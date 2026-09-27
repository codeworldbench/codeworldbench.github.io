# CodeWorldBench — project site

Static site for the CodeWorldBench paper: overview figure, the two result tables as a sortable
leaderboard, trajectory analysis, downstream transfer, and run instructions.

No build step and no dependencies. Every number and figure is derived from the paper source, not
retyped.

## Preview locally

`fetch()` is blocked on `file://` in most browsers, so serve the directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Layout

```
index.html                 single page
css/style.css              styles
js/leaderboard.js          renders data/results.json, client-side sorting
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
