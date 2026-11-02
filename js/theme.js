/* Theme switch. Dark is the default; a reader who picks light keeps it across
   pages and visits. Loaded in <head> rather than at the end of <body>, so the
   stored theme is applied before first paint and a light page never flashes dark.

   Storage can be unavailable (private windows, blocked site data), so every read
   and write is guarded and the page falls back to dark. */

(function () {
  "use strict";

  var KEY = "cwb-theme";
  var root = document.documentElement;

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function apply(theme) {
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }

  apply(stored());

  function init() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;

    function label() {
      var text = root.getAttribute("data-theme") === "light" ?
        "Switch to dark mode" : "Switch to light mode";
      btn.setAttribute("aria-label", text);
      btn.title = text;
    }

    label();
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {
        // Not persisted; the switch still holds for this page view.
      }
      label();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
