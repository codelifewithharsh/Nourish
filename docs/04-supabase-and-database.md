# 04 — Supabase & Database

*Last updated: 2026-06-08.*

This doc covers everything about our Supabase setup: what's in the database, how Row Level Security works, how migrations are managed, and the workflow for schema changes.

---

## 1. What Supabase gives us

Three things we use heavily:

- **Postgres database** — relational store with full SQL, JSONB, and row-level security.
- **Auth** — JWT-based session management with OAuth providers (we use Google). Sessions live in `auth.users`.
- **Edge Functions** — Deno serverless functions. We use them only for AI calls (see [doc 05](./05-ai-edge-functions.md)).

Things we *could* use but don't (yet): Storage (file uploads), Realtime (DB → client streaming), pgvector.

---

## 2. Setting up a fresh project

If you're cloning the repo or setting up a new environment:

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Create a project at app.supabase.com (write down the project ref)

# 3. Link this repo to the project
npx supabase link --project-ref <your-project-ref>

# 4. Apply all migrations
npx supabase db push

# 5. Deploy edge functions
npx supabase functions deploy generate-meal-plan
npx supabase functions deploy get-recipe
npx supabase functions deploy lookup-nutrition
npx supabase functions deploy swap-meal

# 6. Set the OpenAI key as a function secret (NOT a public env var)
npx supabase secrets set OPENAI_API_KEY=sk-...

# 7. In Supabase Dashboard → Authentication → Providers → Google
#    Enable Google OAuth and paste the Client ID/Secret from Google Console.
#    See doc 03 for the Google Console part.

# 8. Copy the project URL + anon key into your .env.local
#    EXPO_PUBLIC_SUPABASE_URL=...
#    EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 3. The tables

All tables live in `public.` schema. Every table has RLS enabled.

### `profiles` — one row per user
Mirrors the user; created by a trigger when `auth.users` gets a new row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK to `auth.users.id` |
| `email` | text | |
| `name` | text | |
| `goal` | text | `muscle_gain` \| `fat_loss` \| `stay_healthy` |
| `age`, `weight_kg`, `height_cm` | int / numeric | |
| `activity_level` | text | `sedentary` \| `lightly_active` \| `very_active` |
| `diet_type` | text | `pure_veg` \| `vegan` \| `eggetarian` \| `non_veg` |
| `cuisines` | text[] | preferences |
| `restrictions` | text[] | `onion_garlic`, `dairy`, etc. |
| `daily_calories`, `daily_protein` | int | targets |
| `preferred_units` | text | `metric` \| `imperial` |
| `kitchen_ingredients` | text | comma-separated free text |
| `onboarding_completed` | bool | the routing gate |
| `is_pro` | bool | Pro membership flag (true for every signup right now) |
| `is_early_bird` | bool | Early Bird sub-flag — drives the "EARLY BIRD" chip on the Pro sheet |
| `pro_since` | timestamptz | when the user became Pro (used in "Pro member since" tag) |
| `credits`, `last_daily_refill`, `credits_intro_seen` | int / date / bool | **legacy** — old credit model; no longer read or written but columns still exist |
| `meal_notification_times` | jsonb | `{ breakfast, lunch, dinner: { hour, minute } }` — defaults to 8:00/13:00/19:30 if null |

### `meal_plans` — one row per user
The current 7-day plan. Rewritten wholesale by `generate-meal-plan`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | one plan per user |
| `plan` | jsonb | 7-day structure (see below) |
| `generated_at` | timestamptz | |

`plan` shape:
```json
{
  "days": [
    {
      "day": 1,
      "meals": [
        { "type": "breakfast", "name": "Paneer bhurji", "calories": 380, "protein": 22, "carbs": 28, "fat": 18 },
        { "type": "lunch", ... },
        { "type": "dinner", ... },
        { "type": "snack", ... }
      ],
      "total_calories": 1480,
      "total_protein": 78
    }
    // ...6 more days
  ]
}
```

Denormalised JSONB is chosen over normalised rows because the plan is always read as a whole, generated atomically, and per-meal swaps patch it in place.

### `daily_logs` — one row per logged meal

| Column | Type |
|---|---|
| `id`, `user_id`, `date`, `meal_type`, `meal_name` | |
| `calories`, `protein`, `carbs`, `fat` | int |
| `logged_at` | timestamptz |

### `water_logs` — one row per user per day
Upsert on `(user_id, date)`.

### `recipes` — public recipe cache
Created the first time anyone asks for a recipe with that `meal_key` (a slugified meal name). Subsequent users with the same query get the cached row free.

| Column | Type | Notes |
|---|---|---|
| `meal_key` | text PK | slugified, e.g. `paneer-bhurji` |
| `name`, `tagline`, `hero_emoji` | text | |
| `ingredients`, `steps` | jsonb | structured |
| `prep_minutes`, `difficulty`, `serves` | | |
| `views` | int | popularity counter |

### `ai_rate_limits` — atomic daily counters
Used by the shared `check_and_increment_rate_limit` RPC.

| Column | Notes |
|---|---|
| `(user_id, action, window_start)` | PK |
| `count` | int |

### `ai_usage_log` — append-only audit log
Every AI call (cache hits, errors, rate-limited attempts, successes) writes a row here.

| Column | Notes |
|---|---|
| `user_id`, `action`, `status` | `pending`, `success`, `cache_hit`, `rate_limited`, `openai_error` |
| `cache_hit`, `tokens_in`, `tokens_out`, `cost_micros`, `latency_ms` | for cost analytics |
| `credits_charged` | **legacy** — always 0 under the Pro model |
| `meta` | jsonb, free-form |

### `meal_plan_cache` / `nutrition_cache` — shared caches
Used by edge functions to avoid recomputing common requests. Keyed by a profile-shape bucket / normalised query string.

### `app_config` — live-tunable settings
Single source of truth for values that operations may want to change without redeploying. Read by edge functions via `get_config_int(key, default)` and by the client via `useAppConfigText(key, default)`.

| Column | Notes |
|---|---|
| `key` | text PK, e.g. `limit_meal_plan`, `pro_price_normal`, `login_tagline` |
| `value` | text — all values stored as text; callers cast as needed |
| `description` | text — for editor context in the Supabase dashboard |
| `updated_at` | timestamptz |

Seeded with daily limits (`limit_*`), pricing copy (`pro_price_*`), and marketing copy (`login_tagline`).

### `credit_ledger`, `credit_pack_interest` — *legacy*
From the old credits economy. The Pro membership model replaced credits; these tables are no longer written to but remain in the schema until we explicitly drop them.

---

## 4. Row Level Security (RLS)

RLS is the security model. Every table has it enabled, and the client (with its public anon key) can never bypass it.

The pattern for user-owned tables:

```sql
create policy table_self_read
  on public.<table> for select
  using (auth.uid() = user_id);

create policy table_self_write
  on public.<table> for insert
  with check (auth.uid() = user_id);
-- and similar for update/delete
```

`auth.uid()` is a function Postgres injects based on the JWT the request was authenticated with. So every query the client sends is implicitly filtered to "where user_id = me."

**You cannot reach another user's data from the client.** The Supabase anon key is safe to ship — it's only a passport for the RLS-protected RPC.

The `recipes` table is an exception: it's a *public* cache (anyone can read any recipe, but only the system service role can write).

---

## 5. RPC functions (Postgres functions)

We use `SECURITY DEFINER` RPCs for atomic operations the client can't safely do row-by-row:

| Function | Purpose |
|---|---|
| `check_and_increment_rate_limit(p_user_id, p_action, p_daily_limit)` | Atomic upsert; returns `false` if over limit |
| `get_config_int(p_key, p_default)` | Reads `app_config` text → int with safe fallback |
| `get_config_text(p_key, p_default)` | Reads `app_config` text with safe fallback (anon-callable) |
| `ensure_daily_refill(...)`, `deduct_credits(...)`, `grant_credits(...)`, `refund_credits(...)` | **legacy** — unused under the Pro model |

Rate-limit + config functions are called from **edge functions only** (they bypass RLS via `SECURITY DEFINER`). `get_config_text` is also granted to `anon` for pre-auth screens (login, onboarding).

---

## 6. The migrations workflow

We use **flat SQL migrations** in `supabase/migrations/`. Naming: `YYYYMMDDHHMMSS_short_name.sql`.

### Making a schema change

```bash
# 1. Create a new migration
touch supabase/migrations/$(date -u +%Y%m%d%H%M%S)_my_change.sql

# 2. Write the SQL (idempotent — use IF NOT EXISTS where possible)

# 3. Apply it to your linked Supabase project
npx supabase db push

# 4. Regenerate types
npx supabase gen types typescript --linked > lib/database.types.ts

# 5. Commit both the SQL file and the regenerated types
```

### Rules

- **Migrations are forward-only.** Don't edit an already-applied migration. Write a new one that fixes the issue.
- **Idempotent statements** (`if not exists`, `add column if not exists`) make migrations safe to re-run.
- **Backfill in a `DO $$ ... $$;` block** when you need data to fit a new column.

### Why not a migration tool like Prisma?

Supabase ships its own migrations runner that's tightly integrated. Adding Prisma would mean owning both the migration story *and* the type generation story. Supabase already does both.

---

## 7. Type generation

`lib/database.types.ts` is generated by the Supabase CLI from the live DB schema. Every table column becomes a typed field on `Database['public']['Tables']['<name>']['Row']`.

```bash
npx supabase gen types typescript --linked > lib/database.types.ts
```

Run this after every migration. If you forget, queries will silently allow shape mismatches that TypeScript would have caught.

There's no `package.json` script for it yet — should be one (`npm run types:db`). See [doc 08](./08-pending-work.md).

---

## 8. The `auth.users` table is owned by Supabase

You don't write SQL against `auth.users` directly. Instead:

- A trigger fires on `auth.users` insert → creates a `profiles` row with `is_pro=true`, `is_early_bird=true`, `pro_since=now()`.

This means **deleting a row from `auth.users` cascades** through your tables via FK constraints. Verify those are `ON DELETE CASCADE` before you ship a "delete my account" feature.

---

## 9. Common questions

**"Can I write SQL directly in the Dashboard?"**
Yes, but every change should be captured as a migration file. Use the Dashboard SQL editor for one-off queries (debugging, ad-hoc analytics). Anything that mutates the schema goes in a migration.

**"Why are there two separate caches (`meal_plan_cache`, `nutrition_cache`)?"**
Different key shapes. Meal plans are keyed by a *profile bucket* (calorie-rounded + protein-rounded + diet + cuisines), nutrition queries are keyed by a *normalised query string*. Lumping them would muddle indexing.

**"What happens if I push a migration that depends on data not yet in production?"**
You'll get an error from `db push`. Either reorder the migration, or use a `DO $$ ... $$` block to guard the data-dependent part.
