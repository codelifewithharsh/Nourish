"""Prompts under test.

Most prompts ask the model for calories directly. "Grounded" prompts
(grounded=True) ask only for raw ingredient grams; run.py then computes
calories and protein in code from data/ingredients.csv (IFCT/NIN values).

"v1_app" is copied VERBATIM from supabase/functions/lookup-nutrition/index.ts —
if the app's prompt changes, update it here, or the eval is testing something
users never see. Later experiments (Phase 4) add new versions alongside it.
"""

import csv
from pathlib import Path

# The only ingredient names a grounded answer may use — the rows of
# ingredients.csv. A vocabulary (names, no quantities or values), so it gives
# the model no part of the answer key.
with open(Path(__file__).parent / "data" / "ingredients.csv") as _f:
    INGREDIENT_NAMES = [row["name"] for row in csv.DictReader(_f)]

# Strict JSON schema: the API guarantees the reply matches it, so the model
# cannot invent an ingredient name we can't look up.
GROUNDED_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "serving", "items"],
    "properties": {
        "name": {"type": "string"},
        "serving": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["item", "count", "raw_ingredients_per_unit"],
                "properties": {
                    "item": {"type": "string"},
                    "count": {"type": "number"},
                    "raw_ingredients_per_unit": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["ingredient", "grams"],
                            "properties": {
                                "ingredient": {"type": "string", "enum": INGREDIENT_NAMES},
                                "grams": {"type": "number"},
                            },
                        },
                    },
                },
            },
        },
    },
}

PROMPTS = {
    "v1_app": {
        "system": (
            "You are a precise Indian nutrition expert. You estimate calories and macros for Indian dishes "
            "using standard recipe values. You always return valid JSON only — no prose, no markdown."
        ),
        "user": """The user ate: "{query}"

Return ONLY valid JSON with the nutritional information. Estimate for a standard Indian serving size if quantity is not specified.

{{
  "name": "clean dish name",
  "calories": 000,
  "protein": 00,
  "carbs": 00,
  "fat": 00,
  "serving": "description of serving size assumed"
}}

Rules:
- Use standard Indian recipe nutritional values
- All numbers must be integers
- name should be clean and properly capitalized
- serving should be brief, e.g. "1 medium bowl", "2 pieces\"""",
    },

    # Experiment B: same model, make the model show its working.
    # Hypothesis: listing raw ingredients per unit, then multiplying by the
    # quantity, fixes quantity scaling (explicit × 3) and protein inflation
    # (oil/ghee and water become visible as separate lines).
    #
    # Deliberately NOT included: our own katori sizes or IFCT values. Putting the
    # answer key's assumptions in the prompt would raise the score without making
    # the app better for users — that's overfitting to the eval.
    "v2_decompose": {
        "system": (
            "You are a precise Indian nutrition expert. You estimate calories and macros for Indian dishes "
            "using standard recipe values. You always return valid JSON only — no prose, no markdown."
        ),
        "user": """The user ate: "{query}"

Work it out step by step inside the JSON:
1. Split the meal into separate items, each with a count (e.g. "2 besan chilla" → item "besan chilla", count 2). If no quantity is given, assume 1 standard Indian home serving.
2. For ONE unit of each item, list its raw ingredients with grams (flour, dry dal, rice, oil, ghee, paneer, vegetables).
3. From those raw ingredients, compute calories and protein for ONE unit.
4. Multiply by the count to get each item's total.
5. Add up all items for the meal total.

Return ONLY this JSON:
{{
  "items": [
    {{
      "item": "besan chilla",
      "count": 2,
      "unit": "medium chilla",
      "raw_ingredients_per_unit": [{{"ingredient": "...", "grams": 0}}],
      "calories_per_unit": 000,
      "protein_per_unit": 0.0,
      "calories_total": 000,
      "protein_total": 0.0
    }}
  ],
  "name": "clean dish name",
  "calories": 000,
  "protein": 00,
  "carbs": 00,
  "fat": 00,
  "serving": "description of serving size assumed"
}}

Rules:
- "calories" and "protein" at the top level are the meal totals: the sum of the items' totals
- Top-level numbers must be integers
- name should be clean and properly capitalized
- serving should be brief, e.g. "2 medium chilla", "1 bowl\"""",
    },

    # Part B: grounding. The model estimates WHAT and HOW MUCH (raw grams);
    # code supplies the nutrition facts (IFCT) and does the arithmetic.
    # Hypothesis: protein improves, because the model can no longer misremember
    # how much protein dal has. Its grams are saved, so we can also see whether
    # the remaining error is portion size.
    "v3_grounded": {
        "grounded": True,
        "schema": GROUNDED_SCHEMA,
        "system": (
            "You are a precise Indian home-cooking expert. You break Indian meals down into the raw, "
            "uncooked ingredients that went into them, with realistic weights."
        ),
        "user": """The user ate: "{query}"

1. Split the meal into separate items, each with a count. If no quantity is given, assume 1 standard Indian home serving.
2. For ONE unit of each item, list the raw, uncooked ingredients and their weight in grams: dry flour, dry dal, raw rice, oil, ghee, paneer, vegetables, and so on. Include cooking fat.
3. Use only ingredient names from the allowed list. Pick the closest one; leave out anything not on the list.

Do not calculate calories or protein — only ingredients and grams.

Also give a clean dish name and a brief description of the serving size you assumed.""",
    },
}
