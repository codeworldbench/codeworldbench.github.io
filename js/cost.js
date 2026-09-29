/* Cost page tables, fed from data/cost.json.

   Two tables, both rendered here:
   - #cost-table  measured token usage and repriced cost per environment
   - #rate-table  the list prices those costs were computed from

   Same conventions as js/leaderboard.js: no dependencies, click-or-Enter column
   sorting, and a fetch failure explains that file:// blocks fetch. */

(function () {
  "use strict";

  var DATA_URL = (document.body.dataset.costUrl || "data/cost.json");
  var ASSET_BASE = (document.body.dataset.assetBase || "");

  var state = {
    data: null,
    sort: { key: "genScore", dir: -1 }
  };

  /* Column definitions for the usage table. `get` pulls the sort value out of a
     row; `text` renders it. Keeping them separate lets cost sort numerically
     while displaying a currency string. */
  var COLS = [
    { key: "genScore", label: "GEN", title: "Construction score, 50 common environments",
      get: function (r) { return r.genScore; },
      text: function (r) { return r.genScore.toFixed(2); } },
    { key: "f2pScore", label: "F2P", title: "SWE fail-to-pass rate",
      get: function (r) { return r.f2pScore; },
      text: function (r) { return r.f2pScore.toFixed(2); } },
    { key: "in", label: "Input", title: "Uncached input tokens per GEN run",
      get: function (r) { return r.gen.tokens.in; },
      text: function (r) { return tok(r.gen.tokens.in); } },
    { key: "cr", label: "Cache read", title: "Cache-hit input tokens per GEN run",
      get: function (r) { return r.gen.tokens.cr; },
      text: function (r) { return tok(r.gen.tokens.cr); } },
    { key: "cw", label: "Cache write", title: "Cache-creation tokens per GEN run",
      get: function (r) { return r.gen.tokens.cw; },
      text: function (r) { return tok(r.gen.tokens.cw); } },
    { key: "out", label: "Output", title: "Output tokens per GEN run, thinking included",
      get: function (r) { return r.gen.tokens.out; },
      text: function (r) { return tok(r.gen.tokens.out); } },
    { key: "genCost", label: "GEN cost", title: "USD per GEN environment at list prices",
      get: function (r) { return r.gen.cost; },
      text: function (r) { return usd(r.gen.cost); } },
    { key: "sweCost", label: "SWE cost", title: "USD per SWE environment at list prices",
      get: function (r) { return r.swe.cost; },
      text: function (r) { return usd(r.swe.cost); } },
    { key: "costPerPoint", label: "$/GEN pt", title: "GEN cost divided by GEN score",
      get: function (r) { return r.costPerPoint; },
      text: function (r) { return usd(r.costPerPoint); } },
    { key: "billed", label: "Billed at Opus rates",
      title: "What the harness reported: every model priced at Claude Opus 5 rates",
      get: function (r) { return r.gen.billed; },
      text: function (r) { return usd(r.gen.billed); } }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* Token counts run to eight figures, so thousands separators are the only way
     to read the cache column against the input column at a glance. */
  function tok(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  /* Costs span $0.003 to $18.77, so a fixed precision either loses the cheap
     rows or pads the expensive ones. Scale the decimals to the magnitude. */
  function usd(x) {
    if (x >= 1) return "$" + x.toFixed(2);
    if (x >= 0.01) return "$" + x.toFixed(3);
    return "$" + x.toFixed(4);
  }

  function logoCell(row, frontier) {
    var td = el("td", "left");
    var img = el("img");
    img.src = ASSET_BASE + "assets/figures/logo_" + row.logo + ".png";
    img.alt = "";
    img.width = 16;
    img.height = 16;
    td.appendChild(img);
    td.appendChild(document.createTextNode(" " + row.model + " "));
    if (frontier) {
      var b = el("span", "badge open", "frontier");
      b.title = "Nothing cheaper scores as well on GEN";
      td.appendChild(b);
    }
    td.title = row.vendor;
    return td;
  }

  function sortTh(label, key, sort, rerender, title, cls) {
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

  function renderCostTable() {
    var table = document.getElementById("cost-table");
    if (!table || !state.data) return table;
    var data = state.data;
    var frontier = {};
    data.frontier.forEach(function (m) { frontier[m] = true; });

    var sort = state.sort;
    var col = null;
    COLS.forEach(function (c) { if (c.key === sort.key) col = c; });

    var rows = data.models.slice().sort(function (a, b) {
      if (sort.key === "model") return sort.dir * a.model.localeCompare(b.model);
      return sort.dir * (col.get(a) - col.get(b));
    });

    var thead = el("thead");
    var hr = el("tr");
    hr.appendChild(sortTh("Model", "model", sort, renderCostTable, null, "left"));
    COLS.forEach(function (c) {
      hr.appendChild(sortTh(c.label, c.key, sort, renderCostTable, c.title));
    });
    thead.appendChild(hr);

    var tbody = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(logoCell(r, frontier[r.model]));
      COLS.forEach(function (c) {
        var td = el("td", null, c.text(r));
        if (sort.key === c.key) td.classList.add("sorted-col");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.replaceChildren(thead, tbody);
    return table;
  }

  function renderRateTable() {
    var table = document.getElementById("rate-table");
    if (!table || !state.data) return table;
    var tbody = el("tbody");
    // Sorted by output rate: the axis on which these vendors differ most.
    state.data.models.slice().sort(function (a, b) {
      return b.price.out - a.price.out;
    }).forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "left", r.model));
      tr.appendChild(el("td", "left", r.vendor));
      ["in", "cr", "cw", "out"].forEach(function (k) {
        tr.appendChild(el("td", null, usd(r.price[k])));
      });
      tbody.appendChild(tr);
    });
    var old = table.querySelector("tbody");
    if (old) table.replaceChild(tbody, old);
    else table.appendChild(tbody);
    return table;
  }

  function init() {
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.data = data;
        renderCostTable();
        renderRateTable();
      })
      .catch(function (err) {
        // file:// blocks fetch in most browsers; point at the local server.
        var msg = '<p class="lb-error">Could not load <code>' + DATA_URL + '</code> (' +
          err.message + ').<br>Serve the directory over HTTP: ' +
          '<code>python3 -m http.server 8000</code>, then open ' +
          '<code>http://localhost:8000/cost.html</code>.</p>';
        ["cost-table", "rate-table"].forEach(function (id) {
          var t = document.getElementById(id);
          if (t && t.parentNode) t.parentNode.innerHTML = msg;
        });
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
