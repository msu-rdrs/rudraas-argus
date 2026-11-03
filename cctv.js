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

  var COLOR_CCTV = Cesium.Color.fromCssColorString("#5FD3B0");
  var COLOR_BLACK = Cesium.Color.BLACK;

  // All feeds are REAL live webcams — verified embeddable via oEmbed API
  var CAMERA_FEEDS = [
    // USA
    { id: "CAM-001", name: "NYC TIMES SQUARE",          lat: 40.7580,  lng: -73.9855,  ytId: "rnXIjl_Rzy4" },
    { id: "CAM-002", name: "NYC DUFFY SQUARE",          lat: 40.7590,  lng: -73.9845,  ytId: "iiBTWU2FyFo" },
    { id: "CAM-003", name: "LAS VEGAS STRIP",           lat: 36.1147,  lng: -115.1728, ytId: "-6q-aEQB14E" },
    { id: "CAM-004", name: "LAS VEGAS AERIE VIEW",      lat: 36.1175,  lng: -115.1710, ytId: "jtvmwjzZY0c" },
    { id: "CAM-005", name: "JACKSON HOLE TOWN SQ",      lat: 43.4799,  lng: -110.7624, ytId: "1EiC9bvVGnk" },
    { id: "CAM-006", name: "NEW ORLEANS BOURBON ST",    lat: 29.9584,  lng: -90.0654,  ytId: "Ksrleaxxxhw" },
    { id: "CAM-007", name: "NEW ORLEANS BALCONY",       lat: 29.9588,  lng: -90.0650,  ytId: "rnNPl27Arpk" },
    { id: "CAM-008", name: "KEY WEST DUVAL ST",         lat: 24.5551,  lng: -81.8018,  ytId: "3bXyYuk-XK0" },
    { id: "CAM-009", name: "NIAGARA FALLS",             lat: 43.0896,  lng: -79.0849,  ytId: "qx7gry390YA" },
    // JAPAN
    { id: "CAM-010", name: "TOKYO KABUKICHO LIVE",      lat: 35.6938,  lng: 139.7034,  ytId: "gFRtAAmiFbE" },
    { id: "CAM-011", name: "TOKYO SHIBUYA CROSSING",    lat: 35.6595,  lng: 139.7005,  ytId: "dfVK7ld38Ys" },
    { id: "CAM-012", name: "SHIBUYA SCRAMBLE ALT",      lat: 35.6597,  lng: 139.7003,  ytId: "8H3nRCFVR6Y" },
    // EUROPE
    { id: "CAM-013", name: "DUBLIN TEMPLE BAR",         lat: 53.3454,  lng: -6.2636,   ytId: "3nyPER2kzqk" },
    { id: "CAM-014", name: "DUBLIN COLLINS AVE",         lat: 53.3780,  lng: -6.2500,   ytId: "g1r59JJqY60" },
    { id: "CAM-015", name: "ROME ST PETERS BASILICA",   lat: 41.9022,  lng: 12.4539,   ytId: "VzPbcndoD40" },
    { id: "CAM-016", name: "ROME PIAZZA VENEZIA",       lat: 41.8957,  lng: 12.4823,   ytId: "3PVNKVXo6To" },
    { id: "CAM-017", name: "AMSTERDAM CENTRAAL",        lat: 52.3791,  lng: 4.9003,    ytId: "1phWWCgzXgM" },
    { id: "CAM-018", name: "AMSTERDAM ROOFTOP",         lat: 52.3738,  lng: 4.9100,    ytId: "9Pm6Ji6tm7s" },
    // ASIA-PACIFIC
    { id: "CAM-019", name: "BANGKOK SUKHUMVIT",         lat: 13.7445,  lng: 100.5557,  ytId: "UemFRPrl1hk" },
    { id: "CAM-020", name: "BANGKOK SOI 19",            lat: 13.7430,  lng: 100.5570,  ytId: "Q71sLS8h9a4" },
    { id: "CAM-021", name: "SYDNEY HARBOUR",            lat: -33.8568, lng: 151.2153,  ytId: "5uZa3-RMFos" },
    // AFRICA
    { id: "CAM-022", name: "NAMIBIA DESERT LIVE",       lat: -24.7256, lng: 15.2639,   ytId: "ydYDqZQpim8" },
    // SPACE
    { id: "CAM-023", name: "ISS EARTH VIEW",            lat: 0.0,      lng: 0.0,       ytId: "sWasdbDVNvc" },
    { id: "CAM-024", name: "ISS HD VIEWS",              lat: 10.0,     lng: -30.0,     ytId: "zPH5KtjJFaQ" },
    { id: "CAM-025", name: "NASA EARTH FROM SPACE",     lat: -10.0,    lng: 60.0,      ytId: "vytmBNhc9ig" },
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
          font: '11px "JetBrains Mono", monospace',
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
    cctvHud.textContent = cctvEntities.length.toLocaleString("en-US");
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
    panelTitle.textContent = "Live camera";
    panelRoute.style.display = "none";
    panelBodyAir.style.display = "none";
    panelBodySat.style.display = "none";
    panelBodySea.style.display = "none";
    panelBodyHaz.style.display = "none";
    panelBodyCctv.style.display = "block";

    cctvLocEl.textContent = data.name;
    cctvStatusEl.textContent = "Live uplink";
    cctvCamId.textContent = data.id;
    cctvSignal.textContent = "LIVE";

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
    panelTitle.textContent = "Aircraft";
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
    cctvHud.textContent = "0";
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
