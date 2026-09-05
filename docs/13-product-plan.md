# 13 — Product Plan

*Written 2026-09-06. This is a **plan**, not a description of the app. For how the app works today, see [`12-codebase-reference.md`](./12-codebase-reference.md).*

---

## 1. Why we're changing direction

The app has been live ~2 months. Marketing ran. Retention and word-of-mouth are both weak. Feedback gathered from many conversations was consistent — sorted into what to act on and what to set aside:

**Act on:**
- *"No one has time to log a meal after eating."* — the core problem.
- *"The homepage is boring; a new user won't know what this app does."*
- *"Anyone could build this with better UI."* — we have no moat.
- *"Most people have similar diet plans."* — the real conclusion: **the plan is not the product**.

**Set aside:**
- *"Add workout tracking (plan, tracking, sharing)."* Users ask for more features when the core loop hasn't hooked them. Adding a second half-solved problem to a first half-solved problem makes the app worse. Revisit only once logging retains.
- *"Photo apps charge after a few days because images are expensive."* Accurate observation, wrong inference — see §3.

---

## 2. The core problem

Logging friction is the dominant retention variable in this category:

- Manual logging costs **5–10 minutes/day**. Photo logging averages **~8 seconds per meal**.
- Photo loggers retain at roughly **2.5×** manual loggers at day 30.
- AI/photo trackers: **~52%** still tracking at 3 months. Manual: **~23%**.
- **~70%** abandon within 2 weeks if the app feels time-consuming.
- **>98%** of new users churn within 2 weeks if they never hit a value milestone.

Nourish's only logging path today is a `TextInput` on the Log tab ("What did you eat?"). We built the high-friction version of the single interaction that decides retention.

*Treat these percentages as directional — several come from app-marketing sources with an interest in the conclusion. The direction is corroborated across independent sources; the cost figures in §3 are from primary pricing pages.*

---

## 3. The cost assumption was wrong

Photo logging was skipped because image AI was assumed expensive. As of September 2026 it isn't:

| Model | Input $/1M | Output $/1M |
|---|---|---|
| Gemini 2.5 Flash-Lite | **$0.10** (text/image/video) | $0.40 |
| gpt-5-nano | $0.05 | $0.40 |
| gpt-4o-mini *(what we use now)* | $0.15 | $0.60 |
| Gemini 2.5 Flash | $0.30 | $2.50 |

A food photo is **~1,120 input tokens** → on Flash-Lite, **~$0.0001 (₹0.01) per photo**.

**Three meals/day, every day, for a month ≈ ₹1 per user.**

Current per-user AI cost is already under ₹0.50/month. Photo logging does not meaningfully change our cost structure. The competitor paywalls users noticed are a monetization choice, not a cost pass-through.

**There is no cost argument against shipping photo logging. Don't re-litigate this.**

---

## 4. Where the incumbents are weak

**Cal AI** — ~$40M ARR, 15M+ downloads, acquired by MyFitnessPal (March 2026), built almost entirely on photo logging. Documented weaknesses: a small food database (poor on **regional foods**, branded items, restaurant meals); calories and basic macros only with **minimal micronutrients**; briefly pulled from the App Store in April 2026 over **deceptive billing** (3-day trial requiring a card, auto-renew, uninstall ≠ cancel); opaque pricing.

**HealthifyMe** — 40M users, ₹170cr revenue, profitable FY24. Its real moat is the **Indian food database** (1M+ items, 100k+ Indian dishes with regional accuracy). Weak point: **2.9/5 on Trustpilot** (518 reviews), with coaching quality and customer service the top complaints. Pricing: Smart ₹208/mo; coach plans $30–50/mo.

**The accuracy gap that is our opening:**
- Food *identification*: 68–86% accurate. **Portion estimation: as low as 39%.**
- Indian and other less-represented cuisines: **75–80%** identification accuracy.
- A full thali with multiple curries and sides: **70–80%** — the hardest case.
- Portion estimation from a single 2D image remains the dominant source of calorie error.

**Portion estimation is the weakest link in every photo-calorie app, and weakest of all on Indian food.** That's the defensible wedge.

---

## 5. The monetization constraint

Worth knowing before building, even though monetization isn't in this plan:

- India digital wellness **ARPU ≈ $12.82/year** (~₹90/month), projected ~$15.63 by 2032.
- Healthcare here is subsidised, negotiated, or employer-covered → structural resistance to consumer subscriptions.
- Pure consumer-subscription health apps in India are widely described as very hard to make work.

What does work: **B2B2C** (employers/insurers pay), **transactional** (per consultation/test), and **condition-specific** — users managing diabetes, PCOS, or hypertension will pay **₹500–1,500/month** for demonstrated disease management.

**The same app, pointed at a diagnosed condition, is worth 5–15× more per user.** Not a decision for now, but every architectural choice should keep it open.

---

## 6. The decision

**Fix the loop, and build the moat.**

- **Fix the loop** — add photo logging, rebuild Home around a single next action, demote the meal plan from hero feature to supporting feature.
- **Build the moat** — go deep on Indian food accuracy: thali decomposition, katori-based portions, regional coverage, oil/ghee estimation. Position as *"the calorie app that actually knows Indian food."*

Fixing the loop alone yields a nicer app that still competes on UI polish with Cal AI clones. The moat is what makes it defensible.

---

## 7. What "premium" and "engaging" actually mean

The complaint *"no appealing element, no one loves using it"* breaks into three separate problems.

**Premium is craft, not features.** Apps with strong motion design log **15–20% longer sessions**. Keep animations **under 300ms** and don't animate everything — users tune out noise. For haptics, the best implementations use a **small, consistent vocabulary** that confirms actions and prevents errors, with success and warning feeling genuinely distinct. Meaning, not novelty.

**Engagement mechanics that survive contact with reality:**
- **Streaks work through identity** — "I'm on a 30-day streak" is a statement about who you are. Medication adherence rose **62% → 89%** with streak tracking.
- **Social accountability is the strongest single mechanic** — challenges, leaderboards, or friend connections show **20–35% lower monthly churn**. Peloton's community model holds churn under 4%/month.
- Gamified challenges: **+30% engagement**.
- **The caveats matter more than the mechanics.** Streaks burn out, leaderboards discourage, one-size-fits-all challenges plateau. Health gamification **needs forgiveness built in or it creates shame spirals** — someone who breaks a streak needs a way back, not a punishment. **Commitment contracts** beat streaks alone for complex habits.

**Activation is decided in the first ~90 seconds**, not the first session. Design deliberately toward one **aha moment** — the single action that makes the value click — lead with what the user can *do* rather than a feature list, let them skip, and introduce features progressively as behavior makes them relevant.

**Our aha moment should be: photograph a plate of Indian food and watch it get broken down correctly — within 90 seconds, before signup.** Today the app asks five onboarding screens' worth of questions and generates a meal plan before the user experiences anything.

---

## 8. Success metrics

Baseline these in Phase 0 **before** Phase 1 ships.

| Metric | Today | Target |
|---|---|---|
| Median time to log one meal | unknown (text entry) | **< 15s** |
| % of new users who log ≥1 meal in first session | unknown | **> 60%** |
| D1 retention | unmeasured | baseline, then +50% |
| D7 retention | unmeasured | baseline, then +50% |
| D30 retention | unmeasured | category manual ≈23%, AI-photo ≈52% |
| Meals logged per active user per day | unknown | **> 2** |
| Photo-log correction rate | n/a | **< 30%** (accuracy proxy) |
| AI cost per active user per month | <₹0.50 | stay **< ₹5** |

**If Phase 1 ships and D7 doesn't move, friction wasn't the whole problem — stop and re-diagnose before building Phases 2–5.**

---

## 9. The phases

### Phase 0 — Instrument first · *hours*

Analytics today track feature usage, not the funnel (see doc 12 §12). There's no activation event, no time-to-first-log, no retention cohorts — so every later phase would be unfalsifiable. This is the cheapest phase and the easiest to skip. Don't.

Add to `lib/analytics.ts`:
- `activated` — first-ever logged meal
- `timeToFirstLog` — ms from first open to first logged meal
- `onboardingStepViewed` / `onboardingStepCompleted` — per step 1–5, to find the drop-off
- `logMethodUsed` — `text` | `photo` | `plan` | `recent`, so Phase 1 is directly comparable

Configure D1/D7/D30 cohorts in PostHog. Let it run long enough to fill the "Today" column above.

### Phase 1 — Photo logging · *~1 week*

The highest-leverage change available.

**Server — new function `lookup-nutrition-photo`:**
- Reuse the existing pattern. **Copy the shape of `supabase/functions/lookup-nutrition/index.ts` exactly**: `guard(req, "photo")` → cache check → `g.start()` → model call → `recordOutcome({status, tokens_in, tokens_out})`.
- Add a `photo` entry to `ACTION_META` in `_shared/ai-guard.ts`. Set limits **generously** — cost is ~₹0.01/photo, so friction is the constraint, not spend. Suggested: Pro 50/day, free 10/day.
- Keep the warm copy convention: *"You've logged a lot today! Photo logging is back tomorrow morning."*
- Model: **Gemini 2.5 Flash-Lite** or `gpt-5-nano`. Structured JSON out, same as the text path.
- Note `costMicrosGpt4oMini()` in `ai-guard.ts` is hardcoded to gpt-4o-mini rates — it needs a per-model variant, or cost logging for this action will be wrong.
- Return a **per-item breakdown**, not a single number:
  ```json
  { "items": [ { "item": "Roti", "portion": "2 pieces", "calories": 240,
                 "protein": 8, "carbs": 46, "fat": 3, "confidence": 0.9 } ],
    "total": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 } }
  ```
  Per-item is what makes Phase 2's thali decomposition and correction UX possible. Don't collapse it early.

**Client:**
- Camera capture on the Log tab, **downscale before upload** — fewer image tokens, faster round-trip, less mobile data.
- Show the breakdown as an editable list, not a fait accompli.
- Give the wait an honest progress state, not a spinner that looks hung.

**Caching:** don't cache raw images. Once the model returns recognized items, **reuse the existing text cache per item** — "roti" resolves through the same `nutritionCacheKey()` path it already uses. That gets cache economics for free and keeps one source of truth for dish macros.

**Done when:** a user can photograph a plate and log it in under 15 seconds, and `logMethodUsed` shows the photo/text split.

### Phase 2 — Indian portion accuracy · *~2 weeks, ongoing after*

This is the moat. Phase 1 alone makes us a Cal AI clone.

- **Katori/thali-aware prompting** — decompose a thali into components and estimate each separately instead of one blended guess. The per-item response shape from Phase 1 is what makes this expressible.
- **Reference-object scale** — use a katori, a standard plate rim, or a roti as an implicit size reference. This is the direct attack on the 39% portion problem: a known-diameter object in frame is far more tractable than absolute volume from a 2D image.
- **Explicit oil/ghee estimation** — the largest hidden-calorie source in Indian home cooking and where generic models fail worst. A dal tadka and a dry dal are not the same food.
- **Honest confidence + one-tap correction** — "this was 2 rotis, not 3". Two payoffs: better UX, and corrections become a **proprietary training signal** — the start of a data moat nobody can copy by cloning the UI.
- **Regional coverage as a measured target** — North Indian, South Indian, Bengali, Gujarati. Build a small labelled eval set of real plates and track accuracy per cuisine, so this is a number rather than a claim.

**Done when:** correction rate is under 30% and we can state per-cuisine accuracy from our own eval set.

### Phase 3 — Home rebuild + the 90-second aha · *~1–2 weeks*

Home currently stacks five equal-weight cards and five modals, with "Log this meal" as a secondary button inside the third card (doc 12 §10). Nothing dominates, so a new user can't tell what the app is for.

- **Home becomes one dominant action: log your next meal, camera-first.** Calories, macros, water, and streak collapse into a compact secondary row. Resist keeping everything at equal weight — that's what produced "boring and cluttered".
- **Move the aha before onboarding.** Let a brand-new user photograph a plate and see the breakdown *before* signup and the 5-step wizard. Ask body and goal questions only once they've seen the app do something impressive.
- Make the five onboarding steps **skippable with sensible defaults**.
- **Demote the meal plan.** `meals.tsx` (972 lines), `generate-meal-plan`, and `PlanReadyScreen` (524 lines) are a large share of the codebase built around a feature users call undifferentiated. Keep it as a supporting feature; it stops being the onboarding payoff.

**Done when:** first-session logging clears 60% and per-step onboarding drop-off is visible.

### Phase 4 — Premium feel · *~1 week*

- **Extend the design tokens.** Today: 8 colors, no semantic status tokens, no elevation scale, no motion tokens — so screens hardcode hex inline (doc 12 §12). Add status colors, an elevation scale, and duration tokens. All animations **under 300ms**.
- **Apply the haptic vocabulary consistently, starting with Home** — `app/(tabs)/index.tsx` doesn't import `lib/haptics.ts` at all; its only haptics come indirectly through `useHomeData`. The four helpers already exist; the work is consistent, meaningful application.
- Consider dark mode (currently hardcoded `userInterfaceStyle: 'light'`).

### Phase 5 — Engagement, carefully · *~2 weeks*

Engagement today is streak-only with milestone shares and **no streak-break recovery** — exactly the shame-spiral shape flagged in §7.

In order:
1. **Streak forgiveness first** — a repair or grace mechanic, *before* adding any new pressure. This is a fix, not a feature.
2. **Social accountability** — the highest-value mechanic available (20–35% lower churn). **Avoid pure leaderboards**, which discourage exactly the users most at risk.
3. **Consider commitment contracts** over more streak pressure.

---

## 10. Deferred

- **Workout tracking** — noise from an unhooked core loop (§1). Revisit only after logging retains.
- **Condition-specific pivot** (PCOS / pre-diabetes) — the strongest business case (§5), but not now. **Keep the data model condition-ready** so it stays cheap to turn on.
- **Monetization** — don't build a paywall until D7 moves. When it comes: no dark patterns. Cal AI was pulled from the App Store over exactly that, and billing is the top complaint against both major competitors.

---

## 11. Sequencing

```
Phase 0  Instrument            hours     ← blocks everything
Phase 1  Photo logging         ~1 week   ← the retention fix
Phase 2  Indian accuracy       ~2 weeks  ← the moat
Phase 3  Home + onboarding     ~1-2 wks  ← the first-impression fix
Phase 4  Premium feel          ~1 week   ← the "no one loves it" fix
Phase 5  Engagement            ~2 weeks  ← only after the loop works
```

Phases 1 and 3 can overlap if Home is rebuilt around the photo flow as it lands. Phases 4 and 5 shouldn't start until Phase 1's retention effect is measured — if friction wasn't the whole problem, they're the wrong next investment.

---

## 12. Rules

1. **Cost is not a reason to avoid image AI** (§3). Settled.
2. **Friction is the enemy.** Any change that adds taps to logging is a regression, however good it looks.
3. **Don't add workout tracking** without an explicit decision to reverse §1.
4. **Measure before and after.** If a change targets retention and Phase 0 isn't done, do Phase 0 first.
5. **No dark patterns in monetization** (§10).
6. **When trading off generality against Indian correctness, choose Indian correctness.** That's the moat.
7. Follow the existing server conventions in doc 12 §14 — `guard()` + `recordOutcome()`, never call model APIs from the client.

---

## Sources

Retention & friction: [Nutrola retention data](https://nutrola.app/en/blog/calorie-tracker-retention-rates-how-long-users-stick-with-each-app) · [Fitness app retention statistics](https://fitnessrefined.co/fitness-app-retention-statistics/) · [Kibora](https://kibora.app/blog/why-diet-apps-dont-work-long-term/) · [Welling.ai](https://www.welling.ai/articles/stop-giving-up-calorie-counting-apps)

Model pricing: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) · [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

Competitors: [Cal AI $40M ARR](https://getlatka.com/companies/calai.app) · [TechCrunch — MyFitnessPal acquires Cal AI](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens/) · [Cal AI review & billing complaints](https://nutrola.app/en/blog/cal-ai-review-2026) · [Cal AI alternatives](https://www.eesel.ai/blog/cal-ai-alternatives) · [HealthifyMe model](https://www.onestepahead.so/p/how-healthifyme-tracked-its-way-to) · [HealthifyMe pricing 2026](https://nutriscan.app/blog/posts/healthifyme-pricing-2026-india-plans-63a87b21d0)

Accuracy: [PlateLens accuracy review](https://platelens.app/blog/ai-calorie-counting-accuracy-research-2026) · [Fitia](https://fitia.app/learn/article/ai-calorie-photo-apps-accuracy-2026/) · [Indian food trackers tested](https://calfix.app/blog/best-calorie-tracker-indian-food)

India monetization: [HealthTech monetisation in India](https://productgrowth.in/insights/healthtech/healthtech-monetisation-india/) · [India digital fitness & wellness market](https://www.kenresearch.com/industry-reports/india-digital-fitness-wellness-platforms-market)

Premium feel & engagement: [Motion design expectations](https://www.techqware.com/blog/motion-design-micro-interactions-what-users-expect) · [Haptic UX 2026](https://lucky.graphics/learn/haptic-ux-innovation-2026/) · [Sahha — gamification](https://sahha.ai/blog/gamification-behavioral-nudges-health-apps/) · [Wellness retention playbook](https://keytotech.com/blog/wellness-app-retention-design-playbook)

Onboarding: [Scandiweb](https://scandiweb.com/blog/user-onboarding-best-practices/) · [Formbricks](https://formbricks.com/blog/user-onboarding-best-practices)
