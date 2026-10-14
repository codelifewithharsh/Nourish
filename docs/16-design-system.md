# 16 — The Design System (End to End)

*Written 2026-09-09, against v1.1.0. This is the "explain how Nourish works" doc: the whole system, from a tap on the camera button to a row in Postgres and back.*

Docs [12](./12-codebase-reference.md) and [15](./15-version-2.md) are **reference** — what exists, where it lives. This one is **explanation** — how the pieces fit and why they're arranged this way. If you're being asked to describe the app end to end, read this. Where a specific fact matters, doc 12 + doc 15 remain the source of truth.

For **"why did you choose that?"** — Postgres, Supabase, no Redux, key handling, auth — see [17-interview-answers.md](./17-interview-answers.md). New to the vocabulary? Start with §0 below.

---

## 0. Plain-language glossary

Five terms that carry most of the confusion. Each is one idea.

**RLS (Row Level Security)** — a rule on each table saying which rows you may see: `user_id = auth.uid()`. Postgres reads your login token and silently filters every query to your own rows. `select * from daily_logs` with no filter returns only *your* logs — because the database refuses to return others', not because the app remembered to ask. *This is why the app needs no backend server.*

**Anon key vs user JWT** — two keys, two jobs. The **anon key** says *which project* this request is for; it's public by design and shipped inside the app. The **JWT** says *which person* is asking; it's issued at login and kept in the phone's secure store. Address vs keycard: the address tells the request where to go, the keycard gets you in. With only the anon key, `auth.uid()` is null, every RLS rule fails, and you read **nothing**. You never attach the JWT by hand — the Supabase client does it on every call once you're logged in.

**"The code default is only a fallback"** — tunable numbers (rate limits, prices, copy) live in the `app_config` table, not in the app binary. The code asks the database first; the constant in `ai-guard.ts` is used *only if the row is missing*:
```sql
select value into v_val from app_config where key = p_key;
if v_val is null then return p_default; end if;   -- ← the fallback
```
Why: a mobile app can't be hot-fixed, so a bad number in the binary is stuck behind app-store review. In a table, it changes in seconds. **The trap:** editing the constant does nothing if the row exists — the row wins. Update the row.

**Bucketed profile key** — meal plans are cached and reused, but an exact-match key on "2013 calories" would never match anyone. So numbers are **rounded** before forming the key: calories to the nearest 100, protein to the nearest 10. Everyone from 1951–2050 kcal shares one bucket, so two similar users share a generated plan instead of costing two API calls. Like shoe sizes — feet vary continuously, shoes come in sizes, one shoe fits many people. The ~1% rounding error is far smaller than the error in estimating a bowl of dal. **Allergies are *not* bucketed** — they're matched exactly, because sharing a plan across different allergies is a safety problem, not a quality one.

**`onLogged`** — see §4.3. Short version: logging used to be a tab, so navigating back to Home made it refetch for free. Now the review sheet opens *over* Home, which never unmounts and would show stale numbers. With no global cache to invalidate, screens hand the provider a callback and it calls them after saving.

---

## 1. The system in one paragraph

Nourish is an **AI nutritionist for Indian eaters**, built as an Expo/React Native app talking directly to Supabase. There is **no backend server of our own** — the client speaks to Postgres over the Supabase client (with Row Level Security doing the authorization), and to five Deno edge functions for anything involving an AI model. The user photographs a plate; a vision model decomposes it into individual dishes with per-item macros; the user corrects the portions; each item becomes its own row in `daily_logs`. Everything else in the app — the dashboard, the meal plan, the streak — is a read over those rows.

The one-line version: **the camera is the product, `daily_logs` is the database, and the edge functions are the only thing that holds a model key.**

## 2. The four architectural decisions

Almost everything in the codebase follows from four choices. Understanding these is understanding the system.

### 2.1 No backend of our own

The client talks to Postgres directly. There is no Express/Nest/Django tier, no REST API we maintain, no GraphQL.

**Why this works:** authorization is not application logic here — it's *row ownership*. Every table is RLS-enabled with the same policy shape: `user_id = auth.uid()`. A user physically cannot read another user's rows, because Postgres refuses, not because a middleware checked. A backend tier would mostly be re-implementing that check in a place where it's easier to get wrong.

**What it costs:** business logic that *must* be trusted has nowhere to live on the client. That's why anything trusted — rate limits, model calls, cost accounting — is in an edge function instead. The rule is: **if the client could lie about it, it doesn't run on the client.**

### 2.2 The client never holds a model key

All five AI endpoints are server-side Deno functions. The client's `OPENAI_API_KEY` doesn't exist; it's a Supabase secret readable only inside the function runtime.

This isn't only about key theft. It's what makes rate limiting, cost logging, and prompt iteration possible at all — a prompt shipped in the app binary can't be changed without a release, and a key in the binary can be extracted from the APK in minutes.

### 2.3 No global state library

No Redux, no Zustand, no React Query. **Screens own their own fetching.** When one screen changes something another screen displays, it emits a `DeviceEventEmitter` event (`lib/events.ts`) and the other screen refetches.

**Why:** the app has ~6 screens and one user's data. A state library's value is coordinating many writers of shared cache; here there's one writer per concern. The cost is real though — cross-screen sync is manual, and forgetting to emit an event is a class of bug that a query cache would have made impossible. Photo logging works around this with an explicit subscription (`onLogged`, §4.3), which is the same idea done properly for the one flow where it mattered.

### 2.4 Live config over redeploys

`app_config` is a key/value table, readable by anon+authenticated, writable only from the dashboard. Rate limits, pricing copy, the store URL, login taglines all live there and are read at call time via `get_config_int` / `get_config_text`.

A mobile app can't be hot-fixed — a bad limit shipped in a binary is stuck behind app-store review. So anything we might want to tune under pressure is a config row, not a constant. **The code default is only a fallback when the row is missing.** (Corollary that has bitten before: changing a default in `ai-guard.ts` does *nothing* to a live database if the row exists. Update the row.)

## 3. The layer cake

```
┌───────────────────────────────────────────────────────────────┐
│  EXPO / REACT NATIVE CLIENT                                   │
│                                                               │
│  app/          routes (expo-router, file-based)               │
│  features/     screen logic, hooks, providers                 │
│  components/   UI primitives (Txt, Button, Card, tab bar)     │
│  lib/          supabase client, aiClient, analytics, date     │
└───────────────┬──────────────────────────┬────────────────────┘
                │                          │
      direct DB │ (anon key + user JWT)    │ invoke() + user JWT
      RLS-gated │                          │
                ▼                          ▼
┌───────────────────────────┐  ┌────────────────────────────────┐
│  SUPABASE POSTGRES        │  │  DENO EDGE FUNCTIONS           │
│                           │  │                                │
│  profiles   daily_logs    │  │  _shared/ai-guard.ts  ← the    │
│  meal_plans water_logs    │◄─┤    pattern every fn follows    │
│  weight_logs recipes      │  │                                │
│  *_cache    app_config    │  │  generate-meal-plan            │
│  ai_rate_limits           │  │  lookup-nutrition              │
│  ai_usage_log  feedback   │  │  lookup-nutrition-photo ← v2   │
│                           │  │  get-recipe   swap-meal        │
│  RLS: user_id = auth.uid()│  │                                │
└───────────────────────────┘  └──────────────┬─────────────────┘
                                              │ OPENAI_API_KEY
┌───────────────────────────┐                 │ (secret, server-only)
│  SUPABASE STORAGE         │                 ▼
│  meal-photos (private)    │        ┌─────────────────┐
│  per-user RLS on path[0]  │        │  OpenAI         │
│  read via signed URLs     │        │  gpt-4o-mini    │
└───────────────────────────┘        │  text + vision  │
                                     └─────────────────┘
```

Two paths out of the client, and the distinction is the whole security model:

- **Direct to Postgres** — reads and writes of the user's own rows. Safe because RLS makes "whose row is this" a database-level fact.
- **Through an edge function** — anything touching a model. Safe because the key, the prompt, the rate limit and the cost accounting all live where the user can't reach them.

## 4. The primary flow: photograph a meal

This is the flow the app is built around. Everything else is secondary.

```
   USER                CLIENT                    EDGE FN              DB / STORAGE
    │                    │                          │                      │
    │  taps 📷 in        │                          │                      │
    │  tab bar ─────────►│ PhotoLogProvider.start() │                      │
    │                    │  (mounted once in        │                      │
    │                    │   _layout, above tabs)   │                      │
    │                    │                          │                      │
    │  ◄─ permission ────┤ requestCameraPermission  │                      │
    │     prompt         │  denied+!canAskAgain →   │                      │
    │                    │  offer Settings deeplink │                      │
    │                    │                          │                      │
    │  takes photo ─────►│ launchCameraAsync        │                      │
    │                    │                          │                      │
    │                    │ ── DOWNSCALE ──          │                      │
    │                    │ long edge → 1024px       │                      │
    │                    │ JPEG q=0.7, base64       │                      │
    │                    │ (fewer bytes on mobile   │                      │
    │                    │  data; model uses        │                      │
    │                    │  detail:"low" anyway)    │                      │
    │                    │                          │                      │
    │  "analyzing…" ◄────┤ useAI('lookup-          │                      │
    │                    │   nutrition-photo') ────►│                      │
    │                    │   + user JWT             │                      │
    │                    │                          │ guard(req,"photo")   │
    │                    │                          ├─ authz ─────────────►│
    │                    │                          ├─ is_pro? ───────────►│
    │                    │                          ├─ get_config_int ────►│
    │                    │                          ├─ check_and_increment │
    │                    │                          │  _rate_limit ───────►│
    │                    │                          │   over? → 429        │
    │                    │                          │                      │
    │                    │                          │ g.start() → 'pending'│
    │                    │                          │   row in ai_usage_log│
    │                    │                          │                      │
    │                    │                          │ ── VISION CALL ──    │
    │                    │                          │ system prompt names  │
    │                    │                          │ katori 150ml, roti   │
    │                    │                          │ 15cm, thali 28cm,    │
    │                    │                          │ tsp oil 5ml          │
    │                    │                          │ "never emit a single │
    │                    │                          │  thali row"          │
    │                    │                          │      │               │
    │                    │                          │      ▼ OpenAI        │
    │                    │                          │ sanitise every field │
    │                    │                          │ recordOutcome(tokens)│
    │                    │  ◄── {items[], total, ───┤ ────────────────────►│
    │                    │      meal_name, notes}   │   cost_micros, ms    │
    │                    │                          │                      │
    │  ◄─ REVIEW SHEET ──┤ PhotoResultSheet         │                      │
    │     per item:      │  renders above whatever  │                      │
    │     ± portion      │  screen you were on      │                      │
    │     0.25×–3×       │                          │                      │
    │     edit macros    │  ← THE CORRECTION IS     │                      │
    │     remove item    │    THE MOAT              │                      │
    │     meal type      │                          │                      │
    │                    │                          │                      │
    │  confirms ────────►│ getUser() (resolved here,│                      │
    │                    │  not held in state)      │                      │
    │                    │                          │                      │
    │                    │ uploadPhoto(base64) ─────┼─────────────────────►│
    │                    │  path = {uid}/{ts}.jpg   │   meal-photos bucket │
    │                    │  best-effort: null on    │   RLS on path[0]     │
    │                    │  failure, never blocks   │                      │
    │                    │                          │                      │
    │                    │ insert ONE ROW PER ITEM ─┼─────────────────────►│
    │                    │  shared photo_path       │   daily_logs         │
    │                    │  source='photo'          │                      │
    │                    │                          │                      │
    │  ◄─ dashboard ─────┤ listeners.forEach(fn)    │                      │
    │     updated        │  → subscribed screens    │                      │
    │                    │    refetch               │                      │
```

Four decisions in that diagram are worth stating out loud, because they're the ones people ask about.

### 4.1 One row per item, not one row per photo

A thali is 4–8 foods. A single row saying "thali, 900 kcal" is useless — it can't be corrected item by item, it can't feed a per-dish cache, and it tells the user nothing actionable. So each identified food becomes its own `daily_logs` row, and rows from the same photo share a `photo_path` so the UI can regroup them.

This is also what makes Phase 3 (thali decomposition) possible at all. Collapsing early would have foreclosed it.

### 4.2 The rate limit increments *before* the model call

`guard()` counts the attempt, then the work happens. So a retake, or a photo of a table with no food on it, still costs a scan. That's a deliberate trade: the counter is the spend protection, and a counter that only fires on success can be farmed by making calls that fail. Limits are Pro 6/day, free 2/day — deliberately close to real meal counts because vision calls are the most expensive thing in the system — and both are `app_config` rows, tunable without a release.

### 4.3 The provider is mounted once, above the tab bar

`PhotoLogProvider` sits in `app/_layout.tsx`, inside `ProProvider` (because capture goes through `useAI()`). Every entry point — the tab bar's detached camera button, each meal card's "Scan", the "Ate something else?" card — calls the same `start()`.

The reasoning is a product one: **logging is an action, not a destination.** In v1 logging was a tab, which meant reaching it was a navigation. Now the review sheet renders above whatever screen you're already on and you're returned there.

That creates a problem the no-global-state decision (§2.3) doesn't solve. Concretely:

```
v1:  tap Log tab → NAVIGATE away → save → navigate back
     → Home remounts → refetches → new number shows.
     The navigation WAS the refresh trigger.

v2:  on Home → tap 📷 → sheet slides up OVER Home → save → sheet closes
     → you're still on Home. It never unmounted, never refetched.
     Rows are in the DB; the screen shows stale numbers.
```

With React Query the cache would invalidate and every subscriber would re-render. We deliberately don't have one, so it's hand-rolled — screens register a callback, the provider fires them all after the insert:

```ts
// Home: "tell me when anything is logged"
useEffect(() => onLogged(() => refetch()), []);

// Provider, after inserting the rows:
listeners.forEach(fn => fn());
```

About fifteen lines, and **the one place the no-state-library decision visibly cost us code.** A second flow like this would justify React Query rather than a second hand-rolled pub/sub.

### 4.4 No photo cache, but per-item cache reuse

Every photo is unique, so a photo-level cache would never hit — the function doesn't even try. But once the model has named an item, "roti" is just a text query, and it resolves through the existing `nutrition_cache` via `nutritionCacheKey()`. One source of truth for dish macros, and the cache economics come free.

## 5. The guard: one pattern, every AI endpoint

Every AI endpoint is the same seven lines. This is the most important pattern in the codebase.

```ts
const pf = corsPreflight(req); if (pf) return pf;
const g  = await guard(req, "<action>");   // authz + rate limit
if (!g.ok) return g.response;
// optional: cache hit → g.markCacheHit({...}); return cached
const { recordOutcome } = g.start();       // insert 'pending' log row
// ... model call ...
await recordOutcome({ status: "success", tokens_in, tokens_out, model });
```

What `guard()` does, in order:

```
  Authorization header?  ──── no ──►  401
        │ yes
        ▼
  user-scoped client (caller's JWT, so RLS applies to its reads)
  + optional service-role `admin` client for logging
        │
        ▼
  getUser()  ──── none ──►  401
        │      ──── email set but unconfirmed ──►  403
        ▼
  read profiles.is_pro
    └─ read error? → DEFAULT TO PRO. A DB hiccup must never
       throttle a real user. Fail open, deliberately.
        │
        ▼
  pick limit_<action> (Pro) or limit_<action>_free (non-Pro)
        │
        ▼
  get_config_int(key, default)   ← live value from app_config
        │
        ▼
  check_and_increment_rate_limit(user, action, limit)
    │  atomic, SECURITY DEFINER — the check and the increment are
    │  one statement, so two concurrent calls can't both pass
    │
    ├─ RPC error ──►  503   (never silently allow)
    ├─ false      ──►  429   Pro:     code "rate_limited"    + warm copy
    │                        non-Pro: code "upgrade_required"
    └─ true       ──►  proceed
```

Three things about this worth internalizing:

**It counts cache hits.** A cached response is free for us but hammering the cache is still abuse, so the counter increments regardless. `markCacheHit()` logs it at zero cost.

**It fails open on `is_pro`, closed on the rate limit.** Different failures deserve different defaults. Not knowing whether someone is Pro should never cost them access — assume Pro. Not knowing whether they're over the limit is a spend risk — return 503 rather than guess.

**Every attempt is logged.** `ai_usage_log` gets a `pending` row before the model call and an update after, carrying status, token counts, `cost_micros` (BigInt micro-cents, so no float drift) and latency. That table is the entire monitoring story — cost per user, cache hit rate, p95 latency, error rate all come from it.

### The five endpoints

| Action | Pro/day | Free/day | Function | Cache |
|---|---|---|---|---|
| `meal_plan` | 3 | 0 | `generate-meal-plan` | `meal_plan_cache`, bucketed profile key |
| `recipe` | 8 | 2 | `get-recipe` | `recipes`, global by `meal_key` |
| `swap` | 5 | 1 | `swap-meal` | none |
| `nutrition` | 20 | 3 | `lookup-nutrition` | `nutrition_cache`, normalized query |
| `photo` | 6 | 2 | `lookup-nutrition-photo` | none (per-item reuse instead) |

All on `gpt-4o-mini`. `costMicros(in, out, model)` prices per model from a `MODEL_RATES` table; unknown models fall back to gpt-4o-mini rates so logging never crashes — which means **adding a model without adding its rate silently mis-prices**, the one sharp edge here.

### Cache keys are deliberately lossy

Both text caches normalize aggressively so near-identical inputs collide:

- `nutritionCacheKey()` lowercases, strips accents, punctuation, standalone numbers and unit words. So `"1 medium bowl of rajma!"` ≡ `"rajma"` — one cache entry serves every phrasing.
- `planCacheKey()` buckets calories to the nearest 100 and protein to the nearest 10, sorts cuisines and restrictions, normalizes the pantry text. Two users with similar bodies and identical preferences share a generated plan. Keyed `v2` since fibre was added, to retire pre-fibre plans.

The trade: more profile dimensions in the key (region, budget, allergies) means better plans and fewer cache hits. Allergies join the key as a **safety** requirement, not a quality one — sharing a plan across different allergy sets would be dangerous.

## 6. Identity, sessions and routing

```
  cold start
      │
      ▼
  native splash (dark green + logo)
      │  held by SplashScreen.preventAutoHideAsync()
      │  armSplashGate(2000) — safety cutoff so a hung
      │  network can never strand the user on a splash
      ▼
  app/index.tsx — animates while it works
      │  getSession()  (from expo-secure-store)
      │
      ├─ no session ──────────────────► (auth)/login
      │                                   Google OAuth or guest
      │
      ├─ session, onboarding_completed ─► (tabs)
      │
      └─ session, not completed ───────► (auth)/onboarding
```

`onAuthStateChange` in `_layout.tsx` repeats the same branching for events that happen later (`SIGNED_IN`, `SIGNED_OUT`, `INITIAL_SESSION`) and calls `registerPushToken()` on sign-in. Two places doing the same routing is redundancy, not accident — `index.tsx` handles cold start, the listener handles everything after.

Sessions live in `expo-secure-store` (Keychain / Keystore), not AsyncStorage. Auth is Google OAuth via `expo-auth-session` + `expo-web-browser`, scheme `nourish`. Edge functions receive the caller's JWT and build a user-scoped client from it, so **RLS applies to their reads too** — a function can't accidentally read someone else's profile.

## 7. Onboarding and the domain math

Five steps, sharing one `translateX` in `OnboardingLayout`:

```
  Goal ──► About ──► FoodIdentity ──► Activity ──► PlanReady
  fat_loss   age       cuisines[]      sedentary    computes targets
  muscle_    weight    diet_type       lightly_     writes profile
   gain      height    restrictions[]   active      triggers first plan
  stay_      sex                       very_active
   healthy
```

`PlanReady` is where the system commits: it computes targets via `calculateNutrition()`, writes the profile, and fires the first `generate-meal-plan`.

### The TDEE calculation

```
BMR (Mifflin-St Jeor), base = 10·kg + 6.25·cm − 5·age
    male    = base + 5
    female  = base − 161
    unspec  = average of the two

TDEE = BMR × { sedentary 1.2, lightly_active 1.375, very_active 1.725 }

Calories = TDEE + { fat_loss −400, muscle_gain +250, stay_healthy 0 }
           floor 1200

Devine IBW: male 50 + 2.3(in−60) · female 45.5 + 2.3(in−60)
base = weight > ibw ? ibw + 0.25(weight − ibw)   ← Adjusted Body Weight
                    : ibw
Protein = base × { stay_healthy 1.0, fat_loss 1.4, muscle_gain 1.8 }
          (+0.2 if age ≥ 55, sarcopenia)          floor 40g
```

Three judgment calls in there, each defensible and each worth being able to explain:

**Protein keys off *ideal* weight, not actual.** A 100kg person with an IBW of 60 gets a base of 70 (IBW + 25% of the excess), not 100. Targeting actual weight would give overweight users unreachable protein numbers; targeting bare IBW would feel punishing. Adjusted Body Weight is the clinical-nutrition standard and splits the difference.

**Multipliers sit below US sports-nutrition norms.** 1.0/1.4/1.8 g/kg, tuned for an Indian diet where most users are not athletes and where hitting 2.2 g/kg vegetarian is not realistic advice.

**Sex is now asked, and this was a real bug.** The app used to average the male and female formulas because it never asked. The equations differ by a constant 166 kcal, so **every man was under-fed by ~114 kcal/day and every woman over-fed by the same** — permanently, regardless of body type. Now sex-aware, with `'unspecified'` preserving the old averaged behaviour for anyone who declines.

The failure mode to watch: **both call sites must pass `sex`** — onboarding *and* `profile.tsx`'s recalculation on a weight/height/age/activity/goal edit. Missing it in the second silently reverted users to the averaged formula on their next profile edit. Fixed, but a third call site would reintroduce it.

### Only two numbers are stored

`daily_calories` and `daily_protein` persist. Carbs and fat are **derived at read time**:

```
remaining = calories − protein×4
carbs     = remaining × 0.6 / 4
fat       = remaining × 0.4 / 9
```

A 60/40 split of what's left after protein. Storing them would mean four numbers that can drift out of sync; deriving means one source of truth.

## 8. The data model, and why it's shaped this way

Every table is RLS-enabled, default policy *own rows only*. Migrations are idempotent and additive (`add column if not exists`), and `lib/database.types.ts` is **generated** — migrate, then `npm run types:db`.

| Table | Shape | The interesting bit |
|---|---|---|
| `profiles` | PK = `auth.users.id` | `handle_new_user` trigger creates the row already Pro. Holds body stats, diet prefs, and the v2 progressive fields (`sex`, `region`, `budget_tier`, `medical_flags[]`, `allergies`…) — **columns exist, onboarding UI for most doesn't yet** |
| `daily_logs` | one row per logged item | The center of the app. `source` ∈ `plan`/`text`/`photo`, `photo_path` groups a photo's items, v2 added `fibre`/`sugar`/`sodium`/`sat_fat` |
| `meal_plans` | **`unique(user_id)`** | One plan per user, regenerated wholesale as a jsonb blob. No versioning — a regenerate destroys the old plan |
| `water_logs` | `unique(user_id, date)` | Upsert on conflict |
| `weight_logs` | one row per user per day | v2. Weight used to be a single mutable field with no history, so no trend could be drawn |
| `recipes` | PK `meal_key`, **globally shared** | Any authenticated user reads; writes are service-role only. One user fetching a recipe warms it for everyone |
| `nutrition_cache` / `meal_plan_cache` | keyed, with `hits` | See §5 |
| `ai_rate_limits` | PK `(user_id, action, window_start)` | `window_start` is **UTC** |
| `ai_usage_log` | one row per attempt | The monitoring story: status, cache_hit, tokens, cost_micros, latency_ms |
| `app_config` | PK `key`, text value | Readable by anon+authenticated, dashboard-writable. §2.4 |
| `feedback` | insert-only | 10–2000 chars |

**Storage:** `meal-photos` is a **private** bucket with per-user RLS on the first path segment (`{uid}/...`), read through signed URLs. The user's own photo becomes the log entry's image — free, real, personal, and the reason the app finally looks like a food app.

### The local/UTC asymmetry

This is deliberate and worth explaining precisely, because it looks like an inconsistency:

- **Logs and streaks use local dates** (`todayStr()` / `localDateStr()`). At 1:30 AM IST on Wednesday, UTC is still Tuesday — a meal logged then must land on Wednesday, the day the user thinks it is.
- **`ai_rate_limits.window_start` uses UTC.** A rate limit is a spend-control window, not a user-facing calendar day. UTC makes it uniform and unfarmable across timezones.

`lib/date.ts` exists solely so nobody reaches for `toISOString().split('T')[0]`.

## 9. Cross-screen sync

With no global state, coordination is explicit:

```
  DeviceEventEmitter (lib/events.ts)
    WATER_LOGGED          notification action → Home updates without refetch
    PROFILE_UPDATED       profile edit → dependent screens reload
    MEAL_TIMES_CHANGED    bell sheet ↔ profile stay in agreement
    MEAL_NOTIFS_TOGGLED
    SCROLL_TO_SECTION     drawer → deep-scroll a target screen
    OPEN_GROCERY_LIST     drawer navigates first, then emits — the target
                          screen may not be mounted when the row is tapped
    TOAST_EVENT           (lib/toast.ts) global toast

  PhotoLogProvider.onLogged(fn)   ← the typed version, for the flow
                                    that had no navigation to hang off
```

The clearest example: tapping "log a glass" in a notification tray writes to `water_logs` in `_layout.tsx`, then emits. Home is already mounted and holding the number, so it updates from the event payload rather than re-querying.

## 10. Rate limiting, Pro, and what "Pro" actually means

**Everyone is Pro.** `is_pro` and `is_early_bird` default true and the signup trigger sets them. There is no paywall, no balance, no purchase flow. Pro is a cosmetic badge plus the generous limit tier.

`is_pro = false` exists for one purpose: **throttling suspected abuse.** The free tier's limits go as low as 0/day, which is a moderation tool, not a business model.

Pricing strings (`₹299/yr` struck through, `Free`) are `app_config` copy, not commerce. Nothing charges.

The copy convention matters and is enforced by review: **rate-limit and error messages never mention quotas, credits, or money.** "You've logged a lot today! Photo logging is back tomorrow morning" — warm, no accounting. The 429 carries a machine-readable `code` (`rate_limited` vs `upgrade_required`) so the client can branch without the copy having to.

Client-side: prefer **`useAI()`** from `ProContext` over raw `invokeAI` — same call, but it routes 429s to the global toast automatically.

## 11. Observability

- **`ai_usage_log`** — every AI attempt: status, cache_hit, tokens in/out, `cost_micros`, `latency_ms`, `meta`. Cost per user, cache hit rate, latency and error rate all derive from this one table.
- **PostHog** (`lib/analytics.ts`) — ~40 events, all *feature usage*: `mealLogged`, `photoLogged`, `nutritionLookedUp`, `waterLogged`, `recipeViewed`, `planRegenerated`, `onboardingCompleted`, `jsError`.
- **Errors** — `ErrorBoundary` wraps the tree; `_layout.tsx` additionally installs an `ErrorUtils` global handler that reports to PostHog (stack capped at 1000 chars) before delegating to the previous handler.

**The honest gap:** there are no funnel, activation, or retention-cohort events. The product plan's targets — D1/D7/D30, first-session logging rate, median time to log — are currently **unmeasured**. We can say how often a feature is used, not whether a user came back. That's the first thing to fix before claiming photo logging worked.

**Health-data obligation:** `medical_flags` must never be logged into analytics. It's optional, deletable, and RLS-isolated — and the plan can adapt to it ("lower-GI meals since you noted diabetes") but must never diagnose, treat, or promise outcomes.

## 12. Why the app is shaped like this: the product argument

The engineering follows a product diagnosis, and the two only make sense together.

**The problem.** Live ~2 months, weak retention and word-of-mouth. Manual logging costs 5–10 min/day and is the single biggest reason food apps lose users; photo logging takes ~8 seconds. Photo loggers retain roughly 2.5× better at D30. v1's only logging path was a `TextInput` — **we had built the high-friction version of the one interaction that decides retention.**

**The two structural faults.** (1) There was not a single food image in the app — `recipes.hero_emoji`, an emoji, stood in for a hero image. For a food app that's disqualifying. (2) Home, Meals and Log all answered "what am I eating today?" — one job split across three tabs, which is why new users couldn't tell what the app was for.

**The response, in order:**

1. **Photo logging** kills the friction that drives churn.
2. **3 tabs + a detached camera button** (Home · Plan · Me). `log.tsx` was deleted, not demoted. The user's own photos become the imagery.
3. **Indian portion accuracy is the moat** — not photo logging itself. Identification is 68–86% accurate industry-wide, but **portion estimation runs as low as 39%**, and it's worst on Indian food; a full thali is the hardest case at 70–80%. Cal AI (~$40M ARR, acquired by MyFitnessPal) is weak on regional foods. HealthifyMe's real moat is its 1M+ item Indian database.

Without (3) we're a Cal AI clone. Without (2) nobody stays long enough to notice (3).

**Where the moat physically lives:** in the `lookup-nutrition-photo` system prompt — katori ≈ 150ml, roti ≈ 15cm, thali plate ≈ 28cm, tsp oil ≈ 5ml as reference objects; "never emit a single thali row"; explicit oil/ghee accounting because *"a dal tadka is not a dry dal"* and hidden fat is where Indian home cooking breaks generic models. And in the **corrections**: per-item portion scaling is a proprietary training signal a UI clone cannot copy.

**Cost is settled.** ~1,120 input tokens per photo ≈ **₹0.01/photo**; three meals a day for a month ≈ ₹1/user. Competitor paywalls are a monetization choice, not cost pass-through. This is not to be re-litigated.

## 13. The rules that keep it coherent

From doc 12 §14 and doc 13 §10 — these are the invariants:

1. **Never call a model API from the client.** New AI endpoints go through `guard()` + `recordOutcome()` in an edge function.
2. **Prefer `useAI()`** over raw `invokeAI`, so 429s reach the global toast.
3. **`todayStr()` / `localDateStr()`** for anything user-facing — never `toISOString().split('T')[0]`.
4. **`database.types.ts` is generated.** Migrate, then `npm run types:db`.
5. **Migrations are idempotent and additive.**
6. **`app_config` over redeploys** for anything tunable — and remember the row overrides the code default.
7. **Warm copy.** Never mention quotas, credits, or money.
8. **Screens own their fetching**; cross-screen sync via `DeviceEventEmitter`.
9. **Friction is the enemy.** Any change that adds taps to logging is a regression.
10. **When generality and Indian correctness conflict, choose Indian correctness.**
11. **No dark patterns** in monetization — deceptive billing is what got Cal AI pulled from the App Store.
12. Read the [Expo 56 docs](https://docs.expo.dev/versions/v56.0.0/) before writing Expo code.

## 14. Known sharp edges

Worth knowing before someone finds them for you:

- **`daily-nudge` is orphaned** — deployed, no client call site anywhere. Home's greeting is a static time-of-day string.
- **`dish-image` is dead code** — edge function, bucket and `recipes.image_path` all built, zero references, undeployed. A head start, not a feature.
- **`MODEL_RATES` has no `gpt-image-1` entry**, so deploying `dish-image` would silently mis-log its cost.
- **`ai_response_cache` has no migration** and is absent from the generated types — hand-created, if it exists at all.
- **`WaterBody` re-renders ~40×/sec** while Home is mounted (accelerometer + phase timer, both raw `setState`). Works; heavier than it needs to be.
- **`android.versionCode` is still `1`** — check before a Play Store submission.
- **Progressive profile columns exist without onboarding UI** (`region`, `budget_tier`, `cooking_time`, `medical_flags`…). They're threaded into `planCacheKey` and the plan prompt, but nothing collects them yet.
- **Plans cached before fibre existed lack it**, so the fibre pill renders only when present — a `0g` would read as a nutritional failure rather than missing data.
- **No dark mode, no tablet, portrait phone only.**

---

## Appendix — the 60-second version

If someone asks and you have a minute:

> Nourish is an AI nutritionist for Indian eaters. It's an Expo React Native app with **no backend of our own** — the client talks straight to Supabase Postgres, and Row Level Security (`user_id = auth.uid()`) is the authorization model. Anything involving an AI model goes through one of five Deno edge functions instead, because **the client must never hold a model key**.
>
> The core loop is photo logging. You photograph a plate; the client downscales it to 1024px and posts it to `lookup-nutrition-photo`. Every AI endpoint runs the same `guard()`: authenticate, read `is_pro`, pull the live daily limit from `app_config`, and atomically increment a per-user-per-day counter — then log the attempt with tokens, cost and latency into `ai_usage_log`. A vision model decomposes the plate into individual dishes, using standard Indian serviceware as size references, and the user corrects the portions before anything is written. Each item becomes **its own row** in `daily_logs`, sharing a `photo_path`.
>
> That per-item decomposition and the correction UI are the point. Photo logging itself is commodity — identification is ~80% accurate everywhere. **Portion estimation is the weak link, as low as 39%, and worst on Indian food.** That's the moat: katori-aware prompting, oil and ghee accounting, and user corrections as a proprietary signal nobody gets by cloning the UI.
