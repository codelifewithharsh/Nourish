# 07 — Build, Deploy, and Environments

*Last updated: 2026-06-01.*

What command to run when, where secrets live, and how to ship a build that doesn't accidentally hit your dev database.

---

## 1. The day-to-day loop

For most work, this is all you need:

```bash
npx expo start        # runs Metro, opens dev menu
# edit code, save → hot reload
```

That runs the JS against your **local Expo dev environment**, hitting whatever Supabase project your `.env.local` points at.

---

## 2. The three environments

| Environment | When | Supabase project | OAuth client |
|---|---|---|---|
| **Local dev** | Daily coding | `nourish-dev` | dev Google OAuth client |
| **Preview** | TestFlight / internal Android | `nourish-dev` (or staging) | dev Google OAuth client |
| **Production** | App Store / Play Store | `nourish-prod` | prod Google OAuth client |

Each one has its own Supabase URL, anon key, and Google OAuth credentials. The point of separation is that a bug in development can't reach production data.

---

## 3. Environment variables

### What can be public

```
EXPO_PUBLIC_SUPABASE_URL       ← safe to ship in the bundle
EXPO_PUBLIC_SUPABASE_ANON_KEY  ← safe; RLS enforces security
```

Both are prefixed `EXPO_PUBLIC_` because Expo bakes them into the JS bundle at build time. Don't put anything sensitive here — the bundle can be unpacked.

### What must NOT be public

```
OPENAI_API_KEY                  ← server only, set as Supabase function secret
SUPABASE_SERVICE_ROLE_KEY       ← server only (bypasses RLS)
```

These never appear in the app code. They're set on the server only:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...
```

### Where they live

| File | Purpose | Committed? |
|---|---|---|
| `.env.example` | Documents the required vars | ✅ yes |
| `.env.local` | Your local dev values | ❌ gitignored |
| `.env.development` / `.env.production` | Per-EAS-profile slots | ❌ gitignored |
| EAS Secrets (Expo dashboard) | Values for build pipeline | n/a (managed in Expo dashboard) |
| Supabase Dashboard → Edge Functions → Secrets | Server-only secrets | n/a |

---

## 4. EAS Build

EAS Build is Expo's cloud build service. It compiles iOS `.ipa` and Android `.apk`/`.aab` files without you needing Xcode or Android Studio.

We have three profiles in [`eas.json`](../eas.json):

```
development → for `eas build --profile development`, includes dev client
preview     → internal distribution (TestFlight / APK)
production  → App Store / Play Store, autoIncrement: true
```

### Typical builds

```bash
# First-time setup
eas login
eas build:configure

# Build for TestFlight / internal Android testers
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Build for store submission
eas build --profile production --platform all

# Submit a built artifact to the store
eas submit -p ios
eas submit -p android
```

### What you need before your first store submission

1. **Apple Developer Program** — $99/year. Required for App Store and TestFlight.
2. **Google Play Developer Console** — $25 one-time. Required for Play Store.
3. **OAuth credentials** for production (separate from dev).
4. **Production Supabase project** with the same migrations and edge functions deployed.

---

## 5. Setting up a production Supabase project

```bash
# 1. Create at app.supabase.com (call it nourish-prod or similar)

# 2. Link
npx supabase link --project-ref <prod-ref>

# 3. Apply all migrations from this repo
npx supabase db push

# 4. Deploy all edge functions
for fn in generate-meal-plan get-recipe lookup-nutrition swap-meal; do
  npx supabase functions deploy $fn
done

# 5. Set OpenAI key
npx supabase secrets set OPENAI_API_KEY=sk-...

# 6. In Supabase Dashboard → Authentication → Providers → Google
#    Add the *production* Google Client ID/Secret (different from dev)

# 7. Add the prod URL + anon key to EAS Secrets via the Expo dashboard,
#    scoped to the "production" build profile
```

After step 7, `eas build --profile production` will pick those up automatically because `eas.json` reads them from the EAS env.

---

## 6. The Supabase CLI commands you'll actually use

```bash
# Apply pending migrations to whatever project you're linked to
npx supabase db push

# Regenerate database types after a schema change
npx supabase gen types typescript --linked > lib/database.types.ts

# Deploy one function (after editing its index.ts)
npx supabase functions deploy <name>

# Tail live function logs (useful for debugging OpenAI errors)
npx supabase functions logs --tail

# Set or rotate a secret
npx supabase secrets set OPENAI_API_KEY=sk-...

# Switch which project you're working against
npx supabase link --project-ref <ref>
```

There's no `npx supabase db pull` workflow in this repo — we treat the SQL files as the source of truth, not the live DB.

---

## 7. Pre-flight before any release

A short checklist before you press the build button:

- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] You've tested the auth flow (sign in → onboarding → tabs)
- [ ] You've tested at least one AI flow (regenerate plan, or open recipe)
- [ ] Migrations are applied to the target Supabase project
- [ ] Edge functions are deployed to the target Supabase project
- [ ] `OPENAI_API_KEY` is set on the target Supabase project
- [ ] EAS secrets match the target Supabase project
- [ ] You're not running in dev with your prod database (this is the most common mistake)

---

## 8. Where the Expo / EAS dashboards live

- **Expo Dashboard** → [expo.dev](https://expo.dev) — manages builds, EAS Secrets, OTA updates.
- **Supabase Dashboard** → [app.supabase.com](https://app.supabase.com) — manages DB, auth providers, edge function secrets, logs.
- **App Store Connect** → [appstoreconnect.apple.com](https://appstoreconnect.apple.com) — iOS app metadata, TestFlight builds.
- **Google Play Console** → [play.google.com/console](https://play.google.com/console) — Android app metadata.

---

## 9. OTA updates (Over-the-air)

EAS Update lets you push JS-only changes to existing installs without going through the store review. Not configured yet, but trivial to add when needed:

```bash
eas update --branch production --message "fix log tab regression"
```

This is for **JS / asset changes only**. Native changes (new permissions, new native modules, app icon) still require a new build.
