-- Store per-user meal notification times so reminders fire at the right local time.
-- Defaults to null (app falls back to DEFAULT_MEAL_TIMES: 8:00 / 13:00 / 19:30).

alter table public.profiles
  add column if not exists meal_notification_times jsonb default null;
