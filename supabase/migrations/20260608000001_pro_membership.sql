-- Pro membership + configurable AI limits.
--
-- Replaces the credits model with: silent per-user per-day caps, configurable
-- live from the Supabase dashboard via `app_config`. Every signup is auto-
-- marked as an Early Bird Pro member — the badge is purely cosmetic for now
-- (no expiry enforcement), so they get the same generous limits as everyone
-- else. When a free tier is introduced later, the `is_pro` flag will gate it.

-- ── 1. App-wide configuration table ────────────────────────────────────
-- One row per key. Values stored as text so the dashboard editor stays simple;
-- callers cast as needed. Read by anon+authenticated so the edge functions
-- (which inherit the caller's JWT) can read limits without service role.

create table if not exists public.app_config (
  key         text        primary key,
  value       text        not null,
  description text,
  updated_at  timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "Public read app_config"
  on public.app_config for select
  to anon, authenticated
  using (true);

-- All writes are dashboard-only (service role bypasses RLS); no insert/update
-- policy for end users on purpose.

-- Seed: silent daily limits. Numbers picked so a heavy genuine user never
-- hits them; an abuser scripting the API does.
insert into public.app_config (key, value, description) values
  ('limit_meal_plan', '3',  'Daily meal plan generations per user'),
  ('limit_recipe',    '8',  'Daily recipe generations per user'),
  ('limit_swap',      '5',  'Daily meal swaps per user'),
  ('limit_nutrition', '20', 'Daily AI nutrition lookups per user')
on conflict (key) do nothing;

-- Convenience helper for edge functions. Returns the int value or `p_default`
-- if the key is missing / unparseable. Single round-trip from Deno.
create or replace function public.get_config_int(p_key text, p_default int)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_val text;
  v_int int;
begin
  select value into v_val from public.app_config where key = p_key;
  if v_val is null then return p_default; end if;
  begin
    v_int := v_val::int;
  exception when others then
    return p_default;
  end;
  return v_int;
end;
$$;

grant execute on function public.get_config_int(text, int) to anon, authenticated, service_role;

-- ── 2. Pro membership flags on profiles ────────────────────────────────
alter table public.profiles
  add column if not exists is_pro          boolean     not null default true,
  add column if not exists is_early_bird   boolean     not null default true,
  add column if not exists pro_since       timestamptz not null default now();

-- Existing users are early birds too.
update public.profiles
   set is_pro        = true,
       is_early_bird = true,
       pro_since     = coalesce(pro_since, created_at, now())
 where is_pro is distinct from true
    or is_early_bird is distinct from true;

-- Make the signup trigger explicitly set Pro flags. handle_new_user already
-- exists from the profiles migration; we replace it so the row is born Pro.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, is_pro, is_early_bird, pro_since)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    true,
    true,
    now()
  )
  on conflict (id) do update
    set is_pro        = true,
        is_early_bird = true,
        pro_since     = coalesce(public.profiles.pro_since, excluded.pro_since);
  return new;
end;
$$;
