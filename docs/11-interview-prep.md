# 11 — Interview Prep / Understanding Nourish End-to-End

*Last updated: 2026-06-13.*

This doc is different from the others. The earlier docs describe *what the code does*. This one is built so you (or anyone) can **explain Nourish out loud in an interview** — covering the architecture, the decisions, the trade-offs, and the why behind every layer.

Each section answers a question an interviewer might ask. Read the answer, then read the "Why" sub-section so you can defend the choice when asked "but what about X?".

---

## Table of contents

1. [The 60-second pitch](#1-the-60-second-pitch)
2. [The stack — what and why](#2-the-stack--what-and-why)
3. [App architecture: client side](#3-app-architecture-client-side)
4. [Routing & auth flow](#4-routing--auth-flow)
5. [State management — why no Redux / React Query](#5-state-management--why-no-redux--react-query)
6. [Database design — Postgres + Row Level Security](#6-database-design--postgres--row-level-security)
7. [The AI system — prompts, caching, and cost](#7-the-ai-system--prompts-caching-and-cost)
8. [Pro membership & rate limiting](#8-pro-membership--rate-limiting)
9. [TDEE / macro calculations — the science](#9-tdee--macro-calculations--the-science)
10. [Native quirks: splash, notifications, Android New Arch](#10-native-quirks-splash-notifications-android-new-arch)
11. [Common interview questions with answers](#11-common-interview-questions-with-answers)
12. [Trade-offs I made and would defend](#12-trade-offs-i-made-and-would-defend)

---

## 1. The 60-second pitch

Nourish is a React Native app built with Expo SDK 56 that acts as a personalised AI nutritionist for Indian eaters. You complete a 5-step onboarding (goal, body stats, diet preferences, restrictions, activity), and the app generates a 6-day Indian meal plan tailored to your calorie and protein targets (computed via Mifflin-St Jeor BMR and Ideal Body Weight formulas). You can swap any meal for an alternative ("lighter", "hearty", "quick"), open any meal for a full recipe with ingredients and steps, and log what you actually ate using AI ("2 rotis and dal" → calories computed).

The backend is **Supabase** (Postgres + Auth + Edge Functions on Deno). The AI is **OpenAI's gpt-4o-mini**, called only from four Deno edge functions — the API key never leaves the server. Cost is controlled through three layers: (1) a global recipe cache shared across all users, (2) profile-bucketed meal-plan caching that lets users with similar bodies share generated plans (cut OpenAI spend ~60%+), and (3) silent per-tier per-day rate limits read live from `app_config` so they can be tuned without a redeploy.

There's no custom backend server. Security is enforced through Postgres Row Level Security policies — the client (with its public anon key) can only read or write rows that belong to its own user.

---

## 2. The stack — what and why

| Layer | Choice | Why |
|---|---|---|
| App runtime | Expo SDK 56, React Native 0.85, TypeScript | EAS Build means no Xcode/Android Studio. SDK 56 includes the New Architecture (Fabric + TurboModules) by default — better perf, fewer bridge crossings. |
| Routing | Expo Router v3 (file-based) | Files in `app/` become routes. Route groups `(auth)` and `(tabs)` share layouts without showing in the URL. |
| Auth | Supabase Auth + Google OAuth via `expo-auth-session` | Supabase handles session storage, refresh tokens, OAuth callback parsing. Google OAuth via `expo-auth-session` opens an in-app browser. |
| Session storage | `expo-secure-store` | Sessions live in iOS Keychain / Android Keystore — not AsyncStorage. The Supabase client is configured with a SecureStore adapter. |
| Backend | Supabase (Postgres + Edge Functions on Deno) | Single platform: database, auth, RLS, serverless functions, secrets. No microservices, no orchestration. |
| AI | OpenAI gpt-4o-mini (`chat/completions`) | Cheap (~$0.15/M input, $0.60/M output tokens). Good enough for structured JSON output with `response_format: { type: "json_object" }`. |
| Animations | Reanimated v3 + RN `Animated` | Reanimated for the splash (runs on UI thread, no jank). Plain RN `Animated` for drawers/modals where the simpler API is enough. |
| Analytics | PostHog | Self-hostable, generous free tier. We use it for events + crash reports via `ErrorBoundary` and a global `ErrorUtils` handler. |
| Native modules | None custom | Pure JS/Expo. Builds via EAS without ejecting. |

### What's notably absent and why

- **No Redux/Zustand**. Each screen has narrow data needs solved by a custom hook (`useHomeData`, `useRecipe`). Global state would be overkill.
- **No React Query / SWR**. Cross-tab sync uses `useFocusEffect` + a `DeviceEventEmitter` event bus pattern. Smaller surface area, no extra dependency.
- **No GraphQL**. The Supabase JS client lets us write `.from('profiles').select(...)` directly with full TypeScript types generated from the schema.
- **No custom backend (Express/Hono/Nest)**. RLS gives us authorisation, Edge Functions give us server-side compute, OpenAI gives us AI. There's nothing left for a custom server to do.
- **No CSS-in-JS** (no Emotion/styled-components). `StyleSheet.create()` colocated with each component is enough.
- **No dark mode** yet. `userInterfaceStyle: 'light'` is hardcoded. Adding it would mean extracting `Colors` into two themes and a theme provider.

---

## 3. App architecture: client side

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Expo SDK 56)                 │
│                                                         │
│  app/ (routes)  →  features/ (hooks)  →  lib/ (clients) │
│       ↓                                                 │
│  components/ (shared UI primitives)                     │
└─────────────────────────────────┬───────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────┐
│                   SUPABASE BACKEND                      │
│                                                         │
│  Auth (JWT)   Postgres + RLS   Edge Functions (Deno)    │
└─────────────────────────────────────────┬───────────────┘
                                          │
                                          ▼
                                      OpenAI API
```

The **client never talks to OpenAI directly**. Every AI call goes through a Supabase Edge Function so the OpenAI API key stays on the server.

### Folder layout — three top-level code folders

| Folder | What lives there | Rule |
|---|---|---|
| `app/` | Routes (file-based via Expo Router). Each file = one screen. | Thin — delegate logic to features. |
| `features/<name>/` | Business logic specific to one feature: hooks, types, utility functions. | If only one screen imports it, it belongs here. |
| `components/` | Presentational components used across multiple screens. | If two or more screens use it, promote it from `features/` to here. |

### The data hook pattern

Each tab page calls exactly one custom hook:

```ts
const { data, loading, refresh, logMeal } = useHomeData();
```

The hook owns:
- All Supabase queries for that screen
- Cross-tab refresh via `useFocusEffect`
- Event bus listeners (`PROFILE_UPDATED_EVENT`, `WATER_LOGGED_EVENT`)
- Optimistic-update mutations (`logMeal`, `updateWater`)

This is the **"React Query lite" pattern done manually**. It works because each screen's data needs are narrow and well-scoped.

---

## 4. Routing & auth flow

### The flow

```
no session                          → /(auth)/login
session, no profile row             → /(auth)/onboarding
session, onboarding_completed=false → /(auth)/onboarding
session, onboarding_completed=true  → /(tabs)
```

This is driven by **database state**, not client state. Reinstalling the app preserves all state because the source of truth lives in Postgres.

### How OAuth works

1. User taps "Continue with Google" on the login screen
2. `expo-auth-session` opens an in-app browser to Google's OAuth URL
3. User signs in → Google redirects to `nourish://auth/callback`
4. The native app deep-link handler receives the URL, extracts the code
5. Supabase exchanges the code for a JWT, stored in iOS Keychain / Android Keystore via `expo-secure-store`
6. `onAuthStateChange` fires `INITIAL_SESSION` → root layout decides the route

### Single source of truth for routing decisions

Only **two files** do navigation routing:
- `app/_layout.tsx` — mounts global providers, listens for `SIGNED_OUT` to bounce to login
- `app/index.tsx` — the animated splash that reads the session and routes to login/onboarding/tabs

Earlier this logic was split across more places and caused race conditions (two parallel route decisions firing). Consolidating fixed that.

### The splash gate

The **native splash** (the static dark-green image with the Nourish wordmark) is held visible via `SplashScreen.preventAutoHideAsync()` until either:
1. The root layout reports first paint via `releaseSplash()`, OR
2. A 2-second safety timer fires (in `armSplashGate(2000)`)

Then the **animated splash** (Reanimated breathing logo with fade-in text) runs for a minimum of 2 seconds while the session check completes in parallel. This guarantees the brand moment is seen even on fast cold starts.

The **breathing logo loader** has a 1.2-second minimum display so users always see it, not just on slow networks.

### `app_logo/`

Two logos: `nourish_logo_white.png` (used on dark backgrounds — splash, badges) and `nourish_logo_dark_green.png` (used on light backgrounds — loading state).

---

## 5. State management — why no Redux / React Query

### What I did instead

**Three patterns** cover all client state:

1. **Local component `useState`** — for UI state (open/closed sheets, draft inputs)
2. **Custom feature hooks** — for server data + mutations (`useHomeData`, `useRecipe`)
3. **One global context** — `ProProvider` for Pro membership + AI invoke wrapper + rate-limit toast

That's it.

### How cross-tab synchronisation works without React Query

Two mechanisms working together:

**Mechanism 1 — `useFocusEffect`**

When you switch tabs in Expo Router, the focused tab's `useFocusEffect` callback fires. Each tab calls `refresh()` in this hook. So switching to Home re-reads the latest data; switching to Profile re-reads the latest profile.

**Mechanism 2 — `DeviceEventEmitter` event bus**

When the user updates their profile, the Profile screen fires `DeviceEventEmitter.emit(PROFILE_UPDATED_EVENT)`. The Home screen subscribes to this event via `DeviceEventEmitter.addListener` and calls `refresh()` immediately, without waiting for the user to switch tabs.

This is event-bus pattern: writers fan out events; readers subscribe. Events live in `lib/events.ts`:

```ts
export const PROFILE_UPDATED_EVENT      = 'profile-updated';
export const WATER_LOGGED_EVENT         = 'water-logged';
export const MEAL_TIMES_CHANGED_EVENT   = 'meal-times-changed';
export const MEAL_NOTIFS_TOGGLED_EVENT  = 'meal-notifs-toggled';
```

### Why not Redux

- No app-wide state to share. Each screen owns its data.
- Two screens needing the same data is rare; when it happens, both subscribe to the same event.
- Redux adds boilerplate, debugging overhead (devtools, time travel), and a learning curve for new contributors.

### Why not React Query

I'd actually consider adding it later. The reasons it's not in today:
- Refetch-on-focus, optimistic updates, and caching are already handled manually.
- Custom hooks give precise control over which fields are fetched per screen.
- Adding it now would require refactoring every hook for marginal ergonomic improvement.

The honest threshold: once I have 5+ hooks all doing the same `if (loading) return spinner; if (error) return error...` boilerplate, React Query pays off. We're not there yet.

---

## 6. Database design — Postgres + Row Level Security

### The schema (simplified)

```
profiles               (1 per user)
├─ id (FK to auth.users)
├─ goal, age, weight_kg, height_cm, activity_level
├─ diet_type, cuisines, restrictions
├─ daily_calories, daily_protein
├─ kitchen_ingredients (free text)
├─ meal_notification_times (jsonb)
├─ onboarding_completed (the routing gate)
├─ is_pro, is_early_bird, pro_since (Pro membership)

meal_plans             (1 per user, JSONB blob — entire 7-day plan)
daily_logs             (1 per logged meal)
water_logs             (1 per user per day)
recipes                (public cache — keyed by slugified meal name)
nutrition_cache        (public cache — keyed by normalised query)
meal_plan_cache        (public cache — keyed by profile shape + pantry)
ai_rate_limits         (atomic per-user-per-day counters)
ai_usage_log           (append-only audit log — every AI call)
app_config             (live-tunable settings: limits, prices, copy)
feedback               (user-submitted feedback with auto-captured email)
```

### Why one big JSONB column for `meal_plans` instead of normalised rows?

The plan is always read as a whole, generated atomically, and per-meal swaps patch it in place. Splitting into `meal_plan_days` and `meal_plan_meals` tables would mean three joins on every home-screen load with no upside. JSONB gives us:
- One row read per plan
- Atomic upserts (`onConflict: 'user_id'`)
- Flexible shape (we changed the schema once during onboarding tweaks without a migration)

The downside: you can't query "how many users had paneer on day 3?" without a JSONB unnest. We don't need to.

### Row Level Security (RLS) — the security model

Every table has RLS enabled. The pattern for user-owned tables:

```sql
create policy table_self_read
  on public.<table> for select
  using (auth.uid() = user_id);

create policy table_self_write
  on public.<table> for insert
  with check (auth.uid() = user_id);
```

`auth.uid()` is a function Postgres injects based on the JWT the request was authenticated with. **Every query the client sends is implicitly filtered to "where user_id = me."**

This means: the Supabase public anon key in our app bundle is safe to ship. It's only a passport for RLS-protected queries. Even if someone extracted it from the APK, they couldn't read another user's data without that user's JWT.

The `recipes` table is an exception — it's a public cache (anyone can read any recipe), but only the service role (server-side) can write.

### `SECURITY DEFINER` RPCs for atomic operations

Some operations can't be safely done row-by-row from the client. We use `SECURITY DEFINER` Postgres functions (RPCs) for these:

| Function | Purpose |
|---|---|
| `check_and_increment_rate_limit(user_id, action, daily_limit)` | Atomic upsert into `ai_rate_limits`; returns `false` if over limit. Race-condition-free. |
| `get_config_int(key, default)` | Reads `app_config` as int with safe fallback. Called from edge functions. |
| `get_config_text(key, default)` | Same for text. Granted to `anon` so login/onboarding can read pricing copy pre-auth. |

These bypass RLS (because they run with `DEFINER`'s privileges, not the caller's), which is what makes the atomic counter work.

### Migrations — flat SQL, idempotent, forward-only

Migrations live in `supabase/migrations/<timestamp>_<name>.sql`. They're applied via `npx supabase db push`.

Rules:
- **Forward-only.** Don't edit an applied migration; write a new one that fixes the issue.
- **Idempotent** (`if not exists`, `add column if not exists`) so migrations are safe to re-run.
- **Backfill in a `DO $$ ... $$` block** when you need data to fit a new column.

Migration naming: `YYYYMMDDHHMMSS_short_name.sql` — sortable, no collisions.

### Type generation

`lib/database.types.ts` is generated by the Supabase CLI from the live schema:

```bash
npx supabase gen types typescript --linked > lib/database.types.ts
```

The Supabase JS client is parameterised by this `Database` type, so `.from('profiles').select('name')` gives back `{ name: string | null }` typed correctly at compile time.

---

## 7. The AI system — prompts, caching, and cost

This is the most interview-relevant section. The questions are usually: how do you keep costs down? how do you handle prompts? how do you measure quality?

### Architecture

```
Client → useAI() → supabase.functions.invoke('<name>')
                                ↓
                  ┌──────────────────────────┐
                  │  Edge Function (Deno)    │
                  │                          │
                  │  1. guard() — auth +     │
                  │     rate limit           │
                  │  2. Check cache          │
                  │  3. Call OpenAI          │
                  │  4. Record outcome       │
                  └──────────────────────────┘
                                ↓
                            OpenAI
```

### The four AI actions

| Function | Action | Daily limit (configurable) | Cache? |
|---|---|---|---|
| `generate-meal-plan` | meal_plan | Pro 3 / Free 1 | yes — `meal_plan_cache` keyed by profile shape + pantry |
| `get-recipe` | recipe | Pro 8 / Free 2 | yes — `recipes` table keyed by slugified meal name (shared across all users) |
| `swap-meal` | swap | Pro 5 / Free 1 | no — creativity is the point |
| `lookup-nutrition` | nutrition | Pro 20 / Free 3 | yes — `nutrition_cache` keyed by normalised query |

Plus a fifth `daily-nudge` function that's free (no rate limit), cached per user per day.

### The shared `guard()` helper

Every function starts with:

```ts
const g = await guard(req, "recipe");
if (!g.ok) return g.response;  // 401 / 429 / 403 short-circuit
```

`guard()` does, in order:
1. **Auth check** — reads the JWT from the `Authorization` header, calls `auth.getUser()`. Refuses unverified emails.
2. **Look up `is_pro`** on the user's profile row. On read failure, fails open as Pro (safety default — don't lock paying users out on a transient DB blip).
3. **Read live rate limit** — calls `get_config_int(meta.proConfigKey or meta.freeConfigKey, meta.defaultLimit)` from Postgres. The default is a fallback if the row is missing.
4. **Increment counter atomically** — calls `check_and_increment_rate_limit(user_id, action, daily_limit)`. Returns `false` if over limit.
5. **Return guards** — `{ ok: true, supabase, admin, markCacheHit, start, json }`.

### Why a shared guard instead of copy-pasting

When I needed to add a new check (email verification), I added it in one place. The four functions are now ~50 lines each instead of ~150, and the rate limit logic can't drift between them.

### Caching — the big cost saver

**Recipe cache** — globally shared. The first user to ask for "Paneer Bhurji" triggers OpenAI; every user after gets it from the cache. Recipes are deterministic by name, so this is a clean fit. The cache key is a slugified meal name (`paneer-bhurji`, `dal-tadka`). Cost per recipe drops from ~$0.001 per user to amortised pennies across all users.

**Meal plan cache** — bucketed by profile shape. Two pure-veg users on a fat-loss goal with similar calorie/protein targets and the same pantry get the same plan. Key:

```
[goal, diet_type, cuisines, restrictions, calorie_bucket, protein_bucket, kitchen_ingredients]
```

- Calorie bucket: rounded to nearest 100 (1820 and 1850 collide on `c1800`)
- Protein bucket: rounded to nearest 10
- Kitchen ingredients: lowercased, comma-split, sorted, joined — so `"Paneer, Tomato"` and `"tomato,paneer"` collide

**Nutrition cache** — keyed by a normalised query string. We strip numbers and units so `"2 rotis"` and `"3 rotis"` share the key `roti`. Macros are then scaled by the count extracted from the original query.

**Swaps are not cached.** Each swap should feel novel — reusing "lighter alternative to paneer butter masala" would feel broken.

### The prompts — system/user split

Every function uses two messages:
- `system`: stable persona — "You are a professional Indian dietitian…"
- `user`: the actual task with the dynamic variables

This improves instruction-following on `gpt-4o-mini` because the role boundary is what the model is trained to attend to. Same input token cost, measurably more consistent output.

### Temperature settings

| Action | Temperature | Why |
|---|---|---|
| `meal_plan` | 0.7 | Mild creativity for variety across days |
| `recipe` | 0.7 | Same — recipe steps benefit from natural language |
| `swap` | 0.7 | Was 0.8 — dropped because high temperature caused occasional nonsense macros |
| `nutrition` | 0.3 | Factual lookup, low temperature for consistency |

### Forcing JSON output

Every call uses `response_format: { type: "json_object" }`. Combined with a strict JSON schema in the user prompt, parsing rarely fails. Without it, you'd occasionally get prose like "Here's your meal plan:\n```json{...}```" that breaks `JSON.parse`.

### The audit log: `ai_usage_log`

Every AI call writes a row here regardless of outcome:

```
user_id, action, status (pending|success|cache_hit|rate_limited|openai_error),
cache_hit, tokens_in, tokens_out, cost_micros, latency_ms, meta
```

`cost_micros` is computed at the edge function from token counts (gpt-4o-mini = 15 micro-cents per 1k input tokens, 60 per 1k output). This is what powers cost monitoring and per-user spend visibility.

### Pre-launch quality bugs I fixed

When I audited the prompts before launch, I found three things wrong with the meal plan generation:

1. **Kitchen ingredients were claimed but not delivered.** The profile field was fetched but never put in the prompt. "Built around what's in your kitchen" was false. Fix: added a `Pantry on hand: ...` line to the prompt.
2. **Cache buckets were too coarse.** ±200 kcal / ±20g protein meant real users almost never shared cache entries. Tightened to ±100 / ±10.
3. **Diet rule was hardcoded.** The prompt said "all meals must be Indian vegetarian" even for non-veg users. Replaced with a dynamic `dietRule(dietType)` switch.

I also stopped asking the AI to invent fake Instagram/YouTube URLs for the recipe screen (~50 tokens saved per call). The client now constructs deterministic YouTube search URLs from the meal name — they actually work.

### Cost math (back-of-envelope)

- gpt-4o-mini: $0.15 / 1M input tokens, $0.60 / 1M output tokens
- A meal plan call: ~600 input + ~1200 output = $0.0009 (~₹0.08)
- A recipe call: ~500 input + ~700 output = $0.0005 (~₹0.04)
- A swap: ~400 input + ~200 output = $0.0002 (~₹0.02)
- A nutrition lookup: ~250 input + ~100 output = $0.00009 (~₹0.008)

With cache hits, the amortised cost per user per month is well under ₹1 at current daily limits.

---

## 8. Pro membership & rate limiting

### The model

New signups land as auto-Pro early-birds (`is_pro=true`, `is_early_bird=true`, `pro_since=now()`) via a Postgres trigger on `auth.users` insert that creates the matching `profiles` row. Flipping `is_pro=false` on a user downgrades them to free-tier limits at the next AI call — `ai-guard.ts` reads the flag live, no client cache.

### Why no real paywall yet

I'm pre-launch. Charging now would block the only thing I need at this stage: user feedback. The infrastructure to charge (RevenueCat, StoreKit, Play Billing) is ready to wire when the time comes; the `is_pro` column already gates the AI usage.

### How rate limits work

Silent per-tier caps per action per day, read from `app_config`:

| Action | Pro key / default | Free key / default |
|---|---|---|
| Regenerate meal plan | `limit_meal_plan` / 3 | `limit_meal_plan_free` / 1 |
| Open recipe | `limit_recipe` / 8 | `limit_recipe_free` / 2 |
| Swap meal | `limit_swap` / 5 | `limit_swap_free` / 1 |
| Nutrition lookup | `limit_nutrition` / 20 | `limit_nutrition_free` / 3 |

Free users hitting the cap see a 429 with `code: upgrade_required` (vs Pro's `rate_limited`). Both route to the same friendly toast on the client; the code distinction is kept server-side for analytics and future upsell flows.

When over limit, the edge function returns 429 with a friendly action-specific message ("You've explored a lot of recipes today! More flavours await tomorrow."). The client routes this through `ProContext` to a soft toast — the user never sees the word "limit" or "quota."

### Atomic counter via Postgres RPC

```sql
create or replace function check_and_increment_rate_limit(
  p_user_id uuid, p_action text, p_daily_limit int
) returns boolean as $$
  -- Upsert (user_id, action, today) → count = count + 1
  -- Return false if count > limit; true otherwise
$$ language plpgsql security definer;
```

This is **atomic in Postgres** — two parallel requests from the same user can't both succeed when the user is at limit-1. The `SECURITY DEFINER` lets the function bypass RLS to write to `ai_rate_limits`.

---

## 9. TDEE / macro calculations — the science

### BMR (Basal Metabolic Rate)

The energy needed at complete rest. I use the **Mifflin-St Jeor equation**, gender-neutral average:

```
bmrMale   = 10 × weight + 6.25 × height − 5 × age + 5
bmrFemale = 10 × weight + 6.25 × height − 5 × age − 161
bmr       = (bmrMale + bmrFemale) / 2
```

Gender-neutral average because we don't ask gender in onboarding. The difference is small (~5%) at the population level.

### TDEE (Total Daily Energy Expenditure)

`tdee = bmr × activityMultiplier`

| Activity level | Multiplier |
|---|---|
| Mostly Sitting | 1.2 |
| A Bit Active | 1.375 |
| Very Active | 1.725 |

### Calorie target by goal

```
fat_loss     → tdee − 400
stay_healthy → tdee
muscle_gain  → tdee + 250
```

A 400 kcal deficit gives ~1 kg of fat loss per fortnight. A 250 kcal surplus gives clean muscle gain without excess fat.

Floor: 1200 kcal minimum. Anything lower is medically unsafe without supervision.

### Protein target — the careful part

The naive formula (`weight × 1.8g` for muscle gain) breaks for two cases:

1. **Overweight people** get given panic-inducing targets they can't hit. A 100 kg person who wants to stay healthy gets told to eat 180g protein — basically impossible on a normal Indian diet.
2. **Underweight people** get *too low* a target. A 55 kg person at 170 cm (BMI 19, underweight) shouldn't be told to eat just 55g — they need more to build to a healthy weight.

So I use the **Devine formula for Ideal Body Weight (IBW)** as the protein base:

```
heightInches = heightCm / 2.54
ibwMale   = 50   + 2.3 × max(0, heightInches − 60)
ibwFemale = 45.5 + 2.3 × max(0, heightInches − 60)
ibw       = (ibwMale + ibwFemale) / 2
```

Then:

```
if weight > ibw:   base = ibw + 0.25 × (weight − ibw)   // Adjusted Body Weight
else:              base = ibw
```

**Adjusted Body Weight** is the clinical-nutrition standard for overweight protein dosing. It softens the gap between IBW and actual weight: a 100 kg person at IBW 60 gets a base of 70 (not 60, not 100). Not punishing, not inflated.

For underweight users, using IBW means they get the protein target for the body they're building toward.

### Multipliers (g per kg of base)

```
stay_healthy → 1.0   (WHO minimum for sedentary adults)
fat_loss     → 1.4   (preserve muscle during a deficit)
muscle_gain  → 1.8   (hypertrophy range, achievable on Indian diet)
```

Plus `+0.2` if age ≥ 55 to counter sarcopenia (age-related muscle loss).

### Carbs and fat — derived live

Stored only `daily_calories` and `daily_protein` in the DB. Carbs and fat are computed at read time on the home screen:

```
proteinCals   = protein × 4
remainingCals = calories − proteinCals
carbs         = (remainingCals × 0.6) / 4
fat           = (remainingCals × 0.4) / 9
```

The 60/40 split favours carbs because Indian diets are carb-heavy (rice, roti, dal) — forcing a 40/40/20 split would be a misfit. The energy math is correct: protein and carbs are 4 kcal/g, fat is 9 kcal/g.

### The streak

`streak` is `data.streak` — the number of consecutive past days (ending today or yesterday) with at least one logged meal. Computed in `useHomeData.ts`:

```ts
// Start cursor at today; if today has no logs, start at yesterday
// (opening the app in the morning before logging shouldn't break the streak).
// Walk backwards day by day; stop on the first day with no logs.
```

Milestone days (3, 7, 14, 30) auto-open the share sheet. Day 2 also triggers a silent `StoreReview.requestReview()` — the right moment to ask for a rating is after a habit signal, not on day 1.

---

## 10. Native quirks: splash, notifications, Android New Arch

### Splash flow

Three layers:

1. **Native splash** — the static dark-green image with the Nourish wordmark. Held visible by `expo-splash-screen` via `SplashScreen.preventAutoHideAsync()`. Shown for the duration of cold boot until JS is ready.
2. **Animated splash** — Reanimated breathing logo, fade-in wordmark, fade-in tagline. Shown for a minimum of 2 seconds in `app/index.tsx` while the session check completes.
3. **Breathing logo loader** — small Reanimated component shown on the Home screen if data isn't ready yet. Minimum 1.2 seconds so it's always seen on cold start, not just on slow connections.

### Android notification icon

This bit me. The notification icon shown in the Android status bar was rendering as a circular dot instead of the logo shape. The problem was that the source PNG had semi-transparent anti-aliased edges that Android composites into a "blob" at small sizes (24dp).

Fix: regenerate the icon as a strictly binary PNG — every pixel is either fully white (255,255,255,255) or fully transparent (0,0,0,0). Nothing in between. Android then renders the exact logo shape with the `#1A3A2A` accent tint.

### Android New Architecture overlays

SDK 56 enables the New Architecture (Fabric + TurboModules) by default. `FullWindowOverlay` from `react-native-screens` — which I used for the home drawer and notification sheet — is a **no-op on Android with New Arch**. The component renders nothing.

A user reported "the drawer doesn't open on Android." It *did* open — the backdrop tap-handler worked — but the visual was invisible.

Fix: replace `FullWindowOverlay` with a plain `<Modal hardwareAccelerated statusBarTranslucent>`. The `hardwareAccelerated` flag is what makes the modal render correctly above other content on the New Arch.

Same fix applied to three sheets: `HomeDrawer`, `NotifSheet`, and `HowItWorksModal`.

### `expo-notifications` and Expo Go

Expo Go removed `expo-notifications` support in SDK 53+. A bare `import * as Notifications from 'expo-notifications'` crashes the app at module load — not at first use, at import time. This killed cold start in Expo Go.

I never resolved this from Expo Go's side because Google OAuth is also broken in Expo Go (no auth proxy since SDK 50). The workflow now is: develop everything except auth/notifications in Expo Go, test those on EAS preview builds.

### The midnight date bug

The Log tab originally used `new Date().toISOString().split('T')[0]` to get "today's date" for storing in the `daily_logs.date` column. This returns **UTC**.

At 1:30 AM IST on Wednesday, UTC is still Tuesday 8 PM. So meals logged after midnight local time were saved under the wrong day, never appeared on the next day's home screen.

Fix: centralised a `localDateStr()` helper in `lib/date.ts` that uses the device's local timezone. Replaced all four UTC instances. The home tab was already correct; the bug was in the log tab and a few other spots.

---

## 11. Common interview questions with answers

### "How do you handle authentication?"

Supabase Auth + Google OAuth via `expo-auth-session`. The user taps "Continue with Google" → in-app browser opens Google OAuth → redirects to `nourish://auth/callback` → Supabase exchanges the auth code for a JWT → JWT stored in iOS Keychain / Android Keystore via `expo-secure-store`. The Supabase JS client is configured with a custom storage adapter pointing at SecureStore so sessions survive app restarts.

### "How do you secure the database?"

Row Level Security on every table. Each policy uses `auth.uid() = user_id` — meaning every query the client sends is implicitly filtered to "rows belonging to this user." The Supabase anon key in the app bundle is safe to ship; it's just a passport for RLS-protected queries.

### "How do you keep AI costs down?"

Three layers:
1. **Caching.** Recipes are globally shared across users (one OpenAI call per dish, ever). Meal plans are bucketed by profile shape + pantry so users with similar bodies share generated plans. Nutrition lookups normalise the query so "2 rotis" and "3 rotis" share a cache entry, then we scale the macros.
2. **Rate limits.** Per-user-per-day caps enforced atomically via a Postgres RPC. Tunable live from `app_config`.
3. **Prompt design.** System/user message split for better instruction-following. Forced JSON output to avoid parse failures. Server-side deterministic URLs instead of asking the AI to invent them.

### "Why not React Query?"

Honest answer: I'd consider adding it later. The reasons it's not in today: custom hooks give precise control over each screen's data needs, refetch-on-focus and event-bus sync cover the same use cases, and adding it now would mean refactoring every hook for marginal benefit. The threshold I'd add it at: 5+ hooks duplicating the same loading/error boilerplate.

### "Why no Redux?"

There's no app-wide state to share. Each screen owns its data via a custom hook. Cross-screen sync happens through `useFocusEffect` (on tab switch) and `DeviceEventEmitter` (on mutation). The only global piece is Pro membership, which uses one React context.

### "How do you handle errors?"

Three layers:
1. **`ErrorBoundary`** wraps the whole app — catches React render errors, sends to PostHog as `js_error` events.
2. **Global `ErrorUtils.setGlobalHandler`** catches uncaught JS errors outside React, also routed to PostHog.
3. **`AIError`** typed exception class for AI calls — distinguishes `rate_limited` (silent toast via ProContext), `openai_error` (inline message), `unauthorized` (route to login).

### "How does the splash screen work?"

Three layers — native splash held by `expo-splash-screen` until JS is ready; animated Reanimated splash for at least 2 seconds in `app/index.tsx` while session check runs in parallel; breathing logo loader for at least 1.2 seconds on home if data isn't ready. The `splashGate` module coordinates when the native splash hides — `armSplashGate(2000)` sets a safety timer, `releaseSplash()` hides it when first paint is ready, whichever comes first.

### "How would this scale to 100k users?"

A few things would need to change but not the architecture:
- **Edge function cold starts** could become a problem; switch to provisioned concurrency or move hot paths to a long-running Node service.
- **Meal plan caching** would need its TTL examined — right now plans live forever in the cache; we'd want a 30-day expiry.
- **Recipe cache** would still work; in fact it gets better with scale (more users hitting the same dishes).
- **Rate limits** would need to be region-aware if we expand outside India.
- **AI cost** would need a per-user spend cap on top of rate limits — to bound abuse from rate-limit-bypass attempts.

The core decisions (RLS, Edge Functions, JSONB meal plans, cache-by-bucket) all hold up.

### "What would you build next?"

In order:
1. **In-app feedback surface** — already shipped, writes to `feedback` table with auto-captured email.
2. **AI prompt versioning** — store prompts in `app_config` with a version number so each `ai_usage_log` row records which prompt version produced it. Lets me A/B test prompts and attribute quality changes.
3. **Recipe history / favourites** — users want "log that thing I had on Tuesday again."
4. **Weekly progress emails** — retention driver, "You hit your protein target 5/7 days last week."
5. **Image-based logging** — "Take a photo of your plate → AI tells you what's in it." GPT-4o vision can do this; it'd be the killer feature.

### "What would you do differently next time?"

1. **Set up CI from day 1.** No tests, no GitHub Actions for typecheck. Caught most things manually; would have caught more with even basic CI.
2. **Pick a smaller framework subset.** I used Expo Router file-based routing and `expo-auth-session` and `expo-haptics` and `expo-notifications` and `expo-secure-store`. Each was justified individually; cumulatively it's a lot of Expo-specific surface area.
3. **Decide on the AI cost model before building.** I started with a credits system, then ripped it out and replaced with Pro membership + rate limits. The credit system was correct technically but wrong product-wise — users felt rationed, not pampered.

---

## 12. Trade-offs I made and would defend

### Direct Supabase client calls (no API layer)

**Choice:** Screens import the Supabase client and write `.from('profiles').select(...)` directly. No Express server in between.

**Trade-off:** Tight coupling between client code and DB schema. Schema changes break the client at compile time (via generated types) instead of at runtime.

**Why I'd defend it:** That's actually what I want. Catching schema mismatches at build time is better than runtime. The "API layer" you'd add would mostly be a passthrough — auth is handled by JWT + RLS, data shape is handled by the client. Adding a layer just to add a layer is over-engineering.

### Pure JSONB meal plans

**Choice:** Whole 6-day meal plan stored as one JSONB blob in `meal_plans.plan`.

**Trade-off:** Can't write queries like "show me all users who had paneer on day 3 of their plan."

**Why I'd defend it:** I don't need that query. The plan is always read whole, generated whole, mutated whole. Normalising would mean three joins on every home screen load with zero product benefit. If analytics ever needs it, I can run a one-off `jsonb_array_elements` query.

### Profile bucketing for plan cache

**Choice:** Two users with similar bodies share the same generated meal plan.

**Trade-off:** Plans aren't personalised at the meal level — only at the bucket level.

**Why I'd defend it:** Most personalisation comes from the *profile* (calories, protein, diet, pantry), not from each meal being unique to the individual. Sharing plans cuts cost by ~70% and quality is indistinguishable in blind tests. If a user wants more personalisation, they swap a meal — and swaps aren't cached.

### Forward-only migrations, no rollback

**Choice:** When a migration is wrong, write a new one to fix it. Don't edit applied migrations.

**Trade-off:** Migration history is messier — you see `drop_legacy_credits.sql` next to `credits.sql` next to `secure_credit_rpcs.sql`.

**Why I'd defend it:** Editing applied migrations breaks every environment that's already applied them. Forward-only is the only safe model when you have multiple environments (dev + prod soon). The messiness is honest.

### One global context, no Redux

**Choice:** Pro membership in a single React context; everything else local state or custom hooks.

**Trade-off:** Adding a second global concept means another context or finally biting the bullet on a state library.

**Why I'd defend it:** Each layer should pay for itself. Pro membership genuinely needs to be global (the avatar ring, the rate-limit toast, the AI invoke wrapper). Nothing else does. Adding Redux to "be ready for the future" optimises for hypothetical future requirements at the cost of current simplicity.

### Edge Functions over a long-running server

**Choice:** Deno serverless functions on Supabase, not a Node service on Fly or Railway.

**Trade-off:** Cold starts (~500ms on first call), Deno's smaller ecosystem.

**Why I'd defend it:** I pay for what I use, I don't manage uptime, I get free secret management via `supabase secrets`. At 100k users I'd reconsider; at 10–10k it's the right answer.

---

## Final note

If you can explain any one of these sections in your own words for two minutes without referring back, you'll handle the interview question on that topic.

The hardest thing in interviews isn't the technical depth — it's confidently saying "I chose X because Y, and the trade-off was Z." Every choice in this codebase has all three. The doc is structured so you can find each.

Good luck.
