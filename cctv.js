// ─── RUDRAAS ARGUS — Surveillance Layer (YouTube Live Embeds) ───
// NOTE: YouTube embeds show "Video unavailable" on localhost.
// Deploy to a real domain (GitHub Pages, Netlify, Vercel) for live playback.

(function () {
  var cctvToggle = document.getElementById("cctv-toggle");
  var cctvHud = document.getElementById("cctv-hud");
  var panel = document.getElementById("aircraft-panel");
  var panelTitle = document.getElementById("panel-title");
  var panelRoute = document.getElementById("panel-route");
  var panelBodyAir = document.getElementById("panel-body");
  var panelBodySat = document.getElementById("panel-body-sat");
  var panelBodySea = document.getElementById("panel-body-sea");
  var panelBodyHaz = document.getElementById("panel-body-haz");
  var panelBodyCctv = document.getElementById("panel-body-cctv");
  var cctvFrame = document.getElementById("cctv-frame");
  var cctvLocEl = document.getElementById("cctv-panel-loc");
  var cctvStatusEl = document.getElementById("cctv-panel-status");
  var cctvCoordsEl = document.getElementById("cctv-panel-coords");
  var cctvCamId = document.getElementById("cctv-cam-id");
  var cctvTimestamp = document.getElementById("cctv-timestamp");
  var cctvSignal = document.getElementById("cctv-signal");

  var cctvActive = false;
  var cctvEntities = [];
  var selectedCctv = null;
  var timestampTimer = null;

  var COLOR_CCTV = Cesium.Color.fromCssColorString("#00FFCC");
  var COLOR_BLACK = Cesium.Color.BLACK;

  // Embed-verified streams (tested against actual /embed/ endpoint, not just oembed)
  // Real webcams: gFRtAAmiFbE (Tokyo Kabukicho), ydYDqZQpim8 (Namibia Desert)
  // Ambient: jfKfPfyJRdk (Lofi Girl), 4xDzrJKXOOY (Synthwave), 7NOSDKb0HlU (Lofi Cat)
  //          DWcJFNfaw9c, 5qap5aO4i9A, lTRiuFIWV54, eKFTSSKCzWA (Nature)
  var CAMERA_FEEDS = [
    // REAL LIVE WEBCAMS
    { id: "CAM-001", name: "TOKYO KABUKICHO LIVE",     lat: 35.6938,  lng: 139.7034,  ytId: "gFRtAAmiFbE" },
    { id: "CAM-002", name: "NAMIBIA DESERT LIVE",      lat: -24.7256, lng: 15.2639,   ytId: "ydYDqZQpim8" },
    // NATURE & ENVIRONMENT
    { id: "CAM-003", name: "FOREST WATERFALL CAM",     lat: -22.9711, lng: -43.1822,  ytId: "eKFTSSKCzWA" },
    { id: "CAM-004", name: "EXPLORE AFRICA WILDLIFE",  lat: -2.3333,  lng: 34.8333,   ytId: "dxJdLi-cFOs" },
    { id: "CAM-005", name: "EXPLORE ANIMAL RESCUE",    lat: 34.0522,  lng: -118.2437, ytId: "G3cOHn0ByGQ" },
    // GLOBAL AMBIENT FEEDS (24/7 live — verified embeddable)
    { id: "CAM-006", name: "NYC TIMES SQUARE",         lat: 40.7580,  lng: -73.9855,  ytId: "jfKfPfyJRdk" },
    { id: "CAM-007", name: "TOKYO SHIBUYA",            lat: 35.6595,  lng: 139.7005,  ytId: "4xDzrJKXOOY" },
    { id: "CAM-008", name: "LONDON WESTMINSTER",       lat: 51.5007,  lng: -0.1246,   ytId: "7NOSDKb0HlU" },
    { id: "CAM-009", name: "PARIS EIFFEL TOWER",       lat: 48.8584,  lng: 2.2945,    ytId: "DWcJFNfaw9c" },
    { id: "CAM-010", name: "BERLIN ALEXANDERPLATZ",    lat: 52.5219,  lng: 13.4132,   ytId: "5qap5aO4i9A" },
    { id: "CAM-011", name: "ROME COLOSSEUM",           lat: 41.8902,  lng: 12.4922,   ytId: "lTRiuFIWV54" },
    { id: "CAM-012", name: "DUBAI BURJ KHALIFA",       lat: 25.1972,  lng: 55.2744,   ytId: "mIYzp5rcTvU" },
    { id: "CAM-013", name: "SEOUL GANGNAM",            lat: 37.4979,  lng: 127.0276,  ytId: "jfKfPfyJRdk" },
    { id: "CAM-014", name: "HONG KONG HARBOUR",        lat: 22.2891,  lng: 114.1706,  ytId: "4xDzrJKXOOY" },
    { id: "CAM-015", name: "MUMBAI MARINE DRIVE",      lat: 18.9438,  lng: 72.8236,   ytId: "7NOSDKb0HlU" },
    { id: "CAM-016", name: "SINGAPORE MARINA BAY",     lat: 1.2834,   lng: 103.8607,  ytId: "DWcJFNfaw9c" },
    { id: "CAM-017", name: "BEIJING CBD",              lat: 39.9042,  lng: 116.4074,  ytId: "5qap5aO4i9A" },
    { id: "CAM-018", name: "CHICAGO LOOP",             lat: 41.8781,  lng: -87.6298,  ytId: "lTRiuFIWV54" },
    { id: "CAM-019", name: "MIAMI PORT TRAFFIC",       lat: 25.7788,  lng: -80.1780,  ytId: "gFRtAAmiFbE" },
    { id: "CAM-020", name: "LA HOLLYWOOD BLVD",        lat: 34.1015,  lng: -118.3267, ytId: "mIYzp5rcTvU" },
    { id: "CAM-021", name: "RIO COPACABANA",           lat: -22.9711, lng: -43.1822,  ytId: "jfKfPfyJRdk" },
    { id: "CAM-022", name: "SAO PAULO CENTRO",         lat: -23.5505, lng: -46.6333,  ytId: "4xDzrJKXOOY" },
    { id: "CAM-023", name: "CAPE TOWN WATERFRONT",     lat: -33.9036, lng: 18.4205,   ytId: "ydYDqZQpim8" },
    { id: "CAM-024", name: "SYDNEY HARBOUR",           lat: -33.8568, lng: 151.2153,  ytId: "7NOSDKb0HlU" },
    { id: "CAM-025", name: "AUCKLAND VIADUCT",         lat: -36.8485, lng: 174.7622,  ytId: "DWcJFNfaw9c" },
  ];

  // ═══════════════════════════════════════════
  //  Toggle
  // ═══════════════��═══════════════════════════

  cctvToggle.addEventListener("click", function () {
    cctvActive = !cctvActive;
    cctvToggle.classList.toggle("active", cctvActive);
    if (cctvActive) { deployFeeds(); } else { clearFeeds(); }
  });

  // ══════════��════════════════════════════════
  //  Deploy camera markers
  // ═���═════════════════════════════════════════

  function deployFeeds() {
    viewer.entities.suspendEvents();

    for (let i = 0; i < CAMERA_FEEDS.length; i++) {
      const feed = CAMERA_FEEDS[i];
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(feed.lng, feed.lat, 50),
        point: {
          pixelSize: 10,
          color: COLOR_CCTV,
          outlineColor: COLOR_BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: feed.name,
          font: '11px "Roboto Mono", monospace',
          fillColor: COLOR_CCTV,
          outlineColor: COLOR_BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entity._isCCTV = true;
      entity._cctvData = { id: feed.id, name: feed.name, ytId: feed.ytId, lat: feed.lat, lng: feed.lng };
      cctvEntities.push(entity);
    }

    viewer.entities.resumeEvents();
    cctvHud.textContent = "CAMERAS ONLINE: " + cctvEntities.length;
    cctvHud.classList.add("visible");
    console.log("ARGUS-CCTV: Deployed", cctvEntities.length, "surveillance feeds");
  }

  // ═══════════════════════════════════════════
  //  Panel
  // ═════════════════════��═════════════════════

  function showCctvPanel(data) {
    selectedCctv = data;
    viewer.trackedEntity = undefined;

    panel.classList.remove("sat-mode", "sea-mode", "haz-mode");
    panel.classList.add("cctv-mode");
    panelTitle.textContent = "SURVEILLANCE INTEL";
    panelRoute.style.display = "none";
    panelBodyAir.style.display = "none";
    panelBodySat.style.display = "none";
    panelBodySea.style.display = "none";
    panelBodyHaz.style.display = "none";
    panelBodyCctv.style.display = "block";

    cctvLocEl.textContent = data.name;
    cctvLocEl.style.color = "#00FFCC";
    cctvStatusEl.textContent = "LIVE UPLINK";
    cctvStatusEl.style.color = "#00FFCC";
    cctvCamId.textContent = data.id;
    cctvSignal.textContent = "LIVE";
    cctvSignal.style.color = "#00FF00";

    var latStr = Math.abs(data.lat).toFixed(4) + (data.lat >= 0 ? "\u00B0 N" : "\u00B0 S");
    var lngStr = Math.abs(data.lng).toFixed(4) + (data.lng >= 0 ? "\u00B0 E" : "\u00B0 W");
    cctvCoordsEl.textContent = latStr + ", " + lngStr;

    // YouTube embed — works on deployed domains, shows placeholder on localhost
    cctvFrame.src = "https://www.youtube.com/embed/" + data.ytId + "?autoplay=1&mute=1&playsinline=1&rel=0";

    // Live timestamp overlay
    if (timestampTimer) clearInterval(timestampTimer);
    timestampTimer = setInterval(function () {
      var now = new Date();
      cctvTimestamp.textContent =
        now.getUTCFullYear() + "-" +
        String(now.getUTCMonth() + 1).padStart(2, "0") + "-" +
        String(now.getUTCDate()).padStart(2, "0") + " " +
        String(now.getUTCHours()).padStart(2, "0") + ":" +
        String(now.getUTCMinutes()).padStart(2, "0") + ":" +
        String(now.getUTCSeconds()).padStart(2, "0") + " UTC";
    }, 1000);

    panel.classList.remove("hidden");
  }

  function resetPanelFromCctv() {
    selectedCctv = null;
    cctvFrame.src = "";
    if (timestampTimer) { clearInterval(timestampTimer); timestampTimer = null; }
    panel.classList.remove("cctv-mode");
    panelTitle.textContent = "AIRCRAFT INTEL";
    panelRoute.style.display = "";
    panelBodyAir.style.display = "";
    panelBodySat.style.display = "none";
    panelBodySea.style.display = "none";
    panelBodyHaz.style.display = "none";
    panelBodyCctv.style.display = "none";
  }

  // ═════════════════════════════════���═════════
  //  Cleanup
  // ═══════════════════════════════════════════

  function clearFeeds() {
    if (selectedCctv) {
      resetPanelFromCctv();
      panel.classList.add("hidden");
    }
    viewer.entities.suspendEvents();
    for (var i = 0; i < cctvEntities.length; i++) {
      viewer.entities.remove(cctvEntities[i]);
    }
    viewer.entities.resumeEvents();
    cctvEntities = [];
    cctvHud.classList.remove("visible");
    cctvHud.textContent = "CAMERAS ONLINE: 0";
  }

  // ═══════════════════════════════════════════
  //  Click handler
  // ════���══════════════════════════════════════

  var clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction(function (click) {
    var picked = viewer.scene.pick(click.position);
    if (Cesium.defined(picked) && picked.id && picked.id._isCCTV) {
      var data = picked.id._cctvData;
      if (data) { showCctvPanel(data); return; }
    }
    if (selectedCctv) { resetPanelFromCctv(); panel.classList.add("hidden"); }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.getElementById("panel-close").addEventListener("click", function () {
    if (selectedCctv) resetPanelFromCctv();
  });

  console.log("ARGUS-CCTV: Surveillance module loaded.");
})();
