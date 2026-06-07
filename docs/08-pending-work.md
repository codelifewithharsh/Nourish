# 08 — Pending Work

*Last updated: 2026-06-07.*

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

### 2. EAS Build configuration
**Done:** `eas init` run, `projectId` in `app.json`, preview builds working on Android.

**Still needed:**
1. Google Play Developer Console ($25 one-time) — to publish to Play Store.
2. Apple Developer Program ($99/year) — skip for now, Android-first launch.
3. Android service account key for `eas submit` (Play Store upload).
4. Production EAS build profile wired to prod env vars.

---

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

1. **Production Supabase setup** — create prod project, `supabase db push`, deploy 5 edge functions.
2. **Google Play account** — $25, then production build + submit.
3. **Soft launch to ~10 friends** — triage based on what they complain about, beats guessing.


## TO be fixed now


### 5.
When user login and see splash screen, instead of directly opening homepage and showing a loader, show splash screen till the content is being loaded - so that user won't see that loader at all


### 7. 
Need to update what is being displayed on invite a friend - may be supabase configurable

### 8.
Rate Nourish - how to see that


### 10.
We need a section where users can direclty write about app (no need to send the mail), also what they need in this app (as features)- how can this app be made better for them

### 11.
prompts ??