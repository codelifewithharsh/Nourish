# 04 — Supabase & Database

*Last updated: 2026-06-14.*

This doc covers everything about our Supabase setup: what's in the database, how Row Level Security works, how migrations are managed, and the workflow for schema changes.

---

## 1. What Supabase gives us

Three things we use heavily:

- **Postgres database** — relational store with full SQL, JSONB, and row-level security.
- **Auth** — JWT-based session management with OAuth providers (we use Google only). Sessions live in `auth.users`.
- **Edge Functions** — Deno serverless functions. We use them only for AI calls (see [doc 05](./05-ai-edge-functions.md)).

Things we **deliberately don't use and why:**

- **Storage** — No user-uploaded files. Avatars come from Google OAuth's `user_metadata.avatar_url` (Google's CDN, zero cost). Recipe visuals are a single Unicode emoji field (`hero_emoji`) returned by the AI.
- **Realtime** — Single-user app with no collaborative or multi-device sync scenario. Pull-on-demand is simpler and avoids open WebSocket connections that add SDK overhead for no benefit.
- **pgvector** — No embeddings or semantic search. All AI is prompt-in / structured-JSON-out.

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

Seeded values:

| Key | Value | Purpose |
|---|---|---|
| `limit_meal_plan` | 3 | Daily meal plan generations (Pro) |
| `limit_recipe` | 8 | Daily recipe generations (Pro) |
| `limit_swap` | 5 | Daily meal swaps (Pro) |
| `limit_nutrition` | 20 | Daily nutrition lookups (Pro) |
| `limit_meal_plan_free` | 1 | Free tier limits |
| `limit_recipe_free` | 2 | |
| `limit_swap_free` | 1 | |
| `limit_nutrition_free` | 3 | |
| `pro_price_normal` | ₹299/yr | Crossed-out comparison price on Pro sheet |
| `pro_price_user` | Free | Actual price shown to user |
| `login_tagline` | (empty) | Tagline above Continue button on login screen |
| `invite_copy` | (share text) | Pre-written text for the invite share sheet |
| `recipe_share_footer` | (share text) | Footer appended when sharing a recipe |

### `ai_response_cache` — daily nudge cache
Caches the daily nudge per user per UTC day so the home screen never hits OpenAI more than once per day per user.

| Column | Type | Notes |
|---|---|---|
| `cache_key` | text PK | `daily-nudge:{user_id}:{YYYY-MM-DD}` |
| `response` | jsonb | `{ emoji, message }` |
| `expires_at` | timestamptz | End of UTC day |
| `created_at` | timestamptz | |

### `feedback` — user-submitted feedback
Write-only from the client. No select policy — users can submit but never read back.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK→auth.users | |
| `type` | text | `bug` \| `feature` \| `other` |
| `message` | text | 4–2000 chars (check constraint) |
| `contact` | text | Optional contact info |
| `created_at` | timestamptz | |

<!-- credit_ledger and credit_pack_interest were dropped on 2026-06-09
     (migration 20260609000001_drop_legacy_credits.sql) along with the
     profiles.credits / last_daily_refill / credits_intro_seen columns and
     the ai_usage_log.credits_charged column. -->


---

## 4. Row Level Security (RLS)

RLS is the security model. Every table has it enabled, and the client (with its public anon key) can never bypass it.

`auth.uid()` is a Postgres function that resolves to the `sub` claim in the JWT the client sent. Every query from the client is implicitly scoped to "where user_id = me" — Postgres enforces this at the storage layer, before results are returned.

**You cannot reach another user's data from the client.** The Supabase anon key is safe to ship in the app bundle — it only proves "this request came from the Nourish app", not "this user can access any row."

### Actual RLS policies

`profiles` — single policy covering all operations (consolidated in migration `20260607000002`):
```sql
create policy "Users manage own profile"
  on public.profiles
  for all
  using     (auth.uid() = id)
  with check (auth.uid() = id);
```

`daily_logs` — separate read/write:
```sql
create policy "Users read own logs"
  on public.daily_logs for select
  using (auth.uid() = user_id);

create policy "Users write own logs"
  on public.daily_logs for insert
  with check (auth.uid() = user_id);
```

`recipes` — public read, service-role-only write:
```sql
create policy "Authenticated users can read recipes"
  on public.recipes for select
  to authenticated
  using (true);
-- No insert/update policy for authenticated role.
-- Only the service_role key (used inside Edge Functions via admin client) can write.
```

`feedback` — insert-only, no select:
```sql
create policy "Authenticated users can insert feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);
-- No SELECT policy — users submit but never need to read back.
```

`app_config` — readable by anon (needed for pre-auth screens like login):
```sql
create policy "Public read app_config"
  on public.app_config for select
  to anon, authenticated
  using (true);
```

### What would leak if RLS was off

- Any authenticated user could read every other user's `daily_logs`, `meal_plans`, `water_logs`, `profiles` — full diet history, weight, health goals of the entire user base
- Any user could overwrite another user's `meal_plans` row (single-row-per-user table, upsert on `user_id`)
- `ai_usage_log` would expose everyone's AI usage and cost data
- `ai_rate_limits` would be bypassable — a client could reset another user's counter, or inflate it to DoS them

---

## 5. RPC functions (Postgres functions)

We use `SECURITY DEFINER` RPCs for atomic operations the client can't safely do row-by-row:

| Function | Called from | Purpose |
|---|---|---|
| `check_and_increment_rate_limit(p_user_id, p_action, p_daily_limit)` | Edge Functions (`ai-guard.ts`) | Atomic upsert on `ai_rate_limits`; returns bool |
| `get_config_int(p_key, p_default)` | Edge Functions | Read int from `app_config` with fallback |
| `get_config_text(p_key, p_default)` | Client (`lib/appConfig.ts`, `ProContext.tsx`) | Read text from `app_config` with fallback — anon-callable |
| `bump_meal_plan_cache_hits(p_key)` | Edge Function (`generate-meal-plan`) | Best-effort hit counter increment |
| `bump_nutrition_cache_hits(p_key)` | Edge Function (`lookup-nutrition`) | Best-effort hit counter increment |
| `prune_rate_limits()` | Manual / future cron | Deletes `ai_rate_limits` rows older than 30 days |

`check_and_increment_rate_limit` is the critical one — it's a single atomic `INSERT ... ON CONFLICT DO UPDATE` in Postgres. No Redis needed, no race condition possible:

```sql
insert into public.ai_rate_limits (user_id, action, window_start, count)
values (p_user_id, p_action, current_date, 1)
on conflict (user_id, action, window_start)
do update set count = ai_rate_limits.count + 1
returning count into v_count;

return v_count <= p_daily_limit;
```

The limit resets daily automatically because `window_start = current_date` partitions by day — no cron job needed to reset counters.

`get_config_text` is granted to `anon` so the login screen can fetch pricing strings before the user is authenticated.

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

## 9. Authentication

**Method:** Google OAuth only. No email/password, no Apple Sign-In, no magic link.

**Session storage:** The JWT (access + refresh token) is stored in **Expo SecureStore** — the device's secure enclave (Keychain on iOS, Keystore on Android). Not AsyncStorage.

```typescript
// lib/supabase.ts
const ExpoSecureStoreAdapter = {
  getItem:    (key) => SecureStore.getItemAsync(key).catch(() => null),
  setItem:    (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,   // not a web app
  },
});
```

**How the client knows who the user is:** The JWT contains `sub = auth.uid()`. The client calls `supabase.auth.getUser()` (network verification) or `supabase.auth.getSession()` (cached). Edge Functions receive the JWT in the `Authorization` header and re-verify it server-side via `auth.getUser()` inside `guard()`.

**Auth state machine** (`app/_layout.tsx`):
```
onAuthStateChange listens for:
  INITIAL_SESSION → route to /tabs or /auth/onboarding based on onboarding_completed
  SIGNED_IN       → register push token, check onboarding, route accordingly
  SIGNED_OUT      → clear state, navigate to /auth/login
```

**On sign-out:** `supabase.auth.signOut()` deletes the JWT from SecureStore and fires `SIGNED_OUT`. All user data remains in Postgres — it's re-fetched on next sign-in via RLS-scoped queries.

---

## 10. Client-server boundary

**The rule:** if it involves a secret, enforces a limit, or writes to a shared (non-user-owned) table — it goes in an Edge Function. Everything else is a direct Supabase client call protected by RLS.

| What | Where | Why |
|---|---|---|
| OpenAI API calls | Edge Function | API key cannot be in the app bundle |
| Rate limit enforcement | Edge Function (RPC) | Client-side checks are bypassable |
| Writing to `recipes` | Edge Function (service role) | Global shared table — clients can't write |
| Writing to `ai_usage_log` | Edge Function | Audit trail must be server-owned |
| BMR/TDEE/protein math | Client (`tdee.ts`) | Pure math, no secret, deterministic |
| Reading `daily_logs` | Client (anon key + RLS) | User-owned, RLS scopes it automatically |
| Writing `daily_logs` | Client (anon key + RLS) | Same |
| Reading `profiles` | Client (anon key + RLS) | Same |
| Reading `app_config` pricing | Client (anon key, no RLS needed) | Public read — pre-auth screens need it |

**Specific decisions:**

- **Recipe URLs:** Early versions asked the AI to provide Instagram handles and YouTube links. Moved to deterministic server-side string construction in the Edge Function. Removed from the AI prompt entirely — eliminating ~50 tokens per call and hallucinated 404 URLs.
- **Calorie/protein targets:** Were considered as AI-computed values. Moved to client-side deterministic math (Mifflin-St Jeor + Devine IBW). The computed numbers are stored in `profiles` and injected into prompts as hard constraints. AI computes meals; humans compute targets.

---

## 11. Scaling considerations

**Current plan:** Free tier.

**First bottleneck at scale:** Edge Function CPU-time. Each non-cached AI call spends 500–2000ms waiting on OpenAI. The caching strategy (profile shape bucketing for meal plans, global recipe cache, normalised nutrition cache) exists specifically to avoid this — cache hits use near-zero CPU.

**What to do at 10× traffic:**
- Move to Supabase Pro (removes CPU cap, adds read replicas)
- Add TTL-based pruning for `nutrition_cache` and `meal_plan_cache` — they grow unboundedly; `prune_rate_limits()` is already a model for this pattern
- `daily_logs` is the highest-write table — the `(user_id, date desc)` index is already in place

**Free tier limits relevant to this app:**

| Resource | Free limit | Notes |
|---|---|---|
| Postgres DB size | 500 MB | Not close — JSONB-heavy but small dataset |
| Edge Function invocations | 500K / month | Per-user rate caps bound this naturally |
| Edge Function CPU | 750K ms / month | Real constraint; caching is the mitigation |
| Auth MAUs | 50,000 | First real limit to hit at user-scale |

---

## 12. Common questions

**"Can I write SQL directly in the Dashboard?"**
Yes, but every change should be captured as a migration file. Use the Dashboard SQL editor for one-off queries (debugging, ad-hoc analytics). Anything that mutates the schema goes in a migration.

**"Why are there two separate caches (`meal_plan_cache`, `nutrition_cache`)?"**
Different key shapes. Meal plans are keyed by a *profile bucket* (calorie-rounded + protein-rounded + diet + cuisines), nutrition queries are keyed by a *normalised query string*. Lumping them would muddle indexing.

**"What happens if I push a migration that depends on data not yet in production?"**
You'll get an error from `db push`. Either reorder the migration, or use a `DO $$ ... $$` block to guard the data-dependent part.

**"Why is `verify_jwt = false` in config.toml for all Edge Functions?"**
With `verify_jwt = true`, Supabase rejects requests without a valid JWT — including the `OPTIONS` preflight the SDK sends before every `functions.invoke()` call. The OPTIONS request has no `Authorization` header, so it fails with 401 before the actual call even goes out. Workaround: `verify_jwt = false` everywhere, with manual `auth.getUser()` inside `guard()`. Same security outcome, more boilerplate. See [doc 05 §10](./05-ai-edge-functions.md) for the guard implementation.

**"What does `SECURITY DEFINER` mean on the RPCs?"**
The function runs with the privileges of the function *owner* (usually `postgres`), not the caller. This lets `check_and_increment_rate_limit` write to `ai_rate_limits` atomically even though the caller's JWT only has the `authenticated` role. Without it, the atomic upsert would fail RLS. The trade-off: `SECURITY DEFINER` functions must validate their inputs carefully — a bug in the function has elevated privileges.
