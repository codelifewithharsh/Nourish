"""Phase 4 — put runs side by side and show what changed.

The first run given is the baseline; every other run is compared against it.

Run:  uv run python compare.py                                   # every run in results/, oldest = baseline
      uv run python compare.py results/a.jsonl results/b.jsonl   # specific runs

Output: results/comparison_<timestamp>.md
"""
import sys
from datetime import datetime
from pathlib import Path

from score import ROOT, analyse, pct

# With 21 dishes × 3 repeats, one call is ~1.6% and one dish is ~4.8% of the
# pass rate. Differences smaller than a couple of dishes are probably noise.
NOISE_PP = 0.10


def change(new: float, old: float, higher_is_better: bool = True) -> str:
    diff = new - old
    if abs(diff) < 0.005:
        return "="
    good = (diff > 0) == higher_is_better
    return f"{diff * 100:+.0f} pts {'✅' if good else '❌'}"


def main() -> None:
    paths = [Path(p).resolve() for p in sys.argv[1:]] or sorted((ROOT / "results").glob("*.jsonl"))
    if len(paths) < 2:
        sys.exit("Need at least two runs to compare.")

    results = [analyse(p) for p in paths]
    base = results[0]
    S = [r["summary"] for r in results]
    names = [f"{s['model']} · {s['prompt']}" for s in S]

    L = ["# Comparison\n", f"Baseline: **{names[0]}**\n"]

    # ── headline table: one column per run ───────────────────────────────────
    rows = [
        ("Calorie pass rate", "kcal_pass_rate", True, pct),
        ("Protein pass rate", "protein_pass_rate", True, pct),
        ("Quantity-pair calorie pass", "quantity_kcal_pass_rate", True, pct),
        ("Calorie median error", "kcal_median_abs_err", False, pct),
        ("Protein median error", "protein_median_abs_err", False, pct),
        ("Calorie bias", "kcal_bias", None, lambda x: pct(x, True)),
        ("Protein bias", "protein_bias", None, lambda x: pct(x, True)),
        ("Valid JSON", "valid_rate", True, pct),
    ]
    L.append("| Metric | " + " | ".join(names) + " |")
    L.append("|---|" + "---|" * len(names))
    for label, key, higher_better, fmt in rows:
        cells = [fmt(S[0][key])]
        for s in S[1:]:
            cell = fmt(s[key])
            if higher_better is not None:
                cell += f" ({change(s[key], S[0][key], higher_better)})"
            cells.append(cell)
        L.append(f"| {label} | " + " | ".join(cells) + " |")

    cost_cells = [f"${s['cost_usd'] / s['calls'] * 1000:.3f}" for s in S]
    L.append("| Cost per 1,000 lookups | " + " | ".join(cost_cells) + " |")
    L.append("| Median latency | " + " | ".join(f"{s['latency_median_s']:.1f}s" for s in S) + " |")
    L.append("")

    # ── quantity scaling per run ─────────────────────────────────────────────
    L.append("## Quantity scaling (should be ≈ the 'expected' ratio)\n")
    pairs = [s["pair"] for s in base["scaling"]]
    L.append("| Pair | Expected | " + " | ".join(names) + " |")
    L.append("|---|---|" + "---|" * len(names))
    for i, pair in enumerate(pairs):
        cells = [f"{r['scaling'][i]['actual']:.1f}×" if i < len(r["scaling"]) else "—" for r in results]
        L.append(f"| {pair} | {base['scaling'][i]['expected']:.1f}× | " + " | ".join(cells) + " |")
    L.append("")

    # ── which dishes flipped, per challenger ─────────────────────────────────
    base_dishes = {d["id"]: d for d in base["dishes"]}
    for name, r in zip(names[1:], results[1:]):
        L.append(f"## What changed: {name} vs baseline\n")
        L.append("Dishes whose pass count (out of 3) moved:\n")
        L.append("| Dish | Calories | Protein |")
        L.append("|---|---|---|")
        moved = 0
        for d in r["dishes"]:
            b = base_dishes[d["id"]]
            dk, dp = d["kcal_passes"] - b["kcal_passes"], d["protein_passes"] - b["protein_passes"]
            if dk or dp:
                moved += 1
                fmt = lambda new, old: f"{old}→{new} {'✅' if new > old else '❌' if new < old else ''}"
                L.append(f"| {d['query']} | {fmt(d['kcal_passes'], b['kcal_passes'])} | "
                         f"{fmt(d['protein_passes'], b['protein_passes'])} |")
        if not moved:
            L.append("| (no changes) | | |")
        L.append("")

    # ── how to read this ─────────────────────────────────────────────────────
    L.append("## Reading this honestly\n")
    L.append(f"- 21 dishes × 3 repeats: one dish is ~5 points of pass rate. Treat differences under "
             f"~{NOISE_PP * 100:.0f} points as possibly noise — rerun before believing them.")
    L.append("- Look at **which dishes flipped**, not only the headline. A gain that comes from one "
             "dish category may not generalise.")
    L.append("- Accuracy is only half the decision — weigh it against cost per lookup and latency.")

    report = "\n".join(L) + "\n"
    out = ROOT / "results" / f"comparison_{datetime.now():%Y%m%d-%H%M%S}.md"
    out.write_text(report)
    print(report)
    print(f"Saved → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
