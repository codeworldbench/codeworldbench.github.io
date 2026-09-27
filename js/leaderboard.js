/* Leaderboard rendering. Reads data/results.json (generated from the paper's
   result macros) and draws one table per subset with client-side sorting.
   No dependencies: the page must work from a static host with no build step. */

(function () {
  "use strict";

  var PROVIDER_NAMES = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    bytedance: "ByteDance",
    alibaba: "Alibaba",
    minimax: "MiniMax",
    zai: "Z.ai",
    deepseek: "DeepSeek",
    moonshot: "Moonshot"
  };

  var state = {
    data: null,
    subset: "common",
    defaultsOnly: false,
    sortKey: "gen",
    sortDir: -1 // -1 descending, 1 ascending
  };

  var els = {};

  function fmt(x) {
    return x.toFixed(2);
  }

  /* A row uses its model's default scaffold when it is not one of the extra
     Qwen scaffold rows. The paper reports 14 default-scaffold rows: OpenAI under
     Codex, everything else under Claude Code. */
  function isDefaultScaffold(row) {
    return !(row.model.indexOf("Qwen3") === 0 && row.scaffold !== "Claude Code");
  }

  function visibleRows() {
    var rows = state.data.subsets[state.subset].rows.slice();
    if (state.defaultsOnly) rows = rows.filter(isDefaultScaffold);
    return rows;
  }

  function valueOf(row, key) {
    if (key === "model") return row.model + " " + row.scaffold;
    if (key === "gen" || key === "p2p" || key === "f2p") return row[key];
    return row.categories[key];
  }

  function sortRows(rows) {
    var key = state.sortKey;
    var dir = state.sortDir;
    return rows.sort(function (a, b) {
      var va = valueOf(a, key);
      var vb = valueOf(b, key);
      if (typeof va === "string") return va.localeCompare(vb) * dir * -1;
      if (va === vb) return b.gen - a.gen;
      return (va - vb) * dir;
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildHead(categories) {
    var thead = el("thead");

    // Grouping row: the category block and the setting block, as in the paper.
    var top = el("tr");
    top.appendChild(th("", "left", 4));
    top.appendChild(th("Category", "group", categories.length));
    top.appendChild(th("Setting", "group", 3));
    thead.appendChild(top);

    var row = el("tr");
    row.appendChild(th("#", "rank"));
    row.appendChild(sortTh("Model", "model", "left"));
    row.appendChild(th("Params.", "left"));
    row.appendChild(th("Scaffold", "left"));
    categories.forEach(function (c) {
      var cell = sortTh(c.code, c.code);
      cell.title = c.name;
      row.appendChild(cell);
    });
    row.appendChild(sortTh("GEN", "gen"));
    row.appendChild(sortTh("P2P", "p2p"));
    row.appendChild(sortTh("F2P", "f2p"));
    thead.appendChild(row);
    return thead;

    function th(label, cls, span) {
      var n = el("th", cls, label);
      if (span) n.colSpan = span;
      if (cls !== "group") n.scope = "col";
      return n;
    }

    function sortTh(label, key, cls) {
      var n = el("th", "sortable" + (cls ? " " + cls : ""));
      n.scope = "col";
      n.tabIndex = 0;
      n.appendChild(document.createTextNode(label));
      if (state.sortKey === key) {
        n.appendChild(el("span", "arrow", state.sortDir === -1 ? "▼" : "▲"));
        n.setAttribute("aria-sort", state.sortDir === -1 ? "descending" : "ascending");
      }
      n.dataset.sortKey = key;
      function activate() {
        if (state.sortKey === key) {
          state.sortDir = -state.sortDir;
        } else {
          state.sortKey = key;
          state.sortDir = key === "model" ? 1 : -1;
        }
        // render() rebuilds the table, so the header that was just activated is
        // replaced. Re-focus its successor to keep keyboard sorting usable.
        var refocus = document.activeElement === n;
        render();
        if (refocus) {
          var next = els.mount.querySelector('th[data-sort-key="' + key + '"]');
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
  }

  function render() {
    var subset = state.data.subsets[state.subset];
    var categories = state.data.categories[state.subset];
    var rows = sortRows(visibleRows());

    // Column maxima drive the "best in column" highlight.
    var best = {};
    ["gen", "p2p", "f2p"].concat(categories.map(function (c) { return c.code; }))
      .forEach(function (k) {
        best[k] = Math.max.apply(null, rows.map(function (r) { return valueOf(r, k); }));
      });

    var table = el("table");
    table.appendChild(buildHead(categories));
    var tbody = el("tbody");

    rows.forEach(function (row, i) {
      var tr = el("tr");
      tr.appendChild(el("td", "rank", String(i + 1)));

      var model = el("td", "model left");
      var img = el("img");
      img.src = "assets/figures/logo_" + row.logo + ".png";
      img.alt = "";
      img.width = 16;
      img.height = 16;
      model.appendChild(img);
      model.appendChild(document.createTextNode(" " + row.model + " "));
      model.appendChild(el("span", "badge " + row.source, row.source));
      model.title = PROVIDER_NAMES[row.logo] || row.provider;
      tr.appendChild(model);

      tr.appendChild(el("td", "left", row.params));
      tr.appendChild(el("td", "scaffold left", row.scaffold));

      categories.forEach(function (c) {
        var v = row.categories[c.code];
        var td = el("td", "cat" + (v === best[c.code] ? " best" : ""), fmt(v));
        if (state.sortKey === c.code) td.classList.add("sorted-col");
        tr.appendChild(td);
      });

      ["gen", "p2p", "f2p"].forEach(function (k) {
        var v = row[k];
        var td = el("td", "metric " + k + (v === best[k] ? " best" : ""), fmt(v));
        if (state.sortKey === k) td.classList.add("sorted-col");
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    var cap = el("caption");
    cap.className = "skip-link";
    cap.textContent =
      subset.label + " subset results, " + rows.length + " model-scaffold rows.";
    table.insertBefore(cap, table.firstChild);

    els.mount.innerHTML = "";
    els.mount.appendChild(table);

    // Pin the second header row exactly below the group row; its height depends
    // on the rendered font, so measure rather than hardcode.
    var group = table.querySelector("thead tr:first-child th.group");
    if (group) {
      table.style.setProperty("--group-h", group.getBoundingClientRect().height + "px");
    }

    els.meta.textContent =
      subset.environments + " environments · " + subset.cases.toLocaleString() +
      " hidden cases · " + rows.length + " rows";

    els.subsetButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.subset === state.subset));
    });
  }

  function init() {
    els.mount = document.getElementById("lb-table");
    els.meta = document.getElementById("lb-meta");
    els.subsetButtons = Array.prototype.slice.call(
      document.querySelectorAll("[data-subset]")
    );

    els.subsetButtons.forEach(function (b) {
      b.addEventListener("click", function () {
        if (state.subset === b.dataset.subset) return;
        state.subset = b.dataset.subset;
        // Category keys differ between subsets, so fall back to GEN on switch.
        if (state.sortKey !== "gen" && state.sortKey !== "p2p" &&
            state.sortKey !== "f2p" && state.sortKey !== "model") {
          state.sortKey = "gen";
          state.sortDir = -1;
        }
        render();
      });
    });

    var toggle = document.getElementById("defaults-only");
    toggle.addEventListener("change", function () {
      state.defaultsOnly = toggle.checked;
      render();
    });

    fetch("data/results.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.data = data;
        render();
      })
      .catch(function (err) {
        // file:// blocks fetch in most browsers; point at the local server.
        els.mount.innerHTML =
          '<p style="padding:1rem;color:#8b95a3">Could not load ' +
          '<code>data/results.json</code> (' + err.message + ').<br>Serve the ' +
          'directory over HTTP: <code>python3 -m http.server 8000</code>, then open ' +
          '<code>http://localhost:8000/</code>.</p>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
