import "@supabase/functions-js/edge-runtime.d.ts";
import { asResponse, corsPreflight, guard, json } from "../_shared/ai-guard.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const FALLBACK_PLAN = {
  days: [
    { day: 1, meals: [
      { type: "breakfast", name: "Masala Oats",           calories: 320, protein: 14, carbs: 48, fat: 8 },
      { type: "lunch",     name: "Dal Tadka with Rice",   calories: 480, protein: 18, carbs: 72, fat: 10 },
      { type: "dinner",    name: "Paneer Bhurji with Roti", calories: 520, protein: 28, carbs: 44, fat: 18 },
    ], total_calories: 1320, total_protein: 60 },
    { day: 2, meals: [
      { type: "breakfast", name: "Poha with Peanuts",     calories: 350, protein: 10, carbs: 58, fat: 9 },
      { type: "lunch",     name: "Rajma Rice",            calories: 500, protein: 20, carbs: 78, fat: 8 },
      { type: "dinner",    name: "Aloo Gobi with Paratha",calories: 490, protein: 12, carbs: 68, fat: 16 },
    ], total_calories: 1340, total_protein: 42 },
    { day: 3, meals: [
      { type: "breakfast", name: "Besan Chilla",          calories: 280, protein: 16, carbs: 32, fat: 10 },
      { type: "lunch",     name: "Chole with Bhature",    calories: 560, protein: 18, carbs: 82, fat: 14 },
      { type: "dinner",    name: "Mixed Veg Curry with Rice", calories: 440, protein: 14, carbs: 66, fat: 10 },
    ], total_calories: 1280, total_protein: 48 },
    { day: 4, meals: [
      { type: "breakfast", name: "Upma with Vegetables",  calories: 300, protein: 9,  carbs: 52, fat: 7 },
      { type: "lunch",     name: "Palak Paneer with Roti",calories: 520, protein: 24, carbs: 46, fat: 20 },
      { type: "dinner",    name: "Moong Dal Khichdi",     calories: 420, protein: 18, carbs: 64, fat: 8 },
    ], total_calories: 1240, total_protein: 51 },
    { day: 5, meals: [
      { type: "breakfast", name: "Idli Sambar",           calories: 310, protein: 12, carbs: 56, fat: 5 },
      { type: "lunch",     name: "Bhindi Masala with Dal Rice", calories: 490, protein: 16, carbs: 74, fat: 10 },
      { type: "dinner",    name: "Tofu Stir Fry with Roti",calories: 480, protein: 26, carbs: 42, fat: 18 },
    ], total_calories: 1280, total_protein: 54 },
    { day: 6, meals: [
      { type: "breakfast", name: "Dosa with Coconut Chutney", calories: 340, protein: 8,  carbs: 60, fat: 8 },
      { type: "lunch",     name: "Matar Paneer with Rice",calories: 540, protein: 22, carbs: 70, fat: 16 },
      { type: "dinner",    name: "Vegetable Pulao with Raita",calories: 460, protein: 14, carbs: 68, fat: 10 },
    ], total_calories: 1340, total_protein: 44 },
    { day: 7, meals: [
      { type: "breakfast", name: "Sprouted Moong Salad",  calories: 220, protein: 14, carbs: 30, fat: 4 },
      { type: "lunch",     name: "Kadai Paneer with Naan",calories: 580, protein: 26, carbs: 62, fat: 22 },
      { type: "dinner",    name: "Dal Makhani with Rice", calories: 500, protein: 20, carbs: 72, fat: 12 },
    ], total_calories: 1300, total_protein: 60 },
  ],
};

interface ProfileShape {
  goal:                 string;
  daily_calories:       number;
  daily_protein:        number;
  cuisines:             string[];
  diet_type:            string;
  restrictions:         string[];
  age:                  number;
  weight_kg:            number;
  kitchen_ingredients?: string | null;
}

// Bucketing collapses near-identical profiles into a single cache key. Two
// users wanting 1900 kcal vs 1950 kcal don't need separate AI generations.
function planCacheKey(p: ProfileShape): string {
  const calBucket     = Math.round((p.daily_calories ?? 2000) / 200) * 200;
  const proteinBucket = Math.round((p.daily_protein  ?? 60)   / 20)  * 20;
  const cuisines      = [...(p.cuisines ?? [])].sort().join(",") || "north_indian";
  const restrictions  = [...(p.restrictions ?? [])].sort().join(",") || "none";
  return [
    p.goal      ?? "stay_healthy",
    p.diet_type ?? "vegetarian",
    cuisines,
    restrictions,
    `c${calBucket}`,
    `p${proteinBucket}`,
  ].join("|").toLowerCase();
}

function buildPrompt(profile: ProfileShape): string {
  const cuisineStr     = profile.cuisines.length > 0
    ? profile.cuisines.join(", ").replace(/_/g, " ")
    : "North Indian";
  const restrictionStr = profile.restrictions.length > 0
    ? `Avoid: ${profile.restrictions.join(", ").replace(/_/g, " ")}.`
    : "No restrictions.";

  return `You are a professional Indian dietitian. Generate a 7-day meal plan for this person:

- Goal: ${profile.goal.replace(/_/g, " ")}
- Daily calorie target: ${profile.daily_calories} kcal
- Daily protein target: ${profile.daily_protein}g
- Diet type: ${profile.diet_type.replace(/_/g, " ")}
- Preferred cuisines: ${cuisineStr}
- ${restrictionStr}

Rules:
- 3 meals per day: breakfast, lunch, dinner
- All meals must be Indian vegetarian recipes
- Each meal must match the cuisine preference
- Spread calories and protein evenly across meals
- Total daily calories must be within 100 kcal of the target
- Total daily protein must be within 10g of the target

Respond ONLY with valid JSON in this exact format, no extra text:
{
  "days": [
    {
      "day": 1,
      "meals": [
        { "type": "breakfast", "name": "meal name", "calories": 320, "protein": 14, "carbs": 48, "fat": 8 },
        { "type": "lunch", "name": "meal name", "calories": 480, "protein": 22, "carbs": 60, "fat": 12 },
        { "type": "dinner", "name": "meal name", "calories": 500, "protein": 24, "carbs": 55, "fat": 14 }
      ],
      "total_calories": 1300,
      "total_protein": 60
    }
  ]
}`;
}

Deno.serve(async (req) => {
  const pf = corsPreflight(req); if (pf) return pf;

  const g = await guard(req, "meal_plan");
  if (!g.ok) return g.response;

  try {
    const { data: profile, error: profileError } = await g.supabase
      .from("profiles")
      .select("goal, daily_calories, daily_protein, cuisines, diet_type, restrictions, age, weight_kg, kitchen_ingredients")
      .eq("id", g.userId)
      .single();

    if (profileError || !profile) return json({ error: "Profile not found" }, 404);

    const key = planCacheKey(profile as ProfileShape);

    // 1) Cache hit? Free.
    const cacheRes = await g.supabase
      .from("meal_plan_cache")
      .select("plan")
      .eq("cache_key", key)
      .maybeSingle();

    if (cacheRes.data?.plan) {
      const plan = cacheRes.data.plan;
      await g.supabase
        .from("meal_plans")
        .upsert(
          { user_id: g.userId, plan, generated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      await g.supabase.rpc("bump_meal_plan_cache_hits", { p_key: key });
      await g.markCacheHit({ cache_key: key });
      return json({ plan, cached: true });
    }

    // 2) Miss → log a pending row, then call OpenAI.
    const { recordOutcome } = g.start();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    let plan: unknown = FALLBACK_PLAN;
    let tokensIn  = 0;
    let tokensOut = 0;

    if (openaiKey) {
      try {
        const response = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model:           "gpt-4o-mini",
            messages:        [{ role: "user", content: buildPrompt(profile as ProfileShape) }],
            temperature:     0.7,
            response_format: { type: "json_object" },
          }),
        });
        const result  = await response.json();
        const content = result.choices?.[0]?.message?.content;
        tokensIn  = result.usage?.prompt_tokens     ?? 0;
        tokensOut = result.usage?.completion_tokens ?? 0;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed.days?.length === 7) plan = parsed;
        }
      } catch (err) {
        await recordOutcome({
          status: "openai_error",
          meta:   { error: String(err) },
        });
        return json({ error: "Could not generate plan, please try again" }, 502);
      }
    }

    // 3) Save: per-user plan + shared cache (best-effort).
    await g.supabase
      .from("meal_plans")
      .upsert(
        { user_id: g.userId, plan, generated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    if (g.admin) {
      await g.admin
        .from("meal_plan_cache")
        .upsert({ cache_key: key, plan, generated_at: new Date().toISOString() },
                { onConflict: "cache_key" });
    }

    await recordOutcome({
      status:     "success",
      tokens_in:  tokensIn,
      tokens_out: tokensOut,
      meta:       { cache_key: key },
    });

    return json({ plan, cached: false });
  } catch (err) {
    const r = asResponse(err); if (r) return r;
    console.error("generate-meal-plan error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
