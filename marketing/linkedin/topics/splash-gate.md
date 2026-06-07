# Topic: The 80-line file that made my app feel instant

## Working titles
- *"The cheapest UX upgrade I shipped this month: a 'splash gate'"*
- *"Native splash for 1.5s, then loading spinner for 0.8s. I fixed it without fixing the network."*
- *"Loading states are about perception. Here's the 80-line file that taught me that."*

## What actually happened

My app's cold-start sequence used to be:
1. Native splash (logo on dark green) for a fixed 1000ms.
2. Home screen renders with `<ActivityIndicator>` while data loads (200ms–2s depending on the network).
3. Home screen shows content.

The user saw a spinner between 0 and 2 seconds. The handoff from splash → spinner felt jarring. The whole launch felt unprofessional.

The "real" fix is to make the data fetch faster. That's not always possible — the data depends on the network. But the *perceived* slowness was the splash hiding too early.

So I built a tiny coordinator:
```ts
// lib/splashGate.ts — entire file is ~30 lines
let released = false;
let armed = false;
let safetyTimer = null;

export function armSplashGate(maxMs = 2000): void {
  if (armed) return;
  armed = true;
  safetyTimer = setTimeout(() => releaseSplash(), maxMs);
}

export function releaseSplash(): void {
  if (released) return;
  released = true;
  clearTimeout(safetyTimer);
  SplashScreen.hideAsync().catch(() => {});
}
```

Usage:
- Root layout calls `armSplashGate(2000)` — 2s safety timer.
- Home screen calls `releaseSplash()` the moment its data is ready.
- Login + onboarding (no fetch to wait on) call `releaseSplash()` immediately on mount.
- Whichever fires first wins.

Now the native splash stays up until the home screen has data. The user never sees a spinner. If the network is genuinely slow, the safety cutoff hides the splash at 2s anyway so they're never stuck on it.

## The takeaway

Loading states are about perception. A native splash held one extra second beats a JS spinner shown for one second. The cost is wiring. The win is "the app feels instant."

## What NOT to over-claim
- This doesn't fix slow data. If your data is genuinely slow, fix the data. The splash gate is for the case where the data is *fast enough* — the issue is just the handoff.

## Optional aside
The same coordinator pattern works for any "wait until X is ready before hiding Y" race. Custom paywall? Same shape. Onboarding video? Same shape.

## Final post
*(Add final version here.)*
