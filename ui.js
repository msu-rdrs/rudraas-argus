// ─── RUDRAAS ARGUS — Interface behaviour ───
// Pure UI glue: shortcuts, help dialog, panel collapse, live summaries
// and keyboard navigation for search. Layer modules own their data;
// this file only observes the DOM state they already maintain.

(function initInterface() {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const layerRows = Array.from(document.querySelectorAll(".layer-row"));
  const layersPanel = $("layers-panel");
  const layersSummary = $("layers-summary");
  const statusObjects = $("status-objects");
  const searchBar = $("search-bar");
  const searchDropdown = $("search-dropdown");
  const helpOverlay = $("help-overlay");
  const inspector = $("aircraft-panel");

  // ── Layer state → aria-pressed + summaries ──
  function parseCount(el) {
    if (!el || !el.classList.contains("visible")) return 0;
    const n = parseInt(String(el.textContent).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function refreshSummary() {
    let active = 0;
    let objects = 0;
    layerRows.forEach((row) => {
      const on = row.classList.contains("active");
      row.setAttribute("aria-pressed", on ? "true" : "false");
      const count = row.querySelector(".layer-count");
      // Only write when it changes — this observer watches these nodes.
      if (count && !count.classList.contains("visible") && !count.classList.contains("error") &&
          count.textContent !== "—") {
        count.textContent = "—";
      }
      if (on) {
        active++;
        objects += parseCount(count);
      }
    });
    layersSummary.textContent = active === 0
      ? "None active"
      : `${active} of ${layerRows.length} active`;
    statusObjects.textContent =
      `${objects.toLocaleString("en-US")} object${objects === 1 ? "" : "s"} tracked`;
  }

  const observer = new MutationObserver(refreshSummary);
  layerRows.forEach((row) => {
    observer.observe(row, { attributes: true, attributeFilter: ["class"] });
    const count = row.querySelector(".layer-count");
    if (count) {
      observer.observe(count, { attributes: true, attributeFilter: ["class"], childList: true, characterData: true, subtree: true });
    }
  });
  refreshSummary();

  // ── Collapse layers panel ──
  const collapseBtn = $("layers-collapse");
  collapseBtn.addEventListener("click", () => {
    const collapsed = layersPanel.classList.toggle("collapsed");
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    collapseBtn.title = collapsed ? "Expand panel" : "Collapse panel";
    try { localStorage.setItem("argus.layersCollapsed", collapsed ? "1" : "0"); } catch (_) {}
  });
  try {
    if (localStorage.getItem("argus.layersCollapsed") === "1") collapseBtn.click();
  } catch (_) {}

  // ── Help dialog ──
  function openHelp() { helpOverlay.classList.remove("hidden"); $("help-close").focus(); }
  function closeHelp() { helpOverlay.classList.add("hidden"); }
  $("help-btn").addEventListener("click", openHelp);
  $("help-close").addEventListener("click", closeHelp);
  helpOverlay.addEventListener("click", (e) => { if (e.target === helpOverlay) closeHelp(); });

  // ── Search: arrow-key navigation through suggestions ──
  function dropdownItems() {
    if (searchDropdown.classList.contains("hidden")) return [];
    return Array.from(searchDropdown.querySelectorAll(".search-history-item, .autocomplete-item"));
  }
  function setActiveItem(items, idx) {
    items.forEach((el, i) => el.classList.toggle("is-active", i === idx));
    if (items[idx]) items[idx].scrollIntoView({ block: "nearest" });
  }

  // Capture phase so Enter on a highlighted suggestion wins over the geocoder.
  document.addEventListener("keydown", (e) => {
    if (e.target !== searchBar) return;
    const items = dropdownItems();
    const current = items.findIndex((el) => el.classList.contains("is-active"));

    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActiveItem(items, (current + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActiveItem(items, current <= 0 ? items.length - 1 : current - 1);
    } else if (e.key === "Enter" && current >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      items[current].click();
    } else if (e.key === "Escape") {
      searchDropdown.classList.add("hidden");
      searchBar.blur();
    }
  }, true);

  // ── Global shortcuts ──
  const keyToButton = {
    "1": "air-toggle", "2": "sat-toggle", "3": "sea-toggle", "4": "haz-toggle", "5": "cctv-toggle",
    "r": "air-refresh", "h": "nav-home", "n": "nav-north", "t": "nav-tilt",
    "+": "nav-zoom-in", "=": "nav-zoom-in", "-": "nav-zoom-out", "_": "nav-zoom-out",
  };

  function isTyping(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(e.target)) return;

    if (e.key === "Escape") {
      if (!helpOverlay.classList.contains("hidden")) { closeHelp(); return; }
      if (!inspector.classList.contains("hidden")) { $("panel-close").click(); return; }
      return;
    }
    if (!helpOverlay.classList.contains("hidden")) return;

    if (e.key === "/") {
      e.preventDefault();
      searchBar.focus();
      searchBar.select();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      openHelp();
      return;
    }
    const id = keyToButton[e.key.toLowerCase()];
    if (id) {
      e.preventDefault();
      $(id).click();
    }
  });

  console.log("ARGUS-UI: Interface ready.");
})();
