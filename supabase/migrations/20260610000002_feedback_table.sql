-- In-app feedback table.
-- Users can submit typed feedback without leaving the app.
-- type: 'bug' | 'feature' | 'other'
-- contact is optional — user may leave it blank.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  type        text not null check (type in ('bug', 'feature', 'other')),
  message     text not null check (char_length(message) >= 10 and char_length(message) <= 2000),
  contact     text,
  created_at  timestamptz default now()
);

alter table public.feedback enable row level security;

-- Users can only insert their own rows; no client-side read/update/delete.
create policy "feedback_self_insert"
  on public.feedback for insert
  with check (auth.uid() = user_id);
