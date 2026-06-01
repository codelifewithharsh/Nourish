// Shared guard for all AI edge functions.
//
// Every endpoint follows the same shape:
//   const g = await guard(req, "meal_plan");
//   if (!g.ok) return g.response;
//   // ... do work, optionally g.markCacheHit() to skip the charge
//   const { recordOutcome } = await g.charge();      // deduct + start usage log
//   try {
//     const result = await callOpenAI(...);
//     await recordOutcome({ status: "success", tokens_in, tokens_out });
//     return g.json({ ...result });
//   } catch (err) {
//     await recordOutcome({ status: "openai_error", refund: true });
//     return g.json({ error: "Could not complete" }, 502);
//   }
//
// Why this shape:
// - guard() is sync prereq (auth → rate → refill → balance check). If any
//   fail, the OpenAI call never happens — the wallet is safe.
// - charge() reserves credits BEFORE the external call and returns a closer
//   that finalizes the row. Refunds are atomic.
// - Cache hits route through markCacheHit() which logs status='cache_hit'
//   and charges zero credits.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type AiAction =
  | "meal_plan"
  | "recipe"
  | "swap"
  | "nutrition";

export interface ActionConfig {
  cost:         number; // credits to deduct on cache miss
  dailyLimit:   number; // per-user per-UTC-day cap
}

export const ACTIONS: Record<AiAction, ActionConfig> = {
  meal_plan: { cost: 10, dailyLimit: 5   },
  recipe:    { cost: 5,  dailyLimit: 50  },
  swap:      { cost: 3,  dailyLimit: 20  },
  nutrition: { cost: 1,  dailyLimit: 200 },
};

export const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export function corsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return null;
}

interface RecordParams {
  status:       "success" | "openai_error";
  tokens_in?:   number;
  tokens_out?:  number;
  meta?:        Record<string, unknown>;
  refund?:      boolean;
}

export interface GuardOk {
  ok:              true;
  userId:          string;
  user:            { id: string; email?: string };
  supabase:        SupabaseClient;
  admin:           SupabaseClient | null;
  /** Mark this request as a free cache hit. Logs usage with status='cache_hit' and 0 credits. */
  markCacheHit:    (meta?: Record<string, unknown>) => Promise<void>;
  /**
   * Reserve credits and start a usage log row. Returns recordOutcome() which
   * must be awaited at the end of the handler to finalize (or refund).
   */
  charge:          () => Promise<{
    logId:          string;
    balanceAfter:   number;
    recordOutcome:  (p: RecordParams) => Promise<void>;
  }>;
  json:            typeof json;
}

export interface GuardErr {
  ok:        false;
  response:  Response;
}

/** Cost estimate for gpt-4o-mini given token counts (USD micro-cents). */
export function costMicrosGpt4oMini(tokens_in?: number, tokens_out?: number): bigint | null {
  if (tokens_in == null && tokens_out == null) return null;
  // $0.15 / 1M input, $0.60 / 1M output → 15 / 60 micro-cents per token
  const ti = BigInt(tokens_in  ?? 0);
  const to = BigInt(tokens_out ?? 0);
  return ti * 15n + to * 60n;
}

export async function guard(req: Request, action: AiAction): Promise<GuardOk | GuardErr> {
  const cfg = ACTIONS[action];

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, response: json({ error: "Unauthorized" }, 401) };

  const url     = Deno.env.get("SUPABASE_URL")!;
  const anon    = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = service ? createClient(url, service) : null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  // Belt-and-braces: refuse unverified emails. Google OAuth users already pass.
  // @ts-expect-error email_confirmed_at is on the auth.User type at runtime
  if (user.email && user.email_confirmed_at == null) {
    return { ok: false, response: json({ error: "Email not verified" }, 403) };
  }

  // Rate limit (atomic increment in DB). Always counts attempts, even cache
  // hits — abuse via cache hammering is still abuse.
  const rateRpc = await supabase.rpc("check_and_increment_rate_limit", {
    p_user_id:     user.id,
    p_action:      action,
    p_daily_limit: cfg.dailyLimit,
  });
  if (rateRpc.error) {
    console.error("rate_limit rpc failed:", rateRpc.error);
    // Fail closed: if we can't check, don't burn the API.
    return { ok: false, response: json({ error: "Service unavailable" }, 503) };
  }
  if (rateRpc.data === false) {
    await logRateLimited(admin ?? supabase, user.id, action);
    return {
      ok: false,
      response: json({
        error:      "Daily limit reached",
        code:       "rate_limited",
        retry_after: "tomorrow",
      }, 429),
    };
  }

  // Daily refill (idempotent per UTC day).
  await supabase.rpc("ensure_daily_refill", { p_user_id: user.id, p_daily_grant: 5 });

  const t0 = performance.now();

  const markCacheHit = async (meta?: Record<string, unknown>) => {
    const writer = admin ?? supabase;
    await writer.from("ai_usage_log").insert({
      user_id:         user.id,
      action,
      status:          "cache_hit",
      cache_hit:       true,
      credits_charged: 0,
      latency_ms:      Math.round(performance.now() - t0),
      meta:            meta ?? null,
    });
  };

  const charge = async () => {
    const deductRpc = await supabase.rpc("deduct_credits", {
      p_user_id: user.id,
      p_amount:  cfg.cost,
      p_action:  action,
    });
    if (deductRpc.error) {
      console.error("deduct rpc failed:", deductRpc.error);
      throw new GuardError(json({ error: "Service unavailable" }, 503));
    }
    const balanceAfter = deductRpc.data as number;
    if (balanceAfter < 0) {
      // Out of credits → log and tell client cleanly.
      const writer = admin ?? supabase;
      await writer.from("ai_usage_log").insert({
        user_id:         user.id,
        action,
        status:          "no_credits",
        cache_hit:       false,
        credits_charged: 0,
        latency_ms:      Math.round(performance.now() - t0),
      });
      throw new GuardError(json({
        error:           "Out of credits",
        code:            "no_credits",
        cost:            cfg.cost,
      }, 402));
    }

    // Insert a pending log row so we always have a record, even if the handler
    // crashes before recordOutcome().
    const writer = admin ?? supabase;
    const ins = await writer.from("ai_usage_log").insert({
      user_id:         user.id,
      action,
      status:          "pending",
      cache_hit:       false,
      credits_charged: cfg.cost,
    }).select("id").single();

    const logId = (ins.data?.id as string) ?? crypto.randomUUID();

    const recordOutcome = async (p: RecordParams) => {
      const cost_micros = costMicrosGpt4oMini(p.tokens_in, p.tokens_out);
      await writer
        .from("ai_usage_log")
        .update({
          status:      p.status,
          tokens_in:   p.tokens_in   ?? null,
          tokens_out:  p.tokens_out  ?? null,
          cost_micros: cost_micros != null ? cost_micros.toString() : null,
          latency_ms:  Math.round(performance.now() - t0),
          meta:        p.meta ?? null,
        })
        .eq("id", logId);

      if (p.refund) {
        await supabase.rpc("refund_credits", {
          p_user_id: user.id,
          p_amount:  cfg.cost,
          p_action:  action,
          p_ref_id:  logId,
        });
      }
    };

    return { logId, balanceAfter, recordOutcome };
  };

  return {
    ok:           true,
    userId:       user.id,
    user:         { id: user.id, email: user.email ?? undefined },
    supabase,
    admin,
    markCacheHit,
    charge,
    json,
  };
}

class GuardError extends Error {
  response: Response;
  constructor(response: Response) {
    super("guard");
    this.response = response;
  }
}

export function asResponse(err: unknown): Response | null {
  if (err instanceof GuardError) return err.response;
  return null;
}

async function logRateLimited(client: SupabaseClient, user_id: string, action: AiAction) {
  await client.from("ai_usage_log").insert({
    user_id,
    action,
    status:          "rate_limited",
    cache_hit:       false,
    credits_charged: 0,
  });
}
