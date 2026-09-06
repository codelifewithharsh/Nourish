import "@supabase/functions-js/edge-runtime.d.ts";
import { asResponse, corsPreflight, guard, json } from "../_shared/ai-guard.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const FALLBACK_PLAN = {
  days: [
    { day: 1, meals: [
      { type: "breakfast", name: "Masala Oats",           calories: 320, protein: 14, carbs: 48, fat: 8, fibre: 8 },
      { type: "lunch",     name: "Dal Tadka with Rice",   calories: 480, protein: 18, carbs: 72, fat: 10, fibre: 11 },
      { type: "dinner",    name: "Paneer Bhurji with Roti", calories: 520, protein: 28, carbs: 44, fat: 18, fibre: 7 },
    ], total_calories: 1320, total_protein: 60 },
    { day: 2, meals: [
      { type: "breakfast", name: "Poha with Peanuts",     calories: 350, protein: 10, carbs: 58, fat: 9, fibre: 5 },
      { type: "lunch",     name: "Rajma Rice",            calories: 500, protein: 20, carbs: 78, fat: 8, fibre: 14 },
      { type: "dinner",    name: "Aloo Gobi with Paratha",calories: 490, protein: 12, carbs: 68, fat: 16, fibre: 9 },
    ], total_calories: 1340, total_protein: 42 },
    { day: 3, meals: [
      { type: "breakfast", name: "Besan Chilla",          calories: 280, protein: 16, carbs: 32, fat: 10, fibre: 7 },
      { type: "lunch",     name: "Chole Rice",            calories: 480, protein: 18, carbs: 72, fat: 10, fibre: 13 },
      { type: "dinner",    name: "Mixed Veg Curry with Rice", calories: 440, protein: 14, carbs: 66, fat: 10, fibre: 9 },
    ], total_calories: 1280, total_protein: 48 },
    { day: 4, meals: [
      { type: "breakfast", name: "Upma with Vegetables",  calories: 300, protein: 9,  carbs: 52, fat: 7, fibre: 6 },
      { type: "lunch",     name: "Palak Paneer with Roti",calories: 520, protein: 24, carbs: 46, fat: 20, fibre: 8 },
      { type: "dinner",    name: "Moong Dal Khichdi",     calories: 420, protein: 18, carbs: 64, fat: 8, fibre: 10 },
    ], total_calories: 1240, total_protein: 51 },
    { day: 5, meals: [
      { type: "breakfast", name: "Idli Sambar",           calories: 310, protein: 12, carbs: 56, fat: 5, fibre: 7 },
      { type: "lunch",     name: "Bhindi Masala with Dal Rice", calories: 490, protein: 16, carbs: 74, fat: 10, fibre: 12 },
      { type: "dinner",    name: "Tofu Stir Fry with Roti",calories: 480, protein: 26, carbs: 42, fat: 18, fibre: 9 },
    ], total_calories: 1280, total_protein: 54 },
    { day: 6, meals: [
      { type: "breakfast", name: "Dosa with Coconut Chutney", calories: 340, protein: 8,  carbs: 60, fat: 8, fibre: 4 },
      { type: "lunch",     name: "Matar Paneer with Rice",calories: 540, protein: 22, carbs: 70, fat: 16, fibre: 10 },
      { type: "dinner",    name: "Vegetable Pulao with Raita",calories: 460, protein: 14, carbs: 68, fat: 10, fibre: 8 },
    ], total_calories: 1340, total_protein: 44 },
    { day: 7, meals: [
      { type: "breakfast", name: "Sprouted Moong Salad",  calories: 220, protein: 14, carbs: 30, fat: 4, fibre: 11 },
      { type: "lunch",     name: "Kadai Paneer with Naan",calories: 580, protein: 26, carbs: 62, fat: 22, fibre: 8 },
      { type: "dinner",    name: "Dal Makhani with Rice", calories: 500, protein: 20, carbs: 72, fat: 12, fibre: 13 },
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
  kitchen_ingredients?: string | null;
  // All optional — collected progressively, so any of these may be null for
  // an existing user. Every consumer must degrade gracefully.
  region?:              string | null;
  meals_per_day?:       number | null;
  cooking_time?:        string | null;
  budget_tier?:         string | null;
  eats_out_frequency?:  string | null;
  allergies?:           string | null;
  medical_flags?:       string[] | null;
}

// Normalise free-text kitchen ingredients into a stable comma-separated list so
// "Paneer, Tomato " and "tomato,paneer" share the same cache key.
function normaliseIngredients(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(",")
    .slice(0, 200);
}

// Bucketing collapses near-identical profiles into a single cache key.
// Tightened from ±200 kcal / ±20g to ±100 kcal / ±10g — far more cache hits
// at the cost of a tiny accuracy loss the AI will absorb in its own ±100 kcal
// daily budget rule.
function planCacheKey(p: ProfileShape): string {
  const calBucket     = Math.round((p.daily_calories ?? 2000) / 100) * 100;
  const proteinBucket = Math.round((p.daily_protein  ?? 60)   / 10)  * 10;
  const cuisines      = [...(p.cuisines ?? [])].sort().join(",") || "north_indian";
  const restrictions  = [...(p.restrictions ?? [])].sort().join(",") || "none";
  const ingredients   = normaliseIngredients(p.kitchen_ingredients);
  // Anything that changes the generated plan must be part of the key.
  const region        = (p.region ?? "any").toLowerCase();
  const mealsPerDay   = p.meals_per_day ?? 3;
  const cookTime      = (p.cooking_time ?? "any").toLowerCase();
  const budget        = (p.budget_tier ?? "any").toLowerCase();
  const eatsOut       = (p.eats_out_frequency ?? "any").toLowerCase();
  const allergyKey    = normaliseIngredients(p.allergies) || "none";
  const medical       = [...(p.medical_flags ?? [])].sort().join(",") || "none";
  return [
    // Schema version. Plans cached before fibre was part of the output are
    // still valid JSON, so nothing would evict them — but they'd render with
    // no fibre. Bumping this retires them.
    "v2",
    p.goal      ?? "stay_healthy",
    p.diet_type ?? "vegetarian",
    cuisines,
    restrictions,
    `c${calBucket}`,
    `p${proteinBucket}`,
    ingredients ? `i:${ingredients}` : "i:none",
    `r:${region}`,
    `m:${mealsPerDay}`,
    `t:${cookTime}`,
    `b:${budget}`,
    `e:${eatsOut}`,
    `a:${allergyKey}`,
    `h:${medical}`,
  ].join("|").toLowerCase();
}

// Diet rule depends on what the user actually eats — non-veg users shouldn't
// be told "all meals must be vegetarian".
function dietRule(dietType: string): string {
  switch (dietType) {
    case "vegan":      return "All meals must be Indian vegan recipes (no dairy, no eggs, no honey).";
    case "eggetarian": return "All meals must be Indian vegetarian or egg-based recipes (no meat or fish).";
    case "non_veg":    return "Meals may include Indian chicken, fish, or egg dishes alongside vegetarian options.";
    case "pure_veg":
    default:           return "All meals must be Indian vegetarian recipes (no eggs, no meat, no fish).";
  }
}

const SYSTEM_PROMPT =
  "You are a professional Indian dietitian. You design realistic 7-day home-cooked meal plans " +
  "that match the user's body, goal, and pantry. You always return valid JSON only — no prose, no markdown.";

function buildUserPrompt(profile: ProfileShape): string {
  const mealsPerDay = profile.meals_per_day ?? 3;
  const mealsRule = mealsPerDay === 2
    ? "2 meals per day: lunch, dinner"
    : mealsPerDay >= 4
      ? "4 meals per day: breakfast, lunch, snack, dinner"
      : "3 meals per day: breakfast, lunch, dinner";
  const cuisineStr     = profile.cuisines.length > 0
    ? profile.cuisines.join(", ").replace(/_/g, " ")
    : "North Indian";
  const restrictionStr = profile.restrictions.length > 0
    ? `Avoid: ${profile.restrictions.join(", ").replace(/_/g, " ")}.`
    : "No restrictions.";
  const kitchenStr     = profile.kitchen_ingredients?.trim()
    ? `- Pantry on hand: ${profile.kitchen_ingredients.trim()}`
    : "";

  const pantryRule = profile.kitchen_ingredients?.trim()
    ? "- Lean toward meals that use the pantry items above; introduce 1–2 cheap additions per meal only if needed."
    : "";

  // Progressive fields. Each contributes a line only when we have it, so an
  // older profile produces exactly the prompt it did before.
  const extra: string[] = [];
  if (profile.region?.trim()) {
    extra.push(`- Home region: ${profile.region.replace(/_/g, " ")}. Favour dishes actually cooked in that region's kitchens over generic "Indian" food.`);
  }
  if (profile.cooking_time) {
    const t: Record<string, string> = {
      under_15: "Under 15 minutes per meal — assume a rushed weekday cook.",
      under_30: "Up to 30 minutes per meal.",
      relaxed:  "Time is not a constraint; slower dishes are fine.",
    };
    if (t[profile.cooking_time]) extra.push(`- Cooking time available: ${t[profile.cooking_time]}`);
  }
  if (profile.budget_tier) {
    const b: Record<string, string> = {
      economical: "Economical — build around dal, seasonal vegetables, and grains. Avoid paneer, nuts, and out-of-season produce as daily staples.",
      moderate:   "Moderate — paneer, curd, and nuts a few times a week is fine.",
      premium:    "Comfortable — no meaningful ingredient cost constraint.",
    };
    if (b[profile.budget_tier]) extra.push(`- Budget: ${b[profile.budget_tier]}`);
  }
  if (profile.eats_out_frequency) {
    const e: Record<string, string> = {
      rarely: "Rarely eats out — plan for home cooking every day.",
      weekly: "Eats out about once a week — keep one flexible lighter day.",
      often:  "Eats out several times a week — keep home meals lighter and protein-forward to balance restaurant days.",
    };
    if (e[profile.eats_out_frequency]) extra.push(`- Eating out: ${e[profile.eats_out_frequency]}`);
  }
  if (profile.allergies?.trim()) {
    extra.push(`- ALLERGIES — must never appear in any meal, in any form: ${profile.allergies.trim()}`);
  }
  if (profile.medical_flags && profile.medical_flags.length > 0) {
    const flags = profile.medical_flags.join(", ").replace(/_/g, " ");
    extra.push(
      `- Health considerations: ${flags}. Adapt the plan sensibly (for example lower-GI choices, less added sugar, less salt as relevant). ` +
      `Do not diagnose, do not reference medication, and do not claim to treat anything.`,
    );
  }
  const extraBlock = extra.length > 0 ? "\n" + extra.join("\n") : "";

  // The worked example must agree with mealsRule, or the model follows the
  // example and silently ignores the rule.
  const EXAMPLE_ROW: Record<string, string> = {
    breakfast: '        { "type": "breakfast", "name": "meal name", "calories": 320, "protein": 14, "carbs": 48, "fat": 8, "fibre": 6 }',
    lunch:     '        { "type": "lunch", "name": "meal name", "calories": 480, "protein": 22, "carbs": 60, "fat": 12, "fibre": 9 }',
    snack:     '        { "type": "snack", "name": "meal name", "calories": 180, "protein": 8, "carbs": 22, "fat": 6, "fibre": 3 }',
    dinner:    '        { "type": "dinner", "name": "meal name", "calories": 500, "protein": 24, "carbs": 55, "fat": 14, "fibre": 8 }',
  };
  const exampleTypes = mealsPerDay === 2
    ? ["lunch", "dinner"]
    : mealsPerDay >= 4
      ? ["breakfast", "lunch", "snack", "dinner"]
      : ["breakfast", "lunch", "dinner"];
  const mealExample = exampleTypes.map((t) => EXAMPLE_ROW[t]).join(",\n");

  return `Generate a 7-day meal plan for this person:

- Goal: ${profile.goal.replace(/_/g, " ")}
- Daily calorie target: ${profile.daily_calories} kcal
- Daily protein target: ${profile.daily_protein}g
- Diet type: ${profile.diet_type.replace(/_/g, " ")}
- Preferred cuisines: ${cuisineStr}
- ${restrictionStr}
${kitchenStr}${extraBlock}

Rules:
- ${mealsRule}
- ${dietRule(profile.diet_type)}
- Each meal must match the cuisine preference
- Spread calories and protein evenly across meals
- Total daily calories must be within 100 kcal of the target
- Total daily protein must be within 10g of the target
- Total daily fibre should reach at least 30g (ICMR/WHO adult guidance); dal, whole grains, sabzi and salad are what get you there
- Prioritise home-cooked, balanced Indian meals; never suggest deep-fried or nutritionally poor dishes such as Bhature, Puri, Samosa, Jalebi, Kachori, Vada Pav, or similar indulgent street food
${pantryRule}

Respond ONLY with valid JSON in this exact format, no extra text:
{
  "days": [
    {
      "day": 1,
      "meals": [
${mealExample}
      ],
      "total_calories": 1300,
      "total_protein": 60,
      "total_fibre": 30
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
      .select("goal, daily_calories, daily_protein, cuisines, diet_type, restrictions, kitchen_ingredients, region, meals_per_day, cooking_time, budget_tier, eats_out_frequency, allergies, medical_flags")
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
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user",   content: buildUserPrompt(profile as ProfileShape) },
            ],
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
