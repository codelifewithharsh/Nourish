# 05 — AI & Edge Functions

*Last updated: 2026-06-05.*

This doc explains how the server side of every AI feature works: the Deno edge functions, the shared `guard()`, the OpenAI integration, and how to add a new AI action safely.

If you want the *client* side (how `useAI` works, the credits pill, the modals), read [doc 06](./06-credits-and-rate-limits.md).

---

## 1. Why edge functions at all?

We have four reasons to never call OpenAI from the client:

1. **API key secrecy** — the OpenAI key cannot ship in the app bundle. Bundles can be unpacked.
2. **Cost control** — rate limits and credit deductions must happen *before* we call OpenAI. Client checks are bypassable.
3. **Caching** — multiple users will ask the same things ("calories in 2 rotis"). Caching is cheap on the server.
4. **Audit trail** — every call writes to `ai_usage_log` so we know who spent what.

The shape of every AI flow is identical:

```
Client → useAI() → invokeAI() → supabase.functions.invoke('<name>')
                                          ↓
                          ┌───────────────────────────────┐
                          │  Edge Function (Deno)         │
                          │  1. guard() — auth/rate/cred  │
                          │  2. Check cache               │
                          │  3. Call OpenAI               │
                          │  4. Record outcome / refund   │
                          └───────────────────────────────┘
```

---

## 2. The five functions

| Function | Action | Cost | Daily limit | Cache? |
|---|---|---|---|---|
| `generate-meal-plan` | `meal_plan` | 10 cr | 5/day | yes — `meal_plan_cache` keyed by profile shape |
| `get-recipe` | `recipe` | 5 cr | 50/day | yes — `recipes` table keyed by slugified meal name |
| `swap-meal` | `swap` | 3 cr | 20/day | no — creative per call |
| `lookup-nutrition` | `nutrition` | 1 cr | 200/day | yes — `nutrition_cache` keyed by normalised query |
| `daily-nudge` | — | **0 cr (free)** | — | yes — `ai_response_cache` keyed by `daily-nudge:{user_id}:{date}` |

`daily-nudge` sits outside the credit system entirely — it doesn't use `guard()`. It reads the user's profile + today's logs, calls GPT-4o-mini for a ≤18-word personalised message, and caches the result in `ai_response_cache` for the rest of the UTC day. The client also caches it in AsyncStorage so subsequent app opens don't even hit the network.

All cost/limit values live in **one place** on the server: [`supabase/functions/_shared/ai-guard.ts`](../supabase/functions/_shared/ai-guard.ts) → `ACTIONS` map. The client mirrors them in `features/credits/costs.ts` for display only.

---

## 3. The `guard()` shared helper

Every edge function starts with the same prerequisites:

1. The user is authenticated.
2. The user hasn't hit the daily rate limit for this action.
3. The user has the daily refill applied (if they should).
4. The user has enough credits (only checked when we're about to charge).
5. The call gets logged regardless of outcome.

Rather than copy-paste these five steps into four functions, they live in [`_shared/ai-guard.ts`](../supabase/functions/_shared/ai-guard.ts).

### Usage shape

```ts
import { guard, asResponse, corsPreflight } from "../_shared/ai-guard.ts";

Deno.serve(async (req) => {
  const cors = corsPreflight(req);
  if (cors) return cors;

  const g = await guard(req, "recipe");
  if (!g.ok) return g.response;  // 401 / 429 / 403 short-circuit

  try {
    // 1. Cache check
    const cached = await g.supabase.from("recipes").select("*").eq("meal_key", key).maybeSingle();
    if (cached.data) {
      await g.markCacheHit();         // logs status=cache_hit, charges 0
      return g.json({ recipe: cached.data });
    }

    // 2. Charge before the OpenAI call
    const { recordOutcome } = await g.charge();

    // 3. OpenAI call
    try {
      const result = await callOpenAI();
      await recordOutcome({ status: "success", tokens_in, tokens_out });
      return g.json({ recipe: result });
    } catch (err) {
      await recordOutcome({ status: "openai_error", refund: true });
      return g.json({ error: "Could not generate" }, 502);
    }
  } catch (err) {
    const r = asResponse(err);
    if (r) return r;            // thrown GuardError → its response
    return g.json({ error: "Internal" }, 500);
  }
});
```

### What `guard()` does, in order

1. **Auth** — checks the `Authorization` header, calls `auth.getUser()`. Refuses unverified emails (Google OAuth users pass automatically).
2. **Rate limit** — calls the `check_and_increment_rate_limit` RPC. Atomic. If over limit, returns 429 with `code: rate_limited` and logs a `rate_limited` row.
3. **Daily refill** — calls `ensure_daily_refill` (idempotent per UTC day). Grants 5 credits if today's refill hasn't happened.
4. **Returns** `{ ok: true, supabase, admin, markCacheHit, charge, json }`.

### `markCacheHit()` vs `charge()`

- **`markCacheHit()`** is called when we serve a cached result. It writes a `cache_hit` row to `ai_usage_log` with `credits_charged: 0`. Free for the user, free for us.
- **`charge()`** is called when we're about to spend tokens. It atomically deducts via the `deduct_credits` RPC, returns a `recordOutcome()` closer. If the user has no credits, it throws a `GuardError(402)`.

### `recordOutcome()`

Called after the OpenAI call. Updates the pending log row with token counts, computes USD cost via `costMicrosGpt4oMini()`, and — if `refund: true` is passed — calls `refund_credits` to undo the charge. Used when OpenAI fails.

### Atomic, race-safe credit deduction

The `deduct_credits` RPC is **`UPDATE … WHERE credits >= amount RETURNING balance`**. Postgres serialises row updates, so even if a user double-taps and fires two concurrent requests:

- Request A succeeds, credits go from 50 → 40, returns 40.
- Request B sees credits = 40 ≥ 10, succeeds, credits go 40 → 30, returns 30.

We never end up at a negative balance, and we never overcharge.

---

## 4. The OpenAI call

We use `gpt-4o-mini` for everything. It's cheap (~$0.15/M input, $0.60/M output tokens) and good enough for structured outputs.

Common pattern:

```ts
const resp = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  }),
});

const json = await resp.json();
const content = json.choices[0].message.content;
const parsed = JSON.parse(content);
```

Why `response_format: { type: "json_object" }`?
The model is forced to return valid JSON. Combined with a strict schema in the system prompt, parsing rarely fails.

---

## 5. Caching — the big cost saver

### Meal plan cache (`meal_plan_cache`)

The trick: profiles cluster into **shapes**. Two pure-veg users on a fat-loss goal targeting ~1800 kcal / ~80g protein with similar cuisine preferences will get *the same plan*. So we key the cache by:

```
[goal, diet_type, cuisines, restrictions, calorie_bucket, protein_bucket]
```

- Calorie bucket: rounded to nearest 200 (so 1750 and 1830 both hit `c1800`).
- Protein bucket: rounded to nearest 20.

Cache hit → free for the user, no OpenAI call.

### Recipe cache (`recipes` table)

Keyed by slugified meal name (`paneer-bhurji`, `dal-tadka`). The first user to ask for a recipe pays 5 credits; everyone after gets it free.

### Nutrition cache (`nutrition_cache`)

Keyed by a normalised query string. We strip numbers and units so that:
- `"2 rotis"` → key `roti`
- `"3 rotis"` → key `roti`
- `"1 bowl of rajma"` → key `rajma`

Then we scale the macros by the count we extracted. (Today this scaling is rudimentary; see `lookup-nutrition/index.ts`.)

### What's NOT cached

`swap-meal` results are not cached. Each swap is supposed to feel novel; reusing a "lighter alternative to paneer butter masala" feels broken if every user gets the same lentil soup.

---

## 6. How the client calls these

The client never imports `supabase.functions.invoke` directly for AI. It uses `useAI()`:

```tsx
import { useAI } from '@/features/credits/CreditsContext';
import { AIError } from '@/lib/aiClient';

const invoke = useAI();

try {
  const { recipe } = await invoke<{ recipe: Recipe }>('get-recipe', { meal_name: name });
  setRecipe(recipe);
} catch (err) {
  if (err instanceof AIError && err.code === 'no_credits') {
    // CreditsProvider already showed the 402 modal — silent on the screen.
  } else if (err instanceof AIError && err.code === 'rate_limited') {
    // CreditsProvider already showed the 429 toast — silent on the screen.
  } else {
    showInlineError(err.message);
  }
}
```

The wrapper:
- Refreshes the credits balance after every successful call (best-effort).
- Auto-displays the 402 modal on `no_credits`.
- Auto-displays the 429 toast on `rate_limited`.
- Throws a typed `AIError` so callers can branch.

See [doc 06](./06-credits-and-rate-limits.md) for the full client story.

---

## 7. Deployment

Edge functions live in `supabase/functions/<name>/index.ts` with optional `deno.json` siblings.

```bash
# Deploy one
npx supabase functions deploy generate-meal-plan

# Or all five
for fn in generate-meal-plan get-recipe lookup-nutrition swap-meal daily-nudge; do
  npx supabase functions deploy $fn
done

# Set or rotate the OpenAI key (won't show up in git anywhere)
npx supabase secrets set OPENAI_API_KEY=sk-...

# Tail live logs
npx supabase functions logs --tail
```

Schema changes (migrations) and function changes are independent. You can push a migration without redeploying functions, and vice versa.

---

## 8. Adding a new AI action

Two patterns depending on whether it costs credits or is free:

### Paid action (uses the credit system)

1. **Add to `_shared/ai-guard.ts`** → `ACTIONS` map: `my_action: { cost: N, dailyLimit: M }`.
2. **Create `supabase/functions/my-action/index.ts`** using the `guard()` pattern.
3. (Optional) Add a cache table or use the existing ones if the query shape fits.
4. **Mirror cost in `features/credits/costs.ts`** — add to `COST` and `AI_COSTS`.
5. **Call it** from your screen via `useAI()`.
6. `npx supabase functions deploy my-action`.
7. Verify: check `ai_usage_log`, test 402 at zero credits, test 429 past daily limit.

### Free action (no credits, like `daily-nudge`)

1. **Create `supabase/functions/my-action/index.ts`** — authenticate manually (no `guard()`), skip the credit system entirely.
2. Use `ai_response_cache` for server-side caching keyed by `action:{user_id}:{date}`.
3. Cache on the client with AsyncStorage for the same TTL.
4. Always provide a static fallback so the UI never blocks on the network.
5. `npx supabase functions deploy my-action`.

---

## 9. Local development

Edge functions can be run locally via `npx supabase functions serve <name>`, but it's awkward because they need a running Postgres + your `OPENAI_API_KEY` env var. In practice, we deploy to a *dev* Supabase project and develop against that.

If you need to debug a function:
1. Add `console.log` lines (they show in `supabase functions logs --tail`).
2. Read the `ai_usage_log` row for that call — it captures status, tokens, latency, and any meta you passed.

---

## 10. Common pitfalls

- **Forgetting `corsPreflight(req)`** — the Supabase SDK sends an OPTIONS request first. Without it, browsers and the SDK both fail with a CORS error.
- **Calling `recordOutcome` *before* OpenAI** — race condition where a refund could happen before the charge. Always: `charge() → call OpenAI → recordOutcome`.
- **Forgetting to mark cache hits** — silent cache hits skew our cost analytics. Always call `markCacheHit()`.
- **Putting business logic in the client when it should be in the function** — anything that affects cost, rate limits, or charges must be server-side.
- **Mismatched costs between server and client** — if you bump `cost` in `ACTIONS`, update `COST` in `features/credits/costs.ts` in the same commit.
