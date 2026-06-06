-- Harden credit RPCs: prevent authenticated users from granting/refunding
-- credits to OTHER users. Edge functions call these via the user's own JWT,
-- so self-operations must still work.
--
-- grant_credits is the dangerous one — any user with SQL access could call
--   SELECT grant_credits('<victim-uuid>', 9999, 'admin_grant')
-- and inflate someone's balance. We add an auth.uid() ownership guard.
-- refund_credits also wraps grant_credits, same fix applies.
-- deduct_credits and ensure_daily_refill are already safe (only reduce / idempotent).

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
  v_caller  uuid := auth.uid();
begin
  if p_amount <= 0 then return -1; end if;

  -- Authenticated callers may only grant to themselves.
  -- service_role bypass: auth.uid() is null for service_role.
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'permission denied';
  end if;

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
