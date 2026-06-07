# Topic: Profile bucketing — the cheap-AI trick

## Working titles
- *"How I cut AI costs by 80%+ with one rounding function"*
- *"A 1830-kcal user and a 1920-kcal user get the same meal plan. They both think it's theirs."*
- *"Cache keys are a product decision, not a technical one."*

## What actually happened

Nourish generates a personalised 7-day meal plan via gpt-4o-mini. Each generation costs ~$0.0005 in tokens. Multiply by every signup and every regeneration and the bill adds up fast.

The naive cache would key on the user's profile: goal, calories, protein, diet type, cuisines, restrictions. Each user has a slightly different profile → near-zero cache hits → every signup pays the full cost.

Instead I key on a *bucketed* profile:
```
[goal, diet_type, sorted(cuisines), sorted(restrictions), calorie_bucket, protein_bucket]
```
where calorie_bucket = round(daily_calories / 200) * 200 and protein_bucket = round(daily_protein / 20) * 20.

A user at 1830 kcal / 78g and a user at 1920 kcal / 82g hit the *same row*. The first pays the OpenAI cost. Everyone after gets it free.

The variation a user perceives between a 1800 and a 1900 kcal plan? Roughly zero. Both feel like "their plan."

The same idea powers the nutrition lookup cache. We strip numbers and units before keying:
- `"2 rotis"` → key `roti`
- `"3 rotis"` → key `roti`
- `"1 bowl of rajma"` → key `rajma`

Then scale macros by the count we extracted.

## The takeaway

Cache keys are a product decision. The right level of fuzziness depends on what difference the user can actually *feel*. Round more aggressively than you think — most users don't perceive the precision you'd think they would.

## Numbers worth using
- Generating 1000 fresh meal plans: ~₹40
- Recipe cache: every recipe is shared across all users — the second person who asks "paneer bhurji" gets the first person's recipe for free
- Real per-user OpenAI cost after caching: <₹0.50/month

## What NOT to over-claim
- This isn't novel. Profile bucketing is a known trick. The angle is that I almost didn't do it — my first instinct was to cache exactly. Bucketing felt "lossy". It isn't.

## Final post
*(Add final version here.)*
