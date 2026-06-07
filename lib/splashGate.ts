// Coordinates when the native splash screen is hidden.
//
// We want the splash to stay visible until the first paint of meaningful
// content (home tab with data, or the auth screen if signed out). The
// previous setup hid the splash on a fixed timer, which caused a visible
// "spinner" gap when the data fetch took longer than the timer.
//
// Pattern:
//   - Root layout calls `armSplashGate(maxMs)` once on mount. This kicks off
//     a safety timer — even if nothing else fires, the splash hides after
//     `maxMs` so the user is never stuck on it.
//   - Screens that own "first paint" call `releaseSplash()` once they have
//     enough data to render. Whichever fires first wins.
//   - All calls after the first are no-ops.

import * as SplashScreen from 'expo-splash-screen';

let released = false;
let armed    = false;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

export function armSplashGate(maxMs = 2000): void {
  if (armed) return;
  armed = true;
  safetyTimer = setTimeout(() => releaseSplash(), maxMs);
}

export function releaseSplash(): void {
  if (released) return;
  released = true;
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
  // hideAsync can reject if the splash is already hidden — safe to ignore.
  SplashScreen.hideAsync().catch(() => {});
}
