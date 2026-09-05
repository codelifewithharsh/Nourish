# 12 — Codebase Reference

*Verified against the source 2026-09-06. A map, not a transcript: enough to answer most questions without opening the code, with file pointers for the rest.*

Where this and docs 01–11 disagree, **this is correct** (drift listed in §14).

---

## 1. What it is

Expo/React Native app — AI nutritionist for Indian eaters, *"Eat well. Live better."* Users onboard (body stats + goal), get an AI meal plan, log meals as free text → AI macro lookup, and track calories, macros, water, streak.

`in.nourish.app` · v1.0.0 · portrait, phone-only, light mode only.

## 2. Stack

Expo SDK **56.0.6** · RN **0.85.3** · React **19.2.3** · TS ~6.0.3 · `expo-router` ~56.2.7 (file-based, typed routes) · **New Arch enabled** · Supabase (Postgres + Deno edge fns) · OpenAI **gpt-4o-mini**, server-side only · Reanimated **4.3.1** + worklets 0.8.3 · `expo-secure-store` sessions · PostHog · lucide icons · `expo-updates` OTA (runtimeVersion = appVersion).

**Styling: `StyleSheet.create`.** NativeWind 4 + Tailwind 3 are installed and `global.css` imported, but screens don't use them.

**Absent:** Redux/Zustand, React Query, GraphQL, custom server, dark mode, tablet, custom native modules.

`plugins/withoutPushEntitlement` strips the iOS push entitlement.
Scripts: `start` · `android` · `ios` · `web` · `types:db` (regenerates `lib/database.types.ts`).

## 3. Layout

```
app/          routes          components/ui/  primitives
features/     screen logic    lib/            clients + utils
constants/    design tokens   supabase/       functions/ + migrations/
```
Alias `@/` → repo root. ~13,600 lines across app/components/features/lib/functions.

## 4. Routes

| Route | Lines | What |
|---|---|---|
| `app/index.tsx` | 149 | animated splash + auth/onboarding gate |
| `app/_layout.tsx` | 131 | providers, global error handler, notification listeners |
| `(auth)/login.tsx` | 411 | Google OAuth + guest |
| `(auth)/onboarding.tsx` | 253 | 5-step wizard host |
| `(tabs)/index.tsx` | 872 | Home |
| `(tabs)/meals.tsx` | 972 | plan browser + grocery list |
| `(tabs)/log.tsx` | 884 | food logging |
| `(tabs)/profile.tsx` | 1356 | profile & settings ("You") |
| `recipe/[id].tsx` | 671 | recipe detail |

Tab bar is custom (`components/ui/FloatingTabBar.tsx`), order Home · Meals · Log · You. Android back: non-Home → Home; on Home, second press within 2s exits.

**Startup:** native splash held → `armSplashGate(2000)` safety cutoff (`lib/splashGate.ts`) → `app/index.tsx` animates while calling `getSession()` → route: no session → login · `onboarding_completed` → `(tabs)` · else onboarding. `onAuthStateChange` in `_layout.tsx` repeats this branching and calls `registerPushToken()` on sign-in.

## 5. Database

All tables RLS-enabled; default policy is *own rows only* (`user_id = auth.uid()`). Schema source of truth: `supabase/migrations/` (23 files, all idempotent) and `lib/database.types.ts` (**generated** — never hand-edit).

| Table | Shape / notes |
|---|---|
| `profiles` | PK = `auth.users.id`. Body stats, `goal`, `diet_type`, `cuisines[]`, `restrictions[]`, `daily_calories`, `daily_protein`, `kitchen_ingredients` (free text), `preferred_units`, `onboarding_completed`, `meal_notification_times` jsonb, `expo_push_token`, `is_pro`/`is_early_bird` **default true**, `pro_since`. Triggers: `set_updated_at`, `handle_new_user` (creates row already Pro) |
| `meal_plans` | **`unique(user_id)`** — one plan per user. `plan` jsonb, regenerated wholesale |
| `daily_logs` | One row per logged meal. `date`, `meal_type`, `meal_name`, `calories`, `protein/carbs/fat`. Index `(user_id, date desc)` |
| `water_logs` | `unique(user_id, date)`, `glasses`. Upsert on conflict |
| `recipes` | **Globally shared**, PK `meal_key`. Any authenticated user can read; writes service-role only |
| `meal_plan_cache` | PK `cache_key`, `plan`, `hits` |
| `nutrition_cache` | PK `query_key`, macros, `serving`, `hits` |
| `ai_response_cache` | Used by `daily-nudge`. **No migration, absent from generated types** — hand-created, if it exists |
| `ai_rate_limits` | PK `(user_id, action, window_start)`. `window_start` is a **UTC** date |
| `ai_usage_log` | Per AI attempt: `status`, `cache_hit`, tokens, `cost_micros`, `latency_ms`, `meta` |
| `app_config` | PK `key`, text `value`. **Readable by anon+authenticated**, dashboard-writable. Live knobs, no redeploy |
| `feedback` | `type` ∈ bug/feature/other, message 10–2000 chars. **Insert-only** |

Plan JSON: `{ days: [ { day, meals: [{ type, name, calories, protein, carbs, fat }], total_calories, total_protein } ] }`

**RPCs:** `check_and_increment_rate_limit(user,action,limit)→bool` (atomic, SECURITY DEFINER) · `get_config_int/text(key,default)` · `bump_nutrition_cache_hits` / `bump_meal_plan_cache_hits` · `prune_rate_limits()` (>30d).

`20260609000001_drop_legacy_credits.sql` removed the entire credits economy — tables, RPCs, and columns. **No code path reads credits.**

## 6. Auth

Supabase Auth + Google OAuth (`expo-auth-session` + `expo-web-browser`), sessions in `expo-secure-store`, scheme `nourish`. Guest entry on login. Edge functions inherit the caller's JWT so RLS applies to their reads; `guard()` also rejects a set-but-unconfirmed email.

## 7. AI / edge functions

All AI is server-side Deno. **The client never holds a model key.** All five use `gpt-4o-mini`.

### `_shared/ai-guard.ts` (277 lines) — the pattern every endpoint follows

```ts
const pf = corsPreflight(req); if (pf) return pf;
const g  = await guard(req, "<action>");   // authz + rate limit
if (!g.ok) return g.response;
// optional: cache hit → g.markCacheHit({...}); return cached
const { recordOutcome } = g.start();       // insert 'pending' log row
// ... model call ...
await recordOutcome({ status: "success", tokens_in, tokens_out, meta });
```

`guard()` in order: require `Authorization` (else 401) → build user-scoped client + optional service-role `admin` → `getUser()` (401; 403 if email unverified) → read `is_pro` (**defaults to Pro on read error**, so a DB hiccup never throttles) → pick `limit_<action>` or `limit_<action>_free` → resolve live value via `get_config_int` → `check_and_increment_rate_limit` (RPC error → **503**, over limit → **429**).

**Counts every attempt, including cache hits** — hammering the cache is still abuse.

429 differs by tier: Pro → `code: "rate_limited"` + warm message; non-Pro → `code: "upgrade_required"`.

| Action | Pro | Free | Function | Temp | Cache |
|---|---|---|---|---|---|
| `meal_plan` | 3 | **0** | `generate-meal-plan` | 0.7 | `meal_plan_cache`, bucketed profile key |
| `recipe` | 8 | 2 | `get-recipe` | 0.7 | `recipes` by `meal_key`, global |
| `swap` | 5 | 1 | `swap-meal` | 0.7 | none |
| `nutrition` | 20 | 3 | `lookup-nutrition` | 0.3 | `nutrition_cache`, normalized query |
| — | — | — | `daily-nudge` (**no guard**, `max_tokens: 80`) | 0.8 | `ai_response_cache` per user/day |

Defaults are overridden live by `app_config`. Messages in `ACTION_META` never mention quotas, credits, or money.

**`daily-nudge` is orphaned** — deployed, but no client call site exists anywhere in `app/`, `components/`, `features/`, `lib/`.

**Cost:** `costMicrosGpt4oMini(in,out) = in*15n + out*60n` USD micro-cents (BigInt, avoids float drift). **Hardcoded to gpt-4o-mini rates** — a different model needs a new variant or cost logging goes wrong.

**Cache keys** (both normalize so near-identical inputs collide):
- `planCacheKey()` — calories → nearest 100, protein → nearest 10, sorted cuisines + restrictions, `normaliseIngredients()` (lowercase, split, trim, sort, 200-char cap). `FALLBACK_PLAN` (7 days) used if generation fails.
- `nutritionCacheKey()` — lowercase, strip accents/punctuation/standalone numbers/unit words, cap 100. So `"1 medium bowl of rajma!"` ≡ `"rajma"`.
- `toMealKey()` in `features/recipe/useRecipe.ts` mirrors the server's so client lookups match.

**Client path:** `lib/aiClient.ts` → `invokeAI<T>()` throws typed `AIError` with code `rate_limited` | `upgrade_required` | `openai_error` | `unauthorized` | `unknown`; also treats a 200 carrying `{error}` as failure. **Prefer `useAI()`** from `features/pro/ProContext` — same thing but routes 429s to the global toast.

## 8. Pro membership

**Everyone is Pro.** `is_pro`/`is_early_bird` default true and `handle_new_user()` sets them. No paywall, no balance, no purchase flow — a cosmetic badge plus the generous limit tier. `is_pro = false` exists to **throttle suspected abuse** (free limits go as low as 0/day).

`features/pro/`: `ProContext.tsx` (provider + `useProMember()` + `useAI()` + rate-limit toast) · `EarlyBirdBadge` / `EarlyBirdSheet` · `OGAvatar` · `useProPricing`.

Pricing strings are **copy, not commerce** — `app_config` via `get_config_text` (`pro_price_normal` `₹299/yr` crossed out, `pro_price_user` `Free`).

## 9. `lib/`

`supabase.ts` (typed client + SecureStore adapter) · `aiClient.ts` · `analytics.ts` (PostHog, ~40 events) · `appConfig.ts` · `database.types.ts` *(generated)* · `date.ts` · `events.ts` · `haptics.ts` · `notifications.ts` · `splashGate.ts` · `toast.ts`

**Local dates matter.** `lib/date.ts` exists to avoid `toISOString().split('T')[0]` (UTC): at 1:30 AM IST Wednesday, UTC is still Tuesday, so a meal lands on the wrong day. Use `todayStr()`/`localDateStr()` for anything user-facing. Deliberate asymmetry: logs and streaks use **local** dates, `ai_rate_limits.window_start` uses **UTC**.

**No global state library.** Cross-screen sync is `DeviceEventEmitter` with constants in `lib/events.ts`: `WATER_LOGGED` · `PROFILE_UPDATED` · `SCROLL_TO_SECTION` · `MEAL_TIMES_CHANGED` · `MEAL_NOTIFS_TOGGLED` (+ `TOAST_EVENT` in `toast.ts`). Example: notification-action water logging writes in `_layout.tsx` then emits, so Home updates without refetching.

**Notifications** (`lib/notifications.ts`): `registerPushToken` → `profiles.expo_push_token` · meal reminders (defaults 8:00 / 13:00 / 19:30, per-user override in `meal_notification_times`) · `scheduleWaterReminders(intervalHours, wake=8, sleep=22)`, `0` disables · `WATER_ACTION_ID` logs a glass straight from the tray. Badge cleared on receipt and response.

**Errors:** `components/ErrorBoundary.tsx` wraps the tree; `_layout.tsx` also installs an `ErrorUtils` global handler reporting to PostHog via `analytics.jsError` (stack capped 1000 chars) before delegating.

## 10. Screens

**Home** — `useHomeData()` (`features/home/useHomeData.ts`). Renders: header (avatar→drawer, greeting, bell) · one-time welcome card (`@nourish/welcome_seen`) · calories + 3 macro minis · "Up next" hero meal (log/swap/→recipe) · progress dots · water (10 glasses) · streak card. Modals: swap, drawer, how-it-works, feedback, streak share. Also milestone sharing + `expo-store-review` prompt.

`useHomeData` specifics worth knowing:
- 5 parallel queries: profile, plan, today's logs, today's water, 365d of log dates.
- **Macro split is derived, not stored.** Only calories + protein persist:
  `remaining = cals − protein×4` · `carbs = remaining×0.6/4` · `fat = remaining×0.4/9`. Defaults 2000 kcal / 60g.
- **Display prefers reality over plan** — a logged `meal_type` replaces the planned meal; logged types absent from the plan (snacks) are appended.
- **Streak** = consecutive local dates with ≥1 log, walking back; starts from yesterday if today is empty, so a morning open doesn't look like a break. `weekLoggedDays` is `boolean[7]`, **Monday-indexed**.

**Meals** — day browser, per-meal swap, grocery list partitioned into buy / already-in-kitchen against `kitchen_ingredients`. Unlike Home, a swap here **persists** (rewrites the whole plan blob).

**Log** — `TextInput` "What did you eat?" → `useAI()` → `lookup-nutrition` → result card (name, serving, macros) → meal-type picker (breakfast/lunch/dinner/snack) → insert into `daily_logs`. Plus time-of-day suggestion chips, today's timeline grouped by type, edit/delete.

**You** — largest file. Profile fields, diet prefs, kitchen, units, meal times, water interval, plan regeneration, Early Bird badge, feedback, share, founder card.

**Recipe** — params `id` (URL-encoded name) + type + macros. `useRecipe()` checks shared `recipes` by `toMealKey()`, falls back to `get-recipe`. `partitionIngredients()` splits have/need. Share + creator links.

**Onboarding** — 5 steps via shared `translateX` in `OnboardingLayout`: Goal (`fat_loss`|`muscle_gain`|`stay_healthy`) → About (age/weight/height, ft-lbs→cm-kg on change) → FoodIdentity → Activity (`sedentary`|`lightly_active`|`very_active`) → PlanReady (computes targets, writes profile, triggers first plan). Back on step 1 exits to login.

## 11. Domain math

**`features/onboarding/utils/tdee.ts`** → `calculateNutrition(kg, cm, age, activity, goal) → { dailyCalories, dailyProtein }`

The app never asks gender, so both formulas average male + female.

```
BMR (Mifflin-St Jeor):  male = 10kg + 6.25cm − 5age + 5
                      female = 10kg + 6.25cm − 5age − 161  →  bmr = avg
TDEE = bmr × { sedentary 1.2, lightly_active 1.375, very_active 1.725 }
Calories: fat_loss −400 · muscle_gain +250 · stay_healthy +0     floor 1200

Devine IBW: male 50 + 2.3(in−60) · female 45.5 + 2.3(in−60) → avg
base = weight > ibw ? ibw + 0.25(weight − ibw)   // Adjusted Body Weight
                    : ibw
Protein = base × { stay_healthy 1.0, fat_loss 1.4, muscle_gain 1.8 }
          (+0.2 if age ≥ 55, sarcopenia)          floor 40g
```

Protein keys off **ideal**, not actual, weight so overweight users don't get unrealistic targets. Multipliers sit below US sports-nutrition norms deliberately — tuned for an Indian diet. Only calories + protein are stored; carbs/fat derive at read time (§10).

**Plan rotation** (identical in Home and Meals): `jsDay === 0 ? 6 : jsDay - 1` — Monday→day 1. The plan is **weekday-pinned**, not sequential from generation.

## 12. Design system & analytics

`constants/colors.ts` — **8 tokens only**: `background #F7F5F2` `surface #FFFFFF` `primary #1A1A1A` `secondary #6B6B6B` `accent #2D6A4F` `accentLight #E8F5EF` `error #E63946` `border #E8E6E3`. Brand dark green `#1A3A2A` (splash, adaptive icon, notification tint) is **not** in the palette — hardcoded where used.

`typography.ts` — FontSize 13/16/20/26/32; weights 400/600/700; styles `headingXl|Lg|Md`, `bodyLg|Sm`, `labelBold`.
`spacing.ts` — Spacing 4/8/16/24/32; BorderRadius 8/12/20/999.

**No semantic status tokens, no elevation scale, no motion tokens** — screens hardcode hex where the palette falls short (Home uses `#5B8DB8` `#E6A817` `#C8D0D8` `#D6E8F5`).

Components: `components/ui/` = Button, Card, Tag, Toast, Typography (`Txt`), BreathingLogo, FloatingTabBar. Larger shared: HomeDrawer, HowItWorksModal, StreakShareModal, SwapMealModal, ErrorBoundary. **Use `Txt`, not RN `Text`.**

`lib/haptics.ts` = `light`/`medium`/`success`/`warning`, used in 10 files. `(tabs)/index.tsx` doesn't import it — Home's haptics arrive indirectly via `useHomeData`.

**Analytics** (`lib/analytics.ts`, PostHog): ~40 events covering **feature usage** — `mealLogged` `nutritionLookedUp` `waterLogged` `recipeViewed` `logEntryAdded/Edited/Deleted` `planRegenerated` `onboardingCompleted` `jsError`, etc. Full list in the file. **No funnel, activation, or retention-cohort events.**

## 13. Build & env

`app.json` (Expo config) + `eas.json` (profiles). EAS project `4786fcd8-9c8e-4f2e-b8fc-90fa06d721fe`, owner `codelifewithharsh`. OTA via `u.expo.dev`.

Client (must be `EXPO_PUBLIC_`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
Edge (Supabase secrets, never bundled): `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 14. Conventions

- **Never call a model API from the client.** New AI endpoints go through `guard()` + `recordOutcome()` in an edge function.
- **Prefer `useAI()`** over `invokeAI` so 429s reach the global toast.
- **`todayStr()`/`localDateStr()`** for user-facing dates, never `toISOString().split('T')[0]` (§9).
- **`database.types.ts` is generated** — migrate, then `npm run types:db`.
- Migrations are **idempotent and additive** (`add column if not exists`).
- **`app_config` over redeploys** for anything tunable (limits, prices, copy).
- **Rate-limit and error copy stays warm** — never mentions quotas, credits, or money.
- Screens own their fetching; cross-screen sync via `DeviceEventEmitter` (§9).
- Read the [Expo 56 docs](https://docs.expo.dev/versions/v56.0.0/) before writing Expo code.

## 15. Known drift in docs 01–11

| Older docs say | Actual |
|---|---|
| "6-day meal plan" (01, 05, README) | **7 days** — prompt, JSON, `FALLBACK_PLAN`, and Mon→Sun rotation all agree |
| Reanimated v3, Expo Router v3 (01) | **4.3.1** (+ worklets 0.8.3) and **~56.2.7** |
| Credits system present | **Dropped** (`20260609000001`); no code path reads it |
| "Home … AI daily nudge" (01) | **Client never calls `daily-nudge`** — orphaned; Home's greeting is a static time-of-day string |
| — | **`ai_response_cache` has no migration** and is absent from generated types (§5) |
| Doc 08 pending list | Not re-verified here; treat as stale |

Docs 01–11 remain useful for *reasoning and history*; for current behavior, prefer this file.
