// Shared guard for all AI edge functions.
//
// Pro membership model:
// - Every signup is Pro by default. No credit math, no per-call charging.
// - The only spend protection is a silent per-user per-day cap whose value
//   lives in the `app_config` table (editable from the Supabase dashboard).
// - Logging is unchanged: every call writes to `ai_usage_log` with status,
//   tokens, cost in micro-cents, latency. That's what powers monitoring.
//
// Endpoint shape:
//   const g = await guard(req, "meal_plan");
//   if (!g.ok) return g.response;
//   // ... do work, optionally g.markCacheHit() to log a free cache hit
//   const { recordOutcome } = g.start();         // logs a pending row
//   try {
//     const r = await callOpenAI(...);
//     await recordOutcome({ status: "success", tokens_in, tokens_out });
//     return g.json({ ... });
//   } catch (err) {
//     await recordOutcome({ status: "openai_error" });
//     return g.json({ error: "Could not complete" }, 502);
//   }

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type AiAction =
  | "meal_plan"
  | "recipe"
  | "swap"
  | "nutrition"
  | "photo";

interface ActionMeta {
  // app_config row read for Pro members (existing keys preserved for back-compat)
  proConfigKey:      string;
  proDefaultLimit:   number;
  // app_config row read for non-Pro members. Much tighter limits — the point
  // of toggling is_pro=false is to throttle suspected abuse.
  freeConfigKey:     string;
  freeDefaultLimit:  number;
  rateLimitMessage:  string;
}

const ACTION_META: Record<AiAction, ActionMeta> = {
  meal_plan: {
    proConfigKey:     "limit_meal_plan",
    proDefaultLimit:  3,
    freeConfigKey:    "limit_meal_plan_free",
    freeDefaultLimit: 0,    // non-Pro can't regenerate plans
    rateLimitMessage: "Your plan is already looking great! You can regenerate again tomorrow.",
  },
  recipe: {
    proConfigKey:     "limit_recipe",
    proDefaultLimit:  8,
    freeConfigKey:    "limit_recipe_free",
    freeDefaultLimit: 2,
    rateLimitMessage: "You've explored a lot of recipes today! More flavours await tomorrow.",
  },
  swap: {
    proConfigKey:     "limit_swap",
    proDefaultLimit:  5,
    freeConfigKey:    "limit_swap_free",
    freeDefaultLimit: 1,
    rateLimitMessage: "You've swapped quite a few meals today! Fresh ideas come back tomorrow.",
  },
  photo: {
    // Vision calls are the most expensive thing here, so these are set close
    // to real meal counts rather than generously. Note the counter increments
    // before the model call, so a retake or a photo with no food in it still
    // costs a scan — raise via app_config (limit_photo / limit_photo_free) if
    // that proves too tight in practice.
    proConfigKey:     "limit_photo",
    proDefaultLimit:  6,
    freeConfigKey:    "limit_photo_free",
    freeDefaultLimit: 2,
    rateLimitMessage: "You've logged a lot today! Photo logging is back tomorrow morning.",
  },
  nutrition: {
    proConfigKey:     "limit_nutrition",
    proDefaultLimit:  20,
    freeConfigKey:    "limit_nutrition_free",
    freeDefaultLimit: 3,
    rateLimitMessage: "You've logged a lot today! AI lookups reset tomorrow morning.",
  },
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
  /** Model used, for per-model cost accounting. Defaults to gpt-4o-mini. */
  model?:       string;
  meta?:        Record<string, unknown>;
}

export interface GuardOk {
  ok:              true;
  userId:          string;
  user:            { id: string; email?: string };
  supabase:        SupabaseClient;
  admin:           SupabaseClient | null;
  /** Log this request as a free cache hit (0 cost). */
  markCacheHit:    (meta?: Record<string, unknown>) => Promise<void>;
  /**
   * Begin a billable call: inserts a pending log row and returns
   * recordOutcome() to finalize it with token counts / status.
   */
  start:           () => { recordOutcome: (p: RecordParams) => Promise<void> };
  json:            typeof json;
}

export interface GuardErr {
  ok:        false;
  response:  Response;
}

/**
 * Per-model token prices in USD micro-cents (1e-8 USD) per token.
 * $1 / 1M tokens == 100 micro-cents per token.
 */
const MODEL_RATES: Record<string, { in: bigint; out: bigint }> = {
  // $0.15 / 1M input, $0.60 / 1M output
  "gpt-4o-mini": { in: 15n, out: 60n },
};

const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Cost estimate for a model given token counts (USD micro-cents).
 * Unknown models fall back to gpt-4o-mini rates so logging never crashes;
 * add a MODEL_RATES entry whenever a function starts using a new model, or
 * its cost_micros column will be wrong.
 */
export function costMicros(
  tokens_in?: number,
  tokens_out?: number,
  model: string = DEFAULT_MODEL,
): bigint | null {
  if (tokens_in == null && tokens_out == null) return null;
  const rate = MODEL_RATES[model] ?? MODEL_RATES[DEFAULT_MODEL];
  const ti = BigInt(tokens_in  ?? 0);
  const to = BigInt(tokens_out ?? 0);
  return ti * rate.in + to * rate.out;
}

/** @deprecated Use costMicros(tokens_in, tokens_out, model). Kept for callers. */
export function costMicrosGpt4oMini(tokens_in?: number, tokens_out?: number): bigint | null {
  return costMicros(tokens_in, tokens_out, "gpt-4o-mini");
}

export async function guard(req: Request, action: AiAction): Promise<GuardOk | GuardErr> {
  const meta = ACTION_META[action];

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

  // Look up Pro status — non-Pro users get a tighter limit. Default to Pro
  // on read failure so we never accidentally throttle a real user.
  const proRes = await supabase
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .maybeSingle();
  const isPro = proRes.error ? true : !!(proRes.data as { is_pro?: boolean } | null)?.is_pro;

  const configKey    = isPro ? meta.proConfigKey    : meta.freeConfigKey;
  const defaultLimit = isPro ? meta.proDefaultLimit : meta.freeDefaultLimit;

  // Live limit from app_config, with a safe fallback.
  let dailyLimit = defaultLimit;
  const cfg = await supabase.rpc("get_config_int", {
    p_key:     configKey,
    p_default: defaultLimit,
  });
  if (!cfg.error && typeof cfg.data === "number") {
    dailyLimit = cfg.data;
  }

  // Atomic per-user per-day counter. Always counts attempts, even cache hits —
  // a script hammering the cache is still abuse.
  const rateRpc = await supabase.rpc("check_and_increment_rate_limit", {
    p_user_id:     user.id,
    p_action:      action,
    p_daily_limit: dailyLimit,
  });
  if (rateRpc.error) {
    console.error("rate_limit rpc failed:", rateRpc.error);
    return { ok: false, response: json({ error: "Service unavailable" }, 503) };
  }
  if (rateRpc.data === false) {
    await logRateLimited(admin ?? supabase, user.id, action);
    // Non-Pro users get a different message + code so the client can show
    // an "Upgrade to Pro" nudge instead of the friendly "come back tomorrow".
    if (!isPro) {
      return {
        ok: false,
        response: json({
          error:  "You've hit today's free limit. Upgrade to Pro for higher daily limits.",
          code:   "upgrade_required",
          is_pro: false,
        }, 429),
      };
    }
    return {
      ok: false,
      response: json({
        error:        meta.rateLimitMessage,
        code:         "rate_limited",
        retry_after:  "tomorrow",
      }, 429),
    };
  }

  const t0 = performance.now();

  const markCacheHit = async (extra?: Record<string, unknown>) => {
    const writer = admin ?? supabase;
    await writer.from("ai_usage_log").insert({
      user_id:    user.id,
      action,
      status:     "cache_hit",
      cache_hit:  true,
      latency_ms: Math.round(performance.now() - t0),
      meta:       extra ?? null,
    });
  };

  const start = () => {
    const writerPromise = (async () => {
      const writer = admin ?? supabase;
      const ins = await writer.from("ai_usage_log").insert({
        user_id:   user.id,
        action,
        status:    "pending",
        cache_hit: false,
      }).select("id").single();
      return { writer, logId: (ins.data?.id as string) ?? crypto.randomUUID() };
    })();

    const recordOutcome = async (p: RecordParams) => {
      const { writer, logId } = await writerPromise;
      const cost_micros = costMicros(p.tokens_in, p.tokens_out, p.model);
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
    };

    return { recordOutcome };
  };

  return {
    ok:           true,
    userId:       user.id,
    user:         { id: user.id, email: user.email ?? undefined },
    supabase,
    admin,
    markCacheHit,
    start,
    json,
  };
}

/** Kept for source-compat with handlers that catch a GuardError. */
export function asResponse(_err: unknown): Response | null {
  return null;
}

async function logRateLimited(client: SupabaseClient, user_id: string, action: AiAction) {
  await client.from("ai_usage_log").insert({
    user_id,
    action,
    status:    "rate_limited",
    cache_hit: false,
  });
}
