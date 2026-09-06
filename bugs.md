# Bug Reports — Closed Testing (Play Store)

---

## Bug 1: Meal log status not persisting when navigating to Recipe page

**What is the bug:**
After logging a meal, navigating to the recipe page for that meal does not show it as already logged. The logged status is lost or not reflected in the recipe view.

**What's exactly wrong:**
The recipe page (`app/recipe/[id].tsx`) does not read or reflect the meal log state that was saved when the meal was logged from the home/meals screen. The `isLogged` / logged status is likely not being passed to or fetched inside the recipe screen.

**What to fix:**
- In the recipe screen, query the meal logs for today and check if a log entry exists for this recipe/meal.
- Ensure the "Log Meal" button on the recipe page reflects the current logged state (disabled or showing "Logged" if already logged today).

---

## Bug 2: Keyboard overlapping BottomSheet in Swap Meal / Edit Meal / Add Snack flows

**What is the bug:**
When the user opens the swap meal modal, edit meal sheet, or the add snack bottom sheet and taps an input field, the keyboard appears on top of the bottom sheet instead of pushing it up.

**What's exactly wrong:**
The bottom sheets for these flows (`components/SwapMealModal/index.tsx`, `app/(tabs)/meals.tsx`, `app/(tabs)/log.tsx`) are not handling keyboard avoidance properly. On Android especially, the keyboard does not shift the bottom sheet content up, making text inputs inaccessible.

**What to fix:**
- Add `keyboardBehavior="extend"` or `enableDynamicSizing` on the `BottomSheet` component, or wrap input content in `KeyboardAvoidingView` with `behavior="padding"`.
- For `@gorhom/bottom-sheet`, use the `BottomSheetTextInput` component instead of the standard React Native `TextInput` to get built-in keyboard handling.
- Test on both Android and iOS after the fix.

---

## Bug 3: Old package ID `com.nourish.app` still present in codebase — FIXED

Everything now uses `in.nourish.app`:

- `app.json` — `bundleIdentifier` and `package` both `in.nourish.app`
- `android/app/build.gradle` — `namespace` and `applicationId` both `in.nourish.app`
- Kotlin sources live at `android/app/src/main/java/in/nourish/app/`

Note the OAuth callback was never affected: login builds its redirect from
the `nourish` URL scheme (`app.json`), not from the package id.
- Note: The share URL in `app/recipe/[id].tsx` already correctly uses `in.nourish.app` — no change needed there.

---

## Bug 4: Water logging notification is OFF by default

**What is the bug:**
When a user first opens the app, water reminders are disabled by default. Users have to manually enable them.

**What's exactly wrong:**
In `app/(tabs)/index.tsx` line 662, the `waterInterval` state is initialized to `0` (off):
```ts
const [waterInterval, setWaterInterval] = useState(0);
```
A value of `0` means no water reminders are scheduled.

**What to fix:**
- Change the default `useState` value to `2` (every 2 hours) or whichever interval is considered sensible.
- On first app launch (check via AsyncStorage key), auto-schedule water reminders with the default interval by calling `scheduleWaterReminders(defaultInterval)`.
- Make sure this only fires on first launch, not on every app open.

---

## Bug 5: "Rate the App" prompt triggers on 2nd streak instead of 3rd

**What is the bug:**
The in-app review prompt is currently appearing when the user hits a 2-day streak. It should appear at the 3rd streak milestone instead.

**What's exactly wrong:**
In `app/(tabs)/index.tsx` around line 155, the condition checks `data.streak === 2` to trigger `StoreReview.requestReview()`. This causes the prompt on the 2nd day streak, which is too early.

**What to fix:**
- Change the condition from `data.streak === 2` to `data.streak === 3`.
- Also verify the `MILESTONES` array includes `3` so the effect actually runs on that streak value.

---

## Bug 6: Notification badge dot shown on app icon

**What is the bug:**
When there are pending notifications, an unread dot/badge appears on the app icon on the Android home screen. This looks unappealing and the product decision is to not show it.

**What's exactly wrong:**
Android by default shows a notification badge (dot) on the launcher icon whenever there are unread notifications. No explicit suppression is in place.

**What to fix:**
- In the notification scheduling code (`lib/notifications.ts`), set `badgeCount: 0` or configure the notification channel to not show badges.
- In `AndroidManifest.xml`, or via Expo config plugin, disable launcher badge notifications.
- Alternatively, call `Notifications.setBadgeCountAsync(0)` after each notification is received/dismissed to keep the badge count at zero.

---

## Bug 7: App bar notification indicator shows a plain white dot instead of the app's leaf icon

**What is the bug:**
In the navigation/app bar, the notification indicator is rendering as a plain white dot with a background color. It should be the app's leaf icon with no background.

**What's exactly wrong:**
The notification indicator component in the header/app bar is using a simple `View` styled as a circle (white dot with background color) instead of rendering the leaf icon asset. Likely located in `components/HomeDrawer/index.tsx` or the tab navigator header.

**What to fix:**
- Replace the dot `View` with an `Image` or `SvgIcon` that renders the app's leaf icon.
- Remove any `backgroundColor` from the indicator container so there is no background behind the icon.
- Ensure the icon is appropriately sized (e.g., 20×20) and positioned as a badge overlay.

---

## Bug 8: Unhealthy meal "Chole Bhature" appearing in AI meal recommendations

**What is the bug:**
The AI meal recommendation engine is suggesting "Chole Bhature" (Chole with Bhature), which is a high-calorie, deep-fried meal and is considered very unhealthy for users trying to manage their diet/nutrition.

**What's exactly wrong:**
The meal generation prompt or the allowed meal list used in the AI edge function does not exclude notoriously unhealthy Indian dishes. The AI is free to suggest them without any healthiness filter.

**What to fix:**
- Add "Chole Bhature" (and similar deep-fried/high-calorie dishes like Puri Bhaji, Samosa, Jalebi, etc.) to a blocklist/exclusion list in the meal recommendation prompt.
- Strengthen the system prompt in the AI edge function to explicitly say: "Do not suggest deep-fried, high-calorie, or nutritionally poor Indian dishes. Prioritize balanced, home-cooked Indian meals."
- Optionally add a nutritional threshold filter: if a suggested meal's estimated calories or fat exceed a threshold, regenerate the suggestion.
