# Plan — Fix the nutrition cache key, then move text lookup to gpt-5.6-luna

*Written 2026-10-14, updated 2026-10-15 (cache bug confirmed, made Part 1). Status: **not started**. Owner: Harsh. Hand this file to an agent: "Implement docs/plans/ship-luna-nutrition.md".*

Two changes to one edge function, shipped together in **one deploy** but as **two separate commits**, so the model switch can be rolled back without bringing the cache bug back.

| Part | What | Why |
|---|---|---|
| **1. Cache-key fix** | Stop stripping quantities from the cache key | Correctness bug hurting users today, regardless of model |
| **2. Model switch** | gpt-4o-mini → gpt-5.6-luna | +27 pts calorie accuracy in offline evals |

Order matters: Part 1 first. Without it, Luna's quantity gain is hidden behind cached answers.

## Why

**Part 1 — confirmed bug.** `nutritionCacheKey()` in `supabase/functions/lookup-nutrition/index.ts` (line 12) removes numbers and size/unit words before caching. Running the function on real inputs (2026-10-15):

| User types | Cache key today |
|---|---|
| `1 roti` | `roti` |
| `3 roti` | `roti` ← same as 1 roti |
| `6 roti` | `roti` ← same as 1 roti |
| `2 bowls rajma` | `rajma` |
| `1 katori rajma` | `katori rajma` ← "katori" isn't in the strip list, so inconsistent too |

The cache (`nutrition_cache`) is **global across users**, and both callers use the returned numbers as-is — `app/(tabs)/meals.tsx:913` (Plan tab quick-add) and `components/SwapMealModal/index.tsx:198`. So whoever first looked up "roti", at whatever quantity, fixed the answer for every user and every quantity. The app's own error hint suggests typing *"2 rotis"* — exactly the pattern that breaks.

**Part 2 — offline evals** ([`docs/18-evals.md`](../18-evals.md) §6, code in `evals/`), 21 Indian vegetarian dishes, same prompt:

| | Calorie pass | Protein pass | Quantity pass | $ / 1k lookups |
|---|---|---|---|---|
| gpt-4o-mini (today) | 67% | 68% | 22% | 0.057 |
| **gpt-5.6-luna, `reasoning_effort: "none"`** | **94%** | 71% | **100%** | 0.096 |

## Scope

**In:** `supabase/functions/lookup-nutrition/index.ts`, `supabase/functions/_shared/ai-guard.ts` (`MODEL_RATES` only), docs.

**Out — do not touch:**
- `lookup-nutrition-photo` — uses vision; Luna was **not** evaluated on photos. It has no shared cache key.
- `generate-meal-plan`, `swap-meal`, `get-recipe`, `daily-nudge` — not evaluated.
- The prompt text. It must stay identical to `evals/prompts.py` → `v1_app`, or the eval result no longer applies.
- Client code. The response shape (`name, calories, protein, carbs, fat, serving`) is unchanged.
- The `nutrition_cache` table schema. No migration.
- Grounding (model → grams, code → IFCT). It was tested and scored worse — see Known limits.

---

## Part 1 — Cache-key fix (commit 1)

File: `supabase/functions/lookup-nutrition/index.ts`, function `nutritionCacheKey()`.

1. **Keep quantities and units.** Delete the two `.replace(...)` lines that strip numbers (`\b\d+(\.\d+)?\b`) and unit/size words (`small|medium|large|bowl|…`). Keep: lowercase, `NFKD` + accent stripping, non-alphanumeric → space, whitespace collapse, trim, 100-char cap.
2. **Version the key.** Return `` `v2:${normalised}` ``. Rows written under the old scheme are never read again — no delete, no migration, trivial rollback. (Old rows can be deleted later; not part of this plan.)
3. **Update the comment above the function.** It currently says the stripping is intentional ("so '1 bowl rajma' and 'rajma' share a cache entry") — replace it with why quantities must be part of the key.
4. Keep the empty-key guard: an all-punctuation query should still produce no cache read/write. `"v2:"` alone must not be used as a key — prefix only when the normalised string is non-empty.

**Trade-off, accepted:** lower hit rate ("2 roti" and "3 roti" are now separate entries). A miss costs ~₹0.005 (gpt-4o-mini) / ~₹0.008 (Luna). The cache still keeps answers consistent for identical queries.

**Verify Part 1** — run the real function on these inputs (copy it into a scratch `.js` file and call it with `node`, as was done on 2026-10-15):

| Input | Must produce |
|---|---|
| `1 roti`, `3 roti`, `6 roti` | three **different** keys |
| `3 Roti!`, `3 roti`, `  3   roti ` | the **same** key, `v2:3 roti` |
| `2 bowls rajma`, `2 bowl rajma` | **different** keys (no plural folding — acceptable) |
| `!!!` | empty → no cache read/write |

Commit message: `Fix nutrition cache key dropping quantities`.

## Part 2 — Model switch (commit 2)

### 2a. Model + settings — `supabase/functions/lookup-nutrition/index.ts`
- Add `const MODEL = "gpt-5.6-luna";` near the top (same pattern as `lookup-nutrition-photo/index.ts:5`).
- In the OpenAI request body: `model: MODEL`, **remove `temperature: 0.3`** (Luna returns HTTP 400 for it), add `reasoning_effort: "none"`. Keep `response_format: { type: "json_object" }`.
- Pass `model: MODEL` to **every** `recordOutcome(...)` call in this file. Today it passes none, so cost falls back to gpt-4o-mini rates.

### 2b. Cost logging — `supabase/functions/_shared/ai-guard.ts`
- Add to `MODEL_RATES` (units: USD micro-cents per token, i.e. $/1M × 100):
  `"gpt-5.6-luna": { in: 20n, out: 120n },  // $0.20 / 1M in, $1.20 / 1M out`
- **Verify the price first** on the OpenAI pricing page or billing dashboard. The $0.20/$1.20 figure came from aggregator sites (after a reported 2026-07-30 price cut) and was not confirmed at the source. If it can't be verified, ask Harsh — don't guess.
- Luna's output tokens include hidden reasoning tokens. With `reasoning_effort: "none"` there are 0, so cost is accurate.

### 2c. Keep the eval in sync
- `evals/prompts.py` → `v1_app` must still match the edge function's prompt character-for-character (method: `evals/LEARNING.md`, Phase 2).

**Verify Part 2**
1. From `evals/`: `uv run python run.py --model gpt-5.6-luna --reasoning none`, then `uv run python compare.py` — calorie pass ≈ 94% (±10 pts noise). This confirms the settings, not the deployment.

Commit message: `Move text nutrition lookup to gpt-5.6-luna`.

---

## Before deploying (both parts)
- `deno check supabase/functions/lookup-nutrition/index.ts` passes (skip with a note if Deno isn't installed).
- Part 1 and Part 2 verification tables above all pass.

## Deploy — **ask Harsh before running; this changes production**
```bash
npx supabase functions deploy lookup-nutrition
```
No migration. `ai-guard.ts` is bundled into each function at deploy time, so only `lookup-nutrition` picks up the new rate — fine, nothing else uses Luna.

## After deploying
In the app (Plan tab → "Ate something else?"), look up `1 roti`, then `3 roti`:
- [ ] `3 roti` shows roughly 3× the calories of `1 roti` — **not** the same number. *(This is the end-to-end check the offline eval cannot do — it calls the model directly and never sees the cache.)*
- [ ] `nutrition_cache` has new rows with keys `v2:1 roti` and `v2:3 roti`.
- [ ] The `ai_usage_log` rows for those lookups have a non-null `cost_micros` at Luna rates.
- [ ] Watch `ai_usage_log` for `openai_error` on `nutrition` for a day.

## Rollback
- **Model problem** → revert commit 2 only and redeploy. The cache fix stays.
- **Cache problem** → revert commit 1 and redeploy. Old `nutrition_cache` rows were never deleted, so the old behaviour comes back exactly.

## Acceptance criteria
- [ ] Cache key keeps quantities and units, has a `v2:` prefix, and the verification table passes.
- [ ] The comment above `nutritionCacheKey()` explains why quantity is part of the key.
- [ ] `lookup-nutrition` calls `gpt-5.6-luna` with `reasoning_effort: "none"` and no `temperature`.
- [ ] Every `recordOutcome` in the function passes `model`.
- [ ] `MODEL_RATES` has a verified Luna entry.
- [ ] Prompt text unchanged; `evals/prompts.py` still matches.
- [ ] Eval re-run ≈ 94% calorie pass.
- [ ] Two commits, in order: cache fix, then model switch.
- [ ] Post-deploy "1 roti vs 3 roti" check passes.
- [ ] Docs: in `docs/12-codebase-reference.md` §7 update "All five use gpt-4o-mini" and the cache-key description ("Cache keys … normalize so near-identical inputs collide"); add a line to `docs/15-version-2.md` §8 or a new changelog note; in `docs/18-evals.md` §7 pitfall 3, note the cache bug is fixed; mark this plan **Done** with the date.

## Known limits (don't claim more than this)
- Luna was chosen on the same 21 dishes it was tested on — no held-out validation yet.
- Protein is still weak (71%). Grounding (model → grams, code → IFCT) was tested and scored worse (56% calories); **don't add it in this change** — see `docs/18-evals.md` §6.
- Photo logging still uses gpt-4o-mini.
