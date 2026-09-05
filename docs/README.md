# Nourish Documentation

Welcome. This is your map to understanding the codebase end-to-end.

These docs are written for someone who knows JavaScript/TypeScript well but is touching React Native, Expo, Supabase, and edge functions for the first time. They explain not just *what* the code does, but *why* it's shaped this way — the trade-offs we picked and the ones we deferred.

> **Looking for a quick, accurate answer about how something works?** Go straight to
> **[12-codebase-reference.md](./12-codebase-reference.md)** — it was verified line-by-line against the
> source on 2026-09-06 and is the most current description of the app. Docs 01–11 predate it and have
> known drift (listed in doc 12 §15).


## Reading order

If you're new, read them in order. Each builds on the previous.

1. **[01-overview.md](./01-overview.md)** — What Nourish is, the user journey, what every tab does. Start here.
2. **[02-architecture.md](./02-architecture.md)** — Folder layout, top-level patterns (file-based routing, no global state, direct DB calls, etc.) and the reasoning behind each.
3. **[03-auth-and-routing.md](./03-auth-and-routing.md)** — How Expo Router works, the auth state machine, how Google OAuth is wired through Supabase Auth, what to set up in Google Cloud Console.
4. **[04-supabase-and-database.md](./04-supabase-and-database.md)** — Supabase setup, Row Level Security, every table explained, migrations workflow, type generation.
5. **[05-ai-edge-functions.md](./05-ai-edge-functions.md)** — How the AI edge functions work: the shared `guard()` pattern, caching, refunds, OpenAI integration, deployment.
6. **[06-pro-membership.md](./06-pro-membership.md)** — The Pro membership model: silent rate limits read from `app_config`, the Early Bird badge + sheet, the `useAI()` wrapper, and how to safely add a new AI action.
7. **[07-build-deploy-env.md](./07-build-deploy-env.md)** — Environments, EAS Build profiles, what command to run when, secrets management.
8. **[08-pending-work.md](./08-pending-work.md)** — Honest backlog of what's missing, broken, or future-facing. Prioritised.
9. **[09-code-review.md](./09-code-review.md)** — A senior-engineer sanity pass over the whole codebase: real bugs, security holes, dummy data, dead code. Read this before any external release.
10. **[10-lessons-learned.md](./10-lessons-learned.md)** — The hard-won technical lessons from building this app: every gotcha we hit, the reasoning behind every non-obvious choice, and what we'd want a future engineer (or future-us) to remember.
11. **[11-interview-prep.md](./11-interview-prep.md)** — Comprehensive end-to-end explanation of Nourish for learning and interviews. Read this if you want to talk confidently about every layer — architecture, AI prompts, RLS, OAuth, TDEE — with the trade-offs and reasoning that back each choice.
12. **[12-codebase-reference.md](./12-codebase-reference.md)** — **Single-file technical reference.** Everything about how the app works today — stack, routes, schema, RPCs, edge functions, domain math, conventions — verified against the source. Written so you (or an AI) can answer questions without reading the codebase.
13. **[13-product-plan.md](./13-product-plan.md)** — The product plan: why the direction is changing, the research behind it, success metrics, and the phased build sequence.

## Keep these docs alive

When you finish a feature, update the relevant doc instead of letting it rot. Each doc starts with the date it was last touched. When something on the pending list ships, **delete it** from there rather than striking through.

If you find yourself answering the same question twice (in code review, in chat, or in your head), it probably belongs in one of these files.
