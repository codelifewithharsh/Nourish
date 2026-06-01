-- Waitlist for paid credit packs. Captures real intent from users who
-- hit the 402 modal — used to validate pricing/packaging before launch.

create table if not exists public.credit_pack_interest (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  meta       jsonb       not null default '{}'::jsonb
);

alter table public.credit_pack_interest enable row level security;

-- Owner can read/insert/delete their own row.
create policy credit_pack_interest_self_read
  on public.credit_pack_interest for select
  using (auth.uid() = user_id);

create policy credit_pack_interest_self_write
  on public.credit_pack_interest for insert
  with check (auth.uid() = user_id);

create policy credit_pack_interest_self_delete
  on public.credit_pack_interest for delete
  using (auth.uid() = user_id);
