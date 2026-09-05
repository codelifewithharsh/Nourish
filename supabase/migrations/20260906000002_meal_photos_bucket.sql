-- Storage bucket for meal photos.
--
-- SAFETY: additive only — creates a bucket and its policies. Nothing existing
-- is touched, and no currently-shipped client reads or writes this bucket.
--
-- Layout: meal-photos/<user_id>/<uuid>.jpg
-- The first path segment is the owner's uid, which is what every policy below
-- checks. Private bucket: reads go through signed URLs, so one user can never
-- enumerate or fetch another user's meals.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  5242880,                                  -- 5 MB; client downscales well below this
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Policies are created defensively so the migration stays re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users upload own meal photos'
  ) then
    create policy "Users upload own meal photos"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'meal-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users read own meal photos'
  ) then
    create policy "Users read own meal photos"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'meal-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Users delete own meal photos'
  ) then
    create policy "Users delete own meal photos"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'meal-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
