# Topic: Expo Go quietly stopped supporting things my app needed

## Working titles
- *"Two ways Expo Go broke my dev loop in one week"*
- *"`expo-notifications` doesn't crash anymore. It just kills the app."*
- *"You can't test Google OAuth in Expo Go in 2026"*

## What actually happened

I was building Nourish in Expo Go because the iterate-on-device loop is unbeatable — edit, save, fast refresh, you're testing. Zero native build time. For a solo engineer, that loop is half your productivity.

Then I hit two walls in one week.

**Wall 1: `expo-notifications`.**
Starting with Expo SDK 53, push notifications were removed from Expo Go. The catch: `import * as Notifications from 'expo-notifications'` doesn't fail with a polite warning — it **crashes the app at module load**. Not at first use. At import.

Cold start → blank screen → user logs say "Native module not found." On Expo Go specifically.

Fix: lazy `require()`.
```ts
const isExpoGo = Constants.executionEnvironment === 'storeClient';

function getNotifications() {
  if (isExpoGo) return null;
  return require('expo-notifications') as typeof import('expo-notifications');
}
```
Every notification call site became `const N = getNotifications(); if (!N) return;`. Slightly clunkier API; app boots in Expo Go again.

**Wall 2: Google OAuth.**
Expo removed the auth proxy in SDK 50. The Expo Go redirect URI is `exp://10.x.x.x:8081` — a local IP. Google's OAuth flow can't redirect there. I tried `useProxy: true` on `makeRedirectUri()`. The type doesn't accept it. The proxy is gone.

There is no workaround. Google OAuth doesn't work in Expo Go anymore.

## The takeaway

Expo Go is a dev tool, not a runtime. Plan for the moment you'll switch to a development build. SDK upgrades silently remove things from Expo Go — read the release notes.

What I do now: develop everything in Expo Go *except* auth flows. Auth gets tested on `npx expo run:android` (development build) or a quick EAS preview.

## What NOT to over-claim
- Not bashing Expo. Their tradeoff makes sense — Expo Go has to ship one binary that supports any app's needs. They can't keep every native module in there.
- I'm not anti-Expo-Go. It's still my default for everything except auth.

## Optional aside
The same Constants check (`executionEnvironment === 'storeClient'`) is also how I figure out whether to show a dev OTP login in Expo Go. Real builds get the OAuth path. Dev gets a typed email + magic link. Same screen.

## Final post
*(Add final version here.)*
