-- Per-user daily rate limits for AI edge functions.
-- One row per (user, action, UTC day). Increment+check is atomic via RPC.

create table if not exists public.ai_rate_limits (
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  action       text        not null,
  window_start date        not null,
  count        int         not null default 0,
  primary key (user_id, action, window_start)
);

create index if not exists ai_rate_limits_window_idx
  on public.ai_rate_limits (window_start);

alter table public.ai_rate_limits enable row level security;

-- Users can read their own limits (for showing "X/Y today" UI later).
create policy "Users read own rate limits"
  on public.ai_rate_limits for select
  to authenticated
  using (user_id = auth.uid());

-- All writes happen via SECURITY DEFINER RPC below.

-- Atomic: bump the counter, return true if still within the daily limit.
create or replace function public.check_and_increment_rate_limit(
  p_user_id      uuid,
  p_action       text,
  p_daily_limit  int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_count int;
begin
  insert into public.ai_rate_limits (user_id, action, window_start, count)
  values (p_user_id, p_action, v_today, 1)
  on conflict (user_id, action, window_start)
  do update set count = ai_rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_daily_limit;
end;
$$;

grant execute on function public.check_and_increment_rate_limit(uuid, text, int)
  to authenticated, service_role;

-- Cleanup job-friendly: prune rows older than 30 days.
create or replace function public.prune_rate_limits() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_rate_limits
  where window_start < (now() at time zone 'utc')::date - 30;
$$;
