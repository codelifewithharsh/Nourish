# 18 — Evals: what I learned building them for Nourish

*Written 2026-10-14, updated 2026-10-15 (grounding experiment). Code in [`evals/`](../evals/); raw phase-by-phase notes in [`evals/LEARNING.md`](../evals/LEARNING.md).*

This is the version you can teach from. Every claim is backed by a run you can reproduce for under ₹10.

---

## The 30-second version

> Nourish's AI estimates calories for Indian meals. Nobody had checked whether those numbers were right. I built an answer key of 21 dishes from IFCT 2017 food tables, measured the production model, and found it was right 67% of the time — and got quantities like "3 roti" wrong 78% of the time. I compared five model/prompt setups. The prompt change I was sure would help made things *worse*. Switching to gpt-5.6-luna took calorie accuracy to 94% for ~1.7× the cost. Then I tried grounding — model estimates grams, code looks up IFCT — and it scored 38 points *worse*, which told me exactly where the remaining error lives: portion size.

## The 2-minute version

Add three things to the 30-second version:
1. **How the answer key was built** — recipes in raw grams × IFCT per-100g values, each with a tolerance band. (§3)
2. **The surprise** — a "fix" that fixed its target and broke six other dishes. Without the eval, I'd have shipped it. (§6)
3. **The honesty** — 21 dishes is small; one dish ≈ 5 points; I picked the winner on the same set I tested on. (§7)

---

## 1. What an eval is

A unit test asserts one right answer: `expect(emi(100000, 12, 10)).toBe(8792)`. LLM output has no single right answer and changes between calls. So instead of pass/fail on one case, an eval **measures how often and how badly the model is wrong across many cases.**

Every eval has four parts:

| Part | Nourish |
|---|---|
| **Dataset** — inputs + expected answers | 21 dishes, e.g. `"1 katori toor dal"` → 151 kcal, 6.8g protein, ±25% |
| **Task** — the thing under test | The exact prompt + model the app ships |
| **Scorer** — compares output to expected | Code: is the answer inside the band? |
| **Metric** — one number across the dataset | "67% of answers inside the band" |

**The one-liner:** *tests check that code does what you wrote; evals check that a model does what you need.*

## 2. The pipeline

```
dataset ──► run ──► raw answers (.jsonl) ──► score ──► report ──► compare
           (costs $)                         (free)
```

- **Run and score are separate.** Model calls cost money and vary; scoring is free and deterministic. Save raw answers once, re-score as often as you like. *(Paid off immediately: I corrected IFCT values after a run and just re-scored.)*
- **Test what users get.** The eval's prompt is copied verbatim from the edge function and checked character-for-character. An eval of a slightly different prompt measures nothing real.
- **Repeat each question (3×).** One answer can be luck; three show a pattern — and expose instability.
- **Keep the raw output.** A malformed answer is a finding, not something to drop.

## 3. Building the answer key (the hard part)

**An eval is only as good as its answer key.** A wrong reference silently corrupts every score that touches it. Most of the effort belongs here, and most of it is human judgement.

- **Reference, not gold.** There is no true calorie count for "a katori of dal" — it depends on the katori and the cook. Say *reference*, and attach a **tolerance band** that reflects real-world variation: roti ±20% (homes agree), paneer butter masala ±35% (they don't). A band is *uncertainty about the answer*, not leniency. If every band were ±50%, every model would pass and the eval would be worthless.
- **Recipe decomposition.** IFCT covers raw ingredients, not cooked dishes. So each dish is a recipe in **raw grams** (`toor_dal:30; ghee:5; onion_tomato_masala:20`), multiplied by IFCT per-100g values. Raw weights work because cooking mostly adds water, and water has zero calories.
- **Store inputs, generate outputs.** Humans edit `ingredients.csv` and `dishes.csv`; a script generates `reference.csv`. Reviewers check *assumptions* ("is 30g dry dal one katori?"), not arithmetic.
- **Slice the dataset deliberately:** *single dishes* (knowledge), *quantity pairs* like 1 vs 3 roti (does it scale?), *messy inputs* like "2 roti and thoda dal" (real user typing). Slices tell you *where* it fails, not just *that* it fails.

## 4. Metrics — and what each one hides

| Metric | Answers | Trap it avoids |
|---|---|---|
| **Pass rate** | What % of answers are acceptable? | The headline; easy to explain |
| **Median absolute error** | How big is a typical miss? | Median, so one wild answer doesn't dominate |
| **Bias** (median signed error) | Does it lean high or low? | Separates *size* of error from *direction* |
| **Per-slice pass rate** | Where is it weak? | Overall numbers hide a broken category |
| **Consistency** | Same question, same answer? | Users logging the same meal daily see different numbers |

**Averages hide errors.** The baseline's calorie bias was **−1%** — looks perfect. Its median error was **18%**. Big over- and under-estimates cancelled out. Always report error *size* and *direction* separately.

**Consistent ≠ correct.** "3 roti = 210 kcal" came back identical 3/3 times. It's 38% wrong. Stability is not accuracy.

**Disclose your scoring decisions.** Mine: protein passes inside the band *or* within ±2g (percentages are unfair on 3g); a broken answer counts as a **fail**, never skipped (skipping inflates scores); pass rates are per call.

## 5. Comparing models and prompts

- **Change one thing at a time.** Same dataset, same scorer — only the model *or* the prompt moves. *(Exception I had to disclose: reasoning models reject `temperature`, so Luna runs changed two things.)*
- **Know your noise floor.** 21 dishes × 3 repeats → one dish ≈ 5 points. Differences under ~10 points might be noise.
- **Read which cases flipped**, not just the headline. A +10 that comes entirely from one slice may not generalise.
- **Accuracy is half the decision.** Put cost per 1,000 calls and latency in the same table. The goal is almost always *raise quality, lower cost* — so you need both numbers to see the trade.

## 6. The Nourish case study

**Baseline** — production setup (gpt-4o-mini, app prompt): **67%** calorie pass, **68%** protein pass, **22%** on quantity pairs.

| Setup | Calorie pass | Protein pass | Quantity pass | $ / 1k lookups |
|---|---|---|---|---|
| gpt-4o-mini, app prompt *(baseline)* | 67% | 68% | 22% | 0.057 |
| gpt-4.1-mini | 68% | 68% | 67% | 0.155 |
| gpt-4.1 | 67% | **90%** | 0% | 0.774 |
| gpt-4o-mini, "show your working" prompt | 59% | 52% | 33% | 0.188 |
| **gpt-5.6-luna, reasoning off** | **94%** | 71% | **100%** | 0.096 |
| gpt-5.6-luna, reasoning low | 89% | 78% | 100% | 0.130 |
| gpt-5.6-luna, grounded (model → grams, code → IFCT) | 56% | 57% | 67% | 0.177 |

What each row taught:
- **Measure, don't assume.** "Luna is cheaper and better" was half true: better (+27 pts), not cheaper (~1.7×).
- **Bigger ≠ better.** gpt-4.1 costs 14× and ties on calories — it under-counts (−18% bias) — but it's the best at protein. Models have different strengths.
- **A fix can be a regression.** The "show your working" prompt fixed exactly what it targeted (3 roti: 0/3 → 3/3) and broke upma, idli, rice and messy inputs. If I'd re-tested only roti, I'd have shipped it.
- **Reasoning isn't free and didn't clearly help.** Low vs none: inside the noise band, 35% more cost. Hidden reasoning tokens are billed as output.
- **Grounding moved the guess instead of removing it.** The model now only estimates raw grams; code supplies IFCT facts. It lost 38 points on calories. Because facts are identical on both sides, the gap is pure portion size — and Luna's raw grams ran 1.3–1.75× our recipes for pulses and idli batter, while simple foods (rice, curd) matched. Likely reason: dish-level numbers ("1 katori dal ≈ 150–180 kcal") are published everywhere and memorised; raw-gram recipes are rare. **A good architecture on paper measured worse in practice.**

**Decision:** move nutrition lookup to gpt-5.6-luna, reasoning off. Plan: [`plans/ship-luna-nutrition.md`](./plans/ship-luna-nutrition.md).

**User impact, in one sentence:** a user eating 3 roti was under-logged by ~125 kcal on roti alone, and dal-heavy days over-counted protein by 10–15g — enough to believe you hit a target you missed.

## 7. Pitfalls I hit or nearly hit

1. **Data leakage.** My first prompt rewrite used "3 roti, 35g flour" as its example — a test question with its own answer. Rule: check every prompt for test data. *The cleaner a jump looks, the more suspicious to be.*
2. **Selecting and validating on the same set.** I picked Luna using the same 21 dishes I measured on. With a small set, the winner may just suit those dishes. The fix is a **held-out set** run once at the end. *(Not done — a known gap.)*
3. **What you test decides what you catch.** The app's cache key strips quantities (`"4 roti"` → `roti`), so it may return 1 roti's calories for 4. My eval calls the model directly and **cannot see this** — only an end-to-end eval through the edge function could.
4. **Suspect the answer key too.** Chole failed for *every* model. When everything fails one case, check the reference (35g dry chana may be too small) before blaming models.
5. **Prompt fixes that overfit.** Putting the answer key's assumptions (our katori size) into the prompt would raise the score without helping any user.
6. **Model settings aren't portable.** Reasoning models reject `temperature`; one "model swap" can silently be two changes.
7. **Concluding from a smoke test.** After 5 grounded calls I said protein inflation came from misremembered facts. The 63-call run reversed it: portions were the bigger problem. Smoke tests check plumbing, not results.
8. **Scorers have bugs too.** My portion diagnosis first flagged "ghee left out" when the model used oil — nutritionally identical. Check that a scorer measures what you mean before trusting its output.

## 8. The map of the field (what I did, and what's next)

| Concept | What it is | In Nourish |
|---|---|---|
| **Offline eval** | Fixed dataset, run before shipping | ✅ Built |
| **Reference-based scoring** | Compare to a known answer with code | ✅ Calorie/protein bands |
| **LLM-as-judge** | A model grades outputs with no single right answer (e.g. "is this meal plan varied?") | Skipped — must first be validated against human labels |
| **Online eval** | Signals from real users in production | Not yet — user corrections in the photo sheet are a free label source, but the app discards the AI's original estimate |
| **Regression gate (CI)** | Run evals on every prompt/model change; fail the build if accuracy drops | Not yet |
| **Observability** (Langfuse etc.) | Trace every call: prompt, output, cost, latency | Partly — `ai_usage_log` has cost; no prompts/outputs |
| **Grounding** | Model estimates quantities, code looks up the nutrition facts | Tested — lost 38 pts; diagnosed portion size as the real error |
| **Structured outputs** | A strict JSON schema the API guarantees, e.g. an enum of allowed ingredient names | Used for grounding — removed the need for fuzzy/vector matching |

**Rule of thumb for scorers:** use code when the check is objective (sums, banned ingredients, bands); use an LLM judge only when it isn't — and only after it agrees with your own labels.

## 9. Interview questions, answered

**"How did you know your eval was trustworthy?"** I didn't assume it. References are traceable recipe decompositions anyone can check; bands reflect real variation; scoring rules are disclosed; and I flagged where the key itself may be wrong (chole). The known weakness is size — 21 dishes, no held-out set.

**"Why not just use an LLM to grade?"** Because the check was objective. A band comparison is free, deterministic and always right. An LLM judge adds cost, noise and its own error — worth it only for subjective qualities.

**"How did you pick the model?"** Same dataset, same scorer, one change at a time, with cost and latency in the same table. Luna won by 27 points — well above the ~10-point noise floor for this set size.

**"What surprised you?"** My own prompt fix. It fixed its target and regressed six others; net −8 points.

**"Did you try grounding?"** Yes — and it lost by 38 points. Because the facts were identical on both sides, that isolated the remaining error as portion size: the model over-estimates raw grams for pulses by up to 1.75×. Grounding moves the guess to grams, and this model is worse at grams than at recalling published dish-level numbers. I kept the simpler setup.

**"Why not pgvector for ingredient matching?"** With a fixed list of ~20 ingredients, a strict JSON schema enum makes the model pick a valid name — nothing to match. Vector search earns its place with hundreds of foods and free-text names.

**"What would you do with more time?"** A held-out set to confirm the win; settle the portion dispute with a kitchen scale and user corrections; a CI gate so prompt changes can't silently regress; and capture user corrections as a production eval.

**"How much did it cost?"** About ₹8.5 for seven full runs (441 model calls). Cost is never the reason to skip evals.

## 10. Teaching it — a 45-minute masterclass outline

| Min | Segment | Demo / artifact |
|---|---|---|
| 0–5 | Why: "every number in this app is a guess" | The 3-roti example |
| 5–12 | What an eval is: 4 parts, tests vs evals | §1 table |
| 12–22 | Building an answer key: reference vs gold, bands, decomposition | Open `dishes.csv`, run `build_reference.py` |
| 22–30 | Run + score live | `run.py --limit 5`, then `score.py` |
| 30–38 | Comparing: one variable, noise floor, flips | `compare.py` table; the prompt that backfired |
| 38–43 | Pitfalls: leakage, held-out, what you test decides what you catch | §7 |
| 43–45 | The map: judges, online evals, CI, observability | §8 |

**Hook to open with:** *"I'll show you a prompt fix that made my app worse — and how I caught it."*

## 11. Glossary

- **Reference** — the expected answer; ours comes from recipes × IFCT.
- **Tolerance band** — how far from the reference still counts as right.
- **Pass rate** — % of answers inside the band.
- **Bias** — whether errors lean high or low.
- **Slice** — a subset of the dataset (quantity pairs, messy inputs) scored separately.
- **Baseline** — the "before" number every change is compared to.
- **Noise floor** — the smallest difference that's probably real, given dataset size.
- **Data leakage** — test answers ending up in the prompt or training.
- **Held-out set** — data kept aside and used once, to confirm a choice made on other data.
- **Grounding** — taking facts from a trusted source (IFCT) instead of the model's memory.
- **Reasoning model** — a model that "thinks" in hidden, billed tokens before answering.
