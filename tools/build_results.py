#!/usr/bin/env python3
"""Build data/results.json from the paper's LaTeX result macros.

The single source of truth is sections/4_1_experiment_results_tables.tex in the
paper tree: every number on the site is read out of the \\res*/\\prof* macros so
the leaderboard cannot drift from the submitted tables. Row order, provider,
parameter counts, and scaffold labels follow the two result tables verbatim.

Usage: build_results.py <paper_dir> <out_json>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Column order inside every macro: ten categories, then GEN, P2P, F2P.
COMMON_CATEGORIES = [
    ("CC", "Communication Collaboration"),
    ("ME", "Media Entertainment"),
    ("DI", "Data Intelligence"),
    ("ID", "Infrastructure Development"),
    ("FC", "Financial Compliance"),
    ("CL", "Commerce Logistics"),
    ("PS", "Public Service"),
    ("GC", "Geospatial Construction"),
    ("MA", "Manufacturing Agriculture"),
    ("EI", "Embodied Intelligence"),
]

PROFESSIONAL_CATEGORIES = [
    ("ES", "Engineering Systems"),
    ("EB", "Embedded Systems"),
    ("SC", "Scientific Computing"),
    ("CM", "Creative Media"),
    ("EO", "Enterprise Operations"),
    ("FS", "Financial Services"),
    ("CP", "Commercial Platforms"),
    ("SO", "Supply Operations"),
    ("LG", "Legal Governance"),
    ("HE", "Health Education"),
]

# One entry per table row. `suffix` selects \res<suffix> for the common table and
# \prof<suffix> for the professional one.
ROWS = [
    ("GptSol", "OpenAI", "openai", "GPT-5.6 Sol", "\u2014", "Codex", "closed"),
    ("GptLuna", "OpenAI", "openai", "GPT-5.6 Luna", "\u2014", "Codex", "closed"),
    ("GptTerra", "OpenAI", "openai", "GPT-5.6 Terra", "\u2014", "Codex", "closed"),
    ("GptAstra", "OpenAI", "openai", "GPT-6 Astra", "\u2014", "Codex", "closed"),
    ("Opus", "Anthropic", "anthropic", "Claude Opus 5", "\u2014", "Claude Code", "closed"),
    ("Doubao", "ByteDance", "bytedance", "Doubao-seed-evolving", "\u2014", "Claude Code", "closed"),
    ("QwenSmall", "Alibaba", "alibaba", "Qwen3.8-27B", "27B", "Claude Code", "open"),
    ("QwenSmallOpencode", "Alibaba", "alibaba", "Qwen3.8-27B", "27B", "OpenCode", "open"),
    ("QwenSmallOpenhands", "Alibaba", "alibaba", "Qwen3.8-27B", "27B", "OpenHands", "open"),
    ("QwenSmallQwencode", "Alibaba", "alibaba", "Qwen3.8-27B", "27B", "Qwen Code", "open"),
    ("QwenMoe", "Alibaba", "alibaba", "Qwen3.6-35B-A3B", "35B/3B", "Claude Code", "open"),
    ("QwenMoeOpencode", "Alibaba", "alibaba", "Qwen3.6-35B-A3B", "35B/3B", "OpenCode", "open"),
    ("QwenMoeQwencode", "Alibaba", "alibaba", "Qwen3.6-35B-A3B", "35B/3B", "Qwen Code", "open"),
    ("Minimax", "MiniMax", "minimax", "MiniMax-M3", "428B/23B", "Claude Code", "open"),
    ("GlmFlash", "Z.ai", "zai", "GLM-5.3-Flash", "320B/18B", "Claude Code", "open"),
    ("Glm", "Z.ai", "zai", "GLM-5.3", "744B/40B", "Claude Code", "open"),
    ("DeepseekFlash", "DeepSeek", "deepseek", "DeepSeek-v4.1-flash", "552B/8B-16B", "Claude Code", "open"),
    ("DeepseekPro", "DeepSeek", "deepseek", "DeepSeek-v4-pro", "1.6T/49B", "Claude Code", "open"),
    ("Kimi", "Moonshot", "moonshot", "Kimi K3", "2.8T/104B", "Claude Code", "open"),
]

MACRO_RE = re.compile(
    r"\\newcommand\{\\((?:res|prof)[A-Za-z]+)\}\{%\s*\n([^}]+?)\s*%?\s*\n?\}", re.MULTILINE
)


def parse_macros(tex: str) -> dict[str, list[float]]:
    """Return {macro name: 13 floats} for every result macro in the tables file."""
    out: dict[str, list[float]] = {}
    for match in MACRO_RE.finditer(tex):
        cells = [c.strip().rstrip("%").strip() for c in match.group(2).replace("\n", " ").split("&")]
        if len(cells) != 13 or not all(re.fullmatch(r"[\d.]+", c) for c in cells):
            continue
        out[match.group(1)] = [float(c) for c in cells]
    return out


COMMON_ENVS = 50
PROFESSIONAL_ENVS = 68


def build_subset(macros: dict[str, list[float]], prefix: str, categories) -> list[dict]:
    rows = []
    for suffix, provider, logo, model, params, scaffold, source in ROWS:
        values = macros[f"{prefix}{suffix}"]
        rows.append(
            {
                "provider": provider,
                "logo": logo,
                "model": model,
                "params": params,
                "scaffold": scaffold,
                "source": source,
                "categories": {code: values[i] for i, (code, _) in enumerate(categories)},
                "gen": values[10],
                "p2p": values[11],
                "f2p": values[12],
            }
        )
    return rows


def build_overall(common: list[dict], professional: list[dict]) -> list[dict]:
    """Combine the two subsets into one all-118-environment row per model.

    GEN macro-averages per-environment pass rates, so the overall GEN is the
    environment-weighted mean of the two subset scores. This reproduces panel (a)
    of the model_avg_by_scaffold figure exactly, to the reported decimal.

    P2P and F2P are deliberately absent. They micro-average cases, so combining
    them needs each subset's initially-passing and initially-failing case counts,
    and the paper publishes only the totals over both subsets (9,753 and 15,262).
    An environment-weighted mean of two micro-averages is not a micro-average and
    would not correspond to any published number, so the overall table reports
    GEN alone and the subset tables carry the SWE columns.
    """
    total = COMMON_ENVS + PROFESSIONAL_ENVS
    rows = []
    for c, p in zip(common, professional, strict=True):
        assert (c["model"], c["scaffold"]) == (p["model"], p["scaffold"])
        rows.append(
            {
                "provider": c["provider"],
                "logo": c["logo"],
                "model": c["model"],
                "params": c["params"],
                "scaffold": c["scaffold"],
                "source": c["source"],
                "genCommon": c["gen"],
                "genProfessional": p["gen"],
                "gen": (COMMON_ENVS * c["gen"] + PROFESSIONAL_ENVS * p["gen"]) / total,
            }
        )
    return rows


def main() -> int:
    paper_dir = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    tex = (paper_dir / "sections" / "4_1_experiment_results_tables.tex").read_text()
    macros = parse_macros(tex)

    missing = [
        f"{p}{s}" for p in ("res", "prof") for s, *_ in ROWS if f"{p}{s}" not in macros
    ]
    if missing:
        raise SystemExit(f"missing result macros: {missing}")

    common = build_subset(macros, "res", COMMON_CATEGORIES)
    professional = build_subset(macros, "prof", PROFESSIONAL_CATEGORIES)

    payload = {
        "note": "Generated by tools/build_results.py from the paper result macros. Do not edit by hand.",
        "categories": {
            "common": [{"code": c, "name": n} for c, n in COMMON_CATEGORIES],
            "professional": [{"code": c, "name": n} for c, n in PROFESSIONAL_CATEGORIES],
        },
        "overall": {
            "label": "All environments",
            "environments": COMMON_ENVS + PROFESSIONAL_ENVS,
            "cases": 25015,
            "rows": build_overall(common, professional),
        },
        "subsets": {
            "common": {
                "label": "Common",
                "environments": COMMON_ENVS,
                "cases": 14069,
                "rows": common,
            },
            "professional": {
                "label": "Professional",
                "environments": PROFESSIONAL_ENVS,
                "cases": 10946,
                "rows": professional,
            },
        },
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"wrote {out_path} ({len(ROWS)} rows x 2 subsets + overall)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
