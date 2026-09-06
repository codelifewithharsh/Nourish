-- Onboarding expansion + richer nutrient tracking + weight history.
--
-- SAFETY: this migration is ADDITIVE ONLY. Every statement is either a new
-- nullable column, a new table, or a new index. Nothing is dropped, renamed,
-- retyped, or made NOT NULL without a default. The currently-shipped app
-- selects columns by name, so it will not see any of this and keeps working
-- unchanged. Safe to run against production while old clients are live.

-- ── 1. Profiles: sex ───────────────────────────────────────────────────
-- Sex at birth, used ONLY for the Mifflin-St Jeor BMR and Devine IBW
-- equations, which are sex-specific. Before this column existed the app
-- averaged the male and female formulas for everyone, which left every man
-- under-fed by ~114 kcal/day and every woman over-fed by the same amount.
-- NULL / 'unspecified' preserves that legacy averaged behaviour.
alter table public.profiles
  add column if not exists sex text
    check (sex in ('male', 'female', 'unspecified'));

-- ── 2. Profiles: optional contact ──────────────────────────────────────
-- Contact only. NOT a login method — auth remains Google OAuth.
alter table public.profiles
  add column if not exists phone text;

-- ── 3. Profiles: fields that make AI meal plans materially better ──────
-- All nullable; buildUserPrompt() must emit a sensible line when absent.
alter table public.profiles
  add column if not exists region              text,      -- e.g. 'gujarat', 'west_bengal'
  add column if not exists meals_per_day       int,       -- plan hardcodes 3 today
  add column if not exists cooking_time        text,      -- 'under_15' | 'under_30' | 'relaxed'
  add column if not exists budget_tier         text,      -- 'economical' | 'moderate' | 'premium'
  add column if not exists eats_out_frequency  text,      -- 'rarely' | 'weekly' | 'often'
  add column if not exists allergies           text,      -- free text; `restrictions` is a fixed list of 8
  add column if not exists target_weight_kg    numeric(5,1),
  add column if not exists target_date         date;

-- ── 4. Profiles: medical flags ─────────────────────────────────────────
-- Health data. Optional, never a gate, user-deletable. Existing RLS already
-- isolates rows per user. Do NOT copy these values into analytics events.
-- The plan may adapt to a flag; it must never diagnose or promise outcomes.
alter table public.profiles
  add column if not exists medical_flags text[] default '{}';

-- ── 5. Daily logs: nutrients beyond the original four ──────────────────
-- The dashboard cannot say anything meaningful about health from
-- calories/protein/carbs/fat alone. Fibre and sodium matter especially for
-- Indian diets. Defaults are 0 so existing rows and old clients are valid.
alter table public.daily_logs
  add column if not exists fibre     numeric(6,1) not null default 0,
  add column if not exists sugar     numeric(6,1) not null default 0,
  add column if not exists sodium    numeric(7,1) not null default 0,  -- mg
  add column if not exists sat_fat   numeric(6,1) not null default 0;

-- Where the entry came from, so photo vs text logging can be compared.
alter table public.daily_logs
  add column if not exists source     text,   -- 'text' | 'photo' | 'plan' | 'recent'
  add column if not exists photo_path text;   -- Storage object path, if logged by photo

-- ── 6. Nutrition cache: same nutrients ─────────────────────────────────
-- Cached rows written before this migration simply have 0s; they stay valid.
alter table public.nutrition_cache
  add column if not exists fibre   int not null default 0,
  add column if not exists sugar   int not null default 0,
  add column if not exists sodium  int not null default 0,
  add column if not exists sat_fat int not null default 0;

-- ── 7. Weight history ──────────────────────────────────────────────────
-- profiles.weight_kg is a single mutable value, so no trend can be drawn.
-- One row per user per day; upsert on conflict.
create table if not exists public.weight_logs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  date       date        not null default current_date,
  weight_kg  numeric(5,1) not null,
  logged_at  timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists weight_logs_user_date_idx
  on public.weight_logs (user_id, date desc);

alter table public.weight_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'weight_logs'
      and policyname = 'Users manage own weight logs'
  ) then
    create policy "Users manage own weight logs"
      on public.weight_logs
      for all
      to authenticated
      using  (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

-- ── 8. Daily limit for the new photo action ────────────────────────────
-- Photo logging costs roughly a paisa per call, so the cap exists to stop
-- scripted abuse, not to ration genuine use. See ACTION_META in ai-guard.ts.
insert into public.app_config (key, value, description) values
  ('limit_photo',      '6', 'Daily photo meal logs per Pro user'),
  ('limit_photo_free', '2', 'Daily photo meal logs for non-Pro users (is_pro=false)')
on conflict (key) do nothing;
