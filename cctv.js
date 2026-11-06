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

  // Camera list lives in cctv-feeds.js so the Intel Feed page can share it
  var CAMERA_FEEDS = window.ARGUS_CAMERA_FEEDS || [];

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
