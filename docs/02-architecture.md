# 02 — Architecture

*Last updated: 2026-06-05.*

This is the "what shape is the codebase, and why" doc. If you only read one architecture doc, read this one.

---

## 1. High-level shape

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Expo SDK 56)                 │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │ UI screens │→ │  features  │→ │ lib (SDK clients)│   │
│  │  (app/)    │  │  (hooks)   │  │                  │   │
│  └────────────┘  └────────────┘  └──────────────────┘   │
│         ↓                                ↓              │
│  ┌─────────────────┐            ┌──────────────────┐    │
│  │ shared UI       │            │ shared utilities │    │
│  │ components/     │            │ haptics, notifs  │    │
│  └─────────────────┘            └──────────────────┘    │
└─────────────────────────────────┬───────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────┐
│                   SUPABASE BACKEND                      │
│                                                         │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐     │
│  │   Auth   │  │ Postgres   │  │  Edge Functions  │     │
│  │ (OAuth)  │  │  + RLS     │  │     (Deno)       │     │
│  └──────────┘  └────────────┘  └────────┬─────────┘     │
└─────────────────────────────────────────┴───────────────┘
                                          │
                                          ▼
                                      ┌────────┐
                                      │ OpenAI │
                                      │  API   │
                                      └────────┘
```

The client never talks to OpenAI directly. **Every AI call goes through a Supabase Edge Function** so the OpenAI API key stays on the server.

---

## 2. Folder layout

```
nourish/
├─ app/                          ← Expo Router file-based routes
│  ├─ _layout.tsx                ← root providers + ErrorBoundary + auth listener
│  ├─ index.tsx                  ← Reanimated splash → routes by session
│  ├─ (auth)/                    ← unauthenticated routes
│  │  ├─ _layout.tsx
│  │  ├─ login.tsx
│  │  └─ onboarding.tsx
│  ├─ (tabs)/                    ← authenticated routes
│  │  ├─ _layout.tsx             ← FloatingTabBar
│  │  ├─ index.tsx               ← Home (AI nudge, streak, water, meals)
│  │  ├─ meals.tsx               ← 7-day plan + grocery list export
│  │  ├─ log.tsx                 ← AI nutrition lookup
│  │  └─ profile.tsx             ← "You" page (body, preferences, notification times)
│  └─ recipe/[id].tsx            ← recipe detail (dynamic route)
│
├─ components/                   ← cross-screen presentational components
│  ├─ ui/                        ← design primitives (Txt, FloatingTabBar, Toast)
│  ├─ SwapMealModal/             ← unified AI swap sheet
│  ├─ HomeDrawer/                ← left-side drawer (swipe-to-close + deep links)
│  ├─ HowItWorksModal/
│  ├─ StreakShareModal/          ← streak milestone share sheet
│  └─ ErrorBoundary.tsx          ← React error boundary + PostHog crash capture
│
├─ features/                     ← screen-specific business logic
│  ├─ home/useHomeData.ts        ← profile + plan + logs + water + streak
│  ├─ onboarding/                ← step screens + TDEE calc
│  ├─ nutrition/
│  ├─ recipe/useRecipe.ts
│  └─ credits/                   ← whole credits subsystem (context, pill, sheet, costs)
│
├─ lib/                          ← SDK clients + cross-cutting utilities
│  ├─ supabase.ts                ← Supabase client (with SecureStore adapter)
│  ├─ database.types.ts          ← generated from Postgres schema (npm run types:db)
│  ├─ aiClient.ts                ← wrapper around supabase.functions.invoke for AI
│  ├─ analytics.ts               ← PostHog event helpers
│  ├─ events.ts                  ← DeviceEventEmitter constants (cross-screen events)
│  ├─ toast.ts                   ← imperative toast helper
│  ├─ haptics.ts                 ← expo-haptics wrapper
│  └─ notifications.ts           ← expo-notifications wrapper (meal + water reminders)
│
├─ constants/                    ← design tokens (colors, spacing, typography)
│
├─ assets/
│  └─ app_logo/                  ← nourish_logo_white.png + nourish_logo_dark_green.png
│
├─ supabase/
│  ├─ functions/                 ← Deno edge functions
│  │  ├─ _shared/ai-guard.ts     ← shared auth + rate-limit + credits guard
│  │  ├─ generate-meal-plan/
│  │  ├─ get-recipe/
│  │  ├─ lookup-nutrition/
│  │  ├─ swap-meal/
│  │  └─ daily-nudge/            ← free AI nudge, cached per (user, day)
│  └─ migrations/                ← versioned SQL migrations
│
└─ docs/                         ← these documents
```

### Why three top-level code folders (`app/`, `features/`, `components/`)?

- **`app/`** is owned by Expo Router. Every file maps to a route. Keep it thin — screens should delegate logic.
- **`features/`** holds business logic specific to one feature or screen. Hooks, types, computations. This is where the *behaviour* lives.
- **`components/`** holds presentational components used across multiple screens. Modals, drawers, primitives.

**Rule of thumb:** if a file is imported by exactly one screen, it belongs in `features/`. If two or more, promote it to `components/`.

---

## 3. The patterns we follow

### 3.1 File-based routing with route groups (Expo Router v3)

`(auth)` and `(tabs)` are **route groups** — parentheses mean "no URL segment, just a grouping for shared layouts." So `/(auth)/login` is reachable at `/login`, but anything under `(auth)` shares its `_layout.tsx`.

Auth state determines which group you're in.

### 3.2 Single source of truth for routing decisions

[`app/_layout.tsx`](../app/_layout.tsx) mounts the global providers and listens for `SIGNED_OUT` to bounce the user back to `/(auth)/login`. [`app/index.tsx`](../app/index.tsx) is the splash that reads the session and routes:

```
no session                          → /(auth)/login
session + !onboarding_completed     → /(auth)/onboarding
session + onboarding_completed      → /(tabs)
```

Only these two files do navigation routing. This used to be split across more places and caused race conditions. See [doc 03](./03-auth-and-routing.md) for the full flow.

### 3.3 Feature-colocated data hooks (no global state library)

Instead of a global store (Redux, Zustand, Recoil), each screen owns its data via a custom hook:

- `features/home/useHomeData.ts` → fetches profile + plan + logs + water for home
- `features/recipe/useRecipe.ts` → fetches/generates one recipe with cache lookup

Each tab page calls one hook and gets typed `{ data, loading, refresh, mutations }`.

This is the **"React Query lite" pattern done manually**. It works because:
- Each screen has narrow, well-scoped data needs.
- `useFocusEffect` triggers `refresh()` on tab focus for cross-tab sync.
- We're not at the scale where global state pays off yet.

**Exception:** the credits subsystem *is* global (balance, modals, toasts shown anywhere). It lives in `features/credits/CreditsContext.tsx` and wraps the whole app via `<CreditsProvider>` in `app/_layout.tsx`. See [doc 06](./06-credits-and-rate-limits.md).

### 3.4 Direct Supabase calls — no API layer in between

Screens import `supabase` from `lib/supabase.ts` and call `.from().select()` directly. There is no custom Node/Express API in the middle.

Security is enforced by **Postgres Row Level Security (RLS)** policies on every table. The client can only ever read/write its own rows. See [doc 04](./04-supabase-and-database.md).

**Trade-off:** tight coupling between client code and DB schema. Mitigated by:
- TypeScript types auto-generated from schema (`lib/database.types.ts`)
- Fast iteration — no bespoke endpoints to maintain
- RLS guarantees safety

### 3.5 AI logic isolated in Edge Functions

The OpenAI API key never touches the client. Four Deno functions live in `supabase/functions/`:

| Function | Purpose | Cost (credits) |
|---|---|---|
| `generate-meal-plan` | Reads profile from DB, prompts gpt-4o-mini, upserts 7-day plan | 10 |
| `get-recipe` | Generates ingredients + steps for a meal name | 5 |
| `swap-meal` | Mood-based meal alternative ("lighter", "hearty", "quick") | 3 |
| `lookup-nutrition` | Free-text food → `{ name, calories, protein, carbs, fat, serving }` | 1 |
| `daily-nudge` | Personalised home-screen nudge based on profile + today's logs | **0 (free)** |

Every function uses a shared `guard()` helper that handles auth, rate limits, credit deduction, and usage logging in one place. See [doc 05](./05-ai-edge-functions.md).

### 3.6 Modals and sheets over native navigation modals

All sheets/drawers use the React Native `<Modal>` component (not Expo Router modals). Custom slide animations via `Animated`.

Why:
- Modals render above the floating tab bar by default. Route-based modals would render *below* it because the tab bar uses `position: absolute`.
- Full control over animation timing.
- No dependency on `react-native-gesture-handler` (not installed).

### 3.7 Design system via constants + primitives

- `constants/colors.ts` exports a `Colors` object — every component imports from it.
- `components/ui/Txt.tsx` is the typography primitive — no raw `<Text>` should be used.
- No CSS-in-JS library; `StyleSheet.create()` is colocated with each component.

This makes a future dark mode straightforward: change the `Colors` source and everything rebinds.

### 3.8 Optimistic updates with refetch on focus

User actions update local state immediately, then write to the DB:

```typescript
const handleLog = async (meal) => {
  setLoggedTypes(prev => new Set([...prev, meal.type]));  // optimistic
  await supabase.from('daily_logs').insert({...});         // server
};
```

On tab focus, `useFocusEffect(() => refresh())` reconciles with the server.

**Trade-off:** brief inconsistency window, no automatic rollback on server error. Acceptable for this app's surface area.

### 3.9 Auth → onboarding → app as an implicit state machine

The flow is driven by **DB state**, not client state:

```
no session                          → /(auth)/login
session, no profile row             → /(auth)/onboarding
session, onboarding_completed=false → /(auth)/onboarding
session, onboarding_completed=true  → /(tabs)
```

Consequence: **deleting the app and reinstalling preserves all state.** The truth lives in Postgres. SecureStore only persists the session token for UX.

---

## 4. What we explicitly are NOT doing

- ❌ **No Redux/Zustand/Recoil** — local state + hooks are enough at this scale.
- ❌ **No React Query / SWR** — would help; not added yet.
- ❌ **No custom backend** — Supabase + Edge Functions = full stack.
- ❌ **No GraphQL** — direct DB queries via the Supabase JS client.
- ❌ **No native modules** — pure JS/Expo, builds via EAS.
- ❌ **No CSS-in-JS library** — `StyleSheet.create()` is enough.
- ❌ **No service worker / web** — mobile-first.
- ❌ **No dark mode (yet)** — `userInterfaceStyle: 'light'` hardcoded.
- ✅ **PostHog** — analytics events + crash reporting (ErrorBoundary + ErrorUtils global handler).

If a future requirement makes one of these necessary, document the decision here.

---

## 5. What this architecture is good at

- **Fast feature iteration** — add a screen, add a hook, add an edge function.
- **Type safety end-to-end** — DB types generated, props typed, edge functions typed.
- **Secure by default** — RLS on every table, secrets on the server, no client-side AI keys.
- **Offline-tolerant** — Supabase client retries, local state for optimistic UI.
- **Solo / small team scale** — no microservices, no orchestration, one repo.

## 6. Where it will need to grow

| When | Add |
|---|---|
| Refetch logic gets repetitive across hooks | React Query |
| We need to debug production issues we can't reproduce | Sentry or PostHog |
| `components/ui/` grows past ~15 primitives | Storybook |
| We add dark mode | Theme provider, extracted tokens |
| Meal plan generation becomes too slow for sync request | Job queue (Inngest, Trigger.dev) |
| Multiple writers compete on the same row | Postgres advisory locks |

These are not problems today. Add them when the pain is real, not before.

---

## 7. Conventions

### Code

- **No magic numbers in styles** — if you use one, ask whether it should be a constant.
- **No raw `<Text>`** — use `Txt` from `components/ui/`.
- **No raw colors** — import from `constants/colors.ts`.
- **One screen, one hook** — screen-specific data lives in `features/<screen>/use<X>.ts`.
- **All AI calls go through `useAI()`** — never call `supabase.functions.invoke` directly for AI endpoints. See [doc 06](./06-credits-and-rate-limits.md).
- **All DB writes go through the Supabase client** — never via Edge Function unless the client cannot reasonably do it.

### Files

- New screens go in `app/(tabs)/` or `app/(auth)/`.
- New hooks go in `features/<feature>/`.
- New modals go in `components/<ModalName>/index.tsx`.
- New edge functions go in `supabase/functions/<name>/index.ts`.
- New SQL changes go in `supabase/migrations/<timestamp>_<name>.sql`.

### Commits

- Imperative mood ("add streak hero", not "added streak hero").
- Scope by feature area when useful ("meals: fix day rotation bug").
