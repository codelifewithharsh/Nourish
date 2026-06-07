-- Pro price displayed on EarlyBirdSheet. Stored as text so we can show
-- whatever format we want from the dashboard ("₹299/yr", "₹49/month", etc.)
-- without code changes.

insert into public.app_config (key, value, description) values
  ('pro_price_normal', '₹299/yr', 'Display price shown crossed-out on Early Bird sheet'),
  ('pro_price_user',   'Free',    'Display price shown as the user''s actual price')
on conflict (key) do nothing;

-- Helper for text reads. Mirrors get_config_int.
create or replace function public.get_config_text(p_key text, p_default text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_val text;
begin
  select value into v_val from public.app_config where key = p_key;
  if v_val is null then return p_default; end if;
  return v_val;
end;
$$;

grant execute on function public.get_config_text(text, text) to anon, authenticated, service_role;
