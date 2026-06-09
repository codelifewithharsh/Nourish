# 01 — Overview

*Last updated: 2026-06-10.*

## What Nourish is

Nourish is a mobile app (iOS + Android, built with Expo) that acts as a personalised AI nutritionist for Indian eaters. Tagline: **"Eat well. Live better."**

The pitch: tell us your body and goals, get a 7-day meal plan you'll actually cook, log what you ate by talking to AI, and adjust on the fly.

Three things make it different from MyFitnessPal / HealthifyMe:

1. **Indian-first.** Rajma, dal, roti, masala dosa — the AI knows portion sizes and macros for Indian dishes, not just American salads.
2. **AI is the input method.** No barcode scanning, no manual macro entry. Type "2 rotis and dal" → get calories. Tap "Lighter" → swap to a lighter alternative.
3. **Lightweight commitment.** No subscription paywall. Every signup is a free "Early Bird Pro" member with silent per-action daily caps that tune live from `app_config`.

## The user journey

```
First open
   ↓
Splash screen (animated Nourish logo)
   ↓
Login (Google OAuth)         ← or continue as guest
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
| **Home** | Today's snapshot — what to eat next, streak, water, daily nudge | AI daily nudge (GPT-4o-mini, cached per user/day) |
| **Meals** | 7-day plan, day-by-day, grocery list export | Per-meal swap → AI suggests an alternative |
| **Log** | Track what you actually ate | AI nutrition lookup ("2 rotis and dal" → macros) |
| **You** | Profile, kitchen ingredients, notification times, regenerate plan | Regenerate full 7-day plan |
| **Recipe screen** | Tap a meal → see ingredients + step-by-step method | AI generates full recipe |

## Key concepts you'll meet in the code

- **Profile** — one row per user in `profiles` table. Stores body stats, goal, diet preferences, calorie/protein targets, kitchen ingredients, meal notification times, etc.
- **Meal plan** — one row per user in `meal_plans`. Stores a JSONB blob with 7 days × 3–4 meals each. Regenerated wholesale, never edited piecemeal.
- **Daily logs** — one row per meal logged, in `daily_logs`.
- **Pro membership** — every signup is auto-Pro (`is_pro=true`, `is_early_bird=true`) — see [doc 06](./06-pro-membership.md). AI features are gated by silent per-user-per-day rate limits (3 plans, 8 recipes, 5 swaps, 20 nutrition lookups). Limits are tunable from the Supabase dashboard via `app_config` — no redeploy.
- **Edge functions** — Deno serverless functions on Supabase that wrap OpenAI calls. The client never touches OpenAI directly; the API key stays server-side.
- **Streak** — consecutive days with at least one logged meal. Shown on Home and the You tab. Milestone days (3, 7, 14, 30) auto-trigger a share sheet.

## Tech stack at a glance

| Layer | Tool |
|---|---|
| App runtime | Expo SDK 56, React Native 0.85, TypeScript |
| Routing | Expo Router v3 (file-based) |
| Auth | Supabase Auth + Google OAuth via `expo-auth-session` |
| Session storage | `expo-secure-store` |
| Backend | Supabase (Postgres + Edge Functions on Deno) |
| AI | OpenAI gpt-4o-mini via `chat/completions` (server-only) |
| Animations | Reanimated v3 (splash, breathing logo) + RN `Animated` (drawers, modals) |
| Analytics + crashes | PostHog (events) + React `ErrorBoundary` + `ErrorUtils` global handler |
| Native modules | None custom — pure JS, builds via EAS |

What's notably **absent**: Redux, Zustand, React Query, GraphQL, a custom backend server, dark mode, web build. See [doc 02 §6](./02-architecture.md) for why.

## A 30-second tour of the repo

```
nourish/
├─ app/              ← every file is a route (Expo Router)
├─ components/       ← shared UI used by multiple screens
├─ features/         ← screen-specific logic and hooks
├─ lib/              ← SDK clients & cross-cutting utils (supabase, haptics, analytics, ai client)
├─ constants/        ← design tokens
├─ supabase/
│  ├─ functions/     ← Deno edge functions (server-side AI)
│  └─ migrations/    ← SQL migrations (versioned)
├─ assets/
│  └─ app_logo/      ← nourish_logo_white.png + nourish_logo_dark_green.png
└─ docs/             ← you are here
```

[Doc 02](./02-architecture.md) goes deep on why this layout exists.
