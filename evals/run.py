"""Phase 2 — ask the model about every dish, save the raw answers.

No scoring happens here. Model calls cost money and vary run to run, so we
save every answer once and score it as many times as we like (score.py).

Run:  uv run python run.py                         # all dishes, 3 repeats, gpt-4o-mini
      uv run python run.py --limit 2 --repeats 1   # quick smoke test
      uv run python run.py --model <other-model>   # Phase 4 comparisons
      uv run python run.py --model gpt-5.6-luna --reasoning low   # reasoning models
      uv run python run.py --model gpt-5.6-luna --prompt v3_grounded  # Part B: grounding

Output: results/<timestamp>_<model>_<prompt>.jsonl — one line per model call.
"""
import argparse
import csv
import json
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from build_reference import load_ingredients, macros_for
from prompts import PROMPTS

ROOT = Path(__file__).parent

# USD per 1M tokens (input, output). Unknown models record cost as None
# rather than a wrong number. Check openai.com/api/pricing when adding one.
PRICES = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
    # Aggregator-reported price after the 2026-07-30 cut; OpenAI's own pricing
    # page couldn't be checked. Verify before quoting it anywhere.
    "gpt-5.6-luna": (0.20, 1.20),
}

# Reasoning models reject `temperature` and take `reasoning_effort` instead,
# so a run on one of these changes two things at once — say so when comparing.
REASONING_MODELS = {"gpt-5.6-luna"}


def response_format(prompt: dict) -> dict:
    """Grounded prompts get a strict JSON schema; the rest get plain JSON mode, like the app."""
    if "schema" in prompt:
        return {"type": "json_schema", "json_schema": {"name": "meal", "strict": True, "schema": prompt["schema"]}}
    return {"type": "json_object"}


def ground(parsed: dict, ingredients: dict) -> dict:
    """Grounded answer → calories and protein, computed in code.

    The model said WHAT and HOW MUCH per unit; we multiply by the count and
    look the nutrition facts up in IFCT. The model never states a calorie.
    """
    totals: dict[str, float] = {}  # ingredient → grams for the whole meal
    for item in parsed["items"]:
        for ing in item["raw_ingredients_per_unit"]:
            if ing["grams"] > 0:  # strict mode sometimes pads unused names with 0g
                totals[ing["ingredient"]] = totals.get(ing["ingredient"], 0) + ing["grams"] * item["count"]
    kcal, protein = macros_for(list(totals.items()), ingredients)
    return {
        "calories": round(kcal),
        "protein": round(protein, 1),
        "grams": {name: round(g, 1) for name, g in totals.items()},  # saved for diagnosis
    }


def call_model(client: OpenAI, model: str, prompt: dict, query: str, reasoning: str) -> dict:
    """One call, made exactly the way the app's edge function makes it."""
    settings = {"reasoning_effort": reasoning} if model in REASONING_MODELS else {"temperature": 0.3}
    start = time.perf_counter()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": prompt["system"]},
            {"role": "user", "content": prompt["user"].format(query=query)},
        ],
        response_format=response_format(prompt),
        **settings,
    )
    latency = time.perf_counter() - start

    tokens_in = response.usage.prompt_tokens
    tokens_out = response.usage.completion_tokens  # includes hidden reasoning tokens — they're billed too
    details = getattr(response.usage, "completion_tokens_details", None)
    reasoning_tokens = getattr(details, "reasoning_tokens", 0) or 0
    price = PRICES.get(model)
    cost = (tokens_in * price[0] + tokens_out * price[1]) / 1_000_000 if price else None

    return {
        "raw": response.choices[0].message.content,
        "latency_s": round(latency, 2),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "reasoning_tokens": reasoning_tokens,
        "cost_usd": cost,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-4o-mini")
    parser.add_argument("--prompt", default="v1_app", choices=PROMPTS.keys())
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--limit", type=int, help="only the first N dishes")
    parser.add_argument("--reasoning", default="none", choices=["none", "low", "medium", "high"],
                        help="reasoning effort, reasoning models only")
    args = parser.parse_args()

    load_dotenv()
    prompt = PROMPTS[args.prompt]
    ingredients = load_ingredients() if prompt.get("grounded") else None
    client = OpenAI()  # reads OPENAI_API_KEY from the environment

    with open(ROOT / "data" / "reference.csv") as f:
        dishes = list(csv.DictReader(f))[: args.limit]

    # Label reasoning runs with their effort, e.g. "gpt-5.6-luna[none]".
    label = f"{args.model}[{args.reasoning}]" if args.model in REASONING_MODELS else args.model
    run_id = f"{datetime.now():%Y%m%d-%H%M%S}_{label}_{args.prompt}"
    out_path = ROOT / "results" / f"{run_id}.jsonl"
    out_path.parent.mkdir(exist_ok=True)

    total = len(dishes) * args.repeats
    print(f"Run {run_id}: {len(dishes)} dishes × {args.repeats} repeats = {total} calls\n")

    total_cost, n = 0.0, 0
    with open(out_path, "w") as out:
        for dish in dishes:
            for attempt in range(1, args.repeats + 1):
                n += 1
                record = {
                    "run_id": run_id,
                    "model": label,
                    "prompt": args.prompt,
                    "dish_id": dish["id"],
                    "query": dish["query"],
                    "attempt": attempt,
                }
                try:
                    result = call_model(client, args.model, prompt, dish["query"], args.reasoning)
                    record.update(result)
                    # Parse here so the file shows what we got, but keep "raw"
                    # too — a malformed answer is itself a finding.
                    try:
                        parsed = json.loads(result["raw"])
                        if ingredients:
                            record.update(ground(parsed, ingredients))
                        else:
                            record["calories"] = parsed.get("calories")
                            record["protein"] = parsed.get("protein")
                        record["serving"] = parsed.get("serving")
                    except json.JSONDecodeError:
                        record["error"] = "invalid_json"
                    total_cost += result["cost_usd"] or 0
                except Exception as e:  # API down, rate limit, bad key…
                    record["error"] = f"{type(e).__name__}: {e}"

                out.write(json.dumps(record) + "\n")
                status = record.get("error") or f"{record.get('calories')} kcal, {record.get('protein')}g protein"
                print(f"[{n:>3}/{total}] {dish['query']:<32} #{attempt}  {status}")

    print(f"\nSaved → {out_path.relative_to(ROOT)}")
    print(f"Cost: ${total_cost:.4f} (≈ ₹{total_cost * 84:.2f})")


if __name__ == "__main__":
    main()
