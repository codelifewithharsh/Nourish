-- Per-action daily limits for non-Pro users.
--
-- When a user's profiles.is_pro is false, ai-guard.ts switches from
-- limit_<action> to limit_<action>_free. Defaults below are conservative
-- on purpose — the whole point of toggling is_pro=false is to throttle
-- suspected abuse without blocking the account outright. Tune these from
-- the Supabase dashboard if you want to soften or tighten further.

insert into public.app_config (key, value, description) values
  ('limit_meal_plan_free', '1',  'Daily meal-plan regenerations for non-Pro users (is_pro=false). 1 = one taste, then upgrade nudge.'),
  ('limit_recipe_free',    '2',  'Daily recipe lookups for non-Pro users.'),
  ('limit_swap_free',      '1',  'Daily meal swaps for non-Pro users.'),
  ('limit_nutrition_free', '3',  'Daily AI nutrition lookups for non-Pro users.')
on conflict (key) do nothing;
