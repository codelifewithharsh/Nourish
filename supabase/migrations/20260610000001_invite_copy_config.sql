-- Configurable share message for the "Invite a friend" button in profile.
-- Default is the launch copy. Update from the Supabase dashboard for A/B tests
-- without a redeploy.

insert into public.app_config (key, value, description) values
  (
    'invite_copy',
    'I''ve been eating better with Nourish — an AI nutritionist that plans Indian meals around your goals 🌿\n\nJoin me → https://play.google.com/store/apps/details?id=com.nourish.app',
    'Share message for the Invite a friend button. Supports \n for line breaks.'
  )
on conflict (key) do nothing;
