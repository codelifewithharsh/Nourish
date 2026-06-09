-- Relax feedback message min length from 10 → 4 chars.
-- "Bug", "Love", short reactions are still useful signal.
--
-- The original constraint was inline (anonymous), so Postgres auto-named it.
-- This DO block finds the actual name and replaces it with a named constraint.

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.feedback'::regclass
    and contype  = 'c'
    and pg_get_constraintdef(oid) ilike '%char_length(message)%';

  if con_name is not null then
    execute format('alter table public.feedback drop constraint %I', con_name);
  end if;

  alter table public.feedback
    add constraint feedback_message_length_check
    check (char_length(message) >= 4 and char_length(message) <= 2000);
end $$;
