-- Drop any duplicate RLS policies on profiles that may have been created
-- manually and conflict with the migration-managed one.
drop policy if exists "Users manage own profile" on public.profiles;
drop policy if exists "Enable all for authenticated users" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users manage own profile"
  on public.profiles
  for all
  to authenticated
  using  (id = auth.uid())
  with check (id = auth.uid());
