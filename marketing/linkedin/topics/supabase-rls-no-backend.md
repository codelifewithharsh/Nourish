# Topic: I have no backend. Just Supabase RLS and edge functions.

## Working titles
- *"My nutrition app has no backend code. Here's how that works."*
- *"Supabase RLS is a real architecture, not a hack."*
- *"The Node API I didn't build"*

## What actually happened

When I started Nourish, the default move was "React Native client + Node/Express API + Postgres." Standard three-tier setup. Three repos eventually, deploy two services, decide who owns the schema.

I didn't do that. The whole backend is:
- Supabase Postgres
- Row Level Security policies on every table (`auth.uid() = user_id`)
- 5 Deno edge functions for things that need an OpenAI key

The client imports `supabase` and runs queries directly. No Express, no controllers, no DTOs, no Swagger, no GraphQL.

Why it works:
- **Security is at the data layer.** A bug in the app can't bypass auth because the check is in the RLS policy, not in an API handler.
- **Type safety end-to-end.** `npx supabase gen types` produces `database.types.ts` straight from the live schema. Every query is typed.
- **No bespoke endpoints.** New screen = new query. No API to design, no version to maintain.

The trade-off: the client knows the schema. That sounds bad until you remember a custom API also knows the schema. You've just moved the coupling, not removed it.

Where this stops being free: anything that needs server secrets (OpenAI key, push notification tokens) or atomic invariants across rows. That's what the edge functions are for. They sit between the client and OpenAI, and they enforce things like daily rate limits via `SECURITY DEFINER` Postgres RPCs.

## The takeaway

"Direct DB calls + RLS" is a real architecture. The mental model: client owns queries, DB owns rules. You only need a server when you have a secret to protect or an invariant to enforce. Don't add an API tier by default — earn it.

## Numbers worth using
- 5 edge functions total
- 0 backend services to deploy
- Cost: $25/month base Supabase + maybe ₹50 of OpenAI for a few hundred users

## What NOT to over-claim
- This isn't right for everyone. If you have complex cross-user transactions, multi-table atomicity, or legacy integrations, you want a proper backend.
- RLS *is* code. Bad RLS policies are bugs. The same care applies — review them like you'd review an auth middleware.

## Final post
*(Add final version here.)*
