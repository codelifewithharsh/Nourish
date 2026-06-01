# 06 — Credits & Rate Limits (Client)

*Last updated: 2026-06-01.*

The credits system has two halves:
- **Server enforcement** — atomic deduction, rate limits, refunds. Covered in [doc 05](./05-ai-edge-functions.md).
- **Client UX** — pill, modals, toasts, cost chips. That's this doc.

If you only need to *use* credits in a new feature, jump to §7 ("Adding a new AI action").

---

## 1. The mental model

Credits are a virtual currency that gates AI features.

- New users start with **50 welcome credits** (granted by a DB trigger on signup).
- Everyone gets **+5 daily refill** the first time they call any AI endpoint on a new UTC day.
- Server costs the call before doing it. If the user has too few credits → 402 → modal. If they're over the daily request cap → 429 → toast.

The point of credits isn't to make money (yet — see `credit_pack_interest` waitlist). It's to **bound runaway cost**. A single user can't accidentally burn through $50 of OpenAI in a day.

---

## 2. Files in `features/credits/`

```
features/credits/
├─ CreditsContext.tsx       ← provider, useAI(), useCredits(), 402 modal, 429 toast, intro toast
├─ AICreditsPill.tsx        ← header pill + expandable panel on profile
├─ WhatUsesCreditsSheet.tsx ← bottom sheet listing costs
└─ costs.ts                 ← shared constants (COST.meal_plan = 10, etc.)
```

And one in `lib/`:
```
lib/aiClient.ts             ← invokeAI() — the raw fetch with typed error handling
```

---

## 3. The provider tree

[`app/_layout.tsx`](../app/_layout.tsx) wraps the app in `<CreditsProvider>`. That provider:

- Loads the user's `credits` and `credits_intro_seen` flag on mount and whenever auth state changes.
- Exposes `balance` and `refresh()` via `useCredits()`.
- Exposes a credit-aware `invoke()` wrapper via `useAI()`.
- Owns three UI surfaces mounted at the top of the tree:
  - **OutOfCreditsModal** (402) — shown on `no_credits` errors. Has a waitlist toggle.
  - **RateLimitToast** (429) — slide-down toast for `rate_limited` errors.
  - **CreditsIntroToast** — one-time celebratory toast after first meal plan generation.

Because they live at the layout level, **any screen that triggers a 402/429 gets the modal/toast automatically**. The screen doesn't need to do anything; it just catches the error and decides whether to also show inline messaging.

---

## 4. `useAI()` — the wrapper every AI call uses

```tsx
const invoke = useAI();
const result = await invoke<{ recipe: Recipe }>('get-recipe', { meal_name: name });
```

What it does internally:
1. Calls `invokeAI()` from `lib/aiClient.ts`, which is a typed wrapper around `supabase.functions.invoke()`.
2. On success → triggers `refresh()` so the pill updates.
3. On 402 → opens the `OutOfCreditsModal`, then throws an `AIError(code: 'no_credits')`.
4. On 429 → shows the `RateLimitToast`, then throws an `AIError(code: 'rate_limited')`.
5. On any error → throws an `AIError`.

**The "throw after showing UI" pattern matters.** It lets the caller skip inline error messages for credits-related errors (since the modal/toast already explained), while still surfacing other errors normally.

```tsx
try {
  await invoke('get-recipe', { meal_name });
} catch (err) {
  if (err instanceof AIError && (err.code === 'no_credits' || err.code === 'rate_limited')) {
    // Already shown — silent at the screen level. router.back() or no-op.
  } else {
    setError(err.message);  // show inline
  }
}
```

---

## 5. The cost constants

Costs are defined in **two places** that must stay in sync:

| Where | What |
|---|---|
| `supabase/functions/_shared/ai-guard.ts` → `ACTIONS` | **Authoritative.** What the server charges. |
| `features/credits/costs.ts` → `COST` and `AI_COSTS` | **Display only.** What the UI shows. |

When you change one, change the other in the same commit.

`costs.ts` also exports `DAILY_REFILL = 5` and the structured `AI_COSTS` list (used by `WhatUsesCreditsSheet`).

---

## 6. The four client surfaces

### 6.1 `AICreditsPill` (header pill, tap-to-expand)

Lives at the top of the profile screen. Three visual states based on balance:

| Tone | Balance | Look |
|---|---|---|
| `healthy` | ≥ 10 | Accent-green chip |
| `low` | 1–9 | Amber chip |
| `empty` | 0 | Muted chip, label "Out · refills tomorrow" |

Tapping it expands an inline panel with a "What uses credits?" button that opens the bottom sheet.

### 6.2 `WhatUsesCreditsSheet`

Bottom sheet listing every action's cost, plus a "Cached results are free" footer.

Renders the `AI_COSTS` array from `costs.ts` so it stays in sync automatically.

### 6.3 `OutOfCreditsModal` (402)

Triggered by `useAI()` on a `no_credits` error. Shows:
- "You're out of credits"
- The user's current balance
- "Notify me about credit packs" toggle backed by `credit_pack_interest` table (idempotent upsert/delete)

### 6.4 `RateLimitToast` (429)

Top-aligned slide-down toast. Auto-dismisses after 3 seconds. The message comes from the server (`"Daily limit reached"`).

### 6.5 `CreditsIntroToast` (one-time)

Shown exactly once, after the user's first successful `generate-meal-plan`. Reads `profiles.credits_intro_seen` on `refresh()`, and inside `invoke()` checks the ref:

```ts
if (name === 'generate-meal-plan' && !introSeenRef.current) {
  introSeenRef.current = true;
  supabase.from('profiles').update({ credits_intro_seen: true }).eq('id', user.id);
  setIntroToast(balance);
}
```

Tappable to dismiss; auto-dismisses after 6 seconds.

---

## 7. Cost chips on action buttons

Every AI-triggering button shows the credit cost inline so the user knows what they're about to spend:

| Where | Chip |
|---|---|
| Profile → Regenerate plan button | `· 10` chip |
| Swap modal → AI Nutritionist input header | `1 cr` chip |
| Swap modal → "Or pick a vibe" divider | `· 3 cr` |
| Log tab → AI Nutritionist header | `1 cr` chip |

Sources its number from `COST.<action>`, not a hardcoded literal.

---

## 8. Anti-accident UX patterns

A few decisions specifically to avoid burning credits unintentionally:

### Recent meals skip AI
In the Log tab, clicking a "Recent" chip (a meal you've logged before) **reuses the stored macros** from `daily_logs` — no AI call. Only Quick-add suggestions (foods we don't have data for) trigger AI, and even then we fill the input and require an explicit Send tap.

### Swap moods don't auto-fire
Tapping a mood chip in the Swap modal (Lighter / Hearty / Quick / Balanced) **stages** the selection; a separate "Get <mood> swap · 3 cr" button fires the AI. The button shows the cost so the user knows what they're committing to.

### Auto-back on credits failure
In the Recipe screen, if the user hits the 402 modal and dismisses it, the recipe screen detects `!loading && !recipe && !error` and calls `router.back()` automatically — no awkward error screen.

---

## 9. Adding a new AI action (client side)

Assuming you've already added the server function (see [doc 05 §8](./05-ai-edge-functions.md)):

1. **Mirror cost** in `features/credits/costs.ts`:
   ```ts
   export const COST = { meal_plan: 10, recipe: 5, swap: 3, nutrition: 1, my_new: 2 } as const;
   AI_COSTS.push({ key: 'my_new', label: '...', cost: 2, hint: '...' });
   ```
2. **Call it** with `useAI()`:
   ```ts
   const invoke = useAI();
   const result = await invoke<MyType>('my-new-function', body);
   ```
3. **Add a cost chip** on the trigger button using `COST.my_new`.
4. **Handle errors** by checking `err instanceof AIError && err.code === ...`. Defer to the modal/toast for credit errors.

That's it. The provider does the rest.

---

## 10. Common pitfalls

- **Forgetting `useAI()` and calling `supabase.functions.invoke` directly** → no balance refresh, no 402 modal, no 429 toast. Always go through `useAI()`.
- **Showing inline "you're out of credits" copy in the screen** → the modal already says it. Duplicates feel bad.
- **Setting an error state on `no_credits`** → the user dismisses the modal and lands on an error screen. Prefer silent + auto-back, or a soft empty state.
- **Cost mismatch** → server charges 10, client shows 5. Always update both `ACTIONS` (server) and `COST` (client) in one commit.
- **Hardcoding `5` for daily refill** → use `DAILY_REFILL` from `costs.ts`.

---

## 11. Operational queries

A few SQL snippets you'll want when debugging:

```sql
-- See a user's credit history
select * from credit_ledger where user_id = '...' order by created_at desc;

-- See AI usage in the last day
select action, status, count(*), sum(credits_charged), sum(cost_micros)/1000000.0 as cost_cents
  from ai_usage_log
  where created_at > now() - interval '1 day'
  group by action, status;

-- Reset a user's intro toast (for testing)
update profiles set credits_intro_seen = false where id = '...';

-- Top up a user's credits for testing
select grant_credits('<user_id>', 100, 'manual_topup', null, null, '{}'::jsonb);
```
