/* Leaderboard rendering, shared by the home page and the results page.

   Two table kinds, both fed from data/results.json:
   - #lb-overall  all 118 environments, GEN only (see below)
   - #lb-subset   one subset at a time, ten category columns plus GEN/P2P/F2P

   Whichever mount exists on the page gets rendered, so one script serves both.
   No dependencies: the site is static with no build step. */

(function () {
  "use strict";

  var DATA_URL = (document.body.dataset.dataUrl || "data/results.json");
  var ASSET_BASE = (document.body.dataset.assetBase || "");

  var state = {
    data: null,
    subset: "common",
    // The home leaderboard shows the 14 default-scaffold rows, matching the paper
    // figure. The results page opts into all 19 via data-all-scaffolds, so its
    // tables mirror the paper's own tables row for row.
    defaultsOnly: document.body.dataset.allScaffolds !== "true",
    overallSort: { key: "gen", dir: -1 },
    subsetSort: { key: "gen", dir: -1 }
  };

  var mounts = {};

  function fmt(x) {
    return x.toFixed(2);
  }

  /* A row uses its model's default scaffold unless it is one of the extra Qwen
     scaffold rows. The paper's figures report the 14 default rows: OpenAI under
     Codex, everything else under Claude Code. */
  function isDefaultScaffold(row) {
    return !(row.model.indexOf("Qwen3") === 0 && row.scaffold !== "Claude Code");
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function logoCell(row, cls) {
    var td = el("td", cls);
    var img = el("img");
    img.src = ASSET_BASE + "assets/figures/logo_" + row.logo + ".png";
    img.alt = "";
    img.width = 16;
    img.height = 16;
    td.appendChild(img);
    td.appendChild(document.createTextNode(" " + row.model + " "));
    td.appendChild(el("span", "badge " + row.source, row.source));
    td.title = row.provider;
    return td;
  }

  /* Sortable header cell. `sort` is the live sort object for this table. */
  function sortTh(label, key, cls, sort, rerender, title) {
    var n = el("th", "sortable" + (cls ? " " + cls : ""));
    n.scope = "col";
    n.tabIndex = 0;
    n.dataset.sortKey = key;
    if (title) n.title = title;
    n.appendChild(document.createTextNode(label));
    if (sort.key === key) {
      n.appendChild(el("span", "arrow", sort.dir === -1 ? "▼" : "▲"));
      n.setAttribute("aria-sort", sort.dir === -1 ? "descending" : "ascending");
    }
    function activate() {
      if (sort.key === key) {
        sort.dir = -sort.dir;
      } else {
        sort.key = key;
        sort.dir = key === "model" ? 1 : -1;
      }
      // rerender() replaces this cell, so move focus to its successor to keep
      // keyboard sorting usable.
      var refocus = document.activeElement === n;
      var mount = rerender();
      if (refocus) {
        var next = mount.querySelector('th[data-sort-key="' + key + '"]');
        if (next) next.focus();
      }
    }
    n.addEventListener("click", activate);
    n.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    return n;
  }

  function plainTh(label, cls, span) {
    var n = el("th", cls, label);
    if (span) n.colSpan = span;
    // A group header spans several columns, so colgroup is the honest scope.
    n.scope = n.classList.contains("group") ? "colgroup" : "col";
    return n;
  }

  function sortBy(rows, sort, valueOf) {
    return rows.sort(function (a, b) {
      var va = valueOf(a, sort.key);
      var vb = valueOf(b, sort.key);
      if (typeof va === "string") return va.localeCompare(vb) * sort.dir * -1;
      if (va === vb) return b.gen - a.gen; // stable tiebreak on overall GEN
      return (va - vb) * sort.dir;
    });
  }

  function columnMaxima(rows, keys, valueOf) {
    var best = {};
    keys.forEach(function (k) {
      best[k] = Math.max.apply(null, rows.map(function (r) { return valueOf(r, k); }));
    });
    return best;
  }

  /* Pin the second header row directly below the group row, and the second frozen
     column directly right of the first. Both offsets depend on rendered widths and
     the font, so measure them rather than hardcode. */
  function pinHeader(table) {
    var group = table.querySelector("thead tr:first-child th.group");
    if (group) {
      table.style.setProperty("--group-h", group.getBoundingClientRect().height + "px");
    }
    var first = table.querySelector("tbody td.stick-1");
    if (first) {
      table.style.setProperty("--stick-2", first.getBoundingClientRect().width + "px");
    }
  }

  /* ---- overall table: all 118 environments, GEN only ----
     GEN macro-averages per-environment pass rates, so the all-118 score is the
     environment-weighted mean of the two subsets. P2P and F2P are micro-averages
     over cases and cannot be combined without per-subset case counts, which the
     paper does not publish, so they live on the results page instead. */

  function renderOverall() {
    var mount = mounts.overall;
    var d = state.data.overall;
    var catsC = state.data.categories.common;
    var catsP = state.data.categories.professional;
    var rows = d.rows.filter(function (r) {
      return !state.defaultsOnly || isDefaultScaffold(r);
    });

    /* Category keys are prefixed by subset because the two taxonomies are
       independent column sets living in one table. */
    function valueOf(row, key) {
      if (key === "model") return row.model + " " + row.scaffold;
      if (key.indexOf("c:") === 0) return row.categoriesCommon[key.slice(2)];
      if (key.indexOf("p:") === 0) return row.categoriesProfessional[key.slice(2)];
      return row[key];
    }
    var sort = state.overallSort;
    rows = sortBy(rows, sort, valueOf);

    var keys = ["gen", "genCommon", "genProfessional"]
      .concat(catsC.map(function (c) { return "c:" + c.code; }))
      .concat(catsP.map(function (c) { return "p:" + c.code; }));
    var best = columnMaxima(rows, keys, valueOf);

    var table = el("table", "lb-wide");
    var cap = el("caption", "skip-link");
    cap.textContent = "GEN scores over all 118 environments with per-category breakdown, " +
      rows.length + " rows, ranked.";
    table.appendChild(cap);

    var thead = el("thead");
    var top = el("tr");
    top.appendChild(plainTh("", "stick-1 left"));
    top.appendChild(plainTh("", "stick-2 left"));
    top.appendChild(plainTh("", "left", 2));
    top.appendChild(plainTh("Overall GEN", "group", 3));
    top.appendChild(plainTh("Common categories · 50 env", "group divide", catsC.length));
    top.appendChild(plainTh("Professional categories · 68 env", "group divide", catsP.length));
    thead.appendChild(top);

    var tr = el("tr");
    tr.appendChild(plainTh("#", "rank stick-1"));
    tr.appendChild(sortTh("Model", "model", "left stick-2", sort, renderOverall));
    tr.appendChild(plainTh("Params.", "left"));
    tr.appendChild(plainTh("Scaffold", "left"));
    tr.appendChild(sortTh("All 118", "gen", "big", sort, renderOverall,
      "GEN over all 118 environments"));
    tr.appendChild(sortTh("Com.", "genCommon", "", sort, renderOverall,
      "GEN over the 50 common environments"));
    tr.appendChild(sortTh("Prof.", "genProfessional", "", sort, renderOverall,
      "GEN over the 68 professional environments"));
    catsC.forEach(function (c, i) {
      tr.appendChild(sortTh(c.code, "c:" + c.code, i === 0 ? "divide" : "", sort,
        renderOverall, c.name + " (common)"));
    });
    catsP.forEach(function (c, i) {
      tr.appendChild(sortTh(c.code, "p:" + c.code, i === 0 ? "divide" : "", sort,
        renderOverall, c.name + " (professional)"));
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    var tbody = el("tbody");
    rows.forEach(function (row, i) {
      var r = el("tr");
      r.appendChild(el("td", "rank stick-1", String(i + 1)));
      r.appendChild(logoCell(row, "model left stick-2"));
      r.appendChild(el("td", "left", row.params));
      r.appendChild(el("td", "scaffold left", row.scaffold));

      /* The headline GEN gets a bar so the ranking reads without parsing digits.
         The scale is absolute, not normalized to the leader: the bar is a
         percentage of the full 0-100 track, so a 50 fills half of it and only a
         perfect 100 fills it. Scaling to the maximum instead would paint the top
         row full-width and overstate how far construction has actually got. */
      var gen = el("td", "metric big gen" + (row.gen === best.gen ? " best" : ""));
      var track = el("span", "bar-track");
      var bar = el("span", "bar");
      bar.style.setProperty("--w", row.gen.toFixed(1) + "%");
      track.appendChild(bar);
      gen.appendChild(track);
      gen.appendChild(el("span", "barval", fmt(row.gen)));
      if (sort.key === "gen") gen.classList.add("sorted-col");
      r.appendChild(gen);

      [["genCommon", "genCommon"], ["genProfessional", "genProfessional"]]
        .forEach(function (pair) {
          var k = pair[0];
          var td = el("td", "metric sub" + (row[k] === best[k] ? " best" : ""), fmt(row[k]));
          if (sort.key === k) td.classList.add("sorted-col");
          r.appendChild(td);
        });

      [[catsC, "categoriesCommon", "c:"], [catsP, "categoriesProfessional", "p:"]]
        .forEach(function (blk) {
          blk[0].forEach(function (c, j) {
            var v = row[blk[1]][c.code];
            var key = blk[2] + c.code;
            var td = el("td", "cat" + (j === 0 ? " divide" : "") +
              (v === best[key] ? " best" : ""), fmt(v));
            if (sort.key === key) td.classList.add("sorted-col");
            r.appendChild(td);
          });
        });

      tbody.appendChild(r);
    });
    table.appendChild(tbody);

    mount.innerHTML = "";
    mount.appendChild(table);
    pinHeader(table);
    if (mounts.overallMeta) {
      mounts.overallMeta.textContent = d.environments + " environments · " +
        d.cases.toLocaleString() + " hidden cases · " + rows.length + " rows";
    }
    return mount;
  }

  /* ---- subset table: ten categories plus GEN, P2P, F2P ---- */

  function renderSubset() {
    var mount = mounts.subset;
    var subset = state.data.subsets[state.subset];
    var categories = state.data.categories[state.subset];
    var sort = state.subsetSort;

    function valueOf(row, key) {
      if (key === "model") return row.model + " " + row.scaffold;
      if (key === "gen" || key === "p2p" || key === "f2p") return row[key];
      return row.categories[key];
    }

    var rows = subset.rows.filter(function (r) {
      return !state.defaultsOnly || isDefaultScaffold(r);
    });
    rows = sortBy(rows, sort, valueOf);

    var keys = ["gen", "p2p", "f2p"].concat(categories.map(function (c) { return c.code; }));
    var best = columnMaxima(rows, keys, valueOf);

    var table = el("table");
    var cap = el("caption", "skip-link");
    cap.textContent = subset.label + " subset results, " + rows.length + " rows.";
    table.appendChild(cap);

    var thead = el("thead");
    var top = el("tr");
    top.appendChild(plainTh("", "left", 4));
    top.appendChild(plainTh("Category", "group", categories.length));
    top.appendChild(plainTh("Setting", "group", 3));
    thead.appendChild(top);

    var tr = el("tr");
    tr.appendChild(plainTh("#", "rank"));
    tr.appendChild(sortTh("Model", "model", "left", sort, renderSubset));
    tr.appendChild(plainTh("Params.", "left"));
    tr.appendChild(plainTh("Scaffold", "left"));
    categories.forEach(function (c) {
      tr.appendChild(sortTh(c.code, c.code, "", sort, renderSubset, c.name));
    });
    tr.appendChild(sortTh("GEN", "gen", "", sort, renderSubset, "Construction pass rate"));
    tr.appendChild(sortTh("P2P", "p2p", "", sort, renderSubset, "Pass-to-pass preservation"));
    tr.appendChild(sortTh("F2P", "f2p", "", sort, renderSubset, "Fail-to-pass repair"));
    thead.appendChild(tr);
    table.appendChild(thead);

    var tbody = el("tbody");
    rows.forEach(function (row, i) {
      var r = el("tr");
      r.appendChild(el("td", "rank", String(i + 1)));
      r.appendChild(logoCell(row, "model left"));
      r.appendChild(el("td", "left", row.params));
      r.appendChild(el("td", "scaffold left", row.scaffold));
      categories.forEach(function (c) {
        var v = row.categories[c.code];
        var td = el("td", "cat" + (v === best[c.code] ? " best" : ""), fmt(v));
        if (sort.key === c.code) td.classList.add("sorted-col");
        r.appendChild(td);
      });
      ["gen", "p2p", "f2p"].forEach(function (k) {
        var v = row[k];
        var td = el("td", "metric " + k + (v === best[k] ? " best" : ""), fmt(v));
        if (sort.key === k) td.classList.add("sorted-col");
        r.appendChild(td);
      });
      tbody.appendChild(r);
    });
    table.appendChild(tbody);

    mount.innerHTML = "";
    mount.appendChild(table);
    pinHeader(table);

    if (mounts.subsetMeta) {
      mounts.subsetMeta.textContent = subset.environments + " environments · " +
        subset.cases.toLocaleString() + " hidden cases · " + rows.length + " rows";
    }
    document.querySelectorAll("[data-subset]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.subset === state.subset));
    });
    return mount;
  }

  function renderAll() {
    if (mounts.overall) renderOverall();
    if (mounts.subset) renderSubset();
  }

  function init() {
    mounts.overall = document.getElementById("lb-overall");
    mounts.subset = document.getElementById("lb-subset");
    mounts.overallMeta = document.getElementById("lb-overall-meta");
    mounts.subsetMeta = document.getElementById("lb-subset-meta");
    if (!mounts.overall && !mounts.subset) return;

    document.querySelectorAll("[data-subset]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (state.subset === b.dataset.subset) return;
        state.subset = b.dataset.subset;
        // Category keys differ between taxonomies; fall back to GEN on switch.
        var k = state.subsetSort.key;
        if (k !== "gen" && k !== "p2p" && k !== "f2p" && k !== "model") {
          state.subsetSort = { key: "gen", dir: -1 };
        }
        renderSubset();
      });
    });

    var toggle = document.getElementById("all-scaffolds");
    if (toggle) {
      toggle.checked = !state.defaultsOnly;
      toggle.addEventListener("change", function () {
        state.defaultsOnly = !toggle.checked;
        renderAll();
      });
    }

    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.data = data;
        renderAll();
      })
      .catch(function (err) {
        // file:// blocks fetch in most browsers; point at the local server.
        var msg = '<p class="lb-error">Could not load <code>' + DATA_URL + '</code> (' +
          err.message + ').<br>Serve the directory over HTTP: ' +
          '<code>python3 -m http.server 8000</code>, then open ' +
          '<code>http://localhost:8000/</code>.</p>';
        if (mounts.overall) mounts.overall.innerHTML = msg;
        if (mounts.subset) mounts.subset.innerHTML = msg;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
