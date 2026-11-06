// ─── RUDRAAS ARGUS — Intel Feed ───
// One page for everything coming in: news, seismic, aircraft, vessels, satellites, cameras.
// All text from outside sources is inserted with textContent, never as HTML.

(function () {
  "use strict";

  const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
  const REFRESH_MS = {
    news: 5 * 60 * 1000,
    hazards: 5 * 60 * 1000,
    aircraft: 5 * 60 * 1000, // FR24 calls cost credits — keep this slow
    maritime: 60 * 1000,
    satellites: 60 * 60 * 1000,
  };
  const PAGE_SIZE = 60;
  const EMERGENCY_SQUAWKS = { "7500": "HIJACK", "7600": "RADIO FAILURE", "7700": "EMERGENCY" };

  const state = {
    news: [],
    newsSources: [],
    hazards: [],
    aircraft: [],
    vessels: [],
    satellites: [],
    cameras: window.ARGUS_CAMERA_FEEDS || [],
    status: {},
    filter: "ALL",
    query: "",
    limit: PAGE_SIZE,
    showAllCams: false,
  };

  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "text") node.textContent = v;
        else if (k === "className") node.className = v;
        else if (k === "style") node.setAttribute("style", v);
        else node.setAttribute(k, v === true ? "" : v);
      }
    }
    (children || []).forEach((c) => { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }

  function safeUrl(u) {
    try {
      const url = new URL(u, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function globeLink(lat, lng, label) {
    return "index.html#fly=" + lat.toFixed(4) + "," + lng.toFixed(4) + "," + encodeURIComponent(label);
  }

  // ── Time helpers ──
  function utcHHMM(t) { return new Date(t).toISOString().slice(11, 16) + "Z"; }
  function ago(t) {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return s + "s";
    if (s < 3600) return Math.round(s / 60) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    return Math.round(s / 86400) + "d";
  }
  function fmtCoord(lat, lng) {
    return Math.abs(lat).toFixed(2) + "°" + (lat >= 0 ? "N" : "S") + " " + Math.abs(lng).toFixed(2) + "°" + (lng >= 0 ? "E" : "W");
  }

  // ── Source status ──
  function setStatus(key, s, msg) {
    state.status[key] = { state: s, msg: msg || "", at: Date.now() };
  }

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.error || j.message || ""; } catch (e) { /* ignore */ }
      throw new Error("HTTP " + res.status + (detail ? " · " + detail : ""));
    }
    return res.json();
  }

  async function load(key, fn) {
    setStatus(key, "loading");
    renderTiles();
    try {
      await fn();
      setStatus(key, "live");
    } catch (err) {
      console.warn("ARGUS-FEED:", key, "failed —", err.message);
      setStatus(key, "error", err.message);
    }
    renderAll();
  }

  // ═══════════════════════════════════════════
  //  Loaders
  // ═══════════════════════════════════════════

  function loadNews() {
    return load("news", async () => {
      const json = await getJSON("/api/news");
      state.newsSources = json.sources || [];
      state.news = (json.data || []).map((n) => ({
        id: n.id,
        title: n.title,
        url: safeUrl(n.url),
        source: n.source,
        country: n.country,
        summary: n.summary,
        topic: n.topic || "GENERAL",
        time: Date.parse(n.published) || Date.now(),
      }));
      if (!state.news.length) throw new Error("no articles returned");
    });
  }

  function loadHazards() {
    return load("hazards", async () => {
      const json = await getJSON(USGS_URL);
      state.hazards = (json.features || [])
        .filter((f) => f.geometry && Array.isArray(f.geometry.coordinates))
        .map((f) => ({
          id: f.id,
          mag: Number(f.properties.mag) || 0,
          place: f.properties.place || "UNKNOWN LOCATION",
          time: f.properties.time,
          url: safeUrl(f.properties.url),
          tsunami: f.properties.tsunami === 1,
          alert: f.properties.alert || null,
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          depth: f.geometry.coordinates[2] || 0,
        }));
    });
  }

  function loadAircraft() {
    return load("aircraft", async () => {
      const json = await getJSON("/api/fr24?lamin=-90&lamax=90&lomin=-180&lomax=180");
      const now = Date.now();
      state.aircraft = (json.data || []).map((f) => {
        const ts = Date.parse(f.timestamp);
        return {
          id: f.fr24_id || f.flight_id || f.id || f.hex || Math.random().toString(36).slice(2),
          callsign: (f.callsign || f.flight || "").trim() || "———",
          type: f.type || "—",
          reg: f.reg || "",
          orig: (f.orig_iata || f.orig_icao || "").trim(),
          dest: (f.dest_iata || f.dest_icao || "").trim(),
          alt: f.alt ?? f.altitude ?? null,
          spd: f.gspeed ?? f.spd ?? f.speed ?? null,
          squawk: f.squawk ? String(f.squawk) : "",
          lat: f.lat ?? f.latitude,
          lng: f.lon ?? f.lng ?? f.longitude,
          time: isNaN(ts) ? now : ts,
        };
      });
    });
  }

  function loadMaritime() {
    return load("maritime", async () => {
      const json = await getJSON("/api/maritime");
      state.vessels = json.data || [];
    });
  }

  // TLE → name, NORAD id, launch year, period, approximate altitude (no orbit library needed)
  function parseSat(s) {
    const l1 = s.tle1 || "";
    const l2 = s.tle2 || "";
    const norad = l1.substring(2, 7).trim();
    const yy = parseInt(l1.substring(9, 11), 10);
    const launchNo = parseInt(l1.substring(11, 14), 10) || 0;
    const year = isNaN(yy) ? null : (yy < 57 ? 2000 + yy : 1900 + yy);
    const n = parseFloat(l2.substring(52, 63)); // revs per day
    let period = null;
    let alt = null;
    if (n > 0) {
      period = 1440 / n;
      const w = (n * 2 * Math.PI) / 86400;
      alt = Math.cbrt(398600.4418 / (w * w)) - 6378.137;
    }
    let orbit = "—";
    if (alt != null) orbit = alt < 2000 ? "LEO" : alt < 35000 ? "MEO" : alt < 36500 ? "GEO" : "HEO";
    return { name: s.name, norad, year, launchKey: (year || 0) * 1000 + launchNo, period, alt, orbit };
  }

  function loadSatellites() {
    return load("satellites", async () => {
      const json = await getJSON("/api/satellites");
      state.satellites = (json.data || []).map(parseSat);
    });
  }

  function loadAll() {
    const btn = $("refresh-all");
    btn.classList.add("spinning");
    return Promise.allSettled([loadNews(), loadHazards(), loadAircraft(), loadMaritime(), loadSatellites()])
      .finally(() => btn.classList.remove("spinning"));
  }

  // ═══════════════════════════════════════════
  //  Stream
  // ═══════════════════════════════════════════

  const CHIPS = [
    { key: "ALL", label: "ALL" },
    { key: "ALERTS", label: "ALERTS" },
    { key: "NEWS", label: "NEWS" },
    { key: "SEISMIC", label: "SEISMIC" },
    { key: "CONFLICT", label: "CONFLICT" },
    { key: "DISASTER", label: "DISASTER" },
    { key: "AVIATION", label: "AVIATION" },
    { key: "MARITIME", label: "MARITIME" },
    { key: "SPACE", label: "SPACE" },
    { key: "CYBER", label: "CYBER" },
  ];

  function buildStream() {
    const items = [];

    state.news.forEach((n) => {
      items.push({
        id: n.id, kind: "NEWS", time: n.time, color: "var(--news)",
        tags: ["NEWS", n.topic], inAll: true, sev: "normal",
        title: n.title, url: n.url, summary: n.summary,
        meta: [n.topic !== "GENERAL" ? n.topic : null, n.source, n.country || null],
        text: (n.title + " " + n.summary + " " + n.source + " " + n.topic).toLowerCase(),
      });
    });

    state.hazards.forEach((h) => {
      const critical = h.mag >= 6 || h.tsunami || h.alert === "red" || h.alert === "orange";
      const tags = ["SEISMIC", "DISASTER"];
      if (critical) tags.push("ALERTS");
      items.push({
        id: "haz-" + h.id, kind: "SEISMIC", time: h.time, color: "var(--haz)",
        tags, inAll: h.mag >= 4.0, sev: critical ? "critical" : h.mag >= 4.5 ? "high" : "normal",
        title: "M " + h.mag.toFixed(1) + " — " + h.place,
        url: h.url,
        summary: "",
        meta: [
          "DEPTH " + h.depth.toFixed(0) + " KM",
          fmtCoord(h.lat, h.lng),
          h.tsunami ? "TSUNAMI FLAG" : null,
          h.alert ? "PAGER " + h.alert.toUpperCase() : null,
        ],
        mag: h.mag,
        locate: globeLink(h.lat, h.lng, "M" + h.mag.toFixed(1) + " " + h.place),
        text: (h.place + " seismic earthquake m" + h.mag.toFixed(1)).toLowerCase(),
      });
    });

    state.aircraft.forEach((a) => {
      const code = EMERGENCY_SQUAWKS[a.squawk];
      if (!code) return;
      items.push({
        id: "sq-" + a.id, kind: "AIRCRAFT", time: a.time, color: "var(--alert)",
        tags: ["ALERTS", "AVIATION"], inAll: true, sev: "critical",
        title: "SQUAWK " + a.squawk + " (" + code + ") — " + a.callsign,
        url: null, summary: "",
        meta: [a.type, a.orig && a.dest ? a.orig + " → " + a.dest : null, a.alt != null ? a.alt + " FT" : null],
        locate: a.lat != null && a.lng != null ? globeLink(a.lat, a.lng, a.callsign) : null,
        text: (a.callsign + " squawk " + a.squawk + " " + code + " aircraft").toLowerCase(),
      });
    });

    return items.sort((a, b) => b.time - a.time);
  }

  function filteredStream(all) {
    const q = state.query.trim().toLowerCase();
    return all.filter((it) => {
      if (state.filter === "ALL" ? !it.inAll : !it.tags.includes(state.filter)) return false;
      return !q || it.text.includes(q);
    });
  }

  function renderChips(all) {
    const wrap = $("stream-chips");
    wrap.textContent = "";
    CHIPS.forEach((c) => {
      const count = c.key === "ALL" ? all.filter((i) => i.inAll).length : all.filter((i) => i.tags.includes(c.key)).length;
      const b = el("button", {
        type: "button", className: "fd-chip",
        "aria-pressed": state.filter === c.key ? "true" : "false",
      }, [c.label + " ", el("b", { text: String(count) })]);
      b.addEventListener("click", () => {
        state.filter = c.key;
        state.limit = PAGE_SIZE;
        renderStream();
      });
      wrap.appendChild(b);
    });
  }

  function streamItem(it) {
    const badge = el("span", {
      className: "fd-badge" + (it.sev === "critical" ? " solid" : ""),
      style: "--c: " + (it.sev === "critical" ? "var(--alert)" : it.color),
      text: it.sev === "critical" ? "ALERT · " + it.kind : it.kind,
    });
    const meta = el("div", { className: "fd-meta" }, [badge].concat(
      it.meta.filter(Boolean).map((m) => el("span", { text: m }))
    ));

    const titleNode = it.url
      ? el("a", { href: it.url, target: "_blank", rel: "noopener noreferrer", text: it.title })
      : document.createTextNode(it.title);
    const title = el("h3", { className: "fd-title" }, [titleNode]);

    const body = el("div", { className: "fd-body" }, [meta, title]);
    if (it.summary) body.appendChild(el("p", { className: "fd-sum", text: it.summary }));

    const actions = [];
    if (it.locate) actions.push(el("a", { href: it.locate, text: "LOCATE ON GLOBE →" }));
    if (it.url) actions.push(el("a", { href: it.url, target: "_blank", rel: "noopener noreferrer", text: "OPEN SOURCE ↗" }));
    if (actions.length) body.appendChild(el("div", { className: "fd-actions" }, actions));

    const time = el("div", { className: "fd-time" }, [
      el("b", { text: ago(it.time) + " ago" }),
      el("span", { text: utcHHMM(it.time) }),
    ]);

    const children = [time, body];
    if (it.mag != null) {
      children.push(el("div", { className: "fd-mag", style: "--c: var(--haz)" }, [
        el("small", { text: "MAG" }), it.mag.toFixed(1),
      ]));
    }
    return el("li", { className: "fd-item sev-" + it.sev }, children);
  }

  function renderStream() {
    const all = buildStream();
    renderChips(all);
    const list = filteredStream(all);
    const ul = $("stream-list");
    ul.textContent = "";
    list.slice(0, state.limit).forEach((it) => ul.appendChild(streamItem(it)));

    const st = (k) => (state.status[k] || {}).state;
    const loading = ["news", "hazards"].some((k) => st(k) === "loading");
    const empty = $("stream-empty");
    empty.hidden = list.length > 0 || loading;
    empty.textContent = !all.length && st("news") === "error" && st("hazards") === "error"
      ? "NEWS AND SEISMIC SOURCES ARE OFFLINE — CHECK THE SERVER LOG AND NETWORK ACCESS."
      : "NOTHING MATCHES THIS FILTER.";
    $("stream-more").hidden = list.length <= state.limit;
    $("stream-count").textContent = list.length + " ITEMS" + (state.filter !== "ALL" ? " · " + state.filter : "");
  }

  // ═══════════════════════════════════════════
  //  Tiles
  // ═══════════════════════════════════════════

  function tile(key, count, sub) {
    const t = document.querySelector('.fd-tile[data-src="' + key + '"]');
    if (!t) return;
    const st = state.status[key] || { state: key === "cameras" ? "live" : "loading" };
    t.setAttribute("data-state", st.state);
    t.querySelector(".fd-tile-count").textContent = count;
    t.querySelector(".fd-tile-sub").textContent = st.state === "error" ? "OFFLINE · " + st.msg.toUpperCase() : sub;
    t.querySelector(".fd-tile-sub").title = st.state === "error" ? st.msg : "";
  }

  function renderTiles() {
    const okSources = state.newsSources.filter((s) => s.ok).length;
    tile("news", state.news.length || "—", state.newsSources.length ? okSources + "/" + state.newsSources.length + " SOURCES LIVE" : "CONNECTING");

    const strongest = state.hazards.reduce((m, h) => (h.mag > m ? h.mag : m), 0);
    const day = state.hazards.filter((h) => Date.now() - h.time < 86400000).length;
    tile("hazards", state.hazards.length || "—", state.hazards.length ? day + " IN 24H · MAX M" + strongest.toFixed(1) : "CONNECTING");

    const emerg = state.aircraft.filter((a) => EMERGENCY_SQUAWKS[a.squawk]).length;
    tile("aircraft", state.aircraft.length || (state.status.aircraft && state.status.aircraft.state === "live" ? "0" : "—"),
      emerg ? emerg + " EMERGENCY SQUAWK" : "LIVE SAMPLE · FR24");

    const mil = state.vessels.filter((v) => v.category === "military").length;
    tile("maritime", state.vessels.length || "—", state.vessels.length ? mil + " MILITARY · SIMULATED" : "CONNECTING");

    const leo = state.satellites.filter((s) => s.orbit === "LEO").length;
    tile("satellites", state.satellites.length || "—", state.satellites.length ? leo + " IN LEO" : "CONNECTING");

    tile("cameras", state.cameras.length, "LIVE WEBCAM STREAMS");

    // Header sync indicator
    const sts = Object.values(state.status);
    const anyLoading = sts.some((s) => s.state === "loading");
    const errors = sts.filter((s) => s.state === "error").length;
    const dot = $("sync-dot");
    dot.className = "fd-dot " + (anyLoading ? "loading" : errors ? "error" : "live");
    const last = Math.max(0, ...sts.filter((s) => s.state === "live").map((s) => s.at));
    $("sync-text").textContent = anyLoading
      ? "SYNCING…"
      : (errors ? errors + " SOURCE" + (errors > 1 ? "S" : "") + " OFFLINE · " : "ALL SOURCES LIVE · ") +
        (last ? "SYNC " + new Date(last).toISOString().slice(11, 19) + "Z" : "");
  }

  // ═══════════════════════════════════════════
  //  Side panels
  // ═══════════════════════════════════════════

  function emptyRow(parent, msg) {
    parent.appendChild(el("li", { className: "fd-row-empty", text: msg }));
  }
  function statusMsg(key, fallback) {
    const s = state.status[key];
    if (!s || s.state === "loading") return "LOADING…";
    if (s.state === "error") return "SOURCE OFFLINE — " + s.msg;
    return fallback;
  }

  function renderHazards() {
    const ol = $("haz-list");
    ol.textContent = "";
    const top = state.hazards.slice().sort((a, b) => b.mag - a.mag).slice(0, 8);
    if (!top.length) return emptyRow(ol, statusMsg("hazards", "NO EVENTS"));
    top.forEach((h) => {
      ol.appendChild(el("li", { className: "fd-row" }, [
        el("span", { className: "fd-row-tag", text: h.mag.toFixed(1) }),
        el("div", { className: "fd-row-main" }, [
          el("span", { className: "fd-row-title", text: h.place, title: h.place }),
          el("span", { className: "fd-row-sub", text: ago(h.time) + " ago · " + h.depth.toFixed(0) + " km deep" + (h.tsunami ? " · TSUNAMI FLAG" : "") }),
        ]),
        el("a", { className: "fd-locate", href: globeLink(h.lat, h.lng, "M" + h.mag.toFixed(1) + " " + h.place), text: "LOCATE", "aria-label": "Locate " + h.place + " on the globe" }),
      ]));
    });
  }

  function renderAircraft() {
    const tb = $("air-body");
    tb.textContent = "";
    if (!state.aircraft.length) {
      tb.appendChild(el("tr", {}, [el("td", { colspan: "5", className: "fd-row-empty", text: statusMsg("aircraft", "NO AIRCRAFT RETURNED") })]));
      return;
    }
    state.aircraft
      .slice()
      .sort((a, b) => (EMERGENCY_SQUAWKS[b.squawk] ? 1 : 0) - (EMERGENCY_SQUAWKS[a.squawk] ? 1 : 0) || (b.alt || 0) - (a.alt || 0))
      .forEach((a) => {
        const route = a.orig || a.dest ? (a.orig || "???") + " → " + (a.dest || "???") : "—";
        tb.appendChild(el("tr", { className: EMERGENCY_SQUAWKS[a.squawk] ? "emergency" : null }, [
          el("td", {}, [
            a.lat != null && a.lng != null
              ? el("a", { href: globeLink(a.lat, a.lng, a.callsign), text: a.callsign, style: "color: inherit; text-decoration: none", title: "Locate on globe" })
              : document.createTextNode(a.callsign),
          ]),
          el("td", { text: a.type }),
          el("td", { text: route }),
          el("td", { className: "num", text: a.alt != null ? Number(a.alt).toLocaleString("en-US") : "—" }),
          el("td", { className: "num", text: a.spd != null ? String(a.spd) : "—" }),
        ]));
      });
  }

  function bars(container, rows, color) {
    container.textContent = "";
    const max = Math.max(1, ...rows.map((r) => r.value));
    rows.forEach((r) => {
      container.appendChild(el("div", { className: "fd-bar", style: "--c: " + color }, [
        el("span", { text: r.label }),
        el("span", { className: "fd-bar-track", "aria-hidden": "true" }, [
          el("span", { className: "fd-bar-fill", style: "display:block; width:" + ((r.value / max) * 100).toFixed(1) + "%" }),
        ]),
        el("b", { text: String(r.value) }),
      ]));
    });
  }

  function renderMaritime() {
    const cats = ["military", "cargo", "tanker", "passenger"];
    bars($("sea-bars"), cats.map((c) => ({
      label: c.toUpperCase(),
      value: state.vessels.filter((v) => v.category === c).length,
    })), "var(--sea)");

    const ol = $("sea-list");
    ol.textContent = "";
    const mil = state.vessels.filter((v) => v.category === "military").slice(0, 8);
    if (!mil.length) return emptyRow(ol, statusMsg("maritime", "NO MILITARY ASSETS"));
    mil.forEach((v) => {
      ol.appendChild(el("li", { className: "fd-row" }, [
        el("span", { className: "fd-row-tag", text: String(v.flag || "—").slice(0, 3).toUpperCase(), style: "font-size: 11px" }),
        el("div", { className: "fd-row-main" }, [
          el("span", { className: "fd-row-title", text: v.name }),
          el("span", { className: "fd-row-sub", text: v.type + " · " + v.speed + " KN · HDG " + Math.round(v.heading) + "°" }),
        ]),
        el("a", { className: "fd-locate", href: globeLink(v.lat, v.lng, v.name), text: "LOCATE", "aria-label": "Locate " + v.name + " on the globe" }),
      ]));
    });
  }

  function renderSatellites() {
    bars($("sat-bars"), ["LEO", "MEO", "GEO", "HEO"].map((o) => ({
      label: o,
      value: state.satellites.filter((s) => s.orbit === o).length,
    })), "var(--sat)");

    const ol = $("sat-list");
    ol.textContent = "";
    const newest = state.satellites.slice().sort((a, b) => b.launchKey - a.launchKey).slice(0, 6);
    if (!newest.length) return emptyRow(ol, statusMsg("satellites", "NO SATELLITES"));
    newest.forEach((s) => {
      ol.appendChild(el("li", { className: "fd-row" }, [
        el("span", { className: "fd-row-tag", text: s.year ? String(s.year) : "—", style: "font-size: 11px" }),
        el("div", { className: "fd-row-main" }, [
          el("span", { className: "fd-row-title", text: s.name }),
          el("span", {
            className: "fd-row-sub",
            text: "NORAD " + s.norad + " · " + s.orbit +
              (s.alt != null ? " · ~" + Math.round(s.alt).toLocaleString("en-US") + " KM" : "") +
              (s.period != null ? " · " + s.period.toFixed(0) + " MIN" : ""),
          }),
        ]),
        el("span"),
      ]));
    });
  }

  function renderCameras() {
    const grid = $("cam-grid");
    grid.textContent = "";
    const cams = state.showAllCams ? state.cameras : state.cameras.slice(0, 6);
    cams.forEach((c) => {
      const yt = "https://www.youtube.com/watch?v=" + encodeURIComponent(c.ytId);
      const thumb = el("a", { className: "fd-cam-thumb", href: yt, target: "_blank", rel: "noopener noreferrer", "aria-label": "Watch " + c.name + " live" }, [
        el("img", { src: "https://i.ytimg.com/vi/" + encodeURIComponent(c.ytId) + "/hqdefault_live.jpg", alt: "", loading: "lazy" }),
        el("span", { className: "fd-cam-live", text: "● " + c.id }),
      ]);
      const links = [el("a", { href: yt, target: "_blank", rel: "noopener noreferrer", text: "WATCH ↗" })];
      if (c.region !== "ORBIT") links.unshift(el("a", { href: globeLink(c.lat, c.lng, c.name), text: "LOCATE" }));
      grid.appendChild(el("div", { className: "fd-cam" }, [
        thumb,
        el("span", { className: "fd-cam-name", text: c.name, title: c.name }),
        el("div", { className: "fd-cam-links" }, links),
      ]));
    });
    const more = $("cam-more");
    more.hidden = state.cameras.length <= 6;
    more.textContent = state.showAllCams ? "SHOW FEWER" : "SHOW ALL " + state.cameras.length + " CAMERAS";
  }

  function renderAll() {
    renderTiles();
    renderStream();
    renderHazards();
    renderAircraft();
    renderMaritime();
    renderSatellites();
    renderCameras();
  }

  // ═══════════════════════════════════════════
  //  Wiring
  // ═══════════════════════════════════════════

  function tickClock() {
    $("utc-clock").textContent = new Date().toISOString().slice(11, 19);
  }

  let searchTimer = null;
  $("stream-search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value;
      state.limit = PAGE_SIZE;
      renderStream();
    }, 150);
  });
  $("stream-more").addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderStream();
  });
  $("cam-more").addEventListener("click", () => {
    state.showAllCams = !state.showAllCams;
    renderCameras();
  });
  $("refresh-all").addEventListener("click", loadAll);

  tickClock();
  setInterval(tickClock, 1000);
  setInterval(() => { renderStream(); renderHazards(); }, 30000); // keep "x ago" fresh

  setInterval(loadNews, REFRESH_MS.news);
  setInterval(loadHazards, REFRESH_MS.hazards);
  setInterval(loadAircraft, REFRESH_MS.aircraft);
  setInterval(loadMaritime, REFRESH_MS.maritime);
  setInterval(loadSatellites, REFRESH_MS.satellites);

  renderAll();
  loadAll();
})();
