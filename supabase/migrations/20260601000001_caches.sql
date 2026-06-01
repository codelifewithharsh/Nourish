-- Shared caches that turn per-user AI calls into per-cohort lookups.
-- Both tables are written via service role only.

-- ── Meal-plan cache ─────────────────────────────────────────────────
-- Key = profile shape (goal, diet, restrictions, calorie & protein bucket,
-- cuisines). Most users fall into a small number of buckets, so this collapses
-- thousands of generations into dozens.

create table if not exists public.meal_plan_cache (
  cache_key     text        primary key,
  plan          jsonb       not null,
  hits          int         not null default 0,
  generated_at  timestamptz not null default now()
);

create index if not exists meal_plan_cache_hits_idx
  on public.meal_plan_cache (hits desc);

alter table public.meal_plan_cache enable row level security;

create policy "Meal plan cache readable by authenticated"
  on public.meal_plan_cache for select
  to authenticated
  using (true);

-- ── Nutrition cache ─────────────────────────────────────────────────
-- Indian dish nutritional values don't change. Cache forever.

create table if not exists public.nutrition_cache (
  query_key   text        primary key,
  name        text        not null,
  calories    int         not null,
  protein     int         not null,
  carbs       int         not null,
  fat         int         not null,
  serving     text,
  hits        int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists nutrition_cache_hits_idx
  on public.nutrition_cache (hits desc);

alter table public.nutrition_cache enable row level security;

create policy "Nutrition cache readable by authenticated"
  on public.nutrition_cache for select
  to authenticated
  using (true);

-- Best-effort hit-counter bumpers (callable from edge fns under user context).
create or replace function public.bump_meal_plan_cache_hits(p_key text)
  returns void language sql security definer set search_path = public as $$
  update public.meal_plan_cache set hits = hits + 1 where cache_key = p_key;
$$;

create or replace function public.bump_nutrition_cache_hits(p_key text)
  returns void language sql security definer set search_path = public as $$
  update public.nutrition_cache set hits = hits + 1 where query_key = p_key;
$$;

grant execute on function public.bump_meal_plan_cache_hits(text) to authenticated, service_role;
grant execute on function public.bump_nutrition_cache_hits(text) to authenticated, service_role;
