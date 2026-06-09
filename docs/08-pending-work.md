# 08 — Pending Work

*Last updated: 2026-06-10.*

Honest backlog of what's missing, broken, or worth doing. Organised by priority. When you discover something new, add it at the right priority.

## Legend

- 🔴 **P0 — Blockers** — must be fixed before any external user touches the app
- 🟡 **P2 — Quality** — improves the product but not gating
- 🟢 **P3 — Future** — nice to have, document and move on

---

## 🔴 P0 — Blockers

### 1. Production Supabase project setup
**Done:** `.env.example` documented, `eas.json` env wiring.

**Still needed:**
1. Create a second Supabase project ("nourish-prod").
2. `npx supabase link --project-ref <prod-ref>` and `npx supabase db push`.
3. Deploy all five edge functions to prod.
4. Set `OPENAI_API_KEY` in prod.
5. Set up production Google OAuth credentials (separate from dev — see [doc 03](./03-auth-and-routing.md)).
6. Populate `.env.production` with prod URL/anon key.
7. Add EAS Secrets scoped to the `production` build profile.

Full instructions in [doc 07 §5](./07-build-deploy-env.md).

### 2. EAS Build configuration
**Done:** `eas init` run, `projectId` in `app.json`, preview builds working on Android.

**Still needed:**
1. Google Play Developer Console ($25 one-time) — to publish to Play Store.
2. Apple Developer Program ($99/year) — skip for now, Android-first launch.
3. Android service account key for `eas submit` (Play Store upload).
4. Production EAS build profile wired to prod env vars.

---

## 🟡 P2 — Quality

### 3. AI prompt versioning
Today every edge function has its prompt as a string literal in `index.ts`. When we change prompts we lose the ability to attribute behaviour changes to prompt changes. Move prompts into `app_config` (or a dedicated `ai_prompts` table) and version them so each `ai_usage_log` row records which prompt version it used.

---

## 🟢 P3 — Future / nice to have

### 4. No dark mode
`userInterfaceStyle: 'light'` hardcoded. To add: extract `Colors` to two themes, wrap app in a theme provider, test every screen.

### 5. No web version
`app.json` has `web: { bundler: 'metro' }` but no one's run it. Plenty of work — no haptics, different auth flow, layouts. Defer.

### 6. No tablet layout
`supportsTablet: false`. Fine for now.

### 7. Barcode scanning for packaged foods
`expo-barcode-scanner` + Open Food Facts API. HealthifyMe / MyFitnessPal do this.

### 8. Voice input for the Log tab
`expo-speech` or React Native Voice. Native feel.

### 9. Image-based logging
"Take a photo of your plate → AI tells you what's in it + macros." GPT-4o vision can do it.

### 10. Payment / subscription
Currently free for everyone via Early Bird Pro. When ready to introduce a free tier and a paid tier:
- RevenueCat + StoreKit (iOS) / Google Play Billing (Android)
- Tighten the free-tier `app_config` limits; keep Early Bird users grandfathered
- Gate via `is_pro` (the column already exists)

### 11. Deep linking beyond auth callback
A meal reminder notification could link to "Log lunch" directly. `expo-linking` needs to handle in-app nav from notification payloads.

### 12. No tests
No Jest, no React Native Testing Library, no Detox. Manual QA only. Fine for current size; will hurt at 3+ engineers.

### 13. No CI
GitHub Actions for typecheck + lint on every PR. Not set up.

### 14. Recipe history / favourites
Users will want "I want to log that thing I had on Tuesday again." Partial via recent meals; full feature requires a favourites column or table.

### 15. Weekly progress emails / SMS
"You hit your protein target 5/7 days last week 🎉" — retention driver. Needs a weekly cron + email provider (Resend, Postmark).

### 16. Export data / GDPR compliance
Before EU launch: "export my data" + "delete my account" flow. Verify `ON DELETE CASCADE` on FK constraints.

---

## Recently completed

- Dropped the legacy credit columns, ledger, waitlist, RPCs, and welcome trigger; cleaned up the no-op `credits_charged` writes in `ai-guard.ts` and removed the dead `credits_used` / `out_of_credits` PostHog events.
- Replaced credits system with Pro membership and configurable rate limits (see [doc 06](./06-pro-membership.md)).
- Made price + login tagline configurable via `app_config`.
- Added gradient ring around home + drawer avatars for Pro members.
- Surfaced Early Bird Pro at login (ribbon) and PlanReady (premium card) with values fetched from `app_config`.
- Drag-to-dismiss on EarlyBirdSheet.
- Android back button: route to home tab first; press-again-to-exit on home.
- Splash gate: native splash holds until home data is ready, with 2s safety cutoff; 1.2s minimum breathing logo display.
- Splash screen updated with "Nourish" wordmark baked into the image.
- Breathing-logo loader replacing page-level `ActivityIndicator`s.
- Meal-reminder timings now sync between the home bell sheet and the profile screen.
- Fixed `HowItWorksModal` rendering on Android New Architecture (`FullWindowOverlay` → `hardwareAccelerated` Modal).
- Rate Nourish flow wired to `expo-store-review` with toast fallback until Play Store listing exists; nudge moved to day-2 streak.
- Invite a friend copy driven from `app_config` key `invite_copy`; `\n` unescaping fixed.
- In-app feedback surface: `FeedbackSheet` with type chips (bug/feature/other), writes to `feedback` table with user email auto-captured.
- Android notification icon regenerated as clean binary white-on-transparent 96×96.

## Recommended next things to ship

1. **`supabase db push`** — apply the two pending migrations (feedback table + invite copy).
2. **Production Supabase setup** — create prod project, push migrations, deploy 5 edge functions.
3. **Google Play account** — $25, then production build + submit.
4. **Soft launch to ~10 friends** — triage based on what they complain about, beats guessing.
