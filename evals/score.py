"""Phase 3 — score a saved run against the reference and write a report.

No model calls: this only reads results/*.jsonl and data/reference.csv, so it
is free and can be re-run whenever the reference or the scoring rules change.

Run:  uv run python score.py                        # latest run
      uv run python score.py results/<run>.jsonl    # a specific run

Output: results/<run>_report.md      (for humans)
        results/<run>_summary.json   (headline numbers, for comparing runs)
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from statistics import median

from build_reference import parse_recipe

ROOT = Path(__file__).parent

# Protein amounts are small, so % error is harsh on them: 3g vs 3.7g is 19% off
# but only 0.7g. A protein answer passes if it's inside the band OR within this.
PROTEIN_ABS_TOLERANCE_G = 2.0

# (smaller, larger) dish ids. The expected ratio comes from the reference itself.
QUANTITY_PAIRS = [("roti_1", "roti_3"), ("rice_1", "rice_2"), ("idli_2", "idli_4")]

# A dish is "unstable" if its repeated answers spread wider than this.
UNSTABLE_SPREAD = 0.15


# ── scoring one answer ────────────────────────────────────────────────────────

def pct_error(predicted: float, reference: float) -> float:
    """Signed: +0.25 means 25% too high, -0.25 means 25% too low."""
    return (predicted - reference) / reference


def score_call(call: dict, ref: dict) -> dict:
    band = float(ref["band_pct"]) / 100
    ref_kcal, ref_protein = float(ref["ref_kcal"]), float(ref["ref_protein_g"])
    kcal, protein = call.get("calories"), call.get("protein")

    # No usable number (API error, bad JSON, missing field) = a failed answer.
    # It counts against the pass rate; it doesn't silently disappear.
    if not isinstance(kcal, (int, float)) or not isinstance(protein, (int, float)):
        return {"valid": False, "kcal_pass": False, "protein_pass": False}

    kcal_err = pct_error(kcal, ref_kcal)
    protein_err = pct_error(protein, ref_protein)
    return {
        "valid": True,
        "kcal": kcal,
        "protein": protein,
        "kcal_err": kcal_err,
        "protein_err": protein_err,
        "kcal_pass": abs(kcal_err) <= band,
        "protein_pass": abs(protein_err) <= band or abs(protein - ref_protein) <= PROTEIN_ABS_TOLERANCE_G,
    }


# ── small helpers ─────────────────────────────────────────────────────────────

def rate(items: list[bool]) -> float:
    return sum(items) / len(items) if items else 0.0


def pct(x: float, signed: bool = False) -> str:
    return f"{x * 100:+.0f}%" if signed else f"{x * 100:.0f}%"


def latest_run() -> Path:
    runs = sorted((ROOT / "results").glob("*.jsonl"))
    if not runs:
        sys.exit("No runs in results/ — run `uv run python run.py` first.")
    return runs[-1]


# ── main ──────────────────────────────────────────────────────────────────────

def analyse(run_path: Path) -> dict:
    """Score one run. Returns summary, per-dish, per-category and scaling results."""
    calls = [json.loads(line) for line in open(run_path)]
    with open(ROOT / "data" / "reference.csv") as f:
        refs = {row["id"]: row for row in csv.DictReader(f)}

    # Score every call, then group by dish.
    scored = []
    by_dish: dict[str, list[dict]] = defaultdict(list)
    for call in calls:
        s = score_call(call, refs[call["dish_id"]]) | {"dish_id": call["dish_id"]}
        scored.append(s)
        by_dish[call["dish_id"]].append(s)
    valid = [s for s in scored if s["valid"]]

    # Headline numbers — over every call, not every dish.
    summary = {
        "run": run_path.stem,
        "model": calls[0]["model"],
        "prompt": calls[0]["prompt"],
        "calls": len(scored),
        "valid_rate": rate([s["valid"] for s in scored]),
        "kcal_pass_rate": rate([s["kcal_pass"] for s in scored]),
        "protein_pass_rate": rate([s["protein_pass"] for s in scored]),
        "kcal_median_abs_err": median(abs(s["kcal_err"]) for s in valid),
        "protein_median_abs_err": median(abs(s["protein_err"]) for s in valid),
        "kcal_bias": median(s["kcal_err"] for s in valid),
        "protein_bias": median(s["protein_err"] for s in valid),
        "cost_usd": sum(c.get("cost_usd") or 0 for c in calls),
        "latency_median_s": median(c["latency_s"] for c in calls if "latency_s" in c),
    }

    # Per-dish view: median of the repeats is the dish's "answer".
    dishes = []
    for dish_id, ss in by_dish.items():
        ref = refs[dish_id]
        good = [s for s in ss if s["valid"]]
        kcals = [s["kcal"] for s in good]
        dishes.append({
            "id": dish_id,
            "query": ref["query"],
            "category": ref["category"],
            "ref_kcal": float(ref["ref_kcal"]),
            "ref_protein": float(ref["ref_protein_g"]),
            "band": float(ref["band_pct"]),
            "kcals": kcals,
            "proteins": [s["protein"] for s in good],
            "kcal_err": median(s["kcal_err"] for s in good) if good else None,
            "protein_err": median(s["protein_err"] for s in good) if good else None,
            "kcal_passes": sum(s["kcal_pass"] for s in ss),
            "protein_passes": sum(s["protein_pass"] for s in ss),
            "repeats": len(ss),
            # Spread of repeated answers relative to their middle value.
            "spread": (max(kcals) - min(kcals)) / median(kcals) if kcals else None,
        })

    # Category breakdown.
    categories = {}
    for cat in ["single", "quantity", "messy"]:
        ss = [s for s in scored if refs[s["dish_id"]]["category"] == cat]
        categories[cat] = {
            "dishes": len({s["dish_id"] for s in ss}),
            "kcal_pass": rate([s["kcal_pass"] for s in ss]),
            "protein_pass": rate([s["protein_pass"] for s in ss]),
        }

    # Quantity scaling: does the model's ratio match the reference's ratio?
    dish_by_id = {d["id"]: d for d in dishes}
    scaling = []
    for small, large in QUANTITY_PAIRS:
        a, b = dish_by_id.get(small), dish_by_id.get(large)
        if not a or not b or not a["kcals"] or not b["kcals"]:
            continue
        expected = b["ref_kcal"] / a["ref_kcal"]
        actual = median(b["kcals"]) / median(a["kcals"])
        scaling.append({"pair": f"{a['query']} → {b['query']}", "expected": expected,
                        "actual": actual, "off": pct_error(actual, expected)})
    summary["scaling_median_abs_err"] = median(abs(s["off"]) for s in scaling) if scaling else None
    summary["quantity_kcal_pass_rate"] = categories["quantity"]["kcal_pass"]

    return {"summary": summary, "dishes": dishes, "categories": categories, "scaling": scaling,
            "grams": grams_diagnosis(calls)}


# Ghee and oil are both pure fat (900 kcal, 0g protein per 100g), so a model
# choosing oil where our recipe says ghee is not an error. Compare them as one.
SAME_NUTRITION = {"ghee": "ghee/oil", "oil": "ghee/oil"}


def merge_fats(pairs) -> dict[str, float]:
    out: dict[str, float] = {}
    for name, grams in pairs:
        key = SAME_NUTRITION.get(name, name)
        out[key] = out.get(key, 0) + grams
    return out


def grams_diagnosis(calls: list[dict]) -> dict | None:
    """Grounded runs only: the model's raw grams vs our recipe's grams.

    Tells us whether remaining error is portion size (wrong grams) — the
    nutrition facts themselves come from IFCT on both sides.
    """
    grounded = [c for c in calls if "grams" in c]
    if not grounded:
        return None
    with open(ROOT / "data" / "dishes.csv") as f:
        recipes = {d["id"]: merge_fats(parse_recipe(d["recipe_raw_grams"])) for d in csv.DictReader(f)}

    by_dish: dict[str, list[dict]] = defaultdict(list)
    queries = {}
    for c in grounded:
        by_dish[c["dish_id"]].append(merge_fats(c["grams"].items()))
        queries[c["dish_id"]] = c["query"]

    per_dish, ratios = [], defaultdict(list)
    for dish_id, answers in by_dish.items():
        ref = recipes[dish_id]
        names = sorted(set(ref) | {n for a in answers for n in a})
        # Median across repeats; an ingredient missing from an answer counts as 0g.
        model = {n: median(a.get(n, 0) for a in answers) for n in names}
        per_dish.append({"id": dish_id, "query": queries[dish_id], "ref": ref, "model": model})
        for n, g in ref.items():
            ratios[n].append(model[n] / g)

    per_ingredient = sorted(
        ({"ingredient": n, "dishes": len(r), "ratio": median(r), "omitted": sum(x == 0 for x in r)}
         for n, r in ratios.items()),
        key=lambda x: -abs(x["ratio"] - 1),
    )
    return {"per_dish": per_dish, "per_ingredient": per_ingredient}


def write_report(result: dict, run_path: Path) -> str:
    summary, dishes = result["summary"], result["dishes"]
    categories, scaling = result["categories"], result["scaling"]
    L = []
    L.append(f"# Eval report — `{summary['run']}`\n")
    L.append(f"Model **{summary['model']}** · prompt **{summary['prompt']}** · "
             f"{summary['calls']} calls ({len(dishes)} dishes × {dishes[0]['repeats']} repeats)\n")

    L.append("## Headline\n")
    L.append("| Metric | Calories | Protein |")
    L.append("|---|---|---|")
    L.append(f"| **Pass rate** (inside band) | **{pct(summary['kcal_pass_rate'])}** | **{pct(summary['protein_pass_rate'])}** |")
    L.append(f"| Median error (typical miss) | {pct(summary['kcal_median_abs_err'])} | {pct(summary['protein_median_abs_err'])} |")
    L.append(f"| Bias (+ = over-estimates) | {pct(summary['kcal_bias'], True)} | {pct(summary['protein_bias'], True)} |")
    L.append("")
    L.append(f"Valid JSON answers: {pct(summary['valid_rate'])} · "
             f"Cost: ${summary['cost_usd']:.4f} · Median latency: {summary['latency_median_s']:.1f}s\n")

    L.append("## By category\n")
    L.append("| Category | Dishes | Calorie pass | Protein pass |")
    L.append("|---|---|---|---|")
    for cat, c in categories.items():
        L.append(f"| {cat} | {c['dishes']} | {pct(c['kcal_pass'])} | {pct(c['protein_pass'])} |")
    L.append("")

    if scaling:
        L.append("## Quantity scaling\n")
        L.append("Does a bigger quantity scale the calories by the right amount?\n")
        L.append("| Pair | Should be | Model gave | Off by |")
        L.append("|---|---|---|---|")
        for s in scaling:
            L.append(f"| {s['pair']} | {s['expected']:.1f}× | {s['actual']:.1f}× | {pct(s['off'], True)} |")
        L.append("")

    L.append("## Worst 5 dishes (calories)\n")
    L.append("| Dish | Reference | Model answers | Error | Band |")
    L.append("|---|---|---|---|---|")
    worst = sorted((d for d in dishes if d["kcal_err"] is not None), key=lambda d: -abs(d["kcal_err"]))[:5]
    for d in worst:
        L.append(f"| {d['query']} | {d['ref_kcal']:.0f} | {', '.join(str(k) for k in d['kcals'])} | "
                 f"{pct(d['kcal_err'], True)} | ±{d['band']:.0f}% |")
    L.append("")

    L.append("## Consistency\n")
    unstable = sorted((d for d in dishes if d["spread"] and d["spread"] > UNSTABLE_SPREAD), key=lambda d: -d["spread"])
    identical = sum(1 for d in dishes if d["spread"] == 0)
    L.append(f"{identical} of {len(dishes)} dishes gave the identical answer every time. "
             f"{len(unstable)} spread more than {pct(UNSTABLE_SPREAD)}:\n")
    if unstable:
        L.append("| Dish | Answers | Spread |")
        L.append("|---|---|---|")
        for d in unstable:
            L.append(f"| {d['query']} | {', '.join(str(k) for k in d['kcals'])} | {pct(d['spread'])} |")
    L.append("")

    L.append("## Every dish\n")
    L.append("| Dish | Cat | Ref kcal | Answers | kcal err | kcal pass | Ref prot | Answers | prot err | prot pass |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for d in dishes:
        ke = pct(d["kcal_err"], True) if d["kcal_err"] is not None else "—"
        pe = pct(d["protein_err"], True) if d["protein_err"] is not None else "—"
        L.append(f"| {d['query']} | {d['category']} | {d['ref_kcal']:.0f} | {', '.join(map(str, d['kcals']))} | {ke} | "
                 f"{d['kcal_passes']}/{d['repeats']} | {d['ref_protein']:.1f} | {', '.join(map(str, d['proteins']))} | "
                 f"{pe} | {d['protein_passes']}/{d['repeats']} |")
    L.append("")

    if result.get("grams"):
        g = result["grams"]
        L.append("## Portion diagnosis (grounded run)\n")
        L.append("Nutrition facts come from IFCT on both sides, so any gap here is **portion size**: "
                 "how many grams the model assumed vs our recipe.\n")
        L.append("| Ingredient | In dishes | Model grams ÷ our grams | Left out |")
        L.append("|---|---|---|---|")
        for i in g["per_ingredient"]:
            L.append(f"| {i['ingredient']} | {i['dishes']} | {i['ratio']:.2f}× | {i['omitted']} |")
        L.append("")
        L.append("| Dish | Our recipe (g) | Model (g, median of repeats) |")
        L.append("|---|---|---|")
        fmt = lambda d: ", ".join(f"{n} {v:g}" for n, v in sorted(d.items(), key=lambda x: -x[1]) if v)
        for d in g["per_dish"]:
            L.append(f"| {d['query']} | {fmt(d['ref'])} | {fmt(d['model'])} |")
        L.append("")

    L.append("## How this was scored\n")
    L.append("- **Pass** = answer within the dish's tolerance band (`band_pct` in `data/dishes.csv`).")
    L.append(f"- **Protein** also passes if within ±{PROTEIN_ABS_TOLERANCE_G:.0f}g — small amounts make % error unfair.")
    L.append("- A missing or malformed answer counts as a **fail**, not as skipped.")
    L.append("- Pass rates are over every call; per-dish errors use the median of the repeats.")
    L.append("- References are recipe decompositions using IFCT 2017 / NIN values — references, not ground truth.")

    report = "\n".join(L) + "\n"
    report_path = run_path.with_name(run_path.stem + "_report.md")
    report_path.write_text(report)
    run_path.with_name(run_path.stem + "_summary.json").write_text(json.dumps(summary, indent=2))
    return report


def main() -> None:
    run_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else latest_run()
    print(write_report(analyse(run_path), run_path))
    print(f"Saved → {run_path.with_name(run_path.stem + '_report.md').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
