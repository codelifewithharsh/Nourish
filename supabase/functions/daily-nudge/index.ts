import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsPreflight, json, CORS } from "../_shared/ai-guard.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Returns a short personalised nudge for the user, cached in ai_response_cache
// per (user_id, today's UTC date). Costs 0 credits — it's a free daily perk.
Deno.serve(async (req) => {
  const pf = corsPreflight(req); if (pf) return pf;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const url     = Deno.env.get("SUPABASE_URL")!;
  const anon    = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = service ? createClient(url, service) : supabase;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const cacheKey = `daily-nudge:${user.id}:${today}`;

  // Serve from cache if exists
  const { data: cached } = await supabase
    .from("ai_response_cache")
    .select("response")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached?.response) {
    return new Response(JSON.stringify(cached.response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  if (!openAiKey) return json({ error: "OpenAI not configured" }, 503);

  // Fetch profile + today's logs in parallel
  const [profileRes, logsRes] = await Promise.all([
    supabase.from("profiles").select(
      "name, goal, daily_calories, daily_protein, diet_type"
    ).eq("id", user.id).single(),
    supabase.from("daily_logs").select("meal_type, calories, protein").eq(
      "user_id", user.id
    ).eq("date", today),
  ]);

  const profile = profileRes.data;
  const logs = logsRes.data ?? [];

  const eatenCalories = logs.reduce((s, r) => s + (r.calories ?? 0), 0);
  const eatenProtein  = logs.reduce((s, r) => s + (r.protein  ?? 0), 0);
  const loggedTypes   = new Set(logs.map((r) => r.meal_type));
  const hour = new Date().getUTCHours(); // rough — good enough for AM/PM context

  const goalLabel = profile?.goal === "muscle_gain"
    ? "building muscle"
    : profile?.goal === "fat_loss"
    ? "losing fat"
    : "staying healthy";

  const prompt = [
    `You are a warm, concise AI nutrition coach inside the Nourish app.`,
    `User context: name=${profile?.name ?? "user"}, goal=${goalLabel}, ` +
    `diet=${profile?.diet_type ?? "unknown"}, ` +
    `daily target=${profile?.daily_calories ?? "?"}kcal / ${profile?.daily_protein ?? "?"}g protein.`,
    `Today so far: eaten ${eatenCalories}kcal, ${eatenProtein}g protein. ` +
    `Logged: ${[...loggedTypes].join(", ") || "nothing yet"}. ` +
    `Local hour approx ${hour} UTC.`,
    `Write ONE short nudge (max 18 words). Be specific to their data, warm, and practical.`,
    `Return ONLY valid JSON: {"emoji":"<single emoji>","message":"<nudge text>"}`,
  ].join(" ");

  try {
    const resp = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80,
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const oai = await resp.json();
    const raw = oai.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { emoji?: string; message?: string };

    if (!parsed.emoji || !parsed.message) throw new Error("bad shape");

    const nudge = { emoji: parsed.emoji, message: parsed.message };

    // Cache for the day
    await admin.from("ai_response_cache").upsert({
      cache_key: cacheKey,
      response:  nudge,
      expires_at: new Date(today + "T23:59:59Z").toISOString(),
    }, { onConflict: "cache_key" });

    return json(nudge);
  } catch (err) {
    console.error("daily-nudge error:", err);
    // Fall back gracefully — client will use static nudge
    return json({ error: "nudge_unavailable" }, 502);
  }
});
