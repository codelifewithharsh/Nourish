-- Core app tables: meal_plans, daily_logs, water_logs.
-- These were created manually in Supabase; this migration makes them
-- reproducible so prod setup works from `supabase db push`.

-- ── Meal plans ──────────────────────────────────────────────────────
create table if not exists public.meal_plans (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  plan         jsonb       not null,
  generated_at timestamptz default now(),
  unique (user_id)
);

alter table public.meal_plans enable row level security;

create policy "Users manage own meal plan"
  on public.meal_plans
  for all
  to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Daily food logs ─────────────────────────────────────────────────
create table if not exists public.daily_logs (
  id        uuid        primary key default gen_random_uuid(),
  user_id   uuid        not null references public.profiles(id) on delete cascade,
  date      date        not null default current_date,
  meal_type text        not null,
  meal_name text        not null,
  calories  int         not null default 0,
  protein   numeric(6,1) not null default 0,
  carbs     numeric(6,1) not null default 0,
  fat       numeric(6,1) not null default 0,
  logged_at timestamptz default now()
);

create index if not exists daily_logs_user_date_idx on public.daily_logs (user_id, date desc);

alter table public.daily_logs enable row level security;

create policy "Users manage own logs"
  on public.daily_logs
  for all
  to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Water logs ──────────────────────────────────────────────────────
create table if not exists public.water_logs (
  id      uuid  primary key default gen_random_uuid(),
  user_id uuid  not null references public.profiles(id) on delete cascade,
  date    date  not null default current_date,
  glasses int   not null default 0,
  unique (user_id, date)
);

alter table public.water_logs enable row level security;

create policy "Users manage own water logs"
  on public.water_logs
  for all
  to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
