-- One-time onboarding flag for the credits explainer toast. Set to true
-- the first time we show the toast (after the user's first successful
-- AI generation), so it never appears again.

alter table public.profiles
  add column if not exists credits_intro_seen boolean not null default false;
