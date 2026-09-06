# 15 — Version 2

*Written 2026-09-06. Shipped as **v1.1.0** on `feature/photo-logging-v2`.*

What v2 changed and why. For everything unchanged, [`12-codebase-reference.md`](./12-codebase-reference.md) still holds — **except where this file contradicts it** (§7).

---

## 1. The bet

v1 asked users to type what they ate. Manual logging costs 5–10 min/day and is the single biggest reason food apps lose users. v2 makes the camera the primary logging path: photograph the plate, AI reads the dishes and portions.

The moat is **Indian portion accuracy**, not photo logging itself — competitors identify dishes well and estimate portions badly, worst on Indian food. Cost is settled at ~₹0.01/photo; don't re-litigate it.

## 2. Photo logging

**Flow:** camera/gallery → downscale to 1024px long edge → `lookup-nutrition-photo` → review sheet → one `daily_logs` row **per identified item**.

Per-item rows, not one blob: a thali is 4–8 foods and a single "thali" number is useless. Rows share a `photo_path` so the UI can regroup them.

| Piece | File |
|---|---|
| Capture, downscale, upload | `features/nutrition/usePhotoLog.ts` |
| App-wide flow owner | `features/nutrition/PhotoLogProvider.tsx` |
| Review + correction sheet | `features/nutrition/components/PhotoResultSheet.tsx` |
| Vision endpoint | `supabase/functions/lookup-nutrition-photo/` |

**`PhotoLogProvider` is mounted once in `app/_layout.tsx`** (inside `ProProvider`, because capture goes through `useAI()`). Every entry point calls the same `start()`; the review sheet renders above whatever screen you're on. Screens subscribe via `onLogged(fn)` to refetch — the tab-bar button logs rows without any navigation, so nothing else would tell them.

**Corrections are the valuable signal.** The sheet allows per-item portion scaling (±, 0.25×–3×), direct macro editing, removal, and meal-type tagging before anything is written. Portion estimation is the weak point of every photo-calorie pipeline; corrections are what a generic clone can't copy.

**Rate limits: Pro 6/day, free 2/day** (`app_config` → `limit_photo`, `limit_photo_free`; defaults in `ACTION_META`). The counter increments **before** the model call, so a retake or a no-food photo still costs a scan. Raise from the dashboard if too tight.

## 3. Structure: 4 tabs → 3 + an action

`log.tsx` **is deleted.** Home, Meals and Log all answered "what am I eating today" — one job split three ways.

- **Home** (`(tabs)/index.tsx`, 872→395 lines) — dashboard: intake gauge, macros, water, next meal.
- **Plan** (`(tabs)/meals.tsx`) — the single meal surface. Absorbed Log's job entirely.
- **Me** (`(tabs)/profile.tsx`)

The camera is a **detached button in the tab bar, not a tab** — logging is something you do, not a place you go. It opens the camera in place. Extended ("Scan your meal") at the top of a page, collapses to a circle on scroll, driven by `features/nutrition/ScrollContext.tsx`.

**On the Plan tab:** each meal card carries **Log it · Scan · Suggest** (Scan reads a photo of what was actually eaten; Suggest is the AI alternative). Logged meals collapse and gain inline **Edit / De-log**. A "Ate something else?" card below the plan carries camera-first quick-add with text fallback and recent-meal chips.

## 4. The TDEE fix — affects existing users

`tdee.ts` averaged the male and female Mifflin-St Jeor formulas because the app never asked for sex. The equations differ by a constant 166 kcal, so **every man was under-fed by ~114 kcal/day and every woman over-fed by the same** — permanently, regardless of body type.

Now sex-aware, applied to everyone. `'unspecified'` preserves the old averaged behaviour. Worked example (70kg/175cm/30, lightly active): male **2,267** kcal (was 2,153).

**Both call sites must pass `sex`** — onboarding *and* `profile.tsx`'s recalculation on weight/height/age/activity/goal edit. Missing it there silently reverted users to the averaged formula on their next profile edit; fixed, but it's the failure mode to watch if a third call site appears.

## 5. Schema

Four migrations, `20260906000001`–`4`, all **additive** and applied.

- `profiles` — `sex`, `phone`, `region`, `meals_per_day`, `cooking_time`, `budget_tier`, `eats_out_frequency`, `allergies`, `target_weight_kg`, `target_date`, `medical_flags[]`. **Columns exist; onboarding UI for most does not.** All join `planCacheKey` — for allergies that's a safety requirement, not a quality one.
- `daily_logs` — `fibre`, `sugar`, `sodium`, `sat_fat` (NOT NULL default 0), plus `source` (`'plan' | 'text' | 'photo'`) and `photo_path`.
- `weight_logs` — new table, one row per user per day.
- `meal-photos` — **private** bucket, per-user RLS on the first path segment; reads via signed URLs.

`app_config` overrides code defaults, so changing a limit in `ai-guard.ts` alone does nothing to a live database — update the row too.

## 6. Smaller things worth knowing

- **Fibre** is now generated per meal (plan prompt + all fallback meals) and shown on the Plan tab. Plans cached before this lack it, so the pill and summary column render **only when present** — a `0g` would read as a nutritional failure rather than missing data. Cache key bumped to `v2` to retire pre-fibre plans.
- **Home has a skeleton, not a spinner** (`DashboardSkeleton.tsx`), plus a real error state with retry. A failed *first* load shows the error; a failed *refresh* keeps stale numbers on screen.
- **Water reminders default off**; `applyWaterRemindersOffDefault()` turns them off once per install for users who had them on.
- **Water figure** tilts with the phone via accelerometer (not gyroscope — gravity gives absolute orientation without drift).
- Store URL in `app_config` corrected to `in.nourish.app`; the old `com.nourish.app` was a dead Play Store link in every invite and shared recipe.

## 7. Corrections to doc 12

| Doc 12 says | Actual after v2 |
|---|---|
| Tabs: Home · Meals · Log · You | **Home · Plan · Me** + detached camera button; `log.tsx` deleted |
| `(tabs)/index.tsx` 872 lines | **395** |
| `(tabs)/log.tsx` 884 lines | **Gone** |
| v1.0.0 | **v1.1.0** |
| No image handling anywhere | `expo-image`, `expo-image-picker`, `expo-image-manipulator`, `expo-sensors`; `meal-photos` bucket |
| `gpt-4o-mini` text only | Also vision, via `lookup-nutrition-photo` |

## 8. Known loose ends

- **Docs 12, 13, 14 are stale.** 14 is actively wrong (says nothing is deployed; it all is). 13 still states the old 50/10 scan limits.
- **`dish-image` is dead code** — edge function, `dish-images` bucket and `recipes.image_path` all built, zero client references. Undeployed, costs nothing. Keep as a head start or delete; don't rediscover it confused.
- `MODEL_RATES` in `ai-guard.ts` has no `gpt-image-1` entry, so if `dish-image` is ever deployed its cost logging will be silently wrong.
- `WaterBody` re-renders ~40×/sec while Home is mounted (accelerometer + phase timer, both raw `setState`). Works; heavier than it needs to be.
- `android.versionCode` still `1` — check before a Play Store submission.
- Onboarding UI for the progressive profile fields (columns exist, screens don't).
