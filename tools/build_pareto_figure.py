#!/usr/bin/env python3
"""Render the cost-versus-capability Pareto figure from data/cost.json.

Two panels, both with cost per environment on a log x-axis, because the models
span a factor of 77 in price and a linear axis collapses six of seven points
onto the left edge:

  (a) GEN construction score against recomputed cost
  (b) SWE fail-to-pass against recomputed cost

The staircase marks the Pareto frontier: a model is on it when no other model is
both cheaper and better. Frontier membership is recomputed per panel, since the
ordering by F2P is not the ordering by GEN.

Usage: build_pareto_figure.py <cost_json> <out_png>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Vendor colors, reused from the paper's scaffold figures.
COLORS = {
    "Anthropic": "#C44E52",
    "Moonshot": "#4C72B0",
    "Z.ai": "#55A868",
    "DeepSeek": "#8172B3",
    "MiniMax": "#DD8452",
    "Tencent": "#937860",
}

# Per-point label placement, in offset points. Tuned by eye so that no label
# overlaps another or runs off the axes; a generic placement rule cannot do this
# with seven points at these coordinates.
NUDGE = {
    "gen": {
        "Claude Opus 5":       (-10, -16),
        "Kimi K3":             (-12, 9),
        "GLM-5.3":             (7, -4),
        "GLM-5.3-Flash":       (-8, 9),
        "DeepSeek-v4-pro":     (8, 5),
        "DeepSeek-v4.1-flash": (-6, -16),
        "MiniMax-M3":          (7, -3),
    },
    "swe": {
        "Claude Opus 5":       (-10, -16),
        "Kimi K3":             (-12, 9),
        "GLM-5.3":             (7, -4),
        "GLM-5.3-Flash":       (-8, 9),
        "DeepSeek-v4-pro":     (7, 4),
        "DeepSeek-v4.1-flash": (-6, -16),
        "MiniMax-M3":          (7, -3),
    },
}


def frontier_of(points: list[tuple[float, float, str]]) -> list[tuple[float, float, str]]:
    """Pareto-optimal points for (cost down, score up), returned cheapest first."""
    best: list[tuple[float, float, str]] = []
    ceiling = float("-inf")
    for cost, score, name in sorted(points):          # cheapest first
        if score > ceiling:                            # nothing cheaper scores as well
            best.append((cost, score, name))
            ceiling = score
    return best


def panel(ax, rows, key, score_key, title, ylabel):
    points = [(r[key]["cost"], r[score_key], r["model"]) for r in rows]
    front = frontier_of(points)
    front_names = {n for _, _, n in front}

    # Staircase through the frontier: hold the score, then step up at the price
    # where a better model becomes available. Drawn under the markers.
    if len(front) > 1:
        sx, sy = [front[0][0]], [front[0][1]]
        for cost, score, _ in front[1:]:
            sx += [cost, cost]
            sy += [sy[-1], score]
        ax.plot(sx, sy, color="#999", lw=1.0, ls="--", zorder=1)

    for cost, score, name in points:
        row = next(r for r in rows if r["model"] == name)
        on = name in front_names
        color = COLORS[row["vendor"]]
        ax.scatter(cost, score, s=74 if on else 46, color=color,
                   edgecolor="#222" if on else color,
                   linewidth=1.1 if on else 0.0,
                   zorder=4 if on else 3, alpha=1.0 if on else 0.62)
        dx, dy = NUDGE[key].get(name, (7, 4))
        ax.annotate(name, (cost, score), textcoords="offset points",
                    xytext=(dx, dy), fontsize=7.3,
                    fontweight="bold" if on else "normal",
                    color="#222" if on else "#666", zorder=5)

    ax.set_xscale("log")
    # Labels sit to the side of their marker, so the data range alone clips the
    # outermost ones. Pad by a factor either side, in log space.
    lo = min(c for c, _, _ in points)
    hi = max(c for c, _, _ in points)
    ax.set_xlim(lo / 1.9, hi * 2.6)
    ax.set_xlabel("Cost per environment (USD, log scale)", fontsize=9)
    ax.set_ylabel(ylabel, fontsize=9)
    ax.set_title(title, fontsize=10, pad=5)
    ax.tick_params(labelsize=7.8)
    ax.grid(True, which="major", ls=":", lw=0.6, color="#ccc", zorder=0)
    ax.grid(True, which="minor", ls=":", lw=0.4, color="#e8e8e8", zorder=0)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    return front


def main() -> int:
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip().splitlines()[-1])
    cost_json, out_png = Path(sys.argv[1]), Path(sys.argv[2])
    data = json.load(open(cost_json))
    rows = data["models"]

    plt.rcParams.update({"font.family": "DejaVu Sans", "pdf.fonttype": 42,
                         "ps.fonttype": 42})
    fig, axes = plt.subplots(1, 2, figsize=(11.2, 4.1))

    gen_front = panel(axes[0], rows, "gen", "genScore",
                      "(a) Construction (GEN) against cost",
                      "GEN score (%)")
    swe_front = panel(axes[1], rows, "swe", "f2pScore",
                      "(b) Repair (SWE fail-to-pass) against cost",
                      "F2P rate (%)")

    handles = [plt.Line2D([], [], marker="o", ls="", color=COLORS[v],
                          markersize=6, label=v)
               for v in dict.fromkeys(r["vendor"] for r in rows)]
    handles.append(plt.Line2D([], [], color="#999", ls="--", lw=1.0,
                              label="Pareto frontier"))
    fig.legend(handles=handles, fontsize=8.4, ncol=len(handles),
               loc="lower center", frameon=False, bbox_to_anchor=(0.5, -0.02))

    fig.tight_layout(rect=(0, 0.055, 1, 1))
    out_png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_png, dpi=160, bbox_inches="tight", pad_inches=0.06,
                facecolor="white")
    print(f"wrote {out_png}")
    print("  GEN frontier:", " -> ".join(n for _, _, n in gen_front))
    print("  SWE frontier:", " -> ".join(n for _, _, n in swe_front))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
