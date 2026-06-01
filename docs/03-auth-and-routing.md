# 03 — Auth & Routing

*Last updated: 2026-06-01.*

This doc explains how Expo Router works in this project, how a user gets from cold start to the right screen, and how Google Sign-In is wired through Supabase Auth + Google Cloud Console.

---

## 1. Expo Router crash course

Expo Router is file-based routing for React Native, modelled after Next.js's App Router. Three things to know:

1. **Every file under `app/` is a route.** `app/index.tsx` is `/`, `app/recipe/[id].tsx` is `/recipe/123`, etc.
2. **`_layout.tsx` files wrap their siblings.** They're where you put providers, headers, tab bars.
3. **Folders in parentheses are "route groups."** `(auth)` and `(tabs)` are organisational — they share a `_layout.tsx` but don't add a URL segment.

So `app/(auth)/login.tsx` is reachable at `/login`, not `/auth/login`.

---

## 2. The route tree

```
app/
├─ _layout.tsx                  ← global providers + auth-out listener
├─ index.tsx                    ← splash, routes user by session state
├─ (auth)/                      ← group: unauthenticated routes
│  ├─ _layout.tsx               ← shared layout for auth screens
│  ├─ login.tsx                 ← Google sign-in
│  └─ onboarding.tsx            ← multi-step profile setup
├─ (tabs)/                      ← group: authenticated routes
│  ├─ _layout.tsx               ← floating tab bar
│  ├─ index.tsx                 ← Home
│  ├─ meals.tsx                 ← 7-day plan
│  ├─ log.tsx                   ← AI nutrition lookup
│  └─ profile.tsx               ← You
└─ recipe/[id].tsx              ← dynamic route, takes URL-encoded meal name
```

---

## 3. The startup flow

```
App launches
   ↓
Native splash (dark green from app.json's expo-splash-screen plugin)
   ↓
React renders
   ↓
app/_layout.tsx mounts:
   - SafeAreaProvider, StatusBar
   - CreditsProvider (loads balance)
   - onAuthStateChange listener (only handles SIGNED_OUT)
   - Stack navigator
   ↓
app/index.tsx (the splash route) mounts:
   - shows Lottie animation + "Satva" wordmark
   - calls supabase.auth.getSession()
   - reads profiles.onboarding_completed if signed in
   - router.replace() to the right group
   ↓
User lands on /(auth)/login | /(auth)/onboarding | /(tabs)
```

### Why is the routing logic split across two files?

`_layout.tsx` only handles **sign-out** — when the user explicitly signs out we bounce them to login.

`index.tsx` handles **cold start** — once on app open it inspects state and routes once.

We *don't* listen for `SIGNED_IN` events at the layout level. In Supabase v2, token refreshes can fire `SIGNED_IN` repeatedly, and reacting to it caused an infinite redirect loop. Once `index.tsx` lands you on a screen, route changes are user-driven from there.

### The native → app splash chain

The user sees one continuous dark-green screen for ~2 seconds:

1. **Native splash** — configured in `app.json` under the `expo-splash-screen` plugin. Background `#1A3A2A`, splash icon centered.
2. **`app/index.tsx`** — same dark-green background, Lottie animation. Native splash hands off to this seamlessly.
3. **`router.replace()`** — once we know where to go, we navigate. The destination screen takes over.

If you ever see a white flash between steps, the native splash background colour is wrong.

---

## 4. Auth: Google Sign-In through Supabase

### The flow

```
User taps "Continue with Google"
   ↓
supabase.auth.signInWithOAuth({ provider: 'google' })
   → returns a hosted OAuth URL
   ↓
WebBrowser.openAuthSessionAsync(url, redirectUrl)
   → opens system browser (SFAuthenticationSession on iOS,
     Chrome Custom Tab on Android)
   ↓
User picks a Google account
   ↓
Google redirects back to `satva://` (our app scheme)
   ↓
Browser closes, app foregrounds with the result URL
   ↓
We parse `access_token` and `refresh_token` from the URL hash
   ↓
supabase.auth.setSession({ access_token, refresh_token })
   ↓
Supabase emits SIGNED_IN
   ↓
SecureStore persists the tokens (next launch is silent)
```

Code: [`app/(auth)/login.tsx`](../app/(auth)/login.tsx) `handleGoogleSignIn`.

The reason we manually `setSession` after `openAuthSessionAsync` — instead of letting Supabase's built-in deep-link handler do it — is that `expo-auth-session`'s browser-managed flow returns the tokens to us as URL params, and we forward them explicitly. It's the most reliable path on Expo with no native modules.

### What `expo-secure-store` does

`lib/supabase.ts` configures the Supabase client with a custom `storage` adapter that reads/writes the session to iOS Keychain / Android Keystore via `expo-secure-store`. This means:

- Tokens are encrypted at rest.
- They survive app updates.
- On next launch, `supabase.auth.getSession()` returns the persisted session without a network call.
- They get cleared on explicit sign-out or device wipe.

---

## 5. Google Cloud Console setup

This is what you (or whoever sets up a fresh Supabase project) does **once** per environment (dev, prod).

### A. Create an OAuth client in Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (or reuse one).
2. Navigate to **APIs & Services → Credentials**.
3. Click **Create Credentials → OAuth client ID**.
4. Choose **Web application** (yes, even though it's a mobile app — Supabase brokers the OAuth and acts as the web client).
5. Authorised redirect URIs — add:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   You'll find `<your-project-ref>` in your Supabase project URL.
6. Save the **Client ID** and **Client Secret**.

### B. Configure the OAuth consent screen

In Google Cloud Console → **APIs & Services → OAuth consent screen**:
- App name: Satva
- User support email: yours
- Scopes: `email`, `profile`, `openid` (the defaults)
- Test users: add your email until you publish the app

### C. Wire it into Supabase

In Supabase Dashboard → **Authentication → Providers → Google**:
- Enable Google.
- Paste the Client ID and Client Secret you just generated.
- Save.

The redirect callback URL Supabase shows here should match what you added in Google Console.

### D. App URL scheme

`app.json` declares `"scheme": "satva"`. This is what Google redirects back to (`satva://...`). If you change the scheme, update it in both places — but you don't need to, it's already set.

---

## 6. The auth state machine in code

This is what determines which screen a user sees:

| Session | Profile row | `onboarding_completed` | Destination |
|---|---|---|---|
| Missing | — | — | `/(auth)/login` |
| Present | Missing | — | `/(auth)/onboarding` |
| Present | Exists | `false` | `/(auth)/onboarding` |
| Present | Exists | `true` | `/(tabs)` |

The decision happens in [`app/index.tsx`](../app/index.tsx). Note that `profiles.onboarding_completed` is the *only* signal that distinguishes "needs onboarding" from "done." Don't add other flags.

---

## 7. Common gotchas

- **Sign-in opens browser but never returns** → `scheme` in `app.json` doesn't match what Google is redirecting to. Or you're testing in Expo Go without a development build (deep linking back to a custom scheme requires a dev build for OAuth).
- **Stuck on splash after reload** → an error in a provider above `<Stack>` (e.g. `CreditsProvider`) is blocking render. Check Metro logs for the red error before `[layout] mount`.
- **Logged-in user keeps landing on onboarding** → `profiles.onboarding_completed` was never written to true. Check the onboarding completion handler.
- **Token expires after a while** → it shouldn't — Supabase's `autoRefreshToken: true` is set in `lib/supabase.ts`. If it does, the SecureStore writes are failing silently; check `getItem`/`setItem` are returning.

---

## 8. Sign-out

`supabase.auth.signOut()` triggers `SIGNED_OUT` → `_layout.tsx` listener calls `router.replace('/(auth)/login')`. SecureStore is cleared automatically. No manual cleanup needed.
