# 08 — Pending Work

*Last updated: 2026-06-08.*

Honest backlog of what's missing, broken, or worth doing. Organised by priority. When you discover something new, add it at the right priority.

## Legend

- 🔴 **P0 — Blockers** — must be fixed before any external user touches the app
- 🟠 **P1 — Important** — should land before public launch
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

## 🟠 P1 — Important

### 3. Drop the legacy credit columns
The Pro membership refactor leaves `profiles.credits`, `profiles.credits_intro_seen`, `profiles.last_daily_refill`, `credit_ledger`, and `credit_pack_interest` in the schema. They're no longer read or written, but they're dead weight. Write a migration that drops them once we're confident no production rows still need them for accounting.

### 4. In-app feedback surface
Right now the only feedback channel is `mailto:codelifewithharsh@gmail.com`. Replace with an in-app form that writes to a `feedback` table (text + optional contact) so users can type without leaving the app. Pair with a "what would you love to see next?" prompt to also capture feature requests.

### 5. Rate Nourish flow
The "Rate Nourish" entry in the drawer doesn't currently surface a working rating prompt. Wire to `expo-store-review` and `StoreReview.requestReview()` on Android once a Play listing exists.

---

## 🟡 P2 — Quality

### 6. Make the "invite a friend" copy configurable
Drive it from `app_config` so we can A/B test the line without a redeploy. Same pattern as `login_tagline`.

### 7. AI prompt versioning
Today every edge function has its prompt as a string literal in `index.ts`. When we change prompts we lose the ability to attribute behaviour changes to prompt changes. Move prompts into `app_config` (or a dedicated `ai_prompts` table) and version them so each `ai_usage_log` row records which prompt version it used.

---

## 🟢 P3 — Future / nice to have

### 8. No dark mode
`userInterfaceStyle: 'light'` hardcoded. To add: extract `Colors` to two themes, wrap app in a theme provider, test every screen.

### 9. No web version
`app.json` has `web: { bundler: 'metro' }` but no one's run it. Plenty of work — no haptics, different auth flow, layouts. Defer.

### 10. No tablet layout
`supportsTablet: false`. Fine for now.

### 11. Barcode scanning for packaged foods
`expo-barcode-scanner` + Open Food Facts API. HealthifyMe / MyFitnessPal do this.

### 12. Voice input for the Log tab
`expo-speech` or React Native Voice. Native feel.

### 13. Image-based logging
"Take a photo of your plate → AI tells you what's in it + macros." GPT-4o vision can do it.

### 14. Payment / subscription
Currently free for everyone via Early Bird Pro. When ready to introduce a free tier and a paid tier:
- RevenueCat + StoreKit (iOS) / Google Play Billing (Android)
- Tighten the free-tier `app_config` limits; keep Early Bird users grandfathered
- Gate via `is_pro` (the column already exists)

### 15. Deep linking beyond auth callback
A meal reminder notification could link to "Log lunch" directly. `expo-linking` needs to handle in-app nav from notification payloads.

### 16. No tests
No Jest, no React Native Testing Library, no Detox. Manual QA only. Fine for current size; will hurt at 3+ engineers.

### 17. No CI
GitHub Actions for typecheck + lint on every PR. Not set up.

### 18. Recipe history / favourites
Users will want "I want to log that thing I had on Tuesday again." Partial via recent meals; full feature requires a favourites column or table.

### 19. Weekly progress emails / SMS
"You hit your protein target 5/7 days last week 🎉" — retention driver. Needs a weekly cron + email provider (Resend, Postmark).

### 20. Export data / GDPR compliance
Before EU launch: "export my data" + "delete my account" flow. Verify `ON DELETE CASCADE` on FK constraints.

---

## Recently completed

These were in this list. They've shipped, so they're recorded here for posterity rather than struck through above.

- Replaced credits system with Pro membership and configurable rate limits (see [doc 06](./06-pro-membership.md)).
- Made price + login tagline configurable via `app_config`.
- Added `OGAvatar` gradient ring around home + drawer avatars for Pro members.
- Surfaced Early Bird Pro at login (ribbon) and PlanReady (premium card) with values fetched from `app_config`.
- Drag-to-dismiss on EarlyBirdSheet.
- Android back button: route to home tab first; press-again-to-exit on home.
- Splash gate: native splash holds until home data is ready, with 2s safety cutoff.
- Breathing-logo loader replacing page-level `ActivityIndicator`s.
- Meal-reminder timings now sync between the home bell sheet and the profile screen.
- Fixed `HowItWorksModal` rendering on Android New Architecture (`FullWindowOverlay` → `hardwareAccelerated` Modal).

## Recommended next things to ship

1. **Production Supabase setup** — create prod project, `supabase db push`, deploy 5 edge functions.
2. **Google Play account** — $25, then production build + submit.
3. **In-app feedback surface** — see P1 #4.
4. **Soft launch to ~10 friends** — triage based on what they complain about, beats guessing.
