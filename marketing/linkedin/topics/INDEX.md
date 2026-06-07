# Topic Index

Each file in this folder is a self-contained brief for one LinkedIn post. Paste the master `README.md` + `style-guide.md` + one of these files into Claude, then ask for the post.

| File | One-line angle | Best for |
|---|---|---|
| [ripping-out-credits.md](./ripping-out-credits.md) | I shipped a credit system then deleted it because Indian users hate feeling metered | Product / UX-leaning engineers |
| [expo-go-broke.md](./expo-go-broke.md) | Two things SDK upgrades quietly removed from Expo Go, and how I worked around them | React Native / mobile engineers |
| [profile-bucketing-cache.md](./profile-bucketing-cache.md) | I cut AI costs by 80%+ with a rounding function | AI / backend engineers |
| [supabase-rls-no-backend.md](./supabase-rls-no-backend.md) | I have no backend code — RLS + edge functions is enough | Full-stack engineers |
| [android-new-arch-modals.md](./android-new-arch-modals.md) | My drawer was opening on Android. Just invisibly. | React Native / debugging stories |
| [splash-gate.md](./splash-gate.md) | 30 lines that made my app feel instant — without making it faster | UX engineers, mobile devs |
| [app-config-table.md](./app-config-table.md) | My feature flag system is one Postgres table | Pragmatic backend / DevOps engineers |
| [atomic-counters-in-postgres.md](./atomic-counters-in-postgres.md) | My rate limiter has no lock and no Redis. Just one SQL statement. | Backend / database engineers |
| [no-react-query-no-redux.md](./no-react-query-no-redux.md) | What I use instead of Redux, Zustand, and React Query | React engineers, generalist devs |

## Suggesting new topics

When something interesting happens while building the app — a debugging moment, a tradeoff, a number that surprised me — add a new file here. Use the same shape as the existing ones:

```
# Topic: ...
## Working titles
## What actually happened
## The takeaway
## Numbers worth using (optional)
## What NOT to over-claim
## Optional aside
## Final post
```

The "Final post" section starts empty and gets filled when a post goes live, so we have a record of what was actually written.
