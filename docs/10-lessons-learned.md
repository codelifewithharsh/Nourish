# 10 — Lessons Learned

*Last updated: 2026-06-08.*

This isn't an architecture doc. The other files explain *what the codebase looks like*. This one captures *what we learned while building it* — the gotchas that surprised us, the choices we second-guessed, and the technical knowledge that's hard to extract from the code alone.

Read this when you're about to make a similar decision elsewhere, or when something feels off and you want context on why it's shaped the way it is.

---

## 1. Expo Go is great until it isn't

We started development on **Expo Go** because the iterate-on-device loop is unbeatable. Edit → save → fast refresh in under a second. Zero native build time.

Then we hit two walls:

**Wall 1: `expo-notifications` removed from Expo Go in SDK 53+.**
A bare `import * as Notifications from 'expo-notifications'` would crash the app at module load. Not at first use — at *import*. Which meant the whole app died on cold start.

We fixed it with a lazy `require()` guard:

```ts
const isExpoGo = Constants.executionEnvironment === 'storeClient';

function getNotifications() {
  if (isExpoGo) return null;
  return require('expo-notifications') as typeof import('expo-notifications');
}
```

Every notification call site now uses `const N = getNotifications(); if (!N) return;`. The cost is a slightly clunkier API; the win is the app boots in Expo Go again. Real builds still get the real module.

**Wall 2: Google OAuth needs a real scheme.**
Expo removed the auth proxy in SDK 50. The Expo Go redirect URI is `exp://10.x.x.x:8081` — a local IP — which Google's OAuth flow can't redirect to. We tried `useProxy: true` on `makeRedirectUri()`; the type doesn't accept it, and casting it didn't help because the proxy is gone.

The honest truth: **Google OAuth doesn't work in Expo Go anymore.** We test auth on a real EAS build (or `npx expo run:android`) and develop everything else in Expo Go.

**Lesson:** Expo Go is a dev tool, not a runtime. Plan for the moment you'll need a development build. SDK upgrades silently remove things from Expo Go — read the release notes.

---

## 2. The Android New Architecture broke our overlays

Expo SDK 56 enables the New Architecture by default. We used `FullWindowOverlay` from `react-native-screens` for the home drawer and notification sheet so they'd render above the floating tab bar.

On Android with the New Arch, `FullWindowOverlay` is **a no-op + warning**. The component renders nothing. On iOS it still works. We learned this from a user report: "the drawer doesn't open on Android" — except it *did* open, just invisibly. The backdrop tap-handler worked. Only the visual was missing.

The fix: replace `FullWindowOverlay` with a plain `<View style={StyleSheet.absoluteFill}>` inside a `<Modal hardwareAccelerated statusBarTranslucent>`. The `hardwareAccelerated` flag is what makes the modal render correctly above other content on the New Arch.

The same fix applied to three sheets: `HomeDrawer`, the home `NotifSheet`, and `HowItWorksModal`. None of them got a warning at compile time. None of them broke on iOS. Only Android Logcat hinted at the cause.

**Lesson:** Cross-platform components silently degrade. If something only breaks on one OS, search for that component's docs on the platform that's failing — not on the one that works.

A related sub-lesson: the New Architecture also kills `UIManager.setLayoutAnimationEnabledExperimental(true)` — it's a no-op and warns. Remove those calls; `LayoutAnimation` itself still works for simple effects.

---

## 3. We chose Supabase RLS over a custom backend, and we'd do it again

There was a moment of "should we put an Express/Hono layer between the client and the DB?" We resisted, because RLS is genuinely good when you commit to it:

- **No bespoke endpoints to maintain.** Adding a new screen means writing a query, not designing an API.
- **Type safety end-to-end** via auto-generated `database.types.ts`.
- **Security at the data layer** instead of the API layer. A bug in app code can't bypass it because the auth.uid() check is in the policy, not in the handler.

The trade-off is that the client knows the schema. That feels uncomfortable until you remember a custom API also knows the schema; you've just moved the coupling, not removed it.

Where it stops being free: anything that *must* be atomic across multiple rows, or that needs server secrets (OpenAI key, push notification provider). Those go in edge functions. That's where `SECURITY DEFINER` RPCs come in — atomic spend checks, daily counters, configurable limits. They're called from edge functions only.

**Lesson:** "Direct DB calls + RLS" is a real architecture, not a hack. The mental model: client owns the queries, DB owns the rules. You only need a server when you have a secret to protect or an invariant to enforce.

---

## 4. The credits ceremony was a tax we didn't need to pay

We built a full credit economy: ledger, atomic deduction, refunds, daily refill, intro toast, balance pill, "out of credits" modal, waitlist. It was technically clean — the `deduct_credits` RPC is one of the proudest pieces of SQL in the repo.

It was also the wrong UX for our audience.

Indian users in this category strongly dislike feeling metered. "5 credits left" reads as a paywall countdown, not a generous free tier. And our real per-user OpenAI cost is **under ₹0.50/month** — protecting against that level of spend with a credit display is like a restaurant counting peas.

So we ripped it out and replaced it with:
1. Silent per-action daily caps read live from `app_config`.
2. A warm, action-specific toast on the rare cap-hit (`"You've explored a lot of recipes today! More flavours await tomorrow."`).
3. A status badge — "Early Bird Pro" — that frames the same generosity as something earned.

We left the old columns and ledger in the schema as "legacy" for now. They're scheduled for removal once we're confident nothing in analytics still depends on them.

**Lesson:** *Cost of running* and *cost the user feels* aren't the same thing. Spend protection should match the actual risk. Visible rationing is a tax on user trust; choose it deliberately, not by reflex.

---

## 5. Profile bucketing is the cheap-AI trick

When we generate a meal plan, we don't key the cache on the raw profile. We bucket:

```
[goal, diet_type, sorted(cuisines), sorted(restrictions), calorie_bucket, protein_bucket]
```

Calorie bucket: rounded to nearest 200. Protein bucket: rounded to nearest 20.

That means a "vegetarian, fat-loss, 1830 kcal / 78g protein" user and another at "1920 kcal / 82g protein" hit the *same cache row*. The first one pays the OpenAI cost; everyone else gets it free.

This isn't a hack — it works because the actual variation a user perceives between a 1800 and a 1900 kcal plan is roughly zero. They both feel like "their plan."

The same idea powers the nutrition lookup cache: strip numbers and units so `"2 rotis"`, `"3 rotis"`, and `"roti"` all collapse to the same key.

**Lesson:** Cache keys are a product decision, not just a technical one. The right level of fuzziness depends on what difference the user can actually feel.

---

## 6. Atomic counters belong in Postgres, not in your service

The rate-limit RPC is dead simple:

```sql
insert into ai_rate_limits (user_id, action, window_start, count)
values (p_user_id, p_action, today, 1)
on conflict (user_id, action, window_start)
do update set count = ai_rate_limits.count + 1
returning count;
```

One statement. Postgres serializes it. Two concurrent calls cannot both pass through if the second one would put the user over the limit. There is no lock to take, no version field to compare, no retry loop.

The alternative — fetch count, check, increment, write — is the textbook race condition. The "fix" is usually a `SELECT ... FOR UPDATE` or an application-level lock, both of which are bug-prone.

**Lesson:** When you need atomicity, see if the database can do it in one statement. The simplest concurrency-safe code is the code that delegates the concurrency to something better at it.

---

## 7. Cold start UX: the splash gate

The original cold start was: native splash for a fixed 1000ms → home screen with `ActivityIndicator` while data loaded → home screen with content. That meant the user saw a spinner for between 0 and 3 seconds — the gap was visible and felt bad.

We fixed it with a tiny coordinator (`lib/splashGate.ts`):
- Root layout `armSplashGate(2000)` — sets a 2s safety timer.
- Home tab calls `releaseSplash()` when its data is ready.
- Onboarding and login (no fetch to wait on) `releaseSplash()` immediately on mount.
- Whichever fires first hides the native splash.

No spinner gap. If the network is slow, the safety timer hides the splash anyway so the user is never stuck.

**Lesson:** Loading states are about perception. A native splash held one extra second beats a JS spinner shown for one second. The cost is wiring; the win is "the app feels instant."

---

## 8. PostHog as your only observability tool

We use **one** SaaS for analytics, error capture, and basic crash reporting: PostHog. Events are typed in `lib/analytics.ts` so there's a single inventory of what we track. The `ErrorBoundary` and a global `ErrorUtils` handler send uncaught errors to the same place.

No Sentry. No Mixpanel. No Amplitude. No Datadog.

This won't scale forever — Sentry's stack-trace UX is genuinely better for prod crashes — but at our size, the cost of one extra tool (mental, $$, integration) is higher than the marginal benefit.

**Lesson:** Tool sprawl is a cost. Default to fewer SaaS. Add the next one when the existing one demonstrably fails you, not when you anticipate it might.

---

## 9. `app_config` — boring but transformative

A two-column table (`key`, `value` text). Two SQL helpers (`get_config_int`, `get_config_text`). One tiny client hook (`useAppConfigText`).

That's it. And it unlocked:
- Tuning daily rate limits without a redeploy.
- A/B testing the login tagline by editing one row.
- Changing the Pro price string without a release.
- (Future) versioned prompt strings, marketing copy, feature flags.

We almost reached for LaunchDarkly or a config-as-code service. We don't need them. A Postgres row with RLS-readable access is enough.

**Lesson:** Operationally important strings should live somewhere editable without a deploy. The cheapest version of that is a table. Add infrastructure only when the table becomes the bottleneck (it won't, for years).

---

## 10. DeviceEventEmitter for cross-screen sync

When meal reminder times were edited in two places (the home bell sheet and the profile screen), changing one didn't reflect in the other. Each surface owned its own local state.

The temptation was to reach for Context, or Zustand, or React Query. What worked instead was `DeviceEventEmitter` with a couple of named events:

```ts
DeviceEventEmitter.emit(MEAL_TIMES_CHANGED_EVENT);
// elsewhere:
DeviceEventEmitter.addListener(MEAL_TIMES_CHANGED_EVENT, refreshFromDb);
```

Both screens persist to the same DB column; the event just nudges every mounted listener to re-read. No global store, no shared cache, no provider tree to thread.

**Lesson:** "These two screens need to stay in sync" doesn't always justify a state-management library. An event bus + DB-as-source-of-truth is often enough.

---

## 11. Modals on Android need `hardwareAccelerated`

Filing this separately because it cost us more time than it should have.

```tsx
<Modal
  visible={open}
  transparent
  statusBarTranslucent
  hardwareAccelerated   // <-- required on Android New Architecture
  animationType="none"
  onRequestClose={dismiss}
>
```

Without `hardwareAccelerated`, animated modal content on Android either flickers, fails to compose with the rest of the screen, or doesn't render at all on certain devices. On iOS the flag does nothing. On Android with the New Architecture, it's the difference between "works" and "looks broken."

The other necessary pair: `statusBarTranslucent` so the modal extends behind the status bar, and `onRequestClose` so Android's hardware back button can dismiss it.

---

## 12. EAS Build is a generous free tier — until it isn't

The Free plan gives **30 Android builds/month**. That sounds like plenty until you're debugging a release-only issue and burn 5 builds in a morning.

Things that helped:
- **Don't build to test JS changes.** Use Expo Go or a development build. Only build for native config changes (Android manifest, icons, splash, OAuth schemes, native module additions).
- **`preview` and `production` profiles** in `eas.json` keep dev artifacts from filling your quota.
- **Internal distribution APK** lets you share with testers without going through Play Store review.
- **The `npx expo run:android` path** (build locally with Android Studio) is unlimited if you have the SDK installed.

**Lesson:** Cloud build minutes are a real budget. Track them, don't waste them on JS-only changes.

---

## 13. Things we explicitly chose *not* to do

For completeness — these were considered and rejected, and the reason matters more than the decision:

- **No React Query / SWR.** Each screen owns a tiny hook (`useHomeData`, `useRecipe`, etc.) and a `useFocusEffect`-driven `refresh()`. We'll add React Query when refetch logic gets repetitive across hooks; it isn't yet.
- **No Redux/Zustand.** Global state at our scale is mostly auth + Pro membership, both already in Context.
- **No GraphQL.** The Supabase JS client is a typed query builder. GraphQL would mean owning a schema layer we don't have.
- **No CSS-in-JS library.** `StyleSheet.create()` colocated with each component is enough. No theme runtime, no className extraction step.
- **No dark mode (yet).** `userInterfaceStyle: 'light'` hardcoded. We'll add it when we have the bandwidth to test every screen against both themes.

Each of these can be added later if the pain becomes real. Adding them prematurely would have slowed early iteration without payoff.

---

## 14. Closing observation

The biggest mistake we *didn't* make was building a custom backend "just in case." The biggest mistake we *did* make was over-engineering the credits system before validating it was the right model.

The pattern repeats: **adding infrastructure is easier to defend than removing it.** When in doubt, defer. The version of you in three months will have more information, and the constraint will either turn out to be real (build it then) or never materialize (you saved the effort).
