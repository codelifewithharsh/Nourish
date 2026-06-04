# 08 — Pending Work

*Last updated: 2026-06-05.*

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
3. Deploy all four edge functions to prod.
4. Set `OPENAI_API_KEY` in prod.
5. Set up production Google OAuth credentials (separate from dev — see [doc 03](./03-auth-and-routing.md)).
6. Populate `.env.production` with prod URL/anon key.
7. Add EAS Secrets scoped to the `production` build profile.

Full instructions in [doc 07 §5](./07-build-deploy-env.md).

### 2. EAS Build configuration — scaffolding only
[`eas.json`](../eas.json) has three profiles. **Still needed (requires your accounts):**
1. Apple Developer Program signup ($99/year).
2. Google Play Developer Console ($25 one-time).
3. `eas login` + `eas build:configure`.
4. `eas credentials` for iOS provisioning.
5. Android service account key in repo root (gitignored).
6. Fill in `eas.json` → `submit.production.ios` real values.

---

## 🟠 P1 — Important before public launch

### 3. Push notification infrastructure
`expo-notifications` is wired for local scheduling only. For reliable delivery (especially Android background):
- Set up Expo Push Service or FCM directly.
- Store push tokens in `profiles` table.
- Send server-side triggers from edge functions where needed.

---

## 🟢 P3 — Future / nice to have

### 7. No dark mode
`userInterfaceStyle: 'light'` hardcoded. To add:
- Extract `Colors` to two themes
- Wrap app in a theme provider
- Test every screen

### 8. No web version
`app.json` has `web: { bundler: 'metro' }` but no one's run it. Plenty of work — no haptics, different auth flow, layouts. Defer.

### 9. No tablet layout
`supportsTablet: false`. Fine for now.

### 10. Barcode scanning for packaged foods
`expo-barcode-scanner` + Open Food Facts API. HealthifyMe / MyFitnessPal do this.

### 11. Voice input for the Log tab
`expo-speech` or React Native Voice. Native feel.

### 12. Image-based logging
"Take a photo of your plate → AI tells you what's in it + macros." GPT-4o vision can do it.

### 13. Payment / subscription
Currently free, but `credit_pack_interest` table is capturing intent. When ready:
- RevenueCat + StoreKit (iOS)
- RevenueCat + Google Play Billing (Android)
- Decide free vs paid tier

### 14. Deep linking beyond auth callback
A meal reminder notification could link to "Log lunch" directly. `expo-linking` needs to handle in-app nav from notification payloads.

### 15. No tests
No Jest, no React Native Testing Library, no Detox. Manual QA only. Fine for current size; will hurt at 3+ engineers.

### 16. No CI
GitHub Actions for typecheck + lint on every PR. Not set up.

### 17. Recipe history / favourites
Users will want "I want to log that thing I had on Tuesday again." Partial via recent meals; full feature requires a favourites column or table.

### 18. Weekly progress emails / SMS
"You hit your protein target 5/7 days last week 🎉" — retention driver. Needs a weekly cron + email provider (Resend, Postmark).

### 19. Export data / GDPR compliance
Before EU launch: "export my data" + "delete my account" flow. Verify `ON DELETE CASCADE` on FK constraints.

---

## Recommended next things to ship

1. **Production Supabase + EAS Build** — needed before anyone installs outside Expo Go.
2. **Push token storage + server-side triggers** — local scheduling alone won't cut it on Android.
3. **Soft launch to ~10 friends** — triage based on what they complain about, that beats guessing.

---

## Known small issues

- Three migrations exist locally but may not be pushed to prod yet: `20260601000004_credit_pack_interest.sql`, `20260601000005_credits_intro_seen.sql`, and `20260605000001_meal_notification_times.sql`. Run `npx supabase db push`.
- `daily-nudge` edge function needs deploying to prod: `npx supabase functions deploy daily-nudge`.
