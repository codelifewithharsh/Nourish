-- Store Expo push tokens per user so server-side notifications can be sent.
-- A user may have multiple devices; we keep only the latest token per user.

alter table public.profiles
  add column if not exists expo_push_token text default null;
