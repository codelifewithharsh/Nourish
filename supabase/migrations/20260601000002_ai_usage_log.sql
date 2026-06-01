-- One row per AI action attempt. Foundation for cost dashboards, abuse
-- detection, and "before-charging" pricing decisions. Writes only via
-- service role; users can read their own rows for an in-app history later.

create table if not exists public.ai_usage_log (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        references public.profiles(id) on delete set null,
  action           text        not null,
  status           text        not null,        -- success | rate_limited | no_credits | openai_error | cache_hit
  cache_hit        boolean     not null default false,
  tokens_in        int,
  tokens_out       int,
  cost_micros      bigint,                      -- USD micro-cents (1e-8 USD), avoids float drift
  credits_charged  int         not null default 0,
  latency_ms       int,
  meta             jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists ai_usage_log_user_idx     on public.ai_usage_log (user_id, created_at desc);
create index if not exists ai_usage_log_action_idx   on public.ai_usage_log (action, created_at desc);
create index if not exists ai_usage_log_created_idx  on public.ai_usage_log (created_at desc);

alter table public.ai_usage_log enable row level security;

create policy "Users read own usage"
  on public.ai_usage_log for select
  to authenticated
  using (user_id = auth.uid());
