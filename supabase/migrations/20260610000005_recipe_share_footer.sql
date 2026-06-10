-- Configurable footer for the "Share recipe" button on the recipe screen.
-- Lives in app_config so we can A/B test the line or update the store URL
-- without a redeploy. Use literal "\n" for newlines — the client
-- (RecipeScreen handleShare) unescapes them before passing to Share.share.

insert into public.app_config (key, value, description) values
  (
    'recipe_share_footer',
    'Made with Nourish 🌿\nEat well. Live better. → https://play.google.com/store/apps/details?id=com.nourish.app',
    'Footer appended to shared recipes. Supports \n for line breaks.'
  )
on conflict (key) do nothing;
