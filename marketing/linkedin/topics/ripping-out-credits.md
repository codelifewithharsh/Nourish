# Topic: I built a credit system, then ripped it out

## Working titles
- *"I shipped a credit system. Then I deleted it."*
- *"The wrong way to run a free tier in India"*
- *"₹0.50/month/user. So why was I asking them to count credits?"*

## What actually happened

I built a full credit economy for Nourish (AI Indian nutrition app):
- 50 welcome credits on signup
- 5 daily refill
- 10 credits per meal plan, 5 per recipe, 3 per swap, 1 per nutrition lookup
- Atomic deduction in Postgres (race-safe `UPDATE ... WHERE credits >= amount RETURNING balance`)
- A `credit_ledger` table for every transaction
- An "Out of credits" modal with a waitlist for paid packs

It was technically clean. The `deduct_credits` RPC is genuinely one of the proudest SQL bits in the repo.

Then I ran the math:
- Real OpenAI cost per call (gpt-4o-mini): meal plan ~$0.0005, recipe ~$0.0004, swap ~$0.00015, nutrition lookup ~$0.00006.
- A normal monthly user does ~1 plan (cached after first), ~10 recipes (mostly cached), ~8 swaps, ~30 lookups.
- Monthly cost per active user: ~₹0.40.

I was rationing peas.

And I'm building for an Indian audience. "5 credits left" doesn't read as a generous free tier — it reads as a paywall countdown. Indian users specifically dislike feeling metered. The credit UI was actively making the app feel cheaper than it actually was.

## What I replaced it with

- Silent per-action daily caps (3 plans, 8 recipes, 5 swaps, 20 lookups) read live from a `app_config` table.
- A friendly action-specific toast on the rare cap-hit. *"You've explored a lot of recipes today! More flavours await tomorrow."*
- A status badge — "Early Bird Pro" — that frames the same generosity as something earned.

The columns and ledger are still in the DB. I'll drop them later. Right now they're harmless.

## The takeaway

"Cost of running" and "cost the user feels" are not the same number. Visible rationing is a tax on user trust — pay it deliberately, not by reflex.

## Numbers worth using
- 467 lines deleted across context, pill, sheet, modal, costs file
- 4 client components removed
- 1 new `app_config` table replaces 7 hardcoded limit values
- Real cost: ~₹0.40/user/month after caching

## What NOT to over-claim
- I'm not claiming credits are *always* wrong. They're great for products where the unit cost is high and visible (image generation, video).
- I'm not anti-paywall. I'll introduce a real one when there's a free tier worth gating.
- I'm not claiming I knew this would happen — I built it and shipped it, then unbuilt it.

## Final post
*(Add the final version here once it's polished.)*
