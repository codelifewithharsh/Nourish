-- Configurable tagline shown above the Continue button on the login screen.
-- Default is empty so we can ship without copy and add it later from the
-- Supabase dashboard. The login screen treats empty as "render nothing" —
-- no whitespace, no margin reserved.

insert into public.app_config (key, value, description) values
  ('login_tagline', '', 'Tagline shown above the Continue button on the login screen. Empty = hide.')
on conflict (key) do nothing;
