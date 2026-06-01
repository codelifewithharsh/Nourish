-- Credit economy: profiles.credits is the live balance; credit_ledger is the
-- append-only history. Every grant/spend/refund/purchase writes a ledger row,
-- so the ledger is always the source of truth and the column is the cache.

alter table public.profiles
  add column if not exists credits           int  not null default 0,
  add column if not exists last_daily_refill date;

-- ── Ledger ─────────────────────────────────────────────────────────
create table if not exists public.credit_ledger (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  delta           int         not null,                 -- signed
  balance_after   int         not null,
  reason          text        not null,                 -- welcome|daily_refill|spend|refund|admin_grant|purchase
  action          text,                                 -- ai action, when reason='spend'/'refund'
  ref_id          uuid,                                 -- e.g. ai_usage_log row
  meta            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

create policy "Users read own ledger"
  on public.credit_ledger for select
  to authenticated
  using (user_id = auth.uid());

-- ── Atomic helpers ─────────────────────────────────────────────────
-- Spend: returns new balance on success, -1 if insufficient. Single UPDATE
-- guarded by `credits >= amount` makes the deduct race-free.
create or replace function public.deduct_credits(
  p_user_id  uuid,
  p_amount   int,
  p_action   text,
  p_ref_id   uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then return -1; end if;

  update public.profiles
     set credits = credits - p_amount
   where id = p_user_id and credits >= p_amount
   returning credits into v_balance;

  if v_balance is null then return -1; end if;

  insert into public.credit_ledger (user_id, delta, balance_after, reason, action, ref_id)
  values (p_user_id, -p_amount, v_balance, 'spend', p_action, p_ref_id);

  return v_balance;
end;
$$;

create or replace function public.grant_credits(
  p_user_id  uuid,
  p_amount   int,
  p_reason   text,
  p_action   text default null,
  p_ref_id   uuid default null,
  p_meta     jsonb default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then return -1; end if;

  update public.profiles
     set credits = credits + p_amount
   where id = p_user_id
   returning credits into v_balance;

  if v_balance is null then return -1; end if;

  insert into public.credit_ledger (user_id, delta, balance_after, reason, action, ref_id, meta)
  values (p_user_id, p_amount, v_balance, p_reason, p_action, p_ref_id, p_meta);

  return v_balance;
end;
$$;

-- Refund = grant with reason='refund', wired so callers don't need to know
-- whether ledger or column came first.
create or replace function public.refund_credits(
  p_user_id  uuid,
  p_amount   int,
  p_action   text,
  p_ref_id   uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.grant_credits(p_user_id, p_amount, 'refund', p_action, p_ref_id, null);
end;
$$;

-- Daily free refill: idempotent for the UTC day. Safe to call on every AI
-- request — only the first call per day does anything.
create or replace function public.ensure_daily_refill(
  p_user_id     uuid,
  p_daily_grant int default 5
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_last  date;
begin
  select last_daily_refill into v_last from public.profiles where id = p_user_id;

  if v_last is distinct from v_today then
    update public.profiles set last_daily_refill = v_today where id = p_user_id;
    perform public.grant_credits(
      p_user_id, p_daily_grant, 'daily_refill', null, null,
      jsonb_build_object('date', v_today)
    );
  end if;
end;
$$;

grant execute on function public.deduct_credits(uuid, int, text, uuid)               to authenticated, service_role;
grant execute on function public.grant_credits(uuid, int, text, text, uuid, jsonb)   to authenticated, service_role;
grant execute on function public.refund_credits(uuid, int, text, uuid)               to authenticated, service_role;
grant execute on function public.ensure_daily_refill(uuid, int)                      to authenticated, service_role;

-- ── Welcome bonus on profile creation ──────────────────────────────
create or replace function public.grant_welcome_credits() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the very first row for a user. Existing rows (default 0) get topped
  -- up; the trigger runs AFTER INSERT so the row already exists.
  if new.credits = 0 then
    perform public.grant_credits(new.id, 50, 'welcome', null, null, null);
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_welcome_credits on public.profiles;
create trigger profiles_welcome_credits
  after insert on public.profiles
  for each row execute function public.grant_welcome_credits();

-- ── Backfill for existing users ────────────────────────────────────
-- One-time: any profile that has no ledger row yet gets a welcome grant so
-- early TestFlight users aren't stuck on zero balance after this migration.
do $$
declare
  r record;
begin
  for r in
    select p.id
      from public.profiles p
      left join public.credit_ledger l on l.user_id = p.id
     where l.id is null
  loop
    perform public.grant_credits(r.id, 50, 'welcome', null, null,
      jsonb_build_object('backfill', true));
  end loop;
end $$;
