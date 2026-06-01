# 01 — Overview

*Last updated: 2026-06-01.*

## What Satva is

Satva is a mobile app (iOS + Android, built with Expo) that acts as a personalised AI nutritionist for Indian eaters. The pitch: tell us your body and goals, get a 7-day meal plan you'll actually cook, log what you ate by talking to AI, and adjust on the fly.

Three things make it different from MyFitnessPal / HealthifyMe:

1. **Indian-first.** Rajma, dal, roti, masala dosa — the AI knows portion sizes and macros for Indian dishes, not just American salads.
2. **AI is the input method.** No barcode scanning, no manual macro entry. Type "2 rotis and dal" → get calories. Tap "Lighter" → swap to a lighter alternative.
3. **Lightweight commitment.** No subscription required. Daily free credits, no sign-up paywall.

## The user journey

```
First open
   ↓
Login (Google OAuth)
   ↓
Onboarding (goal, body, diet preferences, restrictions)
   ↓
First 7-day plan auto-generates
   ↓
                  ┌──────────────────┐
                  │   Tab navigator  │
                  └──────────────────┘
                  Home · Meals · Log · You
```

After onboarding, the app is four tabs and one detail screen:

| Tab | Purpose | Main AI feature |
|---|---|---|
| **Home** | Today's snapshot — what to eat next, streak, water, quick nudges | Daily nudge (heuristic today, AI planned) |
| **Meals** | 7-day plan, day-by-day | Per-meal swap → AI suggests an alternative |
| **Log** | Track what you actually ate | AI nutrition lookup ("2 rotis and dal" → macros) |
| **You** | Profile, kitchen ingredients, regenerate plan | Regenerate full 7-day plan |
| **Recipe screen** | Tap a meal → see ingredients + step-by-step method | AI generates full recipe |

## Key concepts you'll meet in the code

- **Profile** — one row per user in `profiles` table. Stores body stats, goal, diet preferences, calorie/protein targets, kitchen ingredients, etc.
- **Meal plan** — one row per user in `meal_plans`. Stores a JSONB blob with 7 days × 3–4 meals each. Regenerated wholesale, never edited piecemeal.
- **Daily logs** — one row per meal logged, in `daily_logs`.
- **Credits** — virtual currency for AI actions. Users get 5 free every morning. Generating a plan = 10 credits, opening a recipe = 5, swap = 3, nutrition lookup = 1. New users get 50 welcome credits. See [doc 06](./06-credits-and-rate-limits.md) for the full system.
- **Edge functions** — Deno serverless functions on Supabase that wrap OpenAI calls. The client never touches OpenAI directly; the API key stays server-side.

## Tech stack at a glance

| Layer | Tool |
|---|---|
| App runtime | Expo SDK 56, React Native 0.84, TypeScript |
| Routing | Expo Router v3 (file-based) |
| Auth | Supabase Auth + Google OAuth via `expo-auth-session` |
| Session storage | `expo-secure-store` |
| Backend | Supabase (Postgres + Edge Functions on Deno) |
| AI | OpenAI gpt-4o-mini via `chat/completions` (server-only) |
| Styling | `StyleSheet.create` colocated, design tokens in `constants/colors.ts` |
| Animations | React Native `Animated` (Reanimated is installed but rarely needed) |
| Native modules | None custom — pure JS, builds via EAS |

What's notably **absent**: Redux, Zustand, React Query, GraphQL, a custom backend server, dark mode, web build. See [doc 02 §6](./02-architecture.md) for why.

## A 30-second tour of the repo

```
Satva/
├─ app/              ← every file is a route (Expo Router)
├─ components/       ← shared UI used by multiple screens
├─ features/         ← screen-specific logic and hooks
├─ lib/              ← SDK clients & cross-cutting utils (supabase, haptics, ai client)
├─ constants/        ← design tokens
├─ supabase/
│  ├─ functions/     ← Deno edge functions (server-side AI)
│  └─ migrations/    ← SQL migrations (versioned)
├─ assets/           ← icons, Lottie files, images
└─ docs/             ← you are here
```

[Doc 02](./02-architecture.md) goes deep on why this layout exists.
