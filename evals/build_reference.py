"""Turn dish recipes into reference macros.

  data/ingredients.csv  (per-100g values)  ─┐
                                            ├─►  data/reference.csv
  data/dishes.csv       (recipes in grams) ─┘

reference.csv is generated — edit the two inputs, never the output.

Run:  uv run python build_reference.py
"""
import csv
from pathlib import Path

DATA = Path(__file__).parent / "data"


def load_ingredients() -> dict[str, dict]:
    with open(DATA / "ingredients.csv") as f:
        return {row["name"]: row for row in csv.DictReader(f)}


def parse_recipe(text: str) -> list[tuple[str, float]]:
    """'atta:35; ghee:5' → [('atta', 35.0), ('ghee', 5.0)]"""
    parts = [p.strip() for p in text.split(";") if p.strip()]
    return [(name.strip(), float(grams)) for name, grams in (p.split(":") for p in parts)]


def macros_for(recipe: list[tuple[str, float]], ingredients: dict) -> tuple[float, float]:
    kcal = protein = 0.0
    for name, grams in recipe:
        if name not in ingredients:
            raise SystemExit(f"Unknown ingredient '{name}' — add it to ingredients.csv")
        ing = ingredients[name]
        kcal += grams * float(ing["kcal_per_100g"]) / 100
        protein += grams * float(ing["protein_per_100g"]) / 100
    return kcal, protein


def main() -> None:
    ingredients = load_ingredients()
    with open(DATA / "dishes.csv") as f:
        dishes = list(csv.DictReader(f))

    rows = []
    for d in dishes:
        kcal, protein = macros_for(parse_recipe(d["recipe_raw_grams"]), ingredients)
        rows.append({
            "id": d["id"],
            "query": d["query"],
            "category": d["category"],
            "ref_kcal": round(kcal),
            "ref_protein_g": round(protein, 1),
            "band_pct": d["band_pct"],
        })

    with open(DATA / "reference.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"{'id':<22}{'query':<34}{'kcal':>6}{'protein':>9}{'band':>7}")
    for r in rows:
        print(f"{r['id']:<22}{r['query']:<34}{r['ref_kcal']:>6}{r['ref_protein_g']:>8}g{'±' + r['band_pct'] + '%':>7}")
    print(f"\n{len(rows)} dishes → data/reference.csv")


if __name__ == "__main__":
    main()
