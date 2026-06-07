# Topic: Race conditions are someone else's problem if Postgres can do it in one statement

## Working titles
- *"My rate limiter is one SQL statement. I don't take a lock anywhere in my app."*
- *"The simplest concurrency-safe code is the code that delegates the concurrency"*
- *"Why my rate limiter has no Redis, no lock, no retry loop"*

## What actually happened

I needed per-user per-day rate limits on my AI endpoints. The textbook implementation is "fetch count, compare, increment, write." That's the textbook race condition. The textbook fix is `SELECT ... FOR UPDATE` or an application lock.

What I shipped:
```sql
create or replace function check_and_increment_rate_limit(
  p_user_id uuid, p_action text, p_daily_limit int
) returns boolean
language plpgsql security definer as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_count int;
begin
  insert into ai_rate_limits (user_id, action, window_start, count)
  values (p_user_id, p_action, v_today, 1)
  on conflict (user_id, action, window_start)
  do update set count = ai_rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_daily_limit;
end;
$$;
```

One statement. Postgres serializes row updates. Two concurrent calls cannot both pass through if the second one would put the user over the cap.

There is no lock to take, no version field to compare, no retry loop in app code.

The edge function calls this RPC at the start of every AI request. If it returns `false`, the request short-circuits with a friendly 429 message before OpenAI is ever called. Done.

## The takeaway

When you need atomicity, ask: can the database do it in one statement? The simplest concurrency-safe code is the code that delegates the concurrency to something better at it.

This generalizes. The same `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` pattern is the right primitive for:
- Daily counters
- Idempotent "first time today" gates
- Optimistic upserts with a derived value

## What NOT to over-claim
- This works because the row is small and the work per call is constant. For very high contention on a single key, you'd want a more distributed approach.
- Postgres serialization isn't free at high throughput. For a few thousand users a day, it's invisible.

## Optional aside
The same `app_config` table also drives the limit value (`limit_meal_plan = '3'`). I read it inside `guard()` before calling the rate-limit RPC, so I can bump the limit from the Supabase dashboard without a redeploy. The whole rate-limiting story is two SQL functions and a 2-column table.

## Final post
*(Add final version here.)*
