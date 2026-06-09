-- Drop the legacy credits system.
--
-- These objects come from the original credit-economy model (see
-- 20260601000003_credits.sql). The Pro membership refactor replaced credits
-- with silent per-action rate limits read from app_config. Nothing in the
-- codebase or edge functions reads or writes these anymore.
--
-- Order matters:
--   1. Drop the welcome-credits trigger (references grant_credits + profiles.credits).
--   2. Drop the credit RPCs (reference profiles.credits and credit_ledger).
--   3. Drop the credit tables (credit_ledger, credit_pack_interest).
--   4. Drop the legacy columns on profiles + ai_usage_log.
--
-- All statements are idempotent so the migration is safe to re-run.

-- ── 1. Trigger ─────────────────────────────────────────────────────────
drop trigger  if exists profiles_welcome_credits   on public.profiles;
drop function if exists public.grant_welcome_credits();

-- ── 2. RPCs ────────────────────────────────────────────────────────────
drop function if exists public.deduct_credits(uuid, int, text, uuid);
drop function if exists public.grant_credits(uuid, int, text, text, uuid, jsonb);
drop function if exists public.refund_credits(uuid, int, text, uuid);
drop function if exists public.ensure_daily_refill(uuid, int);

-- ── 3. Tables ──────────────────────────────────────────────────────────
drop table if exists public.credit_ledger          cascade;
drop table if exists public.credit_pack_interest   cascade;

-- ── 4. Columns ─────────────────────────────────────────────────────────
alter table public.profiles
  drop column if exists credits,
  drop column if exists last_daily_refill,
  drop column if exists credits_intro_seen;

-- ai_usage_log used credits_charged to track per-call spend. Under the Pro
-- model the value is always 0, so the column carries no information.
alter table public.ai_usage_log
  drop column if exists credits_charged;
