// ─── RUDRAAS ARGUS — Global Hazards Module (Live USGS Seismic Data) ───
// Performance-optimized: no CLAMP_TO_GROUND, pre-built colors, batched entity ops

(function () {
  var hazToggle = document.getElementById("haz-toggle");
  var hazHud = document.getElementById("hazards-hud");
  var airRefresh = document.getElementById("air-refresh");
  var panel = document.getElementById("aircraft-panel");
  var panelTitle = document.getElementById("panel-title");
  var panelRoute = document.getElementById("panel-route");
  var panelBodyAir = document.getElementById("panel-body");
  var panelBodySat = document.getElementById("panel-body-sat");
  var panelBodySea = document.getElementById("panel-body-sea");
  var panelBodyHaz = document.getElementById("panel-body-haz");

  var hazActive = false;
  var hazEntities = [];
  var selectedHaz = null;

  // Pre-built colors — avoid per-entity CSS parsing
  var COLOR_RED = Cesium.Color.RED;
  var COLOR_ORANGE = Cesium.Color.fromCssColorString("#FF8800");
  var COLOR_HAZ = Cesium.Color.fromCssColorString("#FF3300");
  var COLOR_HAZ_FILL = COLOR_HAZ.withAlpha(0.18);
  var COLOR_HAZ_LABEL = COLOR_HAZ.clone();
  var COLOR_BLACK = Cesium.Color.BLACK;
  var PIN_HEIGHT = 50; // meters above ellipsoid — kills parallax without terrain queries

  // ═══════════════════════════════════════════
  //  Toggle Handler
  // ═══════════════════════════════════════════

  hazToggle.addEventListener("click", function () {
    hazActive = !hazActive;
    hazToggle.classList.toggle("active", hazActive);

    if (hazActive) {
      fetchAndRender();
    } else {
      clearHazards();
    }
  });

  // Smart Sync — exposed globally
  window._argusHazSync = function () {
    if (!hazActive) return false;
    fetchAndRender();
    return true;
  };

  // ═══════════════════════════════════════════
  //  Fetch + Render
  // ═══════════════════════════════════════════

  async function fetchAndRender() {
    try {
      airRefresh.classList.add("spinning");
      console.log("ARGUS-HAZ: Fetching USGS seismic data...");

      var res = await fetch(
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson"
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      var json = await res.json();
      var features = json.features || [];
      console.log("ARGUS-HAZ: Received", features.length, "seismic events");

      clearHazards();
      hazActive = true;
      hazToggle.classList.add("active");
      ingestHazards(features);
    } catch (err) {
      console.error("ARGUS-HAZ: Fetch error —", err.message);
    } finally {
      airRefresh.classList.remove("spinning");
    }
  }

  // ═══════════════════════════════════════════
  //  Ingest — batched, no terrain clamping
  // ═══════════════════════════════════════════

  function ingestHazards(features) {
    viewer.entities.suspendEvents();

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      try {
        if (!f.geometry || !f.geometry.coordinates) continue;

        const lng = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const depth = f.geometry.coordinates[2] || 0;
        const mag = f.properties.mag || 0;
        const place = f.properties.place || "UNKNOWN LOCATION";

        if (isNaN(lat) || isNaN(lng)) continue;

        const safeData = {
          place: place,
          mag: mag,
          depth: depth,
          time: f.properties.time,
          lng: lng,
          lat: lat,
        };

        const isMajor = mag >= 4.0;
        const isThreat = mag >= 2.5;

        const entityConfig = {
          position: Cesium.Cartesian3.fromDegrees(lng, lat, PIN_HEIGHT),
          point: {
            pixelSize: isMajor ? 7 : (isThreat ? 5 : 3),
            color: isMajor ? COLOR_RED : COLOR_ORANGE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        };

        // Labels only on M4.0+ to cut rendering load
        if (isMajor) {
          entityConfig.label = {
            text: "M " + mag.toFixed(1),
            font: '11px "Roboto Mono", monospace',
            fillColor: COLOR_HAZ_LABEL,
            outlineColor: COLOR_BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          };
        }

        // Impact ellipse only on M4.0+
        if (isMajor) {
          const impactRadius = Math.max((mag * mag * mag) * 1500, 10000);
          entityConfig.ellipse = {
            semiMajorAxis: impactRadius,
            semiMinorAxis: impactRadius,
            material: COLOR_HAZ_FILL,
            height: 0,
          };
        }

        const entity = viewer.entities.add(entityConfig);
        entity._isHazard = true;
        entity._hazardData = safeData;

        hazEntities.push(entity);
      } catch (e) {
        // Skip bad feature
      }
    }

    viewer.entities.resumeEvents();

    console.log("ARGUS-HAZ: Tracking", hazEntities.length, "seismic events");
    hazHud.textContent = "HAZARDS TRACKED: " + hazEntities.length;
    hazHud.classList.add("visible");
  }

  // ═══════════════════════════════════════════
  //  Panel
  // ═══════════════════════════════════════════

  function resetPanelFromHaz() {
    selectedHaz = null;
    panel.classList.remove("haz-mode");
    panelTitle.textContent = "AIRCRAFT INTEL";
    panelRoute.style.display = "";
    panelBodyAir.style.display = "";
    panelBodySat.style.display = "none";
    panelBodySea.style.display = "none";
    panelBodyHaz.style.display = "none";
  }

  // ═══════════════════════════════════════════
  //  Cleanup — batched removal
  // ═══════════════════════════════════════════

  function clearHazards() {
    if (selectedHaz) {
      resetPanelFromHaz();
      panel.classList.add("hidden");
    }

    viewer.entities.suspendEvents();
    for (var i = 0; i < hazEntities.length; i++) {
      viewer.entities.remove(hazEntities[i]);
    }
    viewer.entities.resumeEvents();
    hazEntities = [];

    hazHud.classList.remove("visible");
    hazHud.textContent = "HAZARDS TRACKED: 0";
  }

  // ═══════════════════════════════════════════
  //  Click handler
  // ═══════════════════════════════════════════

  var clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction(function (click) {
    viewer.trackedEntity = undefined;

    var picked = viewer.scene.pick(click.position);

    if (Cesium.defined(picked) && picked.id && picked.id._isHazard) {
      var data = picked.id._hazardData;
      if (data) {
        var mag = data.mag;
        var radiusMeters = Math.max((mag * mag * mag) * 1500, 10000);
        var radiusKm = (radiusMeters / 1000).toFixed(1);

        document.getElementById("haz-panel-loc").textContent = data.place.toUpperCase();

        var latStr = Math.abs(data.lat).toFixed(4) + (data.lat >= 0 ? "° N" : "° S");
        var lngStr = Math.abs(data.lng).toFixed(4) + (data.lng >= 0 ? "° E" : "° W");
        document.getElementById("haz-panel-epi").textContent = latStr + ", " + lngStr;

        document.getElementById("haz-panel-mag").textContent = mag.toFixed(1);
        document.getElementById("haz-panel-depth").textContent = data.depth.toFixed(1) + " km";
        document.getElementById("haz-panel-radius").textContent = radiusKm + " km";

        if (data.time) {
          var timeString = new Date(data.time).toISOString().replace("T", " ").substring(0, 19);
          document.getElementById("haz-panel-time").textContent = timeString;
        } else {
          document.getElementById("haz-panel-time").textContent = "---";
        }

        selectedHaz = data;
        viewer.trackedEntity = undefined;
        panel.classList.remove("sat-mode", "sea-mode");
        panel.classList.add("haz-mode");
        panelTitle.textContent = "SEISMIC INTEL";
        panelRoute.style.display = "none";
        panelBodyAir.style.display = "none";
        panelBodySat.style.display = "none";
        panelBodySea.style.display = "none";
        panelBodyHaz.style.display = "block";
        panel.classList.remove("hidden");
        return;
      }
    }

    if (selectedHaz) {
      resetPanelFromHaz();
      panel.classList.add("hidden");
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.getElementById("panel-close").addEventListener("click", function () {
    if (selectedHaz) resetPanelFromHaz();
  });

  console.log("ARGUS-HAZ: Global Hazards module loaded.");
})();
