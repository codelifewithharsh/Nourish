-- Global, shared recipe cache. One row per unique meal_key.
-- Generated once via the get-recipe edge function, then served to every user
-- who has that meal in their plan. Massive cost savings vs per-user generation.

create table if not exists public.recipes (
  meal_key        text primary key,
  name            text not null,
  tagline         text,
  hero_emoji      text default '🍽️',
  prep_minutes    int  default 20,
  difficulty      text default 'easy',
  serves          int  default 1,
  ingredients     jsonb not null default '[]'::jsonb,
  steps           jsonb not null default '[]'::jsonb,
  chef_tip        text,
  creator_handle  text,
  instagram_url   text,
  youtube_url     text,
  views           int  default 0,
  generated_at    timestamptz not null default now()
);

create index if not exists recipes_views_idx on public.recipes (views desc);

alter table public.recipes enable row level security;

-- Recipes are shared content — anyone signed in can read.
create policy "Recipes are readable by authenticated users"
  on public.recipes for select
  to authenticated
  using (true);

-- Writes happen only via the edge function using the service role, so no
-- insert/update policies are needed for anon/authenticated.
