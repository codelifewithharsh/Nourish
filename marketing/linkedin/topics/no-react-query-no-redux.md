# Topic: No Redux. No Zustand. No React Query. My state management is one hook per screen.

## Working titles
- *"My nutrition app has no state library. Here's how that's working out."*
- *"You don't need React Query yet"*
- *"What I use instead of Redux, Zustand, and React Query"*

## What actually happened

When I started Nourish, every React Native template I looked at came with state management baked in. Redux Toolkit. Zustand. Recoil. React Query for server state.

I shipped a working app without any of them.

What I use instead:
- **Local `useState` and `useReducer`** for screen-local state.
- **One custom hook per screen** for that screen's data. `useHomeData()` reads the profile, the current plan, today's logs, and water status. The screen calls one hook and gets `{ data, loading, refresh, mutations }`.
- **`useFocusEffect(() => refresh())`** to reconcile with the server on tab focus. That's my cross-tab sync.
- **One Context** for genuinely-global state. Pro membership, current pricing, and the "you've hit your daily limit" toast. Mounted once at the root.
- **`DeviceEventEmitter`** for "these two unrelated screens need to hear about the same change" — e.g. meal-reminder times edited in the profile screen need to update the home bell sheet.

That's the whole state architecture.

It works because each screen has narrow, well-scoped data needs. There's no "the meal plan is showing in 5 places and needs to stay consistent." The DB is the source of truth; the screens query it; `useFocusEffect` reconciles when you return.

When would I add React Query? When refetch logic gets repetitive across hooks. It isn't yet — I have 4 screens and 4 hooks. At 10+, the pattern starts to pay.

When would I add Zustand? When I have global mutable state that isn't just auth + Pro membership. I don't.

## The takeaway

State management libraries solve real problems. The mistake is reaching for them by default before you've felt the pain they solve. Build the screen, write the hook, see how it goes. Most of the time, you don't need them yet. The version of you in three months will know better than the version of you starting today.

## What NOT to over-claim
- I'm not anti-React-Query. It's great. I'll add it when I need it.
- "No global state" isn't true — Pro membership *is* global. But it's one Context, not a library. One Context isn't an architecture, it's a 50-line file.

## Final post
*(Add final version here.)*
