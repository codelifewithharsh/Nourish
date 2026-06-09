import "@supabase/functions-js/edge-runtime.d.ts";
import { asResponse, corsPreflight, guard, json } from "../_shared/ai-guard.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT =
  "You are a warm Indian home-cook and dietitian. You write authentic Indian recipe cards with " +
  "household measurements and short clear steps. You always return valid JSON only — no prose.";

// Build deterministic search URLs from the meal name so we don't waste AI
// tokens asking for fake links. These actually work, unlike invented ones.
function buildDiscoveryUrls(mealName: string): { instagram_url: string; youtube_url: string } {
  const q = encodeURIComponent(`${mealName} recipe`);
  const tag = encodeURIComponent(
    mealName.toLowerCase().replace(/[^a-z0-9]+/g, ""),
  );
  return {
    instagram_url: `https://www.instagram.com/explore/tags/${tag}/`,
    youtube_url:   `https://www.youtube.com/results?search_query=${q}`,
  };
}

// "Paneer Bhurji Wrap!" → "paneer-bhurji-wrap"
function toMealKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

Deno.serve(async (req) => {
  const pf = corsPreflight(req); if (pf) return pf;

  const g = await guard(req, "recipe");
  if (!g.ok) return g.response;

  try {
    const body = await req.json();
    const mealName: string = (body?.meal_name ?? "").trim();
    if (!mealName) return json({ error: "meal_name required" }, 400);

    const mealKey = toMealKey(mealName);
    if (!mealKey) return json({ error: "invalid meal_name" }, 400);

    // 1) Global cache hit → free.
    const cacheRes = await g.supabase
      .from("recipes")
      .select("*")
      .eq("meal_key", mealKey)
      .maybeSingle();

    if (cacheRes.data) {
      // Best-effort views increment; ignore failures.
      g.supabase.from("recipes")
        .update({ views: (cacheRes.data.views ?? 0) + 1 })
        .eq("meal_key", mealKey)
        .then(() => {});
      await g.markCacheHit({ meal_key: mealKey });
      return json({ recipe: cacheRes.data, cached: true });
    }
    const tableMissing = cacheRes.error?.code === "42P01"
      || (cacheRes.error?.message ?? "").toLowerCase().includes("does not exist");

    // 2) Miss → log a pending row, then call OpenAI.
    const { recordOutcome } = g.start();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await recordOutcome({ status: "openai_error" });
      return json({ error: "OpenAI not configured" }, 500);
    }

    // Pull user context so the chef tip can feel personal.
    const { data: profile } = await g.supabase
      .from("profiles")
      .select("goal, daily_calories, daily_protein, diet_type, restrictions, kitchen_ingredients")
      .eq("id", g.userId)
      .single();

    const restrictionStr = (profile?.restrictions ?? []).length > 0
      ? `Avoid: ${(profile!.restrictions as string[]).join(", ").replace(/_/g, " ")}.`
      : "No restrictions.";

    const prompt = `Write a complete recipe card for "${mealName}".

Context about the cook:
- Goal: ${profile?.goal?.replace(/_/g, " ") ?? "stay healthy"}
- Diet: ${profile?.diet_type?.replace(/_/g, " ") ?? "vegetarian"}
- ${restrictionStr}

Rules:
- Real, authentic Indian recipe — no Westernized adaptations.
- Ingredients use household quantities (cups, tsp, tbsp, pieces).
- 4–7 steps. Each step is a single action, not a paragraph.
- The tagline reads like a friend describing the dish in 12 words or less.
- The chef_tip is one specific, non-obvious cooking insight (technique, timing, ratio).
- hero_emoji must be ONE single food-related emoji that visually represents the dish.
- difficulty is one of: easy, medium, hard.

Respond ONLY with valid JSON in this exact shape:
{
  "name": "${mealName}",
  "tagline": "string",
  "hero_emoji": "🍛",
  "prep_minutes": 20,
  "difficulty": "easy",
  "serves": 1,
  "ingredients": [
    { "name": "paneer", "quantity": "100", "unit": "g" },
    { "name": "onion", "quantity": "1", "unit": "small" }
  ],
  "steps": [
    { "n": 1, "title": "Prep", "body": "Dice onion finely and grate ginger.", "minutes": 3 }
  ],
  "chef_tip": "string"
}`;

    let parsed: Record<string, unknown>;
    let tokensIn  = 0;
    let tokensOut = 0;
    try {
      const ai = await fetch(OPENAI_API_URL, {
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
      const aiJson  = await ai.json();
      const content = aiJson.choices?.[0]?.message?.content;
      tokensIn  = aiJson.usage?.prompt_tokens     ?? 0;
      tokensOut = aiJson.usage?.completion_tokens ?? 0;
      if (!content) throw new Error("No response from OpenAI");
      parsed = JSON.parse(content);
    } catch (err) {
      await recordOutcome({ status: "openai_error", meta: { error: String(err) } });
      return json({ error: "Could not generate recipe, please try again" }, 502);
    }

    const discovery = buildDiscoveryUrls((parsed.name as string) ?? mealName);
    const toSave = {
      meal_key:       mealKey,
      name:           parsed.name ?? mealName,
      tagline:        parsed.tagline ?? null,
      hero_emoji:     parsed.hero_emoji ?? "🍽️",
      prep_minutes:   Number(parsed.prep_minutes) || 20,
      difficulty:     parsed.difficulty ?? "easy",
      serves:         Number(parsed.serves) || 1,
      ingredients:    parsed.ingredients ?? [],
      steps:          parsed.steps ?? [],
      chef_tip:       parsed.chef_tip ?? null,
      creator_handle: null,
      instagram_url:  discovery.instagram_url,
      youtube_url:    discovery.youtube_url,
      views:          1,
    };

    if (tableMissing) {
      await recordOutcome({ status: "success", tokens_in: tokensIn, tokens_out: tokensOut, meta: { warning: "recipes table missing" } });
      return json({ recipe: toSave, cached: false, warning: "recipes table missing" });
    }
    if (!g.admin) {
      await recordOutcome({ status: "success", tokens_in: tokensIn, tokens_out: tokensOut, meta: { warning: "no service role" } });
      return json({ recipe: toSave, cached: false, warning: "no service role" });
    }

    const upsertRes = await g.admin
      .from("recipes")
      .upsert(toSave, { onConflict: "meal_key" })
      .select()
      .single();

    await recordOutcome({
      status:     "success",
      tokens_in:  tokensIn,
      tokens_out: tokensOut,
      meta:       { meal_key: mealKey },
    });

    return json({ recipe: upsertRes.data ?? toSave, cached: false });
  } catch (err) {
    const r = asResponse(err); if (r) return r;
    console.error("get-recipe error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
