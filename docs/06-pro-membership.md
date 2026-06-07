# 06 — Pro Membership & Rate Limits (Client)

*Last updated: 2026-06-08.*

There are two halves to this system:
- **Server enforcement** — per-user, per-day rate limits read live from `app_config`. Atomic in Postgres. Covered in [doc 05](./05-ai-edge-functions.md).
- **Client UX** — Pro badge, value-prop sheet, friendly rate-limit toast. That's this doc.

If you only need to *use* an AI endpoint in a new feature, jump to §7.

---

## 1. The mental model

Everyone is Pro. There is no balance to manage, no top-up flow, no per-call charge surfaced to the user.

What protects spend instead:
- **Silent per-action daily caps** (e.g. 20 nutrition lookups / day) read live from `app_config` and enforced atomically in Postgres.
- A genuine heavy user never hits them. A script will. When the wall is hit the user sees a warm, action-specific toast (`"You've explored a lot of recipes today! More flavours await tomorrow."`) — no mention of limits, quotas, or money.

Pro is currently a **status badge**, not a paywall. The same `is_pro` column will gate a future paid tier when one exists.

### Why this replaced credits

The previous model surfaced credits, balances, and an "out of credits" modal. That added cognitive load — especially for Indian users who don't want to count tokens — and made the app feel less generous than it actually is. Real per-user costs are <₹0.50/month, so the credit ceremony was overhead with no upside. The columns and ledger from the old model are still in the DB for now (`credits`, `credit_ledger`) but are no longer read or written.

---

## 2. Files in `features/pro/`

```
features/pro/
├─ ProContext.tsx       ← provider, useProMember(), useAI(), 429 rate-limit toast
├─ EarlyBirdBadge.tsx   ← small "Early Bird Pro" pill on the profile header
├─ EarlyBirdSheet.tsx   ← bottom sheet explaining what Pro includes
├─ OGAvatar.tsx         ← brand-accent gradient ring wrapped around the avatar
├─ useProPricing.ts     ← pre-auth pricing fetch (used by login + onboarding)
└─ index.ts             ← public exports
```

And in `lib/`:

```
lib/aiClient.ts         ← invokeAI() — typed wrapper around supabase.functions.invoke
lib/appConfig.ts        ← useAppConfigText() — generic app_config reader
```

---

## 3. The provider tree

[`app/_layout.tsx`](../app/_layout.tsx) wraps the app in `<ProProvider>`. It:

- Reads `is_pro`, `is_early_bird`, `pro_since` and the configurable pricing from the user's profile + `app_config` on mount and on every auth state change.
- Exposes that state via `useProMember()` and a 429-aware AI invoke via `useAI()`.
- Mounts the top-of-tree `RateLimitToast` — when any AI call returns 429, every screen gets the toast for free.

---

## 4. `useAI()` — the wrapper every AI call uses

```tsx
const invoke = useAI();
const result = await invoke<{ recipe: Recipe }>('get-recipe', { meal_name: name });
```

What it does:
1. Calls `invokeAI()` from `lib/aiClient.ts`.
2. On success → returns the typed payload.
3. On 429 (`rate_limited`) → shows the rate-limit toast, then throws `AIError(code: 'rate_limited')`.
4. On any other error → throws `AIError`.

The "throw after showing UI" pattern lets the caller skip inline error messages for rate-limit errors (toast already shown) while still surfacing other errors normally.

```tsx
try {
  await invoke('get-recipe', { meal_name });
} catch (err) {
  if (err instanceof AIError && err.code === 'rate_limited') {
    // Toast already shown — silent at screen level.
  } else {
    setError(err.message); // show inline
  }
}
```

---

## 5. Limits and copy live in `app_config`

The Supabase table `app_config` (key → value) holds:

| Key | Default | Purpose |
|---|---|---|
| `limit_meal_plan` | 3 | Daily meal plan generations |
| `limit_recipe` | 8 | Daily recipe generations |
| `limit_swap` | 5 | Daily meal swaps |
| `limit_nutrition` | 20 | Daily AI nutrition lookups |
| `pro_price_normal` | ₹299/yr | Crossed-out comparison price on the Pro sheet |
| `pro_price_user` | Free | The user's actual price |
| `login_tagline` | (empty) | Tagline shown above the Continue button on login |

Anyone with Supabase dashboard access can tune these without a redeploy. Edge functions read limits at call time via `get_config_int(key, default)`; the client reads pricing via `get_config_text(key, default)`.

The per-action friendly toast messages on 429 are **hardcoded in [`ai-guard.ts`](../supabase/functions/_shared/ai-guard.ts)** (one per action) — making them DB-configurable was deemed not worth the friction for now. Move them later if A/B testing copy matters.

---

## 6. The client surfaces

### 6.1 `EarlyBirdBadge`

Small pill on the profile screen header showing a crown, "Early Bird Pro" label, and a subtle shimmer. Tap → opens `EarlyBirdSheet`.

### 6.2 `EarlyBirdSheet`

Bottom sheet that explains the membership:
- Crown circle + "EARLY BIRD" chip
- "You're a Pro member" headline
- Value row: ~~₹299/yr~~ · Free for you (both values from `app_config`)
- Six perk rows with check ticks
- "Pro member since <Month Year>" tag
- Drag-down or tap-backdrop to dismiss

### 6.3 `OGAvatar`

Wraps any avatar (home header, drawer) in a 2px brand-accent gradient ring (`accentLight → mid mint → accent`) when the user is Pro. Non-Pro users get a pass-through render with no wrapper — zero layout cost.

### 6.4 `RateLimitToast` (429)

Top-anchored, accent-tinted, auto-dismisses after 4.5s. Lives in `ProContext`; every screen that uses `useAI()` benefits automatically.

### 6.5 Login ribbon + PlanReady reward card

Pre-auth surfacing of the membership:
- Login screen shows a slim accent-tinted ribbon directly above the Continue button.
- PlanReady screen shows a premium card with crown, headline, value row, and perks just above the "Let's Go" CTA — framed as a gift after the user has seen their plan.

Both use `useProPricing()` (the pre-auth pricing fetch) so the displayed `pro_price_normal` / `pro_price_user` stay in sync with the rest of the app.

---

## 7. Adding a new AI action (client side)

Assuming you've added the server function (see [doc 05 §8](./05-ai-edge-functions.md)):

1. **Add a default limit + friendly 429 message** in [`ai-guard.ts → ACTION_META`](../supabase/functions/_shared/ai-guard.ts).
2. **Seed an `app_config` row** for `limit_<action>` in a migration so it shows up in the dashboard.
3. **Call it** with `useAI()`:
   ```ts
   const invoke = useAI();
   const result = await invoke<MyType>('my-new-function', body);
   ```
4. **Handle errors** by checking `err instanceof AIError && err.code === 'rate_limited'`. Defer to the toast.

That's it. No cost chip needed — the user doesn't see costs anymore.

---

## 8. Anti-accident UX patterns (still relevant)

A few decisions specifically to avoid burning API budget on accidents:

### Recent meals skip AI
In the Log tab, clicking a "Recent" chip reuses macros from `daily_logs` — no AI call.

### Swap moods stage, don't auto-fire
Tapping a mood chip stages the selection; a separate "Get <mood> swap" button fires the AI.

### Auto-back on rate-limit failure
The Recipe screen detects `!loading && !recipe && !error` after a 429 and calls `router.back()` — no awkward error screen.

---

## 9. Operational queries

```sql
-- See AI usage in the last day
select action, status, count(*),
       sum(cost_micros) / 1e8 as cost_usd
  from ai_usage_log
  where created_at > now() - interval '1 day'
  group by action, status
  order by count desc;

-- Top-N users by AI calls in the last 7 days
select user_id, count(*) as calls,
       sum(cost_micros) / 1e8 as cost_usd
  from ai_usage_log
  where created_at > now() - interval '7 days'
    and status = 'success'
  group by user_id
  order by calls desc
  limit 20;

-- Bump a single limit (live, no redeploy)
update app_config set value = '30' where key = 'limit_nutrition';

-- Change the Pro price string shown on the EarlyBird sheet
update app_config set value = '₹499/yr' where key = 'pro_price_normal';
```
