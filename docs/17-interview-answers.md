# 17 — Interview Answers: Defending the Choices

*Written 2026-09-09. Plain-language answers to "why did you build it this way?"*

Doc [16](./16-design-system.md) explains how the system works. This one is for the follow-up: **"why did you choose that?"** Every answer here is written to be said out loud — short first, detail only if they push.

**The rule for all of these: lead with the trade-off, not the feature.** Saying "Postgres is great" sounds like you picked what you knew. Saying "I picked Postgres because the alternative would have made me write an authorization layer I'd probably get wrong" sounds like you made a decision.

Never claim a choice had no downside. **"What would you do differently?" is a test of self-awareness, not a trap** — every section below ends with an honest cost.

---

## 1. "Why Postgres?"

**Short:** My data is relational and my security model is row ownership. Postgres does both natively; a document store would have made me build the second one myself.

**If they push:**

Nourish is users → their logs → their plans. Every query is "this user's rows for this date." That's a foreign key and an index, which is exactly what a relational database is for.

The deciding factor was **Row Level Security**. In Postgres I write one rule per table — `user_id = auth.uid()` — and the database refuses to return anyone else's rows. In MongoDB or Firestore, "only show this user their own data" is a filter I have to remember in every single query. Forget it once and that's a data leak.

I'd rather that rule live in one place the database enforces than in fifty places I have to get right every time.

**The cost:** the meal plan is a `jsonb` blob, not normalised tables. It's read and written whole, never queried into, so structure would buy nothing — but if I ever want "show me every meal containing paneer across all plans," I'd have to restructure. I took that trade knowingly.

## 2. "Why Supabase?"

**Short:** It gave me Postgres, auth, storage, and serverless functions with one integration, and it's just Postgres underneath — so I'm not locked in.

**If they push:**

I'm one developer. Every service I run myself is a service I maintain, monitor, and patch. Supabase gave me four things in one:

| I needed | Supabase gave |
|---|---|
| Database | Postgres, with RLS |
| Login | Auth with Google OAuth built in |
| Photo storage | Storage buckets with the same RLS model |
| Somewhere to hide the AI key | Deno edge functions |

The important part is that **RLS is the connective tissue**. My database rows and my storage bucket use the same "is this yours?" rule. If I'd assembled this from separate services I'd have written authorization twice and they'd have drifted.

**On lock-in:** it's real but bounded. The database is standard Postgres — `pg_dump` and it runs anywhere. The auth and storage SDKs are what I'd have to rewrite. I judged that acceptable for the time it saved. Firebase, by comparison, would have locked me into a non-relational model I'd have had to design around.

**The cost:** I'm dependent on someone else's uptime, and edge functions are Deno, so I can't reuse app code server-side.

## 3. "Why no Redux / Zustand / React Query?"

**Short:** State libraries solve coordination between many writers of shared data. I have one user, six screens, and one writer per concern — so it'd be ceremony without the payoff.

**If they push:**

Be precise about what those tools solve: two screens showing the same server data, needing to agree after a write. That's a genuinely hard problem *when you have it*.

Here, each screen owns its own fetch. Home reads today's totals, Plan reads the week, Me reads the profile. They rarely overlap, and the app is small enough that "screen fetches what it renders" is easy to follow — you read one file top to bottom and understand the whole screen. Adding Redux would mean actions, reducers, and selectors sitting between a screen and data it could have fetched in three lines.

**Be honest about where it bit me** — this is the part that lands well:

Making photo logging an overlay instead of a tab removed the navigation that used to trigger a refresh. In v1, logging meant navigating away and back, and Home refetched on remount for free. In v2 the sheet opens *over* Home, so Home never unmounts and would sit there showing stale numbers.

React Query would have handled that automatically: invalidate the query, every subscriber re-renders. Instead I hand-rolled a small pub/sub — screens register a callback, the provider fires them after the insert. About fifteen lines.

So my honest answer is: **the decision was right for the app's size, and I can point at exactly what it cost me.** If I add a second data-sharing flow like that, I'd bring in React Query rather than write pub/sub twice — the second hand-rolled instance is where it stops being worth it.

## 4. "How are you protecting the API key?"

**Short:** The OpenAI key is never in the app. It's a server-side secret only my edge functions can read.

**If they push:**

Anything shipped in a mobile binary is public. An APK can be unzipped and the strings read in minutes — an `EXPO_PUBLIC_` variable is compiled straight into the bundle. So a key in the app isn't "hidden," it's just published slightly awkwardly.

The flow instead:

```
App  ──►  My edge function  ──►  OpenAI
     JWT   (holds the key)   secret key
     only    server-side       never leaves
```

The app calls **my** function, authenticated as the user. The function reads `OPENAI_API_KEY` from Supabase secrets — set via CLI, never in git, never in the bundle — and calls OpenAI itself. The user's device never sees it.

**The part worth volunteering, because it shows you thought past the obvious:** hiding the key isn't the only reason. Because every model call goes through my server, I also get to

- **rate limit** — the app can't be scripted into a bill
- **log cost** per call, so I know spend per user
- **change prompts without a release** — a prompt in the binary is frozen until app review

Even if the key were somehow safe on-device, I'd still want that middle layer. **The key is the reason people notice; control is the reason it's right.**

**The cost:** an extra network hop, and a cold start on the function.

## 5. "How does an API call actually work?"

**Short:** Two paths. Plain data goes straight to the database. Anything touching AI goes through an edge function.

```
      ┌── ordinary data (logs, profile, water)
APP ──┤    → straight to Postgres, RLS filters it
      └── anything AI
           → edge function → guard() → OpenAI
```

**Path 1 — data.** The app queries Postgres directly using the Supabase client. There's no REST API I wrote. RLS makes it safe: even without a `where user_id = ...`, the database only returns your rows.

```ts
await supabase.from('daily_logs').select('*').eq('date', today);
```

**Path 2 — AI.** The app calls a function by name and the client attaches the user's JWT automatically:

```ts
await supabase.functions.invoke('lookup-nutrition-photo', { body: { image_base64 } });
```

Server-side, every AI function runs the same `guard()` before doing any work:

```
authenticated?  → no: 401
over daily limit? → yes: 429
                  → no: log 'pending', call OpenAI,
                        record tokens + cost + latency
```

**Say why the split exists, not just that it exists:** if the client could lie about it, it doesn't run on the client. A user can't lie about which rows are theirs — Postgres knows from the JWT. They *could* lie about how many AI calls they've made, so that check lives on the server.

## 6. "How does authentication work?"

**Short:** Google OAuth through Supabase Auth. I never see or store a password.

**The flow, plainly:**

```
Tap "Continue with Google"
   → system browser opens Google's login
   → user authenticates with Google (not with me)
   → redirects back to the app via the `nourish://` scheme
   → Supabase issues a JWT
   → stored in expo-secure-store (Keychain / Keystore)
   → attached automatically to every later request
```

**Three details worth having ready, because they're what a good interviewer probes:**

**Why a system browser, not a webview?** A webview is an app-controlled window — I could read what's typed in it. Users can't tell the difference, so OAuth providers require the real browser, where the URL bar is visible and the password never passes through my process.

**Why Keychain, not AsyncStorage?** AsyncStorage is plaintext on disk; on a rooted or jailbroken device it's readable. A session token is a live credential, so it belongs in the OS secure store. `expo-secure-store` maps to iOS Keychain and Android Keystore.

**Why no passwords at all?** Passwords mean storing hashes, reset emails, breach exposure, and rate-limiting login attempts. Google already does all of that better than I will. **The most secure password is the one I never store.**

**On sign-up:** a Postgres trigger (`handle_new_user`) creates the profile row automatically the moment an auth user is created — so there's no window where someone is logged in but has no profile.

## 7. "What is RLS?"

**Short:** A rule on each table saying which rows you're allowed to see. Postgres enforces it, so the app can't get it wrong.

**The rule is one line:**

```sql
using (user_id = auth.uid())
```

`auth.uid()` is the user ID from the JWT, read by the database. So this query:

```ts
supabase.from('daily_logs').select('*')     // no filter at all
```

returns **only your rows**. Not because the app filtered them — because Postgres won't return the others.

**The framing that makes it land:** normally security is *code you write*, so a missed `where` clause is a data leak. With RLS security is *a property of the table*. I can forget the filter and nothing breaks. That's the difference between "we're careful" and "it's impossible."

This is the single reason the app has no backend server. Without RLS I'd need a server to enforce ownership on every request. With it, that job is already done by the database, and a server would only be re-implementing it somewhere easier to get wrong.

It applies to storage too: `meal-photos` is private, with a policy checking the first folder in the path is your user ID, so photos are read through short-lived signed URLs.

## 8. "Anon key vs user JWT?"

**Short:** The anon key says *which project*. The JWT says *which person*. Only the JWT unlocks data.

| | Anon key | User JWT |
|---|---|---|
| Answers | "which backend?" | "who are you?" |
| Public? | **Yes, by design** | No — short-lived, per user |
| Lives in | The app bundle | Keychain / Keystore |
| Gets you | Nothing on its own | Your own rows |

**The line that settles it:** with only the anon key, `auth.uid()` is null, so every RLS policy fails and every query returns zero rows. It's a street address, not a key to the flat — it tells the request where to go, it doesn't get you in.

**Why it's safe to ship:** the anon key is designed to be public. Its power is entirely bounded by RLS. That's also the catch worth admitting: **the anon key is only safe if RLS is actually on.** A table with RLS disabled is world-readable to anyone who extracts the key from the APK. So "is RLS enabled on this table?" is the first question for every migration.

The service-role key *does* bypass RLS — that one lives only in edge functions, never in the app, and is used for writes the user shouldn't control, like usage logs.

## 9. "Why Expo / React Native?"

**Short:** One codebase for iOS and Android, and Expo removes the native build work I'd otherwise do alone.

**If they push:** the app is screens, forms, lists and a camera — nothing needing native performance. Expo gave me camera, image manipulation, notifications, secure storage and OTA updates as maintained modules. OTA especially: I can ship a JS fix in minutes instead of days behind app review.

**The cost:** anything Expo doesn't wrap needs a config plugin or a prebuild, and I already hit that — I ship a small plugin to strip an iOS push entitlement. That's the deal: enormous leverage until you step outside it, then real work.

## 10. "Why gpt-4o-mini?"

**Short:** It does vision and text in one model, and it's cheap enough that cost isn't a design constraint.

**If they push:** a food photo is ~1,120 input tokens — about **₹0.01 per photo**, so roughly ₹1 per user per month at three meals a day. I use `detail: "low"` because the model downsamples to ~512px anyway and plates are large subjects; high detail costs far more and buys nothing here.

One model for both text lookups and vision means one integration and one cost formula.

**What I'd revisit:** Gemini 2.5 Flash-Lite is cheaper on input. I'd only switch on measured accuracy for Indian food, not price — the cost difference is already below noise. And cost is logged per model, so I can compare with data instead of guessing.

## 11. "What would you do differently?"

Have real answers ready. This question separates people who built something from people who can *evaluate* what they built.

**I'd add analytics for retention before building the feature meant to fix retention.** I track feature usage — meals logged, photos scanned — but not cohorts. So I can't yet prove photo logging improved D7, which was the entire point. I'd instrument the metric first next time.

**I'd have asked for sex during onboarding from day one.** The app averaged the male and female BMR formulas because it never asked. Those formulas differ by a fixed 166 kcal, so every man was under-fed by ~114 kcal a day and every woman over-fed by the same — a permanent error on 100% of users, from one missing question. It taught me to check my domain formulas' assumptions as carefully as my code.

**I'd split the profile screen earlier.** It reached 1,356 lines holding six unrelated editors. Nothing was broken; it was just increasingly risky to change.

**I'd delete dead code instead of keeping it "just in case."** There's a whole image-generation feature — function, bucket, column — with zero references. It costs nothing to run and real confusion to encounter.

## 12. Questions that trip people up

**"Isn't calling the database directly from a mobile app insecure?"**
It would be, without RLS. The client only ever holds the public anon key, and the database filters every query by the user in the JWT. The security boundary is the database, not the client. What I *don't* do client-side is anything the user could lie about — rate limits and cost tracking are server-side.

**"What happens if the AI returns garbage?"**
Every field is sanitised server-side — numbers coerced and floored at zero, strings length-capped, confidence clamped to 0–1. Meal plans have a hardcoded 7-day fallback if generation fails. And the user reviews and corrects every photo result before anything is written, so the model's output is a *draft*, never a fact.

**"How do you stop someone running up your OpenAI bill?"**
An atomic per-user, per-day counter in Postgres — the check and increment are a single statement, so two simultaneous calls can't both slip through. It increments *before* the model call, so failed and retried calls still count; otherwise you could farm free calls by making them fail. Cache hits count too, since hammering a cache is still abuse.

**"Why is everyone a Pro member?"**
It's not a business model yet — there's no paywall. Pro is a badge plus a generous rate-limit tier. The flag exists so I can *lower* limits on an account that looks abusive. I decided not to monetise until retention proves the loop works; charging for something people don't come back to just buys refunds.

**"Your cache rounds people's calorie targets. Isn't that wrong?"**
It's rounding to the nearest 100 kcal so similar users share a generated plan, which is the difference between a cache that hits and one that doesn't. The error is ~1–2%, well inside the model's own accuracy at estimating a bowl of dal. What I deliberately *don't* round is allergies — those are part of the key exactly, because sharing a plan across different allergies is a safety problem, not a quality one.

**"Why store only calories and protein, then calculate carbs and fat?"**
One source of truth. Four stored numbers can drift out of sync; two stored and two derived can't. Carbs and fat come from what's left after protein, split 60/40. If I later need user-specific macro splits, that becomes a stored preference — but I'd rather add that when it's needed than carry four mutable numbers now.

---

## The three sentences to open with

If you get one shot at "tell me about your project":

> Nourish is an AI nutritionist for Indian food. You photograph your plate and a vision model breaks it into individual dishes with per-dish calories, which you correct before it's saved.
>
> It's React Native talking directly to Postgres — no backend server, because Row Level Security means the database itself enforces that you only ever see your own rows. The only server-side code is a set of small functions that hold the AI key, rate-limit usage and log cost.
>
> The interesting problem isn't identifying food — everyone's ~80% at that. It's **portion size**, which industry-wide is as low as 39%, and worst on Indian food. So the model is prompted to measure against standard Indian serviceware — a katori is 150ml, a roti 15cm — and to account for oil and ghee, which is where every generic model underestimates a home-cooked Indian meal.
