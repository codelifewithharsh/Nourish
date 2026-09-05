# 13 — Product Plan

*Updated 2026-09-06. A plan, not a description. For how the app works today see [`12-codebase-reference.md`](./12-codebase-reference.md).*

---

## 1. The problem

Live ~2 months, marketing ran, retention and word-of-mouth are both weak. What users said, filtered:

**Act on:** no time to log after eating · homepage is boring, new users don't know what the app does · anyone could build this with better UI · most people have similar diet plans (i.e. **the plan isn't the product**).

**Set aside:** *add workout tracking* — users ask for more features when the core loop hasn't hooked them; revisit only once logging retains. *Photo apps charge because images are expensive* — right observation, wrong inference (§3).

**Logging friction is the dominant retention variable.** Manual logging costs 5–10 min/day; photo logging ~8 seconds per meal. Photo loggers retain ~2.5× better at D30 (~52% vs ~23% at 3 months). ~70% abandon within 2 weeks if the app feels time-consuming. >98% churn within 2 weeks without an early value milestone.

Our only logging path is a `TextInput` on the Log tab. We built the high-friction version of the one interaction that decides retention.

*Percentages are directional — several come from app-marketing sources. Direction is corroborated; the §3 cost figures are from primary pricing pages.*

## 2. Two structural problems

**There is not a single food image in the app.** Verified: the only `Image` uses are the logo, Google avatars, and a founder photo. `recipes.hero_emoji` — an emoji — is the stand-in for a hero image. No `expo-image`, no image picker, no camera, no storage bucket.

For a food app this is disqualifying. It's most of why the app "looks dumb," why Home is boring, and why anyone could rebuild it better. Text and icons cannot make food feel appetising.

**Second: the first three tabs largely duplicate each other.** Home, Meals, and Log all show today's calories, a meal list, and a way to log — one job split across three tabs. And the fourth tab (You) is a 1,356-line file with six ungrouped sections. The information architecture is the reason a new user can't tell what the app is for. Restructured in Phase 2.

## 3. Cost: settled

Photo logging was skipped as expensive. It isn't:

| Model | Input $/1M | Output $/1M |
|---|---|---|
| Gemini 2.5 Flash-Lite | **$0.10** | $0.40 |
| gpt-5-nano | $0.05 | $0.40 |
| gpt-4o-mini *(current)* | $0.15 | $0.60 |

A food photo ≈ **1,120 input tokens** → **~₹0.01 per photo**. Three meals/day for a month ≈ **₹1/user**. Current AI cost is already <₹0.50/month. Competitor paywalls are a monetization choice, not cost pass-through. **Don't re-litigate.**

## 4. The wedge

**Cal AI** — ~$40M ARR, acquired by MyFitnessPal (Mar 2026), built on photo logging. Weak on **regional foods**, minimal micronutrients, pulled from the App Store (Apr 2026) over deceptive billing.

**HealthifyMe** — 40M users, profitable; real moat is the Indian food database (1M+ items). Weak point: 2.9/5 on Trustpilot, coaching and support are the top complaints.

**The gap:** identification is 68–86% accurate but **portion estimation is as low as 39%** — the dominant source of calorie error. Indian cuisine 75–80%; full thali 70–80%, the hardest case. **Portion estimation is the weakest link in every photo-calorie app, and weakest of all on Indian food.**

## 5. Decision

**Fix the loop, make it look like a food app, and build the moat.**

1. **Photo logging** — kills the friction that drives churn.
2. **Restructure around a dashboard, with real imagery** — 3 tabs + a camera button, one screen that answers "how am I doing?", and food photos everywhere.
3. **Indian portion accuracy** — thali decomposition, katori portions, oil/ghee estimation. *"The calorie app that actually knows Indian food."*

Without 3 we're a Cal AI clone. Without 2 nobody stays long enough to notice 3.

## 6. What premium and engaging actually mean

**Premium is craft.** Strong motion design → 15–20% longer sessions. Animations **under 300ms**, don't animate everything. Haptics need a small consistent vocabulary where success and warning feel distinct — meaning, not novelty.

**Engagement:** streaks work through *identity* (adherence 62%→89% with streak tracking). **Social accountability is the strongest mechanic** — 20–35% lower monthly churn. But: streaks burn out, leaderboards discourage, and health gamification **needs forgiveness or it creates shame spirals**. Someone who breaks a streak needs a way back, not a punishment.

**Activation is decided in the first ~90 seconds.** Design toward one aha moment; lead with what the user can *do*; let them skip.

**Our aha: photograph a plate and watch it break down correctly — before signup.** Today we ask 5 onboarding screens of questions and generate a plan before the user experiences anything.

## 7. Metrics

| Metric | Today | Target |
|---|---|---|
| Median time to log a meal | unknown | **< 15s** |
| New users logging ≥1 meal in first session | unknown | **> 60%** |
| D1 / D7 / D30 retention | unmeasured | baseline, then +50% |
| Meals logged per active user per day | unknown | **> 2** |
| Photo-log correction rate | n/a | **< 30%** |
| AI cost per active user / month | <₹0.50 | **< ₹5** |

**If photo logging ships and D7 doesn't move, friction wasn't the whole problem — stop and re-diagnose.**

## 8. Phases

### Phase 1 — Photo logging · *~1 week*

**Server — `lookup-nutrition-photo`.** Copy the shape of `supabase/functions/lookup-nutrition/index.ts` exactly: `guard(req, "photo")` → cache check → `g.start()` → model call → `recordOutcome()`. Add `photo` to `ACTION_META`; set limits **generously** (Pro 50/day, free 10/day) — cost is ~₹0.01/photo, so friction is the constraint, not spend. Keep the warm copy convention.

Model: Gemini 2.5 Flash-Lite or gpt-5-nano, structured JSON out. Note `costMicrosGpt4oMini()` is hardcoded to gpt-4o-mini rates — needs a per-model variant or cost logging goes wrong.

Return a **per-item breakdown**, not one number:
```json
{ "items": [ { "item": "Roti", "portion": "2 pieces", "calories": 240,
               "protein": 8, "carbs": 46, "fat": 3, "confidence": 0.9 } ],
  "total": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 } }
```
Per-item is what makes Phase 3's thali decomposition and correction UX possible. Don't collapse it early.

**Client:** camera capture on the Log tab, **downscale before upload** (fewer tokens, faster, less mobile data). Show the breakdown as an editable list. Give the wait an honest progress state.

**Caching:** don't cache raw images. Once items are recognized, reuse the existing text cache per item — "roti" already resolves through `nutritionCacheKey()`. Free cache economics, one source of truth for dish macros.

**Done when:** photograph → logged in under 15s.

### Phase 2 — Restructure the app around a dashboard · *~2–3 weeks*

Two problems solved together: the tabs overlap, and the app has no images.

**The overlap is structural.** Home, Meals, and Log all answer *"what am I eating today?"* — differing only in time framing. Verified duplication:

| | Today's calorie total | Meal list | Log action |
|---|---|---|---|
| Home | ✅ | ✅ | ✅ (4 call sites) |
| Meals | partial | ✅ | ✅ (5 call sites) |
| Log | ✅ | ✅ (timeline) | ✅ |

That's one job split across three tabs.

#### New structure: 3 tabs + a camera button

```
  ⌂ Today        (📷)        ▤ Plan        ◔ You
```

- **Today** — the dashboard. Merges current Home + Log.
- **Camera** — center FAB in the tab bar, opens straight to capture. `FloatingTabBar` is already a self-sizing floating pill, so a raised center button drops in without a rewrite.
- **Plan** — the week's meals (current Meals tab, demoted).
- **You** — profile and settings, decluttered.

#### The Today dashboard

Goal: make users take their body seriously instead of treating it casually. **Consequence-focused** — show what today's eating *means*, not just numbers. Motivating without being alarmist; clinical framing reads cold, and pure streak framing creates shame spirals (§6).

```
┌─────────────────────────────┐
│  ◕  1,240 / 2,000 kcal      │   big calorie ring, the anchor
│     760 left                │
│                             │
│  Protein   62 / 120g   ⚠    │
│  ▓▓▓▓▓░░░░░                 │
│  "Under target 4 days       │   ← the consequence line
│   running — this is where   │
│   muscle is lost."          │
│                             │
│  Fibre      8 / 30g    ⚠    │
│  ▓▓░░░░░░░░                 │
│                             │
│  Up next · Lunch            │
│  [photo] Dal Tadka  480kcal │
│                             │
│  Logged today               │
│  [photo] Poha    350 kcal   │
│  [photo] Chai     90 kcal   │
└─────────────────────────────┘
```

Rules for the consequence lines: only fire on a **sustained** pattern (3+ days), never on a single bad day. One at a time — the worst offender only. Always name the mechanism ("this is where muscle is lost"), never just the number. Never shame the user for one meal.

**Data gap — must be closed first.** `daily_logs` stores only `calories`, `protein`, `carbs`, `fat`, and `lookup-nutrition` returns only those. The dashboard needs more to say anything meaningful:

- Add **fibre**, **sugar**, **sodium**, **saturated fat** to `daily_logs`, to the `lookup-nutrition` prompt/response, and to `nutrition_cache`. These are what make consequence framing possible — fibre and sodium especially matter for Indian diets.
- Add a **weight log table** (`weight_logs`: user_id, date, weight_kg). Today weight is a single mutable field on `profiles` with no history, so no trend can be drawn.
- Nutrient targets: derive from existing profile data, same approach as `tdee.ts`.

**Do this migration before building the dashboard UI** — otherwise it gets built against four macros and reworked immediately.

#### Images

**There is not a single food image in the app** (§2). Fixing it:

- **The user's own photo becomes the log entry's image** — free, real, personal, and it arrives automatically once Phase 1 ships. This is what makes the Today timeline look like a food app.
- Needs a **Supabase Storage bucket** (none exists) with per-user RLS, plus client-side downscaling before upload.
- **Plan and recipe imagery** — `recipes.hero_emoji` is currently an emoji standing in for a hero image. Options: a curated set for common Indian dishes, or generated. Decide once; a wrong-looking dish photo is worse than none.
- Add **`expo-image`** (caching, transitions, placeholders) — no image library is installed today.

#### Decluttering You

Six sections today: kitchen, my body, food I love, food I avoid, my meal plan, settings — in a 1,356-line file, the largest in the app.

- Group into **Body & goals** / **Food preferences** / **App settings**, each collapsed by default with only a summary line visible.
- Split the file — it mixes six unrelated editors and is hard to change safely.
- Move plan regeneration to the Plan tab, where it belongs.

**Done when:** first-session logging clears 60%, every food surface shows a real image, and Today answers "how am I doing?" in one screen without scrolling.

### Phase 2.5 — Fix onboarding · *~1 week*

#### What we collect today

Five steps → `OnboardingData`: `goal` · `age` · `weightKg` · `heightCm` · `cuisines[]` · `dietType` · `restrictions[]` · `activityLevel`. Written to `profiles` along with computed `daily_calories` / `daily_protein`.

#### The biggest gap: we don't ask gender

`tdee.ts` **averages the male and female Mifflin-St Jeor formulas** because the app never asks. The formulas differ by 166 kcal at BMR, so every user's target is systematically wrong:

| User | Correct TDEE | What we compute | Error |
|---|---|---|---|
| Man, 70kg, 175cm, 30 | 2,267 | 2,153 | **−114 kcal/day** |
| Woman, 55kg, 160cm, 30 | 1,704 | 1,818 | **+114 kcal/day** |
| Man, 85kg, 180cm, 45 | 2,413 | 2,299 | **−114 kcal/day** |
| Woman, 65kg, 155cm, 40 | 1,729 | 1,844 | **+114 kcal/day** |

Every man is under-fed by ~114 kcal/day; every woman is over-fed by the same. The same averaging distorts the Devine IBW protein base. **One question fixes a permanent error on 100% of users** — this is the highest-value change in the whole onboarding.

Ask sex-at-birth for the metabolic calculation (with a "prefer not to say" option that keeps today's averaged behaviour), and keep it visibly separate from identity.

#### What the meal-plan AI is starved of

`buildUserPrompt()` receives only: goal · calorie target · protein target · diet type · cuisines · restrictions · pantry. Everything below is absent, and each one visibly changes a plan:

| Add | Why it changes the plan |
|---|---|
| **Meals per day + timings** | We hardcode 3 meals. Users who eat 2, or 5 with snacks, get an unusable plan. Timings also drive the reminder schedule |
| **Who cooks / time available** | A 15-min weekday cook and someone with domestic help need different plans. Biggest driver of "I won't actually cook this" |
| **Region/state** | "North Indian" is far too coarse. A Gujarati, Bengali, and Punjabi kitchen share almost nothing. Directly feeds the Indian-accuracy moat (Phase 3) |
| **Budget tier** | Paneer/nuts daily vs dal/seasonal veg. Silently decides whether a plan is affordable |
| **Eating-out frequency** | Someone eating out 5×/week needs a plan that plans for it, not one that pretends otherwise |
| **Medical flags** (diabetes, PCOS, thyroid, BP, cholesterol) | **Confirmed in scope.** Changes what's safe to suggest — a diabetic plan is not a generic one. Also the highest-value field we collect (§9). Optional, clearly explained, never a gate |
| **Allergies** (free text) | `restrictions` is a fixed list of 8. A real allergy that isn't on it has nowhere to go — a safety gap, not just a quality one |
| **Target weight + timeline** | We infer deficit from goal alone. A stated target makes the calorie math honest and gives progress something to measure against |

Also worth collecting: **sleep schedule** (meal timing), **water target** (currently hardcoded to 10 glasses for everyone), and **weight trend direction**.

#### Phone number (optional)

Add `profiles.phone` (nullable). Ask late — after the plan is shown, never as a gate. Explicit purpose, honest copy, easy skip.

Note: this is contact data, not a login method. Auth stays Google OAuth; adding phone auth is a separate decision.

#### Structure: don't just add screens

Onboarding is already 5 screens and the aha moment sits behind all of it (§6). Adding 8 more questions the same way makes it worse.

- **Let the user reach the aha first.** Photograph a plate, see the breakdown, *then* answer questions. Phase 2 already moves this.
- **Split into required vs progressive.** Required to generate a plan: sex, age, height, weight, goal, activity, diet type. Everything else — region, budget, cooking time, medical flags, target weight, phone — is asked later, in context, or from a "improve my plan" prompt on the Plan tab.
- **Show the payoff.** "Tell us your state → we'll match your regional cuisine" converts better than an unexplained question.
- Every added field needs a **default that works when skipped**.

#### Work required

1. Migration: `profiles` gains `sex`, `phone`, `region`, `meals_per_day`, `cooking_time`, `budget_tier`, `eats_out_frequency`, `medical_flags` text[], `allergies` text, `target_weight_kg`, `target_date`. All nullable.
2. `tdee.ts` — use real sex when present, keep averaging as the "prefer not to say" fallback.
3. `buildUserPrompt()` — thread the new fields through; each needs a sensible line when null.
4. `planCacheKey()` — **new fields must join the cache key**, or users with different regions/budgets will share cached plans. Watch the hit rate; more dimensions means fewer hits.
5. Rework onboarding into required + progressive.

### Phase 3 — Indian portion accuracy · *~2 weeks, ongoing*

The moat. Phase 1 alone makes us a Cal AI clone.

- **Katori/thali-aware prompting** — decompose into components, estimate each separately rather than one blended guess.
- **Reference-object scale** — katori, plate rim, or roti as an implicit size reference. Direct attack on the 39% portion problem: a known-diameter object beats absolute volume from a 2D image.
- **Explicit oil/ghee estimation** — the largest hidden-calorie source in Indian home cooking, where generic models fail worst.
- **Honest confidence + one-tap correction** ("2 rotis, not 3"). Corrections are a **proprietary training signal** — a data moat nobody copies by cloning the UI.
- **Per-cuisine eval set** (North/South/Bengali/Gujarati) so accuracy is a number, not a claim.

**Done when:** correction rate <30% and we can state per-cuisine accuracy from our own eval set.

### Phase 4 — Premium feel · *~1 week*

Extend design tokens: semantic status colors, elevation scale, motion durations (all **<300ms**). Today there are 8 colors, no status/elevation/motion tokens, and hardcoded hex in screens (doc 12 §12). Apply the haptic vocabulary consistently **starting with Home**, which doesn't import `lib/haptics.ts` at all. Consider dark mode (currently hardcoded light).

### Phase 5 — Engagement · *~2 weeks*

In order: **streak forgiveness first** (a repair/grace mechanic — a fix, not a feature) → **social accountability** (highest-value mechanic; avoid pure leaderboards, which discourage those most at risk) → consider commitment contracts over more streak pressure.

## 9. Deferred

**Workout tracking** — noise from an unhooked loop. **Monetization** — no paywall until D7 moves; when it comes, no dark patterns (what got Cal AI pulled). **Business-model redirection** — under active discussion; this plan assumes the current consumer app.

Note: **medical flags are now in scope** (Phase 2.5). They are the single most commercially valuable field we collect — condition-specific health apps in India command ₹500–1,500/month versus ~₹90 for general wellness. Two obligations that come with holding them:

- **Handle as health data.** Optional, clearly explained at the point of asking, never a gate, deletable. RLS already isolates rows per user; don't log these values into analytics.
- **Don't make medical claims.** The plan can adapt to a flag ("lower-GI meals since you noted diabetes"); it cannot diagnose, treat, or promise outcomes.

## 10. Rules

1. Cost is not a reason to avoid image AI (§3). Settled.
2. Friction is the enemy — any change adding taps to logging is a regression.
3. No workout tracking without an explicit decision to reverse §1.
4. No dark patterns in monetization.
5. When trading generality against Indian correctness, **choose Indian correctness**.
6. Follow doc 12 §14 — `guard()` + `recordOutcome()`, never call model APIs from the client.

---

## Sources

Retention: [Nutrola](https://nutrola.app/en/blog/calorie-tracker-retention-rates-how-long-users-stick-with-each-app) · [Fitness app stats](https://fitnessrefined.co/fitness-app-retention-statistics/) · [Kibora](https://kibora.app/blog/why-diet-apps-dont-work-long-term/)
Pricing: [OpenAI](https://developers.openai.com/api/docs/pricing) · [Gemini](https://ai.google.dev/gemini-api/docs/pricing)
Competitors: [Cal AI ARR](https://getlatka.com/companies/calai.app) · [TechCrunch acquisition](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens/) · [Cal AI review](https://nutrola.app/en/blog/cal-ai-review-2026) · [HealthifyMe](https://www.onestepahead.so/p/how-healthifyme-tracked-its-way-to)
Accuracy: [PlateLens](https://platelens.app/blog/ai-calorie-counting-accuracy-research-2026) · [Fitia](https://fitia.app/learn/article/ai-calorie-photo-apps-accuracy-2026/) · [Indian trackers tested](https://calfix.app/blog/best-calorie-tracker-indian-food)
Feel & engagement: [Motion design](https://www.techqware.com/blog/motion-design-micro-interactions-what-users-expect) · [Haptics](https://lucky.graphics/learn/haptic-ux-innovation-2026/) · [Sahha gamification](https://sahha.ai/blog/gamification-behavioral-nudges-health-apps/)
Onboarding: [Scandiweb](https://scandiweb.com/blog/user-onboarding-best-practices/)
