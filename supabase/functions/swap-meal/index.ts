import "@supabase/functions-js/edge-runtime.d.ts";
import { asResponse, corsPreflight, guard, json } from "../_shared/ai-guard.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT =
  "You are a professional Indian dietitian. You suggest realistic single-meal swaps " +
  "that match the user's diet, cuisine, and pantry. You always return valid JSON only — no prose.";

Deno.serve(async (req) => {
  const pf = corsPreflight(req); if (pf) return pf;

  const g = await guard(req, "swap");
  if (!g.ok) return g.response;

  try {
    const { mealType, currentMeal, mood, kitchenIngredients } = await req.json();

    const { data: profile } = await g.supabase
      .from("profiles")
      .select("goal, daily_calories, daily_protein, cuisines, diet_type, restrictions, kitchen_ingredients")
      .eq("id", g.userId)
      .single();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OpenAI not configured" }, 500);

    const cuisineStr = (profile?.cuisines ?? []).join(", ").replace(/_/g, " ") || "North Indian";
    const restrictionStr = (profile?.restrictions ?? []).length > 0
      ? `Avoid: ${(profile!.restrictions as string[]).join(", ").replace(/_/g, " ")}.`
      : "No restrictions.";
    const moodNote = mood === "light"
      ? "Make it lighter — lower calories, easy to digest."
      : mood === "hearty"
        ? "Make it hearty and filling — higher protein and calories."
        : mood === "quick"
          ? "Make it quick to prepare — simple ingredients, under 20 minutes."
          : "";
    const resolvedIngredients = (profile as unknown as { kitchen_ingredients?: string })?.kitchen_ingredients || kitchenIngredients;
    const ingredientNote = resolvedIngredients
      ? `Prefer using these available ingredients: ${resolvedIngredients}.`
      : "";

    const prompt = `Suggest ONE alternative ${mealType} meal.

Current meal being replaced: "${currentMeal}"
User profile:
- Diet: ${profile?.diet_type?.replace(/_/g, " ") ?? "pure veg"}
- Cuisines: ${cuisineStr}
- ${restrictionStr}
- Calorie target: ~${profile?.daily_calories ? Math.round(profile.daily_calories / 3) : 450} kcal for this meal
- Protein target: ~${profile?.daily_protein ? Math.round(profile.daily_protein / 3) : 30}g for this meal

Mood preference: ${moodNote || "balanced"}
${ingredientNote}

Rules:
- Must be different from "${currentMeal}"
- Must be a real Indian recipe
- All numbers must be integers

Respond ONLY with valid JSON:
{
  "name": "meal name",
  "calories": 000,
  "protein": 00,
  "carbs": 00,
  "fat": 00,
  "reason": "one sentence why this is a great swap"
}`;

    // Swaps are user-driven and creative — no cache lookup; every call hits AI.
    const { recordOutcome } = g.start();

    let meal: Record<string, unknown>;
    let tokensIn  = 0;
    let tokensOut = 0;
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
            { role: "user",   content: prompt },
          ],
          temperature:     0.7,
          response_format: { type: "json_object" },
        }),
      });
      const result  = await response.json();
      const content = result.choices?.[0]?.message?.content;
      tokensIn  = result.usage?.prompt_tokens     ?? 0;
      tokensOut = result.usage?.completion_tokens ?? 0;
      if (!content) throw new Error("No response from OpenAI");
      meal = JSON.parse(content);
    } catch (err) {
      await recordOutcome({ status: "openai_error", meta: { error: String(err) } });
      return json({ error: "Could not find a swap, please try again" }, 502);
    }

    await recordOutcome({
      status:     "success",
      tokens_in:  tokensIn,
      tokens_out: tokensOut,
      meta:       { meal_type: mealType, mood: mood ?? null },
    });

    return json(meal);
  } catch (err) {
    const r = asResponse(err); if (r) return r;
    console.error("swap-meal error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
