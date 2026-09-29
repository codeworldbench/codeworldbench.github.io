#!/usr/bin/env python3
"""Build data/cost.json: per-model token usage and re-priced API cost.

Two things are joined here, and they come from different places.

Token usage is measured from the raw scaffold logs under
CodeWorldBench-0714/common50_prof68_results/, using the same attempt dedup as
the paper's trace scripts: an attempt is ranked by the greatest timestamp
anywhere inside it, file order breaks ties, and only the winning attempt per
(environment, setting) is kept. Retries are dropped. Every Claude Code result
event carries a usage block with the four billable quantities separated --
uncached input, cache read, cache write, output -- so cost can be recomputed
rather than estimated.

Cost is then recomputed at each model's own published API rates. This is the
whole point of the file. The harness reports a `total_cost_usd` per run, and
that number is exact, but it is computed at Claude Opus 5's rates for every
model, because every run went through Claude Code with Opus's price table
compiled in. A least-squares fit of cost against the four token counts recovers
$5.00 / $0.50 / $6.25-$10 / $25.00 per million for all sixteen model-setting
cells, to a residual of zero. So the published cost column is a token-volume
proxy wearing a dollar sign: useful for comparing volume, wrong for comparing
what these models actually cost to run. PRICES below replaces it.

Usage: build_cost.py <generations_root> <results_json> <out_json>
"""

from __future__ import annotations

import collections
import json
import re
import statistics
import sys
from pathlib import Path

# Official list prices, USD per million tokens, retrieved 2026-09-28.
#   in    uncached input
#   cr    cache read / cache hit
#   cw    cache write; falls back to the input rate where a vendor does not
#         price writes separately, which is the standard convention
#   out   output, thinking tokens included where the vendor counts them
#
# Rates that carry a caveat, stated so the numbers can be audited:
#   claude-opus-5      cache write is the 1-hour rate ($10), not the 5-minute
#                      rate ($6.25), because every cache_creation token in these
#                      logs is ephemeral_1h_input_tokens; the 5-minute bucket is
#                      zero across all 50 runs
#   deepseek-v4-pro    the 75% cut of 2026-05-23, now permanent list price
#   deepseek-v4.1-flash off-peak; peak rates are exactly double
#   glm-5.3-flash      list price, not the launch promo
PRICES = {
    "claude-opus-5":       {"in": 5.000, "cr": 0.500,    "cw": 10.000, "out": 25.000,
                            "vendor": "Anthropic"},
    "kimi-k3":             {"in": 3.000, "cr": 0.300,    "cw": 3.000, "out": 15.000,
                            "vendor": "Moonshot"},
    "glm5.3-step4-expert": {"in": 1.400, "cr": 0.260,    "cw": 1.400, "out": 4.400,
                            "vendor": "Z.ai"},
    "glm-5.3-flash":       {"in": 0.150, "cr": 0.030,    "cw": 0.150, "out": 0.500,
                            "vendor": "Z.ai"},
    "deepseek-v4-pro-0813": {"in": 0.435, "cr": 0.003625, "cw": 0.435, "out": 0.870,
                             "vendor": "DeepSeek"},
    "deepseek-v4.1-flash": {"in": 0.150, "cr": 0.003,    "cw": 0.150, "out": 0.600,
                            "vendor": "DeepSeek"},
    "minimax-m3":          {"in": 0.300, "cr": 0.060,    "cw": 0.300, "out": 1.200,
                            "vendor": "MiniMax"},
    "hy4-preview":         {"in": 0.834, "cr": 0.042,    "cw": 0.834, "out": 2.501,
                            "vendor": "Tencent"},
}

# Raw log directory -> the model label used in the paper's result tables.
# hy4-preview is deliberately absent: it has cost data but no published score,
# so it cannot be placed on a cost-versus-score plane.
LABELS = {
    "claude-opus-5": "Claude Opus 5",
    "kimi-k3": "Kimi K3",
    "glm5.3-step4-expert": "GLM-5.3",
    "glm-5.3-flash": "GLM-5.3-Flash",
    "deepseek-v4-pro-0813": "DeepSeek-v4-pro",
    "deepseek-v4.1-flash": "DeepSeek-v4.1-flash",
    "minimax-m3": "MiniMax-M3",
}

LOGO = {
    "Claude Opus 5": "anthropic",
    "Kimi K3": "moonshot",
    "GLM-5.3": "zai",
    "GLM-5.3-Flash": "zai",
    "DeepSeek-v4-pro": "deepseek",
    "DeepSeek-v4.1-flash": "deepseek",
    "MiniMax-M3": "minimax",
}

# The paper's attempt-dedup regexes, copied verbatim so the row set matches.
HEAD = re.compile(r'^\{"setting":\s?"(\w+)",\s?"attempt_key":\s?"(\w+)"')
TS = re.compile(r'"timestamp":\s?"(\d{4}-\d\d-\d\dT[0-9:.]+Z)"')

SETTINGS = {"L3": "gen", "SWE": "swe"}


def latest_attempts(trace: Path) -> dict[str, dict]:
    """Return the winning attempt's result event per setting.

    Ranking matches common50_trace.one_env: greatest timestamp anywhere in the
    attempt, file order as tie-break for attempts carrying no timestamp.
    """
    last_ts: dict[tuple[str, str], str] = {}
    last_seen: dict[tuple[str, str], int] = {}
    with open(trace, errors="replace") as fh:
        for n, line in enumerate(fh):
            m = HEAD.match(line)
            if not m:
                continue
            key = (m.group(1), m.group(2))
            last_seen[key] = n
            ts = TS.search(line)
            if ts and (key not in last_ts or ts.group(1) > last_ts[key]):
                last_ts[key] = ts.group(1)

    best: dict[str, tuple[str, tuple]] = {}
    for key, n in last_seen.items():
        rank = (last_ts.get(key, ""), n)
        if key[0] not in best or rank > best[key[0]][1]:
            best[key[0]] = (key[1], rank)
    keep = {(setting, ak) for setting, (ak, _) in best.items()}

    out: dict[str, dict] = {}
    with open(trace, errors="replace") as fh:
        for line in fh:
            m = HEAD.match(line)
            if not m or (m.group(1), m.group(2)) not in keep:
                continue
            if "total_cost_usd" not in line:
                continue
            inner = json.loads(line).get("event") or {}
            if isinstance(inner.get("total_cost_usd"), (int, float)):
                out[m.group(1)] = inner  # last result event in the attempt wins
    return out


def collect(root: Path) -> dict:
    """Mean token usage and billed cost per (model, setting) over common50."""
    runs: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for mdir in sorted(p for p in root.iterdir() if p.is_dir()):
        if mdir.name not in PRICES:
            continue
        for envdir in sorted(mdir.glob("C_*")):
            trace = envdir / "trace.jsonl"
            if not trace.exists():
                continue
            for setting, inner in latest_attempts(trace).items():
                if setting not in SETTINGS:
                    continue
                u = inner.get("usage") or {}
                runs[(mdir.name, setting)].append({
                    "billed": inner["total_cost_usd"],
                    "in": u.get("input_tokens") or 0,
                    "cr": u.get("cache_read_input_tokens") or 0,
                    "cw": u.get("cache_creation_input_tokens") or 0,
                    "out": u.get("output_tokens") or 0,
                })
    return runs


def main() -> int:
    if len(sys.argv) != 4:
        sys.exit(__doc__.strip().splitlines()[-1])
    root, results_json, out_path = (Path(a) for a in sys.argv[1:])
    if not root.is_dir():
        sys.exit(f"generations root not found: {root}")

    scores = json.load(open(results_json))
    gen = {}
    for r in scores["subsets"]["common"]["rows"]:
        if r["scaffold"] == "Claude Code":
            gen[r["model"]] = r

    runs = collect(root)
    if not runs:
        sys.exit(f"no usage-bearing traces under {root}")

    models = []
    for key, label in LABELS.items():
        price = PRICES[key]
        row = {"model": label, "vendor": price["vendor"], "logo": LOGO[label],
               "price": {k: price[k] for k in ("in", "cr", "cw", "out")}}
        ok = True
        for setting, short in SETTINGS.items():
            rs = runs.get((key, setting))
            if not rs:
                ok = False
                break
            mean = lambda f: statistics.mean(r[f] for r in rs)
            tok = {f: mean(f) for f in ("in", "cr", "cw", "out")}
            cost = sum(tok[f] * price[f] for f in ("in", "cr", "cw", "out")) / 1e6
            row[short] = {
                "runs": len(rs),
                "tokens": {k: round(v, 1) for k, v in tok.items()},
                "totalTokens": round(sum(tok.values()), 1),
                "cost": round(cost, 4),
                "billed": round(mean("billed"), 4),
            }
        if not ok:
            sys.exit(f"{key}: missing a setting, refusing to emit a partial row")

        score = gen.get(label)
        if score is None:
            sys.exit(f"{label}: no Claude Code row in {results_json}")
        row["genScore"] = score["gen"]
        row["f2pScore"] = score["f2p"]
        row["costPerPoint"] = round(row["gen"]["cost"] / score["gen"], 4)
        models.append(row)

    models.sort(key=lambda r: -r["genScore"])
    frontier = []
    cheapest = float("inf")
    for r in sorted(models, key=lambda r: -r["genScore"]):
        if r["gen"]["cost"] < cheapest:
            frontier.append(r["model"])
            cheapest = r["gen"]["cost"]

    out = {
        "note": ("Generated by tools/build_cost.py. Token counts are measured from the raw "
                 "Claude Code logs over the 50 common environments, deduplicated to the latest "
                 "attempt per environment and setting. Cost is recomputed at each vendor's "
                 "published list price; the harness's own cost column prices every model at "
                 "Claude Opus 5 rates and is kept here as `billed` for comparison only."),
        "pricesRetrieved": "2026-09-28",
        "environments": 50,
        "subset": "common",
        "scaffold": "Claude Code",
        "frontier": frontier,
        "models": models,
    }
    out_path.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {out_path}: {len(models)} models, frontier = {', '.join(frontier)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
