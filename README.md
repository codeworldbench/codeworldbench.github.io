# CodeWorldBench — project site

Static site for the CodeWorldBench paper. The home page carries the headline leaderboard and little
else; detail lives on four sub-pages.

No build step and no dependencies. Every number and figure is derived from the paper source, not
retyped.

## Pages

| Page | Holds |
| --- | --- |
| `index.html` | Hero, the all-118-environment GEN leaderboard (20 category columns behind a switch), four takeaways, the overview figure |
| `results.html` | Aggregation definitions, both subset tables in full, the by-subset figure, detailed observations |
| `benchmark.html` | Task formalism, the two settings, construction pipeline, static profile, 20 domains |
| `analysis.html` | Difficulty slices, scaffold effects, trace analysis, downstream transfer, conclusion |
| `cost.html` | Measured token usage, cost repriced at list rates, the cost-capability Pareto frontier |
| `run.html` | Install, unpack, register a model, generate, evaluate |

## The all-118 ranking

The home leaderboard ranks by GEN over all 118 environments, computed as the environment-weighted
mean of the two subsets:

```
GEN_all = (50 * GEN_common + 68 * GEN_professional) / 118
```

That is a genuine macro-average over all 118 environments, because GEN is itself a macro-average of
per-environment pass rates. It reproduces panel (a) of the `model_avg_by_scaffold` figure exactly, to
the reported decimal, in both value and bar order — `tools/build_results.py` is checked against the
figure whenever it is regenerated.

P2P and F2P are deliberately absent from that table. They micro-average cases, so combining them
needs each subset's initially-passing and initially-failing counts, and the paper publishes only the
totals over both subsets (9,753 and 15,262). An environment-weighted mean of two micro-averages is
not a micro-average, so the SWE columns stay on `results.html`, per subset, where they are exact.

The home table shows the 14 default-scaffold rows, matching the paper's figures. `results.html` opts
into all 19 rows via `data-all-scaffolds="true"` on `<body>`, matching the paper's tables. Either
table can be switched with the "Show every scaffold" checkbox.

## The 20 category columns

The same table can carry all twenty domain categories to the right of GEN, ten common then ten
professional. They are off by default so the home table opens on the headline columns; the
"20 categories" switch turns them on. Those columns are not aggregated across subsets and do not need to be: the two
taxonomies are disjoint, so a common category scores only the 50 common environments and a
professional one only the 68 professional environments. Each cell is the paper's per-subset number
unchanged. That is why the group headers name the environment count (`· 50 env`, `· 68 env`) rather
than implying a shared denominator.

Twenty-seven columns fit no viewport, so `.lb-wide` takes its natural width and the wrapper scrolls
sideways. Rank and model freeze on the left above 720px via `.stick-1` / `.stick-2`, with the second
column's offset measured in `pinHeader()` and written to `--stick-2`, since a hardcoded value drifts
with the rendered font.

## Preview locally

`fetch()` is blocked on `file://` in most browsers, so serve the directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Layout

```
index.html                 home: hero + leaderboard
results.html               full tables
benchmark.html             how the benchmark works
analysis.html              trajectory analysis + downstream
cost.html                  token usage, repriced cost, Pareto frontier
run.html                   run instructions
css/style.css              styles
js/leaderboard.js          renders both table kinds, client-side sorting
js/cost.js                 renders the two cost tables, client-side sorting
js/theme.js                dark by default, remembers a switch to light
data/results.json          GENERATED — do not edit by hand
data/cost.json             GENERATED — do not edit by hand
tools/build_results.py     regenerates data/results.json from the paper
tools/build_cost.py        regenerates data/cost.json from the raw scaffold logs
tools/build_pareto_figure.py  renders the Pareto figure from data/cost.json
assets/figures/*.png       figures rasterized from the paper PDFs
```

## Updating the numbers

`data/results.json` is generated from the `\res*` / `\prof*` macros in the paper's
`sections/4_1_experiment_results_tables.tex`. When the paper tables change, regenerate rather than
editing the JSON:

```bash
python3 tools/build_results.py /path/to/CodeWorldBench_iclr data/results.json
```

The script fails loudly if a macro is missing or does not hold exactly thirteen numeric cells
(ten categories, GEN, P2P, F2P), so a partial table cannot silently produce a partial leaderboard.

## The cost page

`data/cost.json` is not derived from the paper. Token usage is measured from the raw Claude Code logs
over the 50 common environments, using the same attempt dedup as the paper's trace scripts, and cost
is then recomputed at each vendor's published list price:

```bash
python3 tools/build_cost.py \
  /path/to/CodeWorldBench-0714/common50_prof68_results/common50_prof68/common50 \
  data/results.json data/cost.json
python3 tools/build_pareto_figure.py data/cost.json assets/figures/codeworldbench_cost_pareto.png
```

Repricing is the point of the page. The harness reports a `total_cost_usd` per run and that number is
exact, but it prices every model at Claude Opus 5's rates, because every instrumented run went through
Claude Code. Fitting the reported cost against the four token counts recovers $5.00 input, $0.50 cache
read and $25.00 output per million in all sixteen model-setting cells; holding that fixed table
reproduces the reported cost to within 1% on 98.1% of the 800 runs. So the paper's cost column ranks
token volume, not price. It is kept in `cost.json` as `billed` for comparison.

Rates live in `PRICES` at the top of `tools/build_cost.py`, with each caveat noted inline — Opus uses
the 1-hour cache-write rate because every cache-creation token in these logs is in the 1-hour bucket,
DeepSeek-v4-pro uses the permanent 75% cut, DeepSeek-v4.1-flash uses off-peak. Prices move, so the
retrieval date is recorded in the JSON as `pricesRetrieved`.

Seven of the nineteen leaderboard rows appear. The Codex and Doubao runs record no usage block at all,
so no repricing can recover them; Tencent's hy4-preview logs usage but has no published score, so it
cannot be placed on a cost-capability plane.

## Updating the figures

Figures are rasterized from the paper's PDFs at 160 dpi and trimmed:

```bash
pdftoppm -png -r 160 -singlefile figures/<name>.pdf /tmp/<name>
convert /tmp/<name>.png -trim +repage -bordercolor white -border 14 assets/figures/<name>.png
```

Where poppler is unavailable, PyMuPDF rasterizes the same way — `fitz.open(pdf)[0].get_pixmap(dpi=160)`
— and the trim step is unchanged. Rendering both the old and new PDFs and comparing mean absolute
pixel difference is how the committed PNGs were confirmed to come from the current paper.

## Publishing

Published at <https://codeworldbench.github.io/> from the `codeworldbench/codeworldbench.github.io`
repository, `main` branch, root directory.

All URLs are relative, so the tree also works unchanged from a `docs/` folder or a project path like
`<user>.github.io/CodeWorldBench-web/`. The empty `.nojekyll` at the root keeps Jekyll from
reprocessing the tree.

The `noindex, nofollow` robots meta tag was removed from every page when the site went public. Add it
back to all six pages, not just `index.html`, if the site ever needs to leave search results again.
