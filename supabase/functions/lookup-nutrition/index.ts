import "@supabase/functions-js/edge-runtime.d.ts";
import { asResponse, corsPreflight, guard, json } from "../_shared/ai-guard.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// "1 medium Bowl of  rajma! "  → "rajma"
// Strips numbers/units so "1 bowl rajma" and "rajma" share a cache entry.
function nutritionCacheKey(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d+(\.\d+)?\b/g, " ")
    .replace(/\b(small|medium|large|bowl|bowls|plate|plates|piece|pieces|cup|cups|tbsp|tsp|g|gm|gms|ml|l|kg)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

Deno.serve(async (req) => {
  const pf = corsPreflight(req); if (pf) return pf;

  const g = await guard(req, "nutrition");
  if (!g.ok) return g.response;

  try {
    const { query } = await req.json();
    if (!query) return json({ error: "query required" }, 400);

    const key = nutritionCacheKey(query);

    // 1) Cache hit → free.
    if (key) {
      const cacheRes = await g.supabase
        .from("nutrition_cache")
        .select("*")
        .eq("query_key", key)
        .maybeSingle();
      if (cacheRes.data) {
        g.supabase.rpc("bump_nutrition_cache_hits", { p_key: key }).then(() => {});
        await g.markCacheHit({ query_key: key });
        return json({
          name:     cacheRes.data.name,
          calories: cacheRes.data.calories,
          protein:  cacheRes.data.protein,
          carbs:    cacheRes.data.carbs,
          fat:      cacheRes.data.fat,
          serving:  cacheRes.data.serving,
          cached:   true,
        });
      }
    }

    // 2) Miss → reserve credits, then call OpenAI.
    const { recordOutcome } = await g.charge();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await recordOutcome({ status: "openai_error", refund: true });
      return json({ error: "OpenAI not configured" }, 500);
    }

    const prompt = `You are a precise Indian nutrition expert. The user ate: "${query}"

Return ONLY valid JSON with the nutritional information. Estimate for a standard Indian serving size if quantity is not specified.

{
  "name": "clean dish name",
  "calories": 000,
  "protein": 00,
  "carbs": 00,
  "fat": 00,
  "serving": "description of serving size assumed"
}

Rules:
- Use standard Indian recipe nutritional values
- All numbers must be integers
- name should be clean and properly capitalized
- serving should be brief, e.g. "1 medium bowl", "2 pieces"`;

    let nutrition: { name: string; calories: number; protein: number; carbs: number; fat: number; serving?: string };
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
          model:           "gpt-4o-mini",
          messages:        [{ role: "user", content: prompt }],
          temperature:     0.3,
          response_format: { type: "json_object" },
        }),
      });
      const result  = await response.json();
      const content = result.choices?.[0]?.message?.content;
      tokensIn  = result.usage?.prompt_tokens     ?? 0;
      tokensOut = result.usage?.completion_tokens ?? 0;
      if (!content) throw new Error("No response from OpenAI");
      nutrition = JSON.parse(content);
    } catch (err) {
      await recordOutcome({ status: "openai_error", refund: true, meta: { error: String(err) } });
      return json({ error: "Could not look up nutrition, credits refunded" }, 502);
    }

    // 3) Persist to cache (best-effort, needs admin client; falls back silently).
    if (key && g.admin) {
      await g.admin.from("nutrition_cache").upsert({
        query_key: key,
        name:      nutrition.name,
        calories:  Math.round(nutrition.calories ?? 0),
        protein:   Math.round(nutrition.protein  ?? 0),
        carbs:     Math.round(nutrition.carbs    ?? 0),
        fat:       Math.round(nutrition.fat      ?? 0),
        serving:   nutrition.serving ?? null,
      }, { onConflict: "query_key" });
    }

    await recordOutcome({
      status:     "success",
      tokens_in:  tokensIn,
      tokens_out: tokensOut,
      meta:       { query_key: key },
    });

    return json(nutrition);
  } catch (err) {
    const r = asResponse(err); if (r) return r;
    console.error("lookup-nutrition error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
