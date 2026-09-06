import "@supabase/functions-js/edge-runtime.d.ts";
import { asResponse, corsPreflight, guard, json } from "../_shared/ai-guard.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL          = "gpt-4o-mini";

// Vision-model estimate of an Indian plate.
//
// Two things drive accuracy here, and both are Indian-specific:
//   1. Decompose the plate. A thali is 4-8 separate foods; one blended guess
//      for "thali" is useless. Every katori is its own item.
//   2. Portion size is the dominant source of calorie error in every
//      photo-calorie app (identification is ~80% accurate, portions can be
//      under 40%). Standard Indian serviceware has known dimensions, so we
//      tell the model to scale off a katori / roti / plate rim rather than
//      guessing volume from a flat image.
const SYSTEM_PROMPT =
  "You are a precise Indian nutrition expert reading a photograph of a meal. " +
  "You identify every distinct food on the plate and estimate the portion of each " +
  "using standard Indian serviceware as a size reference: a katori is ~150ml, " +
  "a roti is ~15cm across, a standard thali plate is ~28cm, a teaspoon of oil is ~5ml. " +
  "You account for cooking oil and ghee, which are the largest hidden calorie source " +
  "in Indian home cooking — a dal tadka is not a dry dal. " +
  "You are honest about uncertainty and never invent foods you cannot see. " +
  "You always return valid JSON only — no prose, no markdown.";

const USER_PROMPT = `Identify every distinct food item in this photo and estimate its nutrition.

Return ONLY valid JSON in exactly this shape:

{
  "items": [
    {
      "item": "Roti",
      "portion": "2 pieces",
      "calories": 240,
      "protein": 8,
      "carbs": 46,
      "fat": 3,
      "fibre": 4,
      "sugar": 1,
      "sodium": 180,
      "sat_fat": 1,
      "confidence": 0.9
    }
  ],
  "meal_name": "short human label for the whole plate",
  "notes": "one short sentence, or null"
}

Rules:
- One entry per distinct food. Break a thali into its components; never emit a single "thali" row.
- Estimate each portion against the serviceware references above.
- Include cooking oil/ghee in the numbers for each dish.
- All nutrient values are integers. sodium is in milligrams; everything else in grams.
- confidence is 0 to 1, per item. Use a low value when the food is ambiguous or partly hidden.
- meal_name is a short label a person would recognise, e.g. "Rajma chawal with salad".
- notes: mention only what materially affects the estimate (e.g. "oil content unclear"), else null.
- If the photo contains no food at all, return {"items": [], "meal_name": null, "notes": "no food detected"}.`;

interface PhotoItem {
  item:       string;
  portion:    string;
  calories:   number;
  protein:    number;
  carbs:      number;
  fat:        number;
  fibre:      number;
  sugar:      number;
  sodium:     number;
  sat_fat:    number;
  confidence: number;
}

const int = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

function sanitiseItem(raw: Record<string, unknown>): PhotoItem {
  const rawConf = Number(raw.confidence);
  return {
    item:       String(raw.item ?? "Unknown").slice(0, 80),
    portion:    String(raw.portion ?? "").slice(0, 60),
    calories:   int(raw.calories),
    protein:    int(raw.protein),
    carbs:      int(raw.carbs),
    fat:        int(raw.fat),
    fibre:      int(raw.fibre),
    sugar:      int(raw.sugar),
    sodium:     int(raw.sodium),
    sat_fat:    int(raw.sat_fat),
    confidence: Number.isFinite(rawConf) ? Math.min(1, Math.max(0, rawConf)) : 0.5,
  };
}

Deno.serve(async (req) => {
  const pf = corsPreflight(req); if (pf) return pf;

  const g = await guard(req, "photo");
  if (!g.ok) return g.response;

  try {
    const { image_base64, mime_type } = await req.json();
    if (!image_base64 || typeof image_base64 !== "string") {
      return json({ error: "image_base64 required" }, 400);
    }

    // The client downscales before upload; this is a backstop against a
    // malformed or hostile payload rather than a normal-path limit.
    // base64 inflates by ~4/3, so 8 MB of base64 ≈ 6 MB of image.
    if (image_base64.length > 8_000_000) {
      return json({ error: "Image too large — please try again" }, 413);
    }

    const mime = typeof mime_type === "string" && mime_type.startsWith("image/")
      ? mime_type
      : "image/jpeg";

    // No cache lookup: every photo is unique, so a photo-level cache would
    // never hit. Per-item macros still flow through nutrition_cache on the
    // client side when an item is confirmed.
    const { recordOutcome } = g.start();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await recordOutcome({ status: "openai_error", model: MODEL });
      return json({ error: "OpenAI not configured" }, 500);
    }

    let parsed: { items?: unknown[]; meal_name?: unknown; notes?: unknown };
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
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: USER_PROMPT },
                {
                  type: "image_url",
                  // "low" detail keeps this at a fixed ~85 tokens per image.
                  // Plates are large subjects; high detail costs far more and
                  // does not measurably improve dish identification.
                  image_url: { url: `data:${mime};base64,${image_base64}`, detail: "low" },
                },
              ],
            },
          ],
          temperature:     0.2,
          response_format: { type: "json_object" },
        }),
      });

      const result  = await response.json();
      const content = result.choices?.[0]?.message?.content;
      tokensIn  = result.usage?.prompt_tokens     ?? 0;
      tokensOut = result.usage?.completion_tokens ?? 0;
      if (!content) throw new Error(result.error?.message ?? "No response from OpenAI");
      parsed = JSON.parse(content);
    } catch (err) {
      await recordOutcome({
        status: "openai_error",
        model:  MODEL,
        meta:   { error: String(err) },
      });
      return json({ error: "Could not read that photo, please try again" }, 502);
    }

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
          .slice(0, 12)                       // guard against a runaway response
          .map(sanitiseItem)
          .filter((i) => i.calories > 0)
      : [];

    if (items.length === 0) {
      await recordOutcome({
        status:     "success",
        tokens_in:  tokensIn,
        tokens_out: tokensOut,
        model:      MODEL,
        meta:       { items: 0, no_food: true },
      });
      return json({
        items:     [],
        total:     { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugar: 0, sodium: 0, sat_fat: 0 },
        meal_name: null,
        notes:     "We couldn't spot any food in that photo — try again with the plate in frame.",
      });
    }

    const sum = (k: keyof PhotoItem) =>
      items.reduce((n, i) => n + (i[k] as number), 0);

    const total = {
      calories: sum("calories"),
      protein:  sum("protein"),
      carbs:    sum("carbs"),
      fat:      sum("fat"),
      fibre:    sum("fibre"),
      sugar:    sum("sugar"),
      sodium:   sum("sodium"),
      sat_fat:  sum("sat_fat"),
    };

    // Surfaced so the UI can ask for a retake instead of silently logging a
    // low-quality guess.
    const avgConfidence = items.reduce((n, i) => n + i.confidence, 0) / items.length;

    await recordOutcome({
      status:     "success",
      tokens_in:  tokensIn,
      tokens_out: tokensOut,
      model:      MODEL,
      meta:       { items: items.length, avg_confidence: Number(avgConfidence.toFixed(2)) },
    });

    return json({
      items,
      total,
      meal_name:      typeof parsed.meal_name === "string" ? parsed.meal_name.slice(0, 100) : null,
      notes:          typeof parsed.notes === "string" ? parsed.notes.slice(0, 200) : null,
      avg_confidence: Number(avgConfidence.toFixed(2)),
    });
  } catch (err) {
    const r = asResponse(err); if (r) return r;
    console.error("lookup-nutrition-photo error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
