# 05 — AI & Edge Functions

*Last updated: 2026-06-13. Refreshed with exact prompts, formulas, validation details, and cost notes.*

This doc explains how the server side of every AI feature works: the Deno edge functions, the shared `guard()`, the OpenAI integration, and how to add a new AI action safely.

If you want the *client* side (how `useAI` works, the Pro badge and sheet, the rate-limit toast), read [doc 06](./06-pro-membership.md).

---

## 1. Why edge functions at all?

We have four reasons to never call OpenAI from the client:

1. **API key secrecy** — the OpenAI key cannot ship in the app bundle. Bundles can be unpacked.
2. **Cost control** — rate limits must be enforced *before* we call OpenAI. Client checks are bypassable.
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

## 2. The functions

Four rate-limited AI actions plus one free `daily-nudge`:

| Function | Action | Daily limit (default) | Cache? |
|---|---|---|---|
| `generate-meal-plan` | `meal_plan` | 3/day | yes — `meal_plan_cache` keyed by profile shape |
| `get-recipe` | `recipe` | 8/day | yes — `recipes` table keyed by slugified meal name |
| `swap-meal` | `swap` | 5/day | no — creative per call |
| `lookup-nutrition` | `nutrition` | 20/day | yes — `nutrition_cache` keyed by normalised query |
| `daily-nudge` | — | unrestricted | yes — `ai_response_cache` keyed by `daily-nudge:{user_id}:{date}` |

`daily-nudge` sits outside the rate-limit system entirely — it doesn't use `guard()`. It reads the user's profile + today's logs, calls GPT-4o-mini for a ≤18-word personalised message, and caches the result in `ai_response_cache` for the rest of the UTC day. The client also caches it in AsyncStorage so subsequent app opens don't even hit the network.

**Limits are not hardcoded.** Each function's daily cap is read at call time from the `app_config` table via the `get_config_int(key, default)` RPC. `ai-guard.ts` looks up the caller's `is_pro` flag and picks between `proConfigKey` (e.g. `limit_meal_plan`) and `freeConfigKey` (e.g. `limit_meal_plan_free`). Tuning a limit is a single dashboard edit — no redeploy. The defaults in `ACTION_META` (inside [`ai-guard.ts`](../supabase/functions/_shared/ai-guard.ts)) only kick in if the row is missing. Free-tier defaults: 1 meal plan / 2 recipes / 1 swap / 3 nutrition lookups per day.

---

## 3. The `guard()` shared helper

Every edge function starts with the same prerequisites:

1. The user is authenticated.
2. The user hasn't hit the daily rate limit for this action (limit read live from `app_config`).
3. The call gets logged regardless of outcome.

Rather than copy-paste into four functions, they live in [`_shared/ai-guard.ts`](../supabase/functions/_shared/ai-guard.ts).

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
      await g.markCacheHit();         // logs status=cache_hit, free
      return g.json({ recipe: cached.data });
    }

    // 2. Start a pending log row, call OpenAI, record outcome
    const { recordOutcome } = g.start();

    try {
      const result = await callOpenAI();
      await recordOutcome({ status: "success", tokens_in, tokens_out });
      return g.json({ recipe: result });
    } catch (err) {
      await recordOutcome({ status: "openai_error" });
      return g.json({ error: "Could not generate" }, 502);
    }
  } catch (err) {
    const r = asResponse(err);
    if (r) return r;
    return g.json({ error: "Internal" }, 500);
  }
});
```

### What `guard()` does, in order

1. **Auth** — checks the `Authorization` header, calls `auth.getUser()`. Refuses unverified emails (Google OAuth users pass automatically).
2. **Read live limit** — calls `get_config_int(meta.configKey, meta.defaultLimit)`. The default acts as a safe fallback if the row is missing or malformed.
3. **Rate limit** — calls `check_and_increment_rate_limit` with the live limit. Atomic in Postgres. If over limit, returns 429 with `code: rate_limited`, the action-specific friendly message, and logs a `rate_limited` row.
4. **Returns** `{ ok: true, supabase, admin, markCacheHit, start, json }`.

### `markCacheHit()` vs `start()`

- **`markCacheHit()`** is called when we serve a cached result. Writes a `cache_hit` row to `ai_usage_log`. Free for the user, free for us.
- **`start()`** opens a billable call. Inserts a `pending` log row and returns a `recordOutcome()` closer. After the OpenAI call, `recordOutcome()` updates that row with token counts, latency, and the computed USD cost.

There is no `charge()` and no refund any more — every call is allowed if the user is within their daily cap. Cost protection is purely the cap × per-call cost, which keeps the math bounded.

### Friendly 429 messages

Each action has a human-voiced message in `ACTION_META[action].rateLimitMessage` — e.g. *"You've explored a lot of recipes today! More flavours await tomorrow."* The client surfaces this directly in the rate-limit toast; the user never sees the word "limit" or "quota."

---

## 4. The OpenAI call

We use `gpt-4o-mini` for everything. It's cheap (~$0.15/M input, $0.60/M output tokens) and structured outputs are what matters here — not reasoning depth. Tasks are schema-bound with short outputs; gpt-4o would cost ~15× more with no accuracy gain.

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

`response_format: { type: "json_object" }` forces valid JSON. Combined with a strict schema in the system prompt, parsing rarely fails.

**System vs user message split.** Every function uses two messages:
- `system`: who the AI is — "You are a professional Indian dietitian…". Stable across all calls of the same action.
- `user`: the actual task — profile values, the dish name, the query.

The original prompts crammed everything into one user message. Switching to system/user split improves instruction-following on `gpt-4o-mini` because the role boundary is what the model is trained to attend to. Same number of input tokens, measurably more consistent output.

### 4.1 Exact system prompts

| Function | System prompt |
|---|---|
| `generate-meal-plan` | `"You are a professional Indian dietitian. You design realistic 7-day home-cooked meal plans that match the user's body, goal, and pantry. You always return valid JSON only — no prose, no markdown."` |
| `get-recipe` | `"You are a warm Indian home-cook and dietitian. You write authentic Indian recipe cards with household measurements and short clear steps. You always return valid JSON only — no prose."` |
| `lookup-nutrition` | `"You are a precise Indian nutrition expert. You estimate calories and macros for Indian dishes using standard recipe values. You always return valid JSON only — no prose, no markdown."` |
| `swap-meal` | `"You are a professional Indian dietitian. You suggest realistic single-meal swaps that match the user's diet, cuisine, and pantry. You always return valid JSON only — no prose."` |
| `daily-nudge` | No system message — everything is in one user message (see §4.3). |

### 4.2 User prompt structures

**`generate-meal-plan`** — profile values are injected, schema is explicit:
```
Generate a 7-day meal plan for this person:
- Goal: fat_loss
- Daily calorie target: 1600 kcal
- Daily protein target: 72g
- Diet type: pure_veg
- Preferred cuisines: north_indian
- No eggs, no meat, no fish

Rules:
- 3 meals per day: breakfast, lunch, dinner
- Total daily calories must be within 100 kcal of the target
- Total daily protein must be within 10g of the target
[If pantry set: "Pantry on hand: dal, paneer, tomato — bias toward these ingredients"]

Respond ONLY with valid JSON:
{
  "days": [{
    "day": 1,
    "meals": [
      { "type": "breakfast", "name": "...", "calories": 320, "protein": 14, "carbs": 48, "fat": 8 },
      { "type": "lunch",     "name": "...", "calories": 480, "protein": 22, "carbs": 60, "fat": 12 },
      { "type": "dinner",    "name": "...", "calories": 500, "protein": 24, "carbs": 55, "fat": 14 }
    ],
    "total_calories": 1300,
    "total_protein": 60
  }]
}
```

**`lookup-nutrition`** — minimal, tight:
```
The user ate: "2 rotis with dal"
Return ONLY valid JSON:
{ "name": "Roti with Dal", "calories": 340, "protein": 12, "carbs": 58, "fat": 6, "serving": "2 rotis + 1 bowl dal" }
Rules: use standard Indian recipe values. All numbers must be integers. serving should be brief.
```

**`swap-meal`** — includes mood injection:
```
Suggest ONE alternative lunch meal.
Current meal: "Dal Tadka with Rice"
- Diet: pure_veg · Cuisines: north_indian
- Calorie target: ~533 kcal  (daily_calories / 3)
- Protein target: ~24g       (daily_protein / 3)
- Mood: "Make it lighter — lower calories, easy to digest."
- Must be different from "Dal Tadka with Rice". Must be a real Indian recipe. All numbers must be integers.

{ "name": "...", "calories": 000, "protein": 00, "carbs": 00, "fat": 00, "reason": "one sentence why" }
```

Mood strings: `light` → "lower calories, easy to digest" / `hearty` → "higher protein and calories" / `quick` → "simple ingredients, under 20 minutes" / default → "balanced".

**`get-recipe`** — schema-heavy to prevent freeform prose:
```
Write a complete recipe card for "Paneer Bhurji".
- tagline ≤ 12 words, reads like a friend describing the dish
- chef_tip: one specific, non-obvious insight (technique, timing, ratio)
- hero_emoji: ONE single food emoji
- difficulty: easy | medium | hard
- 4–7 steps, each step a single action

{ "name": "...", "tagline": "...", "hero_emoji": "🍛", "prep_minutes": 20, "difficulty": "easy",
  "serves": 1, "ingredients": [{ "name": "paneer", "quantity": "100", "unit": "g" }],
  "steps": [{ "n": 1, "title": "Prep", "body": "Dice onion finely.", "minutes": 3 }],
  "chef_tip": "..." }
```

**`daily-nudge`** — one user message, capped at 80 tokens:
```
You are a warm, concise AI nutrition coach inside the Nourish app.
User: name=Harsh, goal=fat_loss, diet=pure_veg, target=1600kcal/72g protein.
Today so far: eaten 480kcal, 18g protein. Logged: breakfast. Local hour: 13 UTC.
Write ONE short nudge (max 18 words). Be specific to their data, warm, practical.
Return ONLY valid JSON: {"emoji":"<single emoji>","message":"<nudge text>"}
```

### 4.3 Temperatures and token limits

| Action | Temperature | Max tokens | Rationale |
|---|---|---|---|
| `meal_plan` | 0.7 | default | Mild creativity for day-to-day variety |
| `recipe` | 0.7 | default | Same |
| `swap` | 0.7 | default | Was 0.8 — see §4.4 |
| `nutrition` | 0.3 | default | Factual lookup, low temp for consistency |
| `daily-nudge` | 0.8 | **80** | Short creative text; 80 tokens is ~18 words |

### 4.4 What failed: temperature 0.8 on swap

At `temperature: 0.8`, `swap-meal` occasionally produced nutritionally incoherent results — e.g. a "light" swap returning 800 kcal or 8g protein for a paneer dish. The model was treating macro numbers as creative elements rather than constraints. Lowering to 0.7 and adding `"All numbers must be integers"` to the prompt fixed it. The integer constraint turned out to matter independently — floats like `22.5g protein` were common at 0.8 and the frontend was rounding them inconsistently. The rule now appears in three of the five prompts.

### 4.5 What was removed: AI-generated URLs

Early versions of `get-recipe` asked the model to include Instagram handles and YouTube video links. It invented URLs that 404'd. The field was removed from the prompt entirely. Discovery URLs are now built deterministically server-side from the slugified meal name:

```ts
instagram_url = `https://www.instagram.com/explore/tags/${slug}/`;
youtube_url   = `https://www.youtube.com/results?search_query=${encodeURIComponent(meal_name + ' recipe')}`;
```

These actually work, cost zero tokens, and never hallucinate.

### 4.6 Calorie and protein targets are never computed by AI

The AI is given hard numerical constraints, not asked to derive them. Targets are computed deterministically in `features/onboarding/utils/tdee.ts` before the prompt is built:

- **BMR** — Mifflin-St Jeor, gender-neutral average: `((10W + 6.25H − 5A + 5) + (10W + 6.25H − 5A − 161)) / 2`
- **TDEE** — BMR × activity multiplier (1.2 / 1.375 / 1.725)
- **Calorie target** — TDEE − 400 (fat loss), TDEE + 250 (muscle gain), TDEE (maintenance), floor 1200
- **Protein** — IBW (Devine formula, gender-neutral average) adjusted for obesity: `IBW + 0.25 × (actual − IBW)` if over IBW, then × multiplier (1.0 / 1.4 / 1.8 by goal, +0.2 for age ≥ 55), floor 40g

Letting the AI compute TDEE would introduce hallucinated-but-plausible numbers. Deterministic math feeds the prompt as a constraint: *"Total daily calories must be within 100 kcal of 1600."*

### 4.7 Validation

All functions use `response_format: { type: "json_object" }`. There is no runtime schema library (no Zod/AJV) — validation is prompt-level plus minimal structural checks:

| Function | Check | On failure |
|---|---|---|
| `generate-meal-plan` | `parsed.days?.length === 7` | Serve hardcoded FALLBACK_PLAN silently |
| `daily-nudge` | `parsed.emoji && parsed.message` | Throw → 502; client shows static copy |
| `lookup-nutrition` | Numbers coerced: `Math.round(nutrition.calories ?? 0)` | Defaults to 0, not a crash |
| `get-recipe` / `swap-meal` | Field extraction with nullish defaults | Partial results surface rather than failing |

The meal plan FALLBACK_PLAN is a hardcoded 7-day vegetarian plan (~1300 kcal/day, 42–60g protein) used when OpenAI fails or returns a malformed response. It's the only function with a graceful content fallback; others return 502.

---

## 5. Cost tracking & caching

### Cost tracking

Every AI call writes to `ai_usage_log`. Tokens come from the OpenAI response (`usage.prompt_tokens` / `usage.completion_tokens`); cost is computed in `_shared/ai-guard.ts`:

```ts
// micro-cents (1/1,000,000 USD)
function costMicrosGpt4oMini(tokens_in?: number, tokens_out?: number): bigint {
  return BigInt(tokens_in ?? 0) * 15n + BigInt(tokens_out ?? 0) * 60n;
}
```

Cache hits write `status: "cache_hit"` and `cost_micros: 0`. This makes it trivial to see actual vs avoided spend in `ai_usage_log`.

### Caching — the big cost saver

### Meal plan cache (`meal_plan_cache`)

The trick: profiles cluster into **shapes**. Two pure-veg users on a fat-loss goal targeting ~1800 kcal / ~80g protein with similar cuisine preferences and the same pantry will get *the same plan*. So we key the cache by:

```
[goal, diet_type, cuisines, restrictions, calorie_bucket, protein_bucket, kitchen_ingredients]
```

- Calorie bucket: rounded to nearest 100 (so 1820 and 1850 both hit `c1800`). Tightened from ±200 to ±100 because the original was too coarse to ever hit.
- Protein bucket: rounded to nearest 10.
- Kitchen ingredients: lowercased, comma-split, sorted, joined — so `"Paneer, Tomato"` and `"tomato,paneer"` collide. Empty pantries share `i:none`.

Cache hit → free for the user, no OpenAI call.

The kitchen ingredients are also passed into the prompt itself (`"Pantry on hand: ..."`) so the AI biases toward dishes that use what the user already has. This is what backs the "built around what's in your kitchen" claim — without the cache key including it, two users with very different pantries would share a plan that ignored their pantry.

### Recipe cache (`recipes` table)

Keyed by slugified meal name (`paneer-bhurji`, `dal-tadka`). The first user to ask for a recipe triggers OpenAI; everyone after gets it from the cache.

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
import { useAI } from '@/features/pro';
import { AIError } from '@/lib/aiClient';

const invoke = useAI();

try {
  const { recipe } = await invoke<{ recipe: Recipe }>('get-recipe', { meal_name: name });
  setRecipe(recipe);
} catch (err) {
  if (err instanceof AIError && err.code === 'rate_limited') {
    // ProProvider already showed the rate-limit toast — silent on the screen.
  } else if (err instanceof AIError && err.code === 'rate_limited') {
    // CreditsProvider already showed the 429 toast — silent on the screen.
  } else {
    showInlineError(err.message);
  }
}
```

The wrapper:
- Auto-displays the 429 toast on `rate_limited` (action-specific message comes from the server).
- Throws a typed `AIError` so callers can branch.

See [doc 06](./06-pro-membership.md) for the full client story.

---

## 7. Deployment

Edge functions live in `supabase/functions/<name>/index.ts` with optional `deno.json` siblings.

```bash
# Deploy one
npx supabase functions deploy generate-meal-plan

# Or all of them
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

Two patterns depending on whether it's rate-limited or fully free:

### Rate-limited action (the common case)

1. **Add to `_shared/ai-guard.ts`** → `ACTION_META` map: `my_action: { configKey: 'limit_my_action', defaultLimit: N, rateLimitMessage: '...' }`.
2. **Create `supabase/functions/my-action/index.ts`** using the `guard()` + `g.start()` pattern.
3. **Seed `app_config`** with the limit key in a migration so it shows up in the dashboard.
4. (Optional) Add a cache table or reuse an existing one if the query shape fits.
5. **Call it** from your screen via `useAI()` from `@/features/pro`.
6. `npx supabase functions deploy my-action`.
7. Verify: check `ai_usage_log`, test 429 past daily limit.

### Free action (no limits, like `daily-nudge`)

1. **Create `supabase/functions/my-action/index.ts`** — authenticate manually (no `guard()`), skip rate limits entirely.
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
- **Calling `recordOutcome` *before* OpenAI** — the pending row is meant to be finalized *after* the model call returns (or throws). Always: `start() → call OpenAI → recordOutcome`.
- **Forgetting to mark cache hits** — silent cache hits skew cost analytics. Always call `markCacheHit()`.
- **Putting business logic in the client when it should be in the function** — anything that affects rate limits must be server-side.
- **Bypassing `app_config`** — never hardcode a limit in an edge function. Always read from `get_config_int` so ops can tune from the dashboard.
