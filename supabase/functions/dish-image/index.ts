import "@supabase/functions-js/edge-runtime.d.ts";
import { asResponse, corsPreflight, guard, json } from "../_shared/ai-guard.ts";

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";
const MODEL            = "gpt-image-1";
const BUCKET           = "dish-images";

// Mirrors toMealKey() on the client and get-recipe on the server, so all three
// address the same cache entry for a dish.
function mealKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

// Appetising but honest: this stands in for a real plate of home food, so no
// restaurant styling, no garnish the dish wouldn't have, no props that imply
// a fancier meal than the user is about to cook.
function buildPrompt(dish: string): string {
  return `A photograph of ${dish}, a home-cooked Indian dish, served in everyday Indian ` +
    `serviceware — a steel thali, katori or simple ceramic plate. Shot from a 45-degree angle ` +
    `on a plain neutral surface in soft natural daylight. Realistic home portion size, not a ` +
    `restaurant presentation. No text, no hands, no cutlery arrangement, no garnish the dish ` +
    `would not normally have. Clean, uncluttered background.`;
}

Deno.serve(async (req) => {
  const pf = corsPreflight(req); if (pf) return pf;

  // Reuses the recipe action's budget: an image is fetched in the same flow as
  // a recipe, and both are per-dish cached rather than per-user.
  const g = await guard(req, "recipe");
  if (!g.ok) return g.response;

  try {
    const { meal_name } = await req.json();
    if (!meal_name || typeof meal_name !== "string") {
      return json({ error: "meal_name required" }, 400);
    }

    const key = mealKey(meal_name);
    if (!key) return json({ error: "meal_name required" }, 400);

    // 1) Already generated for this dish? Free for everyone after the first.
    const existing = await g.supabase
      .from("recipes")
      .select("image_path")
      .eq("meal_key", key)
      .maybeSingle();

    if (existing.data?.image_path) {
      await g.markCacheHit({ meal_key: key, kind: "dish_image" });
      const { data: pub } = g.supabase.storage.from(BUCKET).getPublicUrl(existing.data.image_path);
      return json({ url: pub.publicUrl, cached: true });
    }

    // Writing to the shared bucket needs the service role; without it we can
    // generate but never persist, which would bill on every single render.
    if (!g.admin) {
      return json({ error: "Image cache unavailable" }, 503);
    }

    const { recordOutcome } = g.start();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await recordOutcome({ status: "openai_error", model: MODEL });
      return json({ error: "OpenAI not configured" }, 500);
    }

    let b64: string;
    try {
      const res = await fetch(OPENAI_IMAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model:   MODEL,
          prompt:  buildPrompt(meal_name),
          n:       1,
          size:    "1024x1024",
          quality: "low",          // plenty for a card thumbnail, and far cheaper
        }),
      });
      const result = await res.json();
      const image  = result.data?.[0]?.b64_json;
      if (!image) throw new Error(result.error?.message ?? "No image returned");
      b64 = image;
    } catch (err) {
      await recordOutcome({ status: "openai_error", model: MODEL, meta: { error: String(err) } });
      return json({ error: "Could not generate an image" }, 502);
    }

    const path  = `${key}.png`;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const upload = await g.admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });

    if (upload.error) {
      await recordOutcome({ status: "openai_error", model: MODEL, meta: { upload: upload.error.message } });
      return json({ error: "Could not store the image" }, 500);
    }

    // Record the path against the dish. The row may not exist yet if no one
    // has opened this recipe, so upsert rather than update.
    await g.admin
      .from("recipes")
      .upsert({ meal_key: key, name: meal_name, image_path: path }, { onConflict: "meal_key" });

    await recordOutcome({ status: "success", model: MODEL, meta: { meal_key: key, kind: "dish_image" } });

    const { data: pub } = g.supabase.storage.from(BUCKET).getPublicUrl(path);
    return json({ url: pub.publicUrl, cached: false });
  } catch (err) {
    const r = asResponse(err); if (r) return r;
    console.error("dish-image error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
