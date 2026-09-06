-- Correct the Play Store package id in shareable copy.
--
-- The app ships as `in.nourish.app`, but two app_config rows still point at
-- `com.nourish.app`. Those URLs go into the invite message and the footer of
-- every shared recipe, so each one has been handing people a dead Play Store
-- link.
--
-- The original migrations used `on conflict do nothing`, so re-running them
-- can't repair an existing row — this updates in place instead.
--
-- SAFETY: touches only these two keys, and only where the wrong id is still
-- present. A value already corrected by hand in the dashboard is left alone.

update public.app_config
set value = replace(value, 'id=com.nourish.app', 'id=in.nourish.app')
where key in ('invite_copy', 'recipe_share_footer')
  and value like '%id=com.nourish.app%';

-- ── Photo scan limits ────────────────────────────────────────────────────
--
-- Seeded at 50/10 when photo logging was built. Vision calls are the most
-- expensive thing the app makes, and app_config takes precedence over the
-- edge function's defaults, so lowering the code alone would have had no
-- effect on an existing database.
--
-- Set close to real meal counts. The rate-limit counter increments before the
-- model call, so a retake or a photo with no food in it still costs a scan;
-- raise these from the dashboard if that proves too tight.

update public.app_config set value = '6' where key = 'limit_photo';
update public.app_config set value = '2' where key = 'limit_photo_free';
