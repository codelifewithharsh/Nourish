# 08 — Pending Work

*Last updated: 2026-06-01.*

Honest backlog of what's missing, broken, or worth doing. Organised by priority. When you ship something, **delete it** rather than striking through. When you discover something new, add it at the right priority.

## Legend

- 🔴 **P0 — Blockers** — must be fixed before any external user touches the app
- 🟠 **P1 — Important** — should land before public launch
- 🟡 **P2 — Quality** — improves the product but not gating
- 🟢 **P3 — Future** — nice to have, document and move on

---

## 🔴 P0 — Blockers

### 1. App icon and branded splash — partially done
**Done:** Native splash bg colour, Android adaptive icon background, iOS notification icon.

**Still needed (requires design work):**
- Replace `assets/icon.png` (currently the Expo placeholder) with a real 1024×1024 Satva icon.
- Replace `assets/splash-icon.png` (currently a placeholder) with the Satva logomark.
- Generate Android adaptive icon variants from the new design via `npx expo prebuild`.

Tools that help: [Icon Kitchen](https://icon.kitchen/), Figma, DALL-E.

### 2. Production Supabase project setup
**Done:** `.env.example` documented, `eas.json` env wiring.

**Still needed:**
1. Create a second Supabase project ("satva-prod").
2. `npx supabase link --project-ref <prod-ref>` and `npx supabase db push`.
3. Deploy all four edge functions to prod.
4. Set `OPENAI_API_KEY` in prod.
5. Set up production Google OAuth credentials (separate from dev — see [doc 03](./03-auth-and-routing.md)).
6. Populate `.env.production` with prod URL/anon key.
7. Add EAS Secrets scoped to the `production` build profile.

Full instructions in [doc 07 §5](./07-build-deploy-env.md).

### 3. EAS Build configuration — done (scaffolding only)
[`eas.json`](../eas.json) has three profiles. **Still needed (requires your accounts):**
1. Apple Developer Program signup ($99/year).
2. Google Play Developer Console ($25 one-time).
3. `eas login` + `eas build:configure`.
4. `eas credentials` for iOS provisioning.
5. Android service account key in repo root (gitignored).
6. Fill in `eas.json` → `submit.production.ios` real values.

---

## 🟠 P1 — Important before public launch

### 4. Recipe detail screen — built but not wired into the rest of the app
The recipe screen exists ([`app/recipe/[id].tsx`](../app/recipe/[id].tsx)) and works end-to-end (cache + AI fallback). **What's missing:** meal names in Meals/Home/Log don't navigate to it. Tapping any meal should `router.push('/recipe/' + encodeURIComponent(name))`.

### 5. Error states are silent in too many places
Several `catch {}` blocks swallow errors with no user-visible feedback. We have a consistent pattern now for credit errors (modal/toast), but generic errors (no internet, OpenAI down) still surface inconsistently.

Need a shared error toast/banner pattern and to wire it into every async action.

### 6. Onboarding writes a `profiles` row but doesn't handle network failure
[`app/(auth)/onboarding.tsx`](../app/(auth)/onboarding.tsx) — the upsert fires-and-forgets. If it fails, the user gets routed to `/(tabs)` anyway with `onboarding_completed: false` still in the DB. On next launch they're sent back to onboarding.

Fix: retry with backoff + show an error state on PlanReady if it ultimately fails.

### 7. Meal plan generation has no progress indication after onboarding
After onboarding, `generate-meal-plan` fires in the background and the user lands on Home. The Meals tab shows "Your plan is being generated" but Home shows an empty/zero state which feels broken.

Fix: Home shows a "Your first plan is cooking 🍳 — usually ready in ~30s" banner until `meal_plans.generated_at` is set.

### 8. Streak only counts last 60 days
[`features/home/useHomeData.ts`](../features/home/useHomeData.ts) hardcodes 60 days. Long streaks silently break.

Fix: bump to a year, or compute longest streak server-side via a Postgres view.

### 9. No analytics or crash reporting
No PostHog, no Sentry. We have no visibility into:
- How many users open the app
- Which tabs they use
- Where they drop off
- What's crashing in production

Bare minimum before launch: PostHog for events + Sentry for crashes. Both have Expo SDKs.

---

## 🟡 P2 — Quality and polish

### 10. Day rotation across midnight is shaky
On the Meals tab, `todayPlanIndex()` is computed at component mount. If the user opens the app at 11:59 PM and reads it at 12:01 AM, the highlighted day is wrong until they leave and come back.

Fix: re-compute on focus.

### 11. "Add a snack" CTA always uses the same prompt
Today's snack suggestion calls `swap-meal` with `currentMeal: 'nothing yet'`. The prompt is built for *replacing* something, not *adding*. Worth a dedicated `suggest-snack` function with a more focused prompt.

### 12. Edit profile in onboarding can't be re-entered
Once onboarding is complete, you can edit individual fields in the You tab but can't re-run the original flow. Should be a "redo my onboarding" button in settings.

### 13. Drawer has no swipe-to-close gesture
We're using `react-native` `Modal` without `react-native-gesture-handler`. Either install the gesture handler or accept tap-outside-to-dismiss.

### 14. Notifications scheduling assumes IST meal times
Hardcoded 8 AM / 1 PM / 7:30 PM. A user in the US or Europe gets push notifications at the wrong times.

Fix: store meal times per-user in `profiles`, let the You tab customise them.

### 15. Profile changes don't ripple to Home/Meals immediately
If a user changes their `daily_calories` target in You, Home/Meals still show the old target until refocus. The `useFocusEffect` pattern catches it eventually.

Fix: a global event bus or one-line `refresh()` on You-save.

### 16. Swap modal "Update my plan" toggle doesn't persist preference
Every swap defaults to off. Power users who always want to update the plan should have the last choice remembered (single AsyncStorage write).

### 17. No way to edit a logged entry
You can delete a `daily_logs` row but not edit it. If you logged "2 rotis" but ate 3, you have to delete and re-add. Two-tap edit on the log entry would be a win.

### 18. Home "nudge card" uses static rules, not AI
[`app/(tabs)/index.tsx`](../app/(tabs)/index.tsx) → `getNudge()` branches on time of day. For an "AI-powered" app this should be a `daily-nudge` edge function cached per (user, day).

### 19. `types:db` script
`lib/database.types.ts` regeneration is manual and easy to forget after a schema change. Add a `package.json` script:
```json
"types:db": "supabase gen types typescript --linked > lib/database.types.ts"
```

---

## 🟢 P3 — Future / nice to have

### 20. No dark mode
`userInterfaceStyle: 'light'` hardcoded. To add:
- Extract `Colors` to two themes
- Wrap app in a theme provider
- Test every screen

### 21. No web version
`app.json` has `web: { bundler: 'metro' }` but no one's run it. Plenty of work — no haptics, different auth flow, layouts. Defer.

### 22. No tablet layout
`supportsTablet: false`. Fine for now.

### 23. No social features
Streak sharing, leaderboards, sharing a meal plan. Major schema addition + new screens.

### 24. Grocery list export
Once kitchen ingredients + a 7-day plan exist, generating a shopping list is one prompt + one screen away.

### 25. Barcode scanning for packaged foods
`expo-barcode-scanner` + Open Food Facts API. HealthifyMe / MyFitnessPal do this.

### 26. Voice input for the Log tab
`expo-speech` or React Native Voice. Native feel.

### 27. Image-based logging
"Take a photo of your plate → AI tells you what's in it + macros." GPT-4o vision can do it.

### 28. Payment / subscription
Currently free, but `credit_pack_interest` table is capturing intent. When ready:
- RevenueCat + StoreKit (iOS)
- RevenueCat + Google Play Billing (Android)
- Decide free vs paid tier

### 29. Deep linking beyond auth callback
A meal reminder notification could link to "Log lunch" directly. `expo-linking` needs to handle in-app nav from notification payloads.

### 30. No tests
No Jest, no React Native Testing Library, no Detox. Manual QA only. Fine for current size; will hurt at 3+ engineers.

### 31. No CI
GitHub Actions for typecheck + lint on every PR. Not set up.

### 32. Recipe history / favourites
Users will want "I want to log that thing I had on Tuesday again." Partial via recent meals; full feature requires a favourites column or table.

### 33. Weekly progress emails / SMS
"You hit your protein target 5/7 days last week 🎉" — retention driver. Needs a weekly cron + email provider (Resend, Postmark).

### 34. Export data / GDPR compliance
Before EU launch: "export my data" + "delete my account" flow. Verify `ON DELETE CASCADE` on FK constraints.

---

## Recommended next 5 things to ship

In order:
1. **App icon + splash + bundle ID** — pure unblock work, half a day.
2. **Production Supabase + EAS Build** — needed before anyone installs outside Expo Go.
3. **Sentry + PostHog** — wire BEFORE soft launch so we see real failure modes.
4. **Wire recipe screen into Meals/Home/Log** — the screen works; just needs the links.
5. **Generic error toast pattern** — so #5 isn't a constant pain point.

Ship to ~10 friends first, then triage the rest based on what they complain about — that beats guessing.

---

## Known small issues

- [`components/HomeDrawer/index.tsx`](../components/HomeDrawer/index.tsx) — "Notifications" and "Preferences" quick links both route to the You tab, not specific sections.
- [`app/(tabs)/profile.tsx`](../app/(tabs)/profile.tsx) — Kitchen save button enables on whitespace-only edits.
- Debug `console.log` lines still in `app/_layout.tsx`, `app/index.tsx`, and `features/credits/CreditsContext.tsx` from the splash-hang diagnosis. Remove when comfortable.
- Two migrations exist locally but may not be pushed to prod yet: `20260601000004_credit_pack_interest.sql` and `20260601000005_credits_intro_seen.sql`. Run `npx supabase db push`.
