-- The manually created constraint used different values than the app.
-- App uses: sedentary, lightly_active, very_active
-- Old constraint had: sedentary, light, moderate, active, very_active
-- Drop and recreate to match the app's ActivityLevel type.

alter table public.profiles
  drop constraint if exists profiles_activity_level_check;

alter table public.profiles
  add constraint profiles_activity_level_check
  check (activity_level in ('sedentary', 'lightly_active', 'very_active'));
