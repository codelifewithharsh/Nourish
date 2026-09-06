-- Generated hero images for planned dishes.
--
-- SAFETY: additive only — one nullable column and one new public bucket.
-- Nothing existing is altered, and no shipped client reads either.
--
-- `recipes` is already a global shared cache keyed by meal_key, so an image
-- is generated once per dish and reused by every user who has that dish in
-- their plan. Cost is therefore per-dish, not per-user: a few hundred common
-- Indian dishes covers the overwhelming majority of generated plans.

alter table public.recipes
  add column if not exists image_path text;

-- Public bucket, unlike meal-photos. These images contain no personal data,
-- are shared across all users, and being public means they can be served
-- straight from the CDN without minting a signed URL per dish per render.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dish-images',
  'dish-images',
  true,
  2097152,                                  -- 2 MB; generated images sit well under this
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Anyone signed in may read; writes are service-role only (the edge function
-- that generates them), so a user can never upload into the shared namespace.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Dish images are readable'
  ) then
    create policy "Dish images are readable"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'dish-images');
  end if;
end $$;
