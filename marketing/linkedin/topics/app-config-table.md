# Topic: A 2-column table replaced my feature flag service

## Working titles
- *"My 'feature flag' system is one Postgres table"*
- *"You don't need LaunchDarkly. You need a table with two columns."*
- *"How I tune my app's rate limits and pricing without a redeploy"*

## What actually happened

I needed to:
- Tune AI daily rate limits without a redeploy
- A/B test marketing copy on the login screen
- Change the Pro price string ("₹299/yr") without a release

I almost reached for LaunchDarkly. Or Supabase's own Feature Flags. Or a config-as-code service.

What I shipped instead:
```sql
create table app_config (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz default now()
);
```

That's it.

Plus two SQL helpers (`get_config_int(key, default)`, `get_config_text(key, default)`) and one tiny React hook (`useAppConfigText`). The whole thing is maybe 40 lines.

Now:
- Edge functions read daily limits live at every call: `get_config_int('limit_recipe', 8)`.
- The client reads the login tagline and pricing via the same RPC pattern.
- Anyone with Supabase dashboard access edits a row to change behavior. No deploy. No PR.

```sql
-- Bump the daily recipe limit
update app_config set value = '12' where key = 'limit_recipe';

-- Change the Pro price string shown on the upgrade sheet
update app_config set value = '₹499/yr' where key = 'pro_price_normal';
```

That's the entire DevOps story.

## The takeaway

Operationally important strings should live somewhere editable without a deploy. The cheapest version of that is a table. Add real infrastructure only when the table becomes the bottleneck — which it won't, for years.

## Numbers worth using
- Total LOC for the system: ~40
- Cost: $0 incremental — uses the Supabase instance I already pay for
- Round-trips per call: 1 extra (cached in module scope on the client)

## What NOT to over-claim
- LaunchDarkly has things this doesn't — segment targeting, A/B test orchestration, multi-region edge distribution. If you need them, pay for them.
- For my scale (a few thousand users, simple boolean/string toggles), the table is enough.

## Final post
*(Add final version here.)*
