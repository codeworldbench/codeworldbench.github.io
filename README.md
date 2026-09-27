# CodeWorldBench — project site

Static site for the CodeWorldBench paper. The home page carries the headline leaderboard and little
else; detail lives on four sub-pages.

No build step and no dependencies. Every number and figure is derived from the paper source, not
retyped.

## Pages

| Page | Holds |
| --- | --- |
| `index.html` | Hero, the all-118-environment GEN leaderboard with all 20 category columns, three takeaways, the overview figure |
| `results.html` | Aggregation definitions, both subset tables in full, the by-subset figure, detailed observations |
| `benchmark.html` | Task formalism, the two settings, construction pipeline, static profile, 20 domains |
| `analysis.html` | Difficulty slices, scaffold effects, trace analysis, downstream transfer, conclusion |
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

The same table carries all twenty domain categories to the right of GEN, ten common then ten
professional. Those columns are not aggregated across subsets and do not need to be: the two
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
run.html                   run instructions
css/style.css              styles
js/leaderboard.js          renders both table kinds, client-side sorting
data/results.json          GENERATED — do not edit by hand
tools/build_results.py     regenerates data/results.json from the paper
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

## Updating the figures

Figures are rasterized from the paper's PDFs at 160 dpi and trimmed:

```bash
pdftoppm -png -r 160 -singlefile figures/<name>.pdf /tmp/<name>
convert /tmp/<name>.png -trim +repage -bordercolor white -border 14 assets/figures/<name>.png
```

## Publishing later

The tree is already Pages-compatible: all URLs are relative, so it works from a repository root, a
`docs/` folder, or a project path like `<user>.github.io/CodeWorldBench-web/`. Two things to do at
that point:

- add an empty `.nojekyll` at the root (already present) so Jekyll does not reprocess the tree
- remove the `noindex, nofollow` robots meta tag in `index.html`, which is there to keep the site out
  of search results while the repository is private
