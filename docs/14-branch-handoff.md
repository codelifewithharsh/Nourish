# 14 — Branch Handoff: `feature/photo-logging-v2`

*Written 2026-09-06. Read this before touching the branch.*

**Nothing here has shipped.** No migration was pushed, no edge function deployed, no build made. Production users are on the old code and an unchanged database. Everything below is code sitting on a branch waiting for you.

---

## 1. Do this first, in this order

### Step 1 — Push the migrations
```bash
npx supabase db push
```
Two new files:
- `20260906000001_onboarding_and_nutrients.sql`
- `20260906000002_meal_photos_bucket.sql`

**Both are additive-only** — new nullable columns, new tables, a new bucket. Nothing is dropped, renamed, retyped, or made NOT NULL without a default. The currently-shipped app selects columns by name, so it cannot see any of this and keeps working. That's what makes it safe to run while live users are on the old build.

Read them before running. They're commented.

### Step 2 — Regenerate types
```bash
npm run types:db
```
I hand-patched `lib/database.types.ts` because regenerating needs a live DB connection. Regenerating will also clean up pre-existing drift — the committed file still lists dropped `credits` columns and is missing `is_pro`.

### Step 3 — Deploy the new function
```bash
npx supabase functions deploy lookup-nutrition-photo
```
Also redeploy the two that changed:
```bash
npx supabase functions deploy generate-meal-plan
npx supabase functions deploy _shared   # if your setup deploys shared separately
```
`OPENAI_API_KEY` is already set, so nothing to configure.

**Deploy order matters:** `generate-meal-plan` now selects the new profile columns, so push the migration *before* deploying it, or it will error on every call.

### Step 4 — Build and test on a device
```bash
npx eas build --profile preview --platform android
```
Must be a **new build**, not an OTA update — `expo-image-picker`, `expo-image-manipulator` and `expo-image` are new native modules. An OTA push to the existing build would crash on the camera screen.

---

## 2. What I could not verify

Be skeptical of these; I had no device and no database.

| Area | Status |
|---|---|
| Every screen's **appearance** | **Never seen.** No simulator. Layout, spacing and colour are unverified — I matched existing token usage, but "does it look good" is your call |
| Photo logging **end to end** | Never run. The prompt, the parsing and the DB write are unexercised against a real photo |
| **Accuracy** on real Indian food | Completely unknown. This is the whole premise and it needs your eyes on real plates |
| Migrations **applied** | Written, never run |
| Storage upload + signed URLs | Written, never run |
| The **dashboard insight logic** | Logic unit-checked in isolation (new user, single bad day, sustained pattern, today-excluded) — but never against real data |
| TDEE change | Math verified numerically; matches the ±114 kcal analysis |
| Bundling | Verified — `expo export` succeeds |

**Typecheck:** the repo had **52 pre-existing errors on `main`**. The branch has 57; all 5 extra are `Cannot find name 'Deno'` in the new edge function, which is the same pre-existing pattern as every other function (the app tsconfig doesn't know Deno globals). **No new app-code errors.**

---

## 3. What changed

### The TDEE fix — affects existing users
`tdee.ts` averaged the male and female Mifflin-St Jeor formulas because the app never asked for sex. The two equations differ by a constant 166 kcal, so **every man was under-fed by ~114 kcal/day and every woman over-fed by the same**, permanently, regardless of body type.

Now takes a `Sex` argument. Per your instruction this applies to **everyone**, not just new users — so existing users will see their calorie target shift by ~114 kcal once they're on the new build and have answered the question. `'unspecified'` preserves the old averaged behaviour for anyone who picks "rather not say".

Worked example, 70kg/175cm/30, lightly active, stay healthy:
- male: **2,267 kcal** (was 2,153)
- female 55kg/160cm/30, fat loss: **1,304 kcal** (was 1,418)

### Photo logging
- `lookup-nutrition-photo` edge function, following the existing `guard()` → `start()` → `recordOutcome()` pattern.
- Decomposes a plate into **per-item rows** rather than one blended estimate — a thali is 4–8 foods and one number for "thali" is useless.
- Scales portions off standard Indian serviceware (katori ≈ 150ml, roti ≈ 15cm, thali ≈ 28cm) because portion size, not identification, is the dominant source of calorie error.
- Accounts for oil and ghee explicitly — the largest hidden calorie source in Indian home cooking.
- Returns per-item confidence; the UI surfaces low confidence rather than hiding it.
- `detail: "low"` on the image, which is a fixed ~85 tokens. Client downscales to a 1024px long edge first.
- Limits are deliberately generous (Pro 50/day, free 10/day) — at ~₹0.01/photo the cap exists to stop scripted abuse, not to ration real use.

### The Today dashboard
Home, Meals and Log all answered "what am I eating today". Today merges Home and Log into one screen with an actual hierarchy: **calories left → what that means → log a meal**.

`deriveInsights()` is the part to watch. It's deliberately conservative: needs **3+ logged days**, **excludes today** (still in progress), shows **only the worst offender**, and can report a good streak so it isn't only ever bad news. This is the mechanic most likely to backfire — "make users worry" is one bad decision away from "make users quit".

### Camera button
The Log tab now renders as a raised camera button in the middle of `FloatingTabBar`. Same route, different presentation. **Still 4 tabs** — I did not merge Meals into Plan or remove a tab, because that's a bigger structural change than I wanted to make unattended.

### Onboarding
- Sex question added to `AboutScreen`, with "Rather not say".
- Migration adds `region`, `meals_per_day`, `cooking_time`, `budget_tier`, `eats_out_frequency`, `allergies`, `target_weight_kg`, `target_date`, `medical_flags`, `phone`. **The columns exist; the UI to collect most of them does not yet.**
- `generate-meal-plan` consumes all of them, emitting a prompt line only when present. A profile with all-null values produces byte-identical output to before — verified by rendering both.

---

## 4. Two things I'd flag

**The worked JSON example in the meal-plan prompt was hardcoded to 3 meals.** With `meals_per_day` now configurable, the model would have followed the example and ignored the rule. It's generated from the field now — but it's the kind of bug that hides for months, so worth knowing it existed.

**All new fields join `planCacheKey`.** Without that, two users with different regions, budgets or **allergies** would share a cached plan. For the allergy field that's a safety bug, not a quality one. Watch the cache hit rate — more dimensions means fewer hits, and cost per plan will rise.

---

## 5. Not done

- **Phase 3** (Indian portion accuracy beyond the prompt work — reference-object calibration, per-cuisine eval set, correction capture)
- **Phase 4** (premium feel) — you asked me to leave this; it needs eyes on a device
- **Phase 5** (engagement, streak forgiveness)
- Onboarding UI for the progressive fields (columns exist, screens don't)
- Splitting the six editors inside `profile.tsx` — only the generic widgets moved; it's 1,119 lines, down from 1,356
- Meal-plan and recipe imagery — still `hero_emoji`. Needs your decision: curated set vs generated

---

## 6. If you want to undo any of it

Every commit is independent and reversible:

```
aa1752d  Extract profile form primitives
68380ac  Feed new profile fields into meal-plan generation
a3c1aa3  Replace Home with a Today dashboard
1d5a1fd  Add photo logging UI and camera button
465f6da  Add photo capture hook and image dependencies
ea0a9cc  Add photo backend and fix sex-blind TDEE
f4d913d  Update product plan
```

`git revert <sha>` on any one. The dashboard (`a3c1aa3`) is the most opinionated change and the easiest to drop — the old `index.tsx` comes straight back.

Branch is pushed: `origin/feature/photo-logging-v2`. Nothing merged to `main`.
