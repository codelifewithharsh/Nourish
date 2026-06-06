-- Core profiles table. Created first; later migrations add columns
-- (credits, meal_notification_times, expo_push_token, etc.) with
-- `alter table … add column if not exists` so they are idempotent.

create table if not exists public.profiles (
  id                   uuid        primary key references auth.users(id) on delete cascade,
  email                text        not null,
  name                 text,
  goal                 text,
  age                  int,
  weight_kg            numeric(5,1),
  height_cm            numeric(5,1),
  activity_level       text,
  diet_type            text,
  cuisines             text[]      default '{}',
  restrictions         text[]      default '{}',
  daily_calories       int,
  daily_protein        int,
  kitchen_ingredients  text,
  preferred_units      text        default 'metric',
  onboarding_completed boolean     default false,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users manage own profile"
  on public.profiles
  for all
  to authenticated
  using  (id = auth.uid())
  with check (id = auth.uid());

-- Auto-update updated_at
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a minimal profile row when a new auth user signs up.
-- The app fills the rest during onboarding.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
