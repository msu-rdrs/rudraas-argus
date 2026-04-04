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

  // YouTube Live stream IDs — embed-friendly 24/7 cams
  var CAMERA_FEEDS = [
    // SPACE & STRATEGIC
    { id: "CAM-001", name: "NASA ISS LIVE UPLINK",    lat: 29.5502,  lng: -95.097,   ytId: "xRPjKQtRXR8" },
    { id: "CAM-002", name: "NASA KENNEDY SPACE CTR",  lat: 28.5721,  lng: -80.6480,  ytId: "21X5lGlDOfg" },
    // NORTH AMERICA
    { id: "CAM-003", name: "NYC TIMES SQUARE",        lat: 40.7580,  lng: -73.9855,  ytId: "1-iS7LmhJZg" },
    { id: "CAM-004", name: "MIAMI SOUTH BEACH",       lat: 25.7826,  lng: -80.1340,  ytId: "WIlEWeuPj54" },
    { id: "CAM-005", name: "LA SANTA MONICA PIER",    lat: 34.0094,  lng: -118.4973, ytId: "JR2bnsjgVBY" },
    { id: "CAM-006", name: "LAS VEGAS STRIP",         lat: 36.1147,  lng: -115.1728, ytId: "nTiJdBZ04XY" },
    { id: "CAM-007", name: "JACKSON HOLE TOWN SQ",    lat: 43.4799,  lng: -110.7624, ytId: "psfFJR3vZ78" },
    // EUROPE
    { id: "CAM-008", name: "LONDON ABBEY ROAD",       lat: 51.5322,  lng: -0.1772,   ytId: "N0GIjOOjX_I" },
    { id: "CAM-009", name: "VENICE GRAND CANAL",      lat: 45.4408,  lng: 12.3155,   ytId: "ph1vpnYIXFk" },
    { id: "CAM-010", name: "DUBLIN TEMPLE BAR",       lat: 53.3455,  lng: -6.2635,   ytId: "JkqjCcOHRsY" },
    { id: "CAM-011", name: "AMSTERDAM DAM SQUARE",    lat: 52.3730,  lng: 4.8932,    ytId: "K-RHadEa93c" },
    { id: "CAM-012", name: "KYIV MAIDAN",             lat: 50.4501,  lng: 30.5234,   ytId: "2cyaIr0OEXY" },
    // ASIA & MIDDLE EAST
    { id: "CAM-013", name: "TOKYO SHIBUYA CROSSING",  lat: 35.6595,  lng: 139.7005,  ytId: "HpdO5Kq3o7Y" },
    { id: "CAM-014", name: "TOKYO KABUKICHO",         lat: 35.6938,  lng: 139.7034,  ytId: "gFRtAAmiFbE" },
    { id: "CAM-015", name: "SEOUL GANGNAM",           lat: 37.4979,  lng: 127.0276,  ytId: "Yf80W4e_FpY" },
    { id: "CAM-016", name: "BEIJING CCTV TOWER",      lat: 39.9042,  lng: 116.4074,  ytId: "xRPjKQtRXR8" },
    { id: "CAM-017", name: "HONG KONG VICTORIA PK",   lat: 22.2891,  lng: 114.1706,  ytId: "21X5lGlDOfg" },
    { id: "CAM-018", name: "DUBAI BURJ KHALIFA",      lat: 25.1972,  lng: 55.2744,   ytId: "1-iS7LmhJZg" },
    { id: "CAM-019", name: "MUMBAI MARINE DRIVE",     lat: 18.9438,  lng: 72.8236,   ytId: "xRPjKQtRXR8" },
    { id: "CAM-020", name: "SINGAPORE MARINA BAY",    lat: 1.2834,   lng: 103.8607,  ytId: "21X5lGlDOfg" },
    // SOUTH AMERICA & AFRICA
    { id: "CAM-021", name: "RIO COPACABANA",          lat: -22.9711, lng: -43.1822,  ytId: "WIlEWeuPj54" },
    { id: "CAM-022", name: "SAO PAULO PAULISTA",      lat: -23.5505, lng: -46.6333,  ytId: "1-iS7LmhJZg" },
    { id: "CAM-023", name: "CAPE TOWN WATERFRONT",    lat: -33.9036, lng: 18.4205,   ytId: "xRPjKQtRXR8" },
    // OCEANIA
    { id: "CAM-024", name: "SYDNEY HARBOUR",          lat: -33.8568, lng: 151.2153,  ytId: "21X5lGlDOfg" },
    { id: "CAM-025", name: "AUCKLAND VIADUCT",        lat: -36.8485, lng: 174.7622,  ytId: "ph1vpnYIXFk" },
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
    cctvFrame.src = "https://www.youtube-nocookie.com/embed/" + data.ytId + "?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=0";

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
