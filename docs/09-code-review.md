# 09 — Code Review (Sanity Check)

*Generated: 2026-06-01. Read like a senior engineer's pass over the whole repo.*

This is an honest audit of the codebase: real bugs, security holes, dummy data, dead code, and architectural smells. I did not patch anything — just flagged. Items are grouped by severity. Each is a concrete finding tied to a file/line so you can act without re-reading the same code.

Where a finding overlaps with [doc 08 — Pending work](./08-pending-work.md), I link instead of duplicating.

---

## 🔴 Critical — Fix before any external user touches the app

### C1. RPC functions are exploitable by any authenticated user

**Files:** [`supabase/migrations/20260601000003_credits.sql:137-140`](../supabase/migrations/20260601000003_credits.sql), [`supabase/migrations/20260601000000_rate_limits.sql:49-50`](../supabase/migrations/20260601000000_rate_limits.sql)

All credit and rate-limit RPCs are `SECURITY DEFINER` and granted to `authenticated`, but **none verify that `auth.uid() = p_user_id`**.

Any signed-in user can run, from the client:
```js
await supabase.rpc('grant_credits', {
  p_user_id: '<my-own-uuid>', p_amount: 1000000, p_reason: 'welcome',
});
```
…and instantly receive a million credits. Same vector for `deduct_credits` (set someone else's balance to zero), `refund_credits`, `check_and_increment_rate_limit` (DoS another user's daily counter).

**Fix:** either (a) restrict execution to `service_role` only and call from edge functions using the admin client, or (b) keep them on `authenticated` but add a guard at the top:
```sql
if auth.uid() is null or auth.uid() <> p_user_id then
  raise exception 'forbidden';
end if;
```
Caveat for (b): `service_role` calls have `auth.uid() = null`, so the check needs to also pass when invoked by the service role.

This is the single biggest risk in the codebase. Fix before any public release.

---

### C2. Welcome-bonus trigger is re-exploitable

**File:** [`supabase/migrations/20260601000003_credits.sql:143-161`](../supabase/migrations/20260601000003_credits.sql)

`grant_welcome_credits()` fires `AFTER INSERT` on profiles when `credits = 0`. If a user can delete and re-insert their own profile row (RLS on `profiles` is not visible in this repo — likely set up via Dashboard, see C3), they can re-fire the trigger and farm 50 credits per cycle.

**Fix:** add a "has the user ever received welcome credits?" check by querying `credit_ledger`:
```sql
if exists (select 1 from credit_ledger
            where user_id = new.id and reason = 'welcome') then
  return null;
end if;
```

---

### C3. Profiles table is not in migrations

**Evidence:** Every migration in `supabase/migrations/` *alters* `public.profiles` or references it as a foreign key, but no migration ever **creates** it. The table exists in production because someone created it via the Dashboard SQL editor before migrations were tracked here.

**Why this matters:**
- `npx supabase db push` on a fresh project will fail.
- The actual schema (columns, RLS policies, FK to `auth.users`, trigger that creates a `profiles` row on signup) lives only in someone's Supabase Dashboard.
- New developers cannot reproduce the dev environment.
- A production restore from migrations is broken.

**Fix:** dump the live schema (`supabase db dump --schema public`) and commit a baseline migration `20240101000000_profiles_baseline.sql` at the start of the migrations folder.

---

### C4. No analytics, no crash reporting

Already flagged in [pending #9](./08-pending-work.md#9-no-analytics-or-crash-reporting). Repeated here because shipping without Sentry means you will not learn about production crashes from users — they will just churn.

---

## 🟠 High — Real bugs users will notice

### H1. `generate-meal-plan` charges credits even when OpenAI key is missing

**File:** [`supabase/functions/generate-meal-plan/index.ts:155-217`](../supabase/functions/generate-meal-plan/index.ts)

Order of operations on cache miss:
1. `g.charge()` deducts 10 credits.
2. Check `OPENAI_API_KEY`. If missing, **skip the API call entirely** but keep `plan = FALLBACK_PLAN`.
3. Upsert the fallback plan.
4. `recordOutcome({ status: 'success', tokens_in: 0, tokens_out: 0 })`.

Result: if you ever forget to set the OpenAI key in a Supabase env, **every user gets a hardcoded vegetarian plan and is charged 10 credits for it**, silently logged as success. The fallback also ignores diet_type — a non-veg user gets a vegetarian plan.

**Fix:** check `openaiKey` *before* calling `charge()`; on missing key, return a 503/500 with no charge.

Same pattern is correctly applied in `lookup-nutrition`, `get-recipe`, `swap-meal`. Only `generate-meal-plan` has it inverted.

---

### H2. Meal plan prompt never includes a snack — but the UI shows snack slots

**File:** [`supabase/functions/generate-meal-plan/index.ts:92-114`](../supabase/functions/generate-meal-plan/index.ts)

The prompt asks for `3 meals per day: breakfast, lunch, dinner`. The home and meals UI both expect a 4-slot model with snack. The Meals tab shows an "Add a snack" CTA when there's no snack in the plan — meaning **every user always sees that CTA**.

**Fix:** add `snack` to the prompt as an optional fourth meal, or remove the snack slot from the UI.

---

### H3. Nutrition cache returns unscaled values

**File:** [`supabase/functions/lookup-nutrition/index.ts:8-19`](../supabase/functions/lookup-nutrition/index.ts)

The cache key strips numbers and units (`"5 rotis"` → `"rotis"`). On hit, the cached values are returned verbatim — so "5 rotis" returns the macros for "1 roti". Worse, the cache is populated by whoever asked first: if user A logs "2 rotis", they pay 1 credit, and user B who logs "5 rotis" gets the "2 rotis" macros for free.

**Fix:** either (a) extract a quantity multiplier client-side and apply it after the cache hit, or (b) include the normalised quantity in the cache key (`"5_rotis"`, `"2_rotis"`).

---

### H4. Home tab and Meals tab show different days of the plan

**Files:** [`features/home/useHomeData.ts:52-58`](../features/home/useHomeData.ts), [`app/(tabs)/meals.tsx:47-51`](../app/(tabs)/meals.tsx)

- **Home** computes day index as `(daysSinceJan1_2024) % 7`.
- **Meals** computes day index as `(jsDay === 0 ? 6 : jsDay - 1)` — i.e. Mon=0..Sun=6.

These do not align. On a given day, Home may render day 3 of the plan while Meals shows day 5. The "Next meal" on Home will be from a totally different day than the user sees in their plan.

**Fix:** pick one. The Mon-Sun mapping is the user's mental model — use that everywhere.

---

### H5. Onboarding bypasses `useAI()` for first plan generation

**File:** [`app/(auth)/onboarding.tsx:125-127`](../app/(auth)/onboarding.tsx)

`handleGetStarted` calls `supabase.functions.invoke('generate-meal-plan')` directly. Consequences:
- No client-side balance refresh after generation.
- No 402/429 modal/toast (unlikely on first run since user has 50 welcome credits, but possible).
- **The intro toast (item E we just built) never fires on the first plan.** The whole point of that feature was the first successful generation, which always happens via this code path.

**Fix:** wrap onboarding's call through `useAI()` as well. Note: that requires `CreditsProvider` to be mounted above the onboarding route — which it is (it's at `app/_layout.tsx`).

---

### H6. Onboarding writes an invalid `activity_level` fallback

**File:** [`app/(auth)/onboarding.tsx:111`](../app/(auth)/onboarding.tsx)

```ts
activity_level: data.activityLevel ?? 'moderate',
```

`'moderate'` is not in the type union `'sedentary' | 'lightly_active' | 'very_active'`. If a user somehow lands in `handleGetStarted` with `activityLevel = null`, the DB write succeeds (the column is `text`), but every downstream consumer (`useHomeData`, `generate-meal-plan` prompt) will silently fall back to defaults because no `ACTIVITY_MULTIPLIER` entry exists for `'moderate'` — that breaks `calculateNutrition` later if the value re-flows back through.

**Fix:** either use `'sedentary'` as the fallback (matches the type), or block the user from advancing past step 4 without selecting one.

---

### H7. Onboarding navigates to `/(tabs)` even after a save failure

**File:** [`app/(auth)/onboarding.tsx:103-136`](../app/(auth)/onboarding.tsx)

The comment says "offline-safe — still navigate even if save fails." It isn't:
- If `supabase.upsert` returned an error, no `profiles` row exists with `onboarding_completed=true`.
- The `router.replace('/(tabs)')` succeeds visually, but on next cold start, `app/index.tsx` sees `onboarding_completed: false` and bounces them back to onboarding.
- They lose every input they entered.

Already in [pending #6](./08-pending-work.md#6-onboarding-writes-a-profiles-row-but-doesnt-handle-network-failure). Calling it out again — this is a real user-visible bug, not a "polish" item.

---

### H8. `NotifSheet` never persists meal-time changes

**File:** [`app/(tabs)/index.tsx:638-681`](../app/(tabs)/index.tsx)

Inside the notif sheet:
```ts
const [mealTimes, setMealTimes] = useState<MealTimes>(DEFAULT_MEAL_TIMES);
```
This state lives only in the sheet's lifecycle. Every time the user opens the sheet, it resets to `DEFAULT_MEAL_TIMES` regardless of what they last picked. The schedules they set still fire on the times they picked (those are persisted by `expo-notifications` itself), but the UI shows wrong defaults the next time they open the sheet.

**Fix:** either persist `mealTimes` in profiles (a `meal_reminder_times` JSONB column) or read back the scheduled triggers from `expo-notifications` and reconstruct the state on open.

---

### H9. `useHomeData.Meal` type doesn't include `'snack'`

**File:** [`features/home/useHomeData.ts:5-12`](../features/home/useHomeData.ts)

```ts
type: 'breakfast' | 'lunch' | 'dinner';
```
But the code path that appends logged snacks to `dayMeals` casts:
```ts
type: type as Meal['type'],   // line 126
```
…hiding the mismatch. Downstream UI happily renders the snack because runtime is forgiving, but the type system is lying.

**Fix:** add `'snack'` to the union.

---

### H10. TDEE uses male-only formula; onboarding has no sex field

**File:** [`features/onboarding/utils/tdee.ts:17`](../features/onboarding/utils/tdee.ts)

Mifflin-St Jeor adds `+5` for men and `-161` for women. The code uses `+5` for everyone. A 60kg / 170cm / 30yo woman gets ~166 kcal/day overestimate, which compounds across a week.

The onboarding flow doesn't ask for sex at all — there's no field in `OnboardingData`. To fix properly: add a sex field, store in `profiles.sex`, branch the formula on it.

---

### H11. Debug logs still in production code paths

Already in [pending](./08-pending-work.md#known-small-issues). Worth surfacing here because once the migrations are pushed, these logs will spam every production Metro and crash-report capture point in `_layout.tsx`, `index.tsx`, and `CreditsContext.tsx`. Strip before EAS production build.

---

## 🟡 Medium — Will cause confusion or maintenance pain

### M1. Duplicate `onAuthStateChange` subscriptions

Both [`app/_layout.tsx`](../app/_layout.tsx) and [`features/credits/CreditsContext.tsx`](../features/credits/CreditsContext.tsx) subscribe to `supabase.auth.onAuthStateChange`. The layout listens for `SIGNED_OUT` only; the credits provider re-runs `refresh()` on every event including token refresh. Each token-refresh event causes a duplicate query to `profiles`.

**Fix:** consolidate. Either have CreditsContext skip events it doesn't care about, or expose an event bus from the layout that other providers subscribe to.

---

### M2. Generated "creator" content is fake

**File:** [`supabase/functions/get-recipe/index.ts:87-91`](../supabase/functions/get-recipe/index.ts)

The prompt asks the AI to invent `creator_handle` (e.g. `@maa.ki.rasoi`) and generate Instagram/YouTube **search URLs**. These render in the recipe screen as if real creators recommended the dish. The Instagram URL goes to a tag search and the YouTube URL to a results page — there is no actual creator behind them.

This is mild deception. Acceptable for v1, but document the decision or remove the UI block until you have real partnerships.

---

### M3. Home "Daily insight" and "Nudge card" are hardcoded if/else

**File:** [`app/(tabs)/index.tsx:48-77, 346-350`](../app/(tabs)/index.tsx)

The "AI-powered" feeling on the home tab is two static functions branching on time of day and protein delta. Honest, but if the rest of the app is positioned as AI-driven, these stand out as the rule-engine flavour they are.

Already in [pending #18](./08-pending-work.md#18-home-nudge-card-uses-static-rules-not-ai). Worth adding "Daily insight" to that item too.

---

### M4. Random Quick-add suggestions change per render

**File:** [`app/(tabs)/log.tsx:84-92`](../app/(tabs)/log.tsx)

`getContextualPrompt` runs `Math.random()` inside the render path. Every re-render shuffles the Quick-add chips. Tap one, it might disappear from the row the next time you look. Should memoise per (user, meal type, day).

---

### M5. Streak titles are duplicated with different thresholds

**Files:** [`app/(tabs)/index.tsx:24-29`](../app/(tabs)/index.tsx) (`getStreakTitle`) and [`app/(tabs)/index.tsx:483-489`](../app/(tabs)/index.tsx) (`getStreakLevel`)

Two functions, in the same file, both classify a streak number into a label. They use different thresholds (`>=8` vs `>=7`) and different copy. Pick one.

---

### M6. Profile screen `regenerate` doesn't ripple to Home

When user regenerates from the You tab, `fetchProfile` reloads the You tab, but Home and Meals only refresh on focus. If the user backgrounds the app and comes back to Home, they see the *old* plan until they tap Home again. Tiny but jarring.

Already mentioned in [pending #15](./08-pending-work.md#15-profile-changes-dont-ripple-to-homemeals-immediately).

---

### M7. Server / client cost values are kept in sync by hope alone

**Files:** [`supabase/functions/_shared/ai-guard.ts:38-43`](../supabase/functions/_shared/ai-guard.ts) and [`features/credits/costs.ts`](../features/credits/costs.ts)

Two declarations of the same truth. If you update one and forget the other, the UI says "this costs 3 credits" but the server charges 5. There is no test that asserts they match. At minimum, write a one-line check script in CI that lints both files for divergence; better, generate one from the other.

---

### M8. `useHomeData` does a full 5-query refetch on every focus

**File:** [`features/home/useHomeData.ts:74-80`](../features/home/useHomeData.ts)

Every tab switch back to Home runs `Promise.all([profile, meal_plans, daily_logs, water_logs, daily_logs(history)])` again. For a logged-in user that's 5 round trips per focus. Could split into `fetchLogsOnly` for focus and full refetch only on first mount / pull-to-refresh, the way `meals.tsx` does.

---

### M9. `app/(tabs)/profile.tsx` has the same intent-state mismatch on weight unit conversion

**File:** [`app/(tabs)/profile.tsx:697`](../app/(tabs)/profile.tsx)

Weight delta preview uses `12 kcal per kg per day` as a constant — fine as approximation, but not connected to the actual TDEE formula. So when a user nudges their weight down by 5 kg, the preview says "-60 kcal target" but `calculateNutrition` would give them a different real target. Not a bug per se; just an honest approximation pretending to be precise.

---

### M10. Recipe screen has no quantity-aware logging

**File:** [`app/recipe/[id].tsx`](../app/recipe/[id].tsx) → `handleLog`

When you log a meal from the recipe screen, it uses the calorie/protein values passed via URL params (which came from the meal plan's per-serving values). There's no way to log "I ate half" or "I ate two servings". Probably acceptable for v1 but worth noting.

---

## 🟢 Low — Polish, cleanup, dead code

### L1. Dead code in `components/ui/`

Three primitives are exported but **never imported anywhere**:
- [`components/ui/Button.tsx`](../components/ui/Button.tsx)
- [`components/ui/Card.tsx`](../components/ui/Card.tsx)
- [`components/ui/Tag.tsx`](../components/ui/Tag.tsx)

`Txt` and `FloatingTabBar` are the only ones actually used. Either delete the unused ones, or convert the inline `View`+`StyleSheet` cards across screens to use the `Card` primitive (probably what was originally intended).

---

### L2. Dead defensive branch in `get-recipe`

**File:** [`supabase/functions/get-recipe/index.ts:49-50, 158-161`](../supabase/functions/get-recipe/index.ts)

The `tableMissing` check for Postgres error code `42P01` (table does not exist) was a defensive fallback from before the recipes migration. After migration `20260531000000_recipes.sql` is applied, this branch is unreachable. Safe to delete.

---

### L3. `tableMissing` mirror in `useRecipe.ts`

**File:** [`features/recipe/useRecipe.ts:106`](../features/recipe/useRecipe.ts)

The comment "silently skip if table missing — edge fn will handle it" is now stale for the same reason as L2.

---

### L4. HomeDrawer "Preferences" and "Notifications" links route incorrectly

Already in [pending → Known small issues](./08-pending-work.md#known-small-issues). The links go to the You tab generally instead of the relevant sub-section, because section deep-links don't exist yet.

---

### L5. Kitchen save button enables on whitespace-only edits

Already in [pending → Known small issues](./08-pending-work.md#known-small-issues).

---

### L6. Glasses-per-day water target is hardcoded at 10

**File:** [`app/(tabs)/index.tsx:230-267`](../app/(tabs)/index.tsx)

Every UI string assumes 10. No per-user setting, no acknowledgment of climate / body weight / activity. Fine for now, but the "Perfectly hydrated" / "Halfway there" copy is built around 10 as a magic number — if you ever change it, you'll have copy bugs.

---

### L7. Random console.warn paths

[`app/(tabs)/meals.tsx:423`](../app/(tabs)/meals.tsx) and [`app/(tabs)/profile.tsx:489`](../app/(tabs)/profile.tsx) both `console.warn` on `generate-meal-plan` failure. With no Sentry hooked up, this is invisible in production. Once Sentry lands, replace with `Sentry.captureException(err)`.

---

### L8. `decodeURIComponent` on URL params lacks fallback

**File:** [`app/recipe/[id].tsx:42`](../app/recipe/[id].tsx)

```ts
const mealName = decodeURIComponent(params.id ?? '');
```
If `params.id` contains a malformed percent-encoded sequence (deep link from a notification, share URL, etc.), `decodeURIComponent` throws `URIError`. Wrap in try/catch or use `decodeURIComponent(...)` in a safe helper.

---

### L9. `PlanReadyScreen` triggers plan generation fire-and-forget

**File:** [`app/(auth)/onboarding.tsx:125-127`](../app/(auth)/onboarding.tsx)

The user lands on Home immediately after onboarding; the plan generation happens in the background. There's no UI signal that "your plan is cooking" on Home. The Meals tab does say "Your plan is being generated" but the user is unlikely to navigate there first.

Already in [pending #7](./08-pending-work.md#7-meal-plan-generation-has-no-progress-indication-after-onboarding).

---

### L10. `lib/notifications.ts` re-requests permission inside helpers

`scheduleMealReminders`, `scheduleWaterReminders` both call `requestNotificationPermission()` internally even after the caller has already requested. Idempotent but redundant — slightly slower path.

---

## 📋 Dummy data and unlinked features inventory

A condensed list of what is *currently fake or unconnected*:

| Where | What's fake / unlinked | Severity |
|---|---|---|
| `generate-meal-plan` `FALLBACK_PLAN` | Generic 7-day vegetarian plan used when OpenAI is unreachable. Users charged anyway (H1). | High |
| `get-recipe` `creator_handle`, `instagram_url`, `youtube_url` | AI-invented fake creators and search-URL links (M2). | Medium |
| Home → "Daily insight" | Hardcoded if/else, not AI. | Medium |
| Home → "Smart Nudge" | Hardcoded if/else, not AI. | Medium |
| Log tab → "Quick add" chips | Hand-curated list, re-randomized on each render (M4). | Low |
| Recipe screen video links | Search URLs, not real recommendations. | Medium |
| Water target | Hardcoded at 10 glasses (L6). | Low |
| TDEE formula | Male-only Mifflin-St Jeor (H10). | High (accuracy) |
| Notification meal times | UI controls present, never persisted (H8). | High |
| `components/ui/Button` / `Card` / `Tag` | Exported, not consumed anywhere (L1). | Low (dead code) |
| `lib/aiClient.ts` `email_confirmed_at` check | Refuses unverified emails — fine for Google OAuth, but breaks any future email/password flow without policy update. | Low |
| Profiles table schema | Lives only in Supabase Dashboard, not in repo (C3). | Critical |
| Snack meal in plans | Plan prompt never asks for one; UI shows "Add a snack" CTA always (H2). | High |
| Recipe screen → log integration | `handleLog` uses params not actual recipe macros; no quantity adjustment (M10). | Low |

---

## Recommendations — order of operations

If I had two weeks before a soft launch, this is the order I'd ship:

1. **C1, C2** — RPC security holes and welcome-trigger re-exploit. Half a day of SQL + redeploy.
2. **C3** — commit a baseline profiles migration. One hour.
3. **H1** — meal plan charges on missing key. 10 minutes.
4. **H7, H5, H6** — onboarding network failure + invalid activity fallback + bypassed credits. Half a day.
5. **H4** — home/meals day rotation mismatch. 20 minutes.
6. **H2** — add snack to plan prompt OR remove from UI. 30 minutes.
7. **H8** — persist meal reminder times. Half a day.
8. **C4, L7** — wire Sentry + PostHog. Half a day.
9. **H3** — nutrition cache scaling. Half a day.
10. **H10** — sex field in onboarding + branched TDEE. Half a day.
11. **H11, L4, L5, L1, L2, L3** — debug logs + dead code + small polish. Half a day total.

After that, the project's actually fit for friends-and-family launch.

---

## What's solid in the codebase

Calling out the good parts so you don't accidentally break them:

- **Edge function `guard()` pattern.** Auth/rate/credits/log in one place. Add new actions by editing the `ACTIONS` map plus one handler file. Excellent.
- **Cache-first AI design.** `meal_plan_cache`, `recipes`, `nutrition_cache` plus the bucket-key trick on plans → real cost savings.
- **Credits subsystem on the client.** Provider pattern, the way `useAI()` auto-handles 402/429, the typed `AIError`, the intro toast — clean architecture for what could have been a mess.
- **Recipe screen.** The loading state with the rotating chef thoughts, the From-Kitchen vs You'll-Also-Need partition — small touches that make the app feel finished.
- **Pre-screen-mount auth split.** `app/_layout.tsx` handling only `SIGNED_OUT`, `app/index.tsx` doing the one-time routing — robust against the Supabase token-refresh loop that almost killed the splash earlier.
- **Migrations have rationale comments.** Each one explains *why*, not just *what*. Rare and valuable.
- **RLS-first thinking.** Every user-owned table has the same self-only policy shape. Easy to audit.

Don't lose these patterns as you grow.
