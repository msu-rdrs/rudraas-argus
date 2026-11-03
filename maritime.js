// ─── RUDRAAS ARGUS — Maritime Tracking Module (CallbackProperty Positions) ───
// Bulletproof architecture mirroring aircraft.js. Zero preUpdate. Zero setInterval positioning.

(function () {
  const EARTH_RADIUS = 6371000;
  const KNOTS_TO_MS = 0.514444;

  const seaToggle = document.getElementById("sea-toggle");
  const airRefresh = document.getElementById("air-refresh");
  const maritimeHud = document.getElementById("maritime-hud");
  const panel = document.getElementById("aircraft-panel");
  const panelTitle = document.getElementById("panel-title");
  const panelRoute = document.getElementById("panel-route");
  const panelBodyAir = document.getElementById("panel-body");
  const panelBodySat = document.getElementById("panel-body-sat");
  const panelBodySea = document.getElementById("panel-body-sea");

  let seaActive = false;
  let vesselEntities = [];
  let selectedVessel = null;
  let telemetryInterval = null;

  const TELEMETRY_RATE = 500;

  // ═══════════════════════════════════════════
  //  SVG Ship Icon Generator (48x48 canvas)
  // ═══════════════════════════════════════════

  const shipIconCache = {};

  function makeShipIcon(fillColor, strongOutline) {
    const cacheKey = fillColor + (strongOutline ? "_outlined" : "");
    if (shipIconCache[cacheKey]) return shipIconCache[cacheKey];

    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);

    ctx.fillStyle = fillColor;
    if (strongOutline) {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 0.5;
    }

    // Sleek top-down hull shape — pointed bow, flat stern
    ctx.beginPath();
    ctx.moveTo(0, -18);    // bow tip
    ctx.lineTo(5, -10);
    ctx.lineTo(7, 0);
    ctx.lineTo(7, 10);
    ctx.lineTo(5, 16);     // stern corner
    ctx.lineTo(-5, 16);    // stern corner
    ctx.lineTo(-7, 10);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-5, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bridge / superstructure
    ctx.fillStyle = strongOutline ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)";
    ctx.fillRect(-3, -2, 6, 8);

    ctx.restore();
    shipIconCache[cacheKey] = canvas.toDataURL();
    return shipIconCache[cacheKey];
  }

  // Color-coded icons — Unified 4-color threat palette
  const ICON_MILITARY  = makeShipIcon("#E5484D");           // Vivid Red — Threat
  const ICON_CARGO     = makeShipIcon("#F2C14E");           // Vivid Yellow — Civilian
  const ICON_TANKER    = makeShipIcon("#000000", true);     // Pure Black + white outline — HVT
  const ICON_PASSENGER = makeShipIcon("#F2C14E");           // Vivid Yellow — Civilian

  function getIconForCategory(cat) {
    if (cat === "military")  return ICON_MILITARY;
    if (cat === "cargo")     return ICON_CARGO;
    if (cat === "tanker")    return ICON_TANKER;
    if (cat === "passenger") return ICON_PASSENGER;
    return ICON_CARGO;
  }

  function getLabelColorForCategory(cat) {
    if (cat === "military")  return Cesium.Color.fromCssColorString("#E5484D");
    if (cat === "cargo")     return Cesium.Color.fromCssColorString("#F2C14E");
    if (cat === "tanker")    return Cesium.Color.WHITE;
    if (cat === "passenger") return Cesium.Color.fromCssColorString("#F2C14E");
    return Cesium.Color.fromCssColorString("#F2C14E");
  }

  // ═══════════════════════════════════════════
  //  Dead Reckoning — identical to aircraft.js
  // ═══════════════════════════════════════════

  function deadReckonPosition(baseLat, baseLng, velocityMs, headingDeg, dtSeconds) {
    if (!isFinite(baseLat) || !isFinite(baseLng)) {
      return { lat: baseLat || 0, lng: baseLng || 0 };
    }
    if (!isFinite(velocityMs) || velocityMs <= 0 ||
        !isFinite(dtSeconds) || dtSeconds <= 0 ||
        !isFinite(headingDeg)) {
      return { lat: baseLat, lng: baseLng };
    }

    const dt = Math.min(dtSeconds, 600); // ships are slow, allow longer extrapolation
    const hdgRad = (headingDeg * Math.PI) / 180;
    const latRad = (baseLat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const DEG = 180 / Math.PI;

    const dist = velocityMs * dt;
    const dLat = (dist * Math.cos(hdgRad)) / EARTH_RADIUS * DEG;
    const dLng = cosLat > 1e-6
      ? (dist * Math.sin(hdgRad)) / (EARTH_RADIUS * cosLat) * DEG
      : 0;

    const newLat = baseLat + dLat;
    const newLng = baseLng + dLng;

    if (isNaN(newLat) || isNaN(newLng)) {
      return { lat: baseLat, lng: baseLng };
    }
    return { lat: newLat, lng: newLng };
  }

  // ═══════════════════════════════════════════
  //  Toggle Handler
  // ═══════════════════════════════════════════

  seaToggle.addEventListener("click", () => {
    seaActive = !seaActive;
    seaToggle.classList.toggle("active", seaActive);

    if (seaActive) {
      fetchAndRender();
    } else {
      clearVessels();
    }
  });

  // Smart Sync — exposed globally
  window._argusSeaSync = function () {
    if (!seaActive) return false;
    fetchAndRender();
    return true;
  };

  // ═══════════════════════════════════════════
  //  Fetch + Render
  // ═══════════════════════════════════════════

  async function fetchAndRender() {
    try {
      airRefresh.classList.add("spinning");
      console.log("ARGUS-SEA: Fetching maritime data...");

      const res = await fetch("/api/maritime");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const vessels = json.data || [];
      console.log("ARGUS-SEA: Received", vessels.length, "vessels");

      clearVessels();
      seaActive = true;
      seaToggle.classList.add("active");
      ingestVessels(vessels);
      startTelemetry();
    } catch (err) {
      console.error("ARGUS-SEA: Fetch error —", err.message);
    } finally {
      airRefresh.classList.remove("spinning");
    }
  }

  // ═══════════════════════════════════════════
  //  Ingest — CallbackProperty positions ONLY
  // ═══════════════════════════════════════════

  function ingestVessels(vessels) {
    const fetchTime = Cesium.JulianDate.now();

    for (const v of vessels) {
      try {
        const velMs = v.speed * KNOTS_TO_MS;
        const safeFallback = Cesium.Cartesian3.fromDegrees(v.lng, v.lat, 0);
        const rotation = Cesium.Math.toRadians(-v.heading);
        const category = v.category || "cargo";
        const icon = getIconForCategory(category);
        const labelClr = getLabelColorForCategory(category);

        // Capture for closure
        const fetchLat = v.lat;
        const fetchLng = v.lng;
        const velocity = velMs;
        const heading = v.heading;
        const ft = Cesium.JulianDate.clone(fetchTime);

        const entity = viewer.entities.add({
          name: v.name,
          position: new Cesium.CallbackProperty(function (time, result) {
            try {
              const dt = Cesium.JulianDate.secondsDifference(time, ft);
              const pos = deadReckonPosition(fetchLat, fetchLng, velocity, heading, dt);

              if (isNaN(pos.lat) || isNaN(pos.lng)) {
                return Cesium.Cartesian3.clone(safeFallback, result);
              }

              const finalPos = Cesium.Cartesian3.fromDegrees(pos.lng, pos.lat, 0, undefined, result);
              if (isNaN(finalPos.x) || isNaN(finalPos.y) || isNaN(finalPos.z)) {
                return Cesium.Cartesian3.clone(safeFallback, result);
              }
              return finalPos;
            } catch (e) {
              return Cesium.Cartesian3.clone(safeFallback, result);
            }
          }, false),
          billboard: {
            image: icon,
            width: 18,
            height: 18,
            rotation: rotation,
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          },
          label: {
            text: v.name,
            font: "10px 'JetBrains Mono', monospace",
            fillColor: labelClr,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            show: false,
          },
        });

        entity._isVessel = true;

        vesselEntities.push({
          id: v.id,
          name: v.name,
          type: v.type,
          category: category,
          flag: v.flag,
          speed: v.speed,
          heading: v.heading,
          fetchLat: fetchLat,
          fetchLng: fetchLng,
          velocity: velocity,
          fetchTime: ft,
          entity: entity,
        });
      } catch (e) {
        // Skip bad vessel
      }
    }

    console.log("ARGUS-SEA: Tracking", vesselEntities.length, "vessels");
    maritimeHud.textContent = vesselEntities.length.toLocaleString("en-US");
    maritimeHud.classList.add("visible");
  }

  // ═══════════════════════════════════════════
  //  Telemetry — updates ONLY panel HTML text
  // ═══════════════════════════════════════════

  function startTelemetry() {
    stopTelemetry();

    const elLat = document.getElementById("sea-panel-lat");
    const elLng = document.getElementById("sea-panel-lng");

    telemetryInterval = setInterval(() => {
      if (!selectedVessel) return;

      const now = Cesium.JulianDate.toDate(viewer.clock.currentTime);
      const dt = (now.getTime() - Cesium.JulianDate.toDate(selectedVessel.fetchTime).getTime()) / 1000;
      const pos = deadReckonPosition(
        selectedVessel.fetchLat,
        selectedVessel.fetchLng,
        selectedVessel.velocity,
        selectedVessel.heading,
        dt
      );

      elLat.textContent = pos.lat.toFixed(4) + "\u00B0";
      elLng.textContent = pos.lng.toFixed(4) + "\u00B0";
    }, TELEMETRY_RATE);
  }

  function stopTelemetry() {
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
  }

  // ═══════════════════════════════════════════
  //  Panel
  // ═══════════════════════════════════════════

  function showSeaPanel(v) {
    selectedVessel = v;
    viewer.trackedEntity = undefined;

    panel.classList.remove("sat-mode");
    panel.classList.add("sea-mode");
    panelTitle.textContent = "Vessel";
    panelRoute.style.display = "none";
    panelBodyAir.style.display = "none";
    panelBodySat.style.display = "none";
    panelBodySea.style.display = "block";

    document.getElementById("sea-panel-name").textContent = v.name;
    document.getElementById("sea-panel-type").textContent = v.type;
    document.getElementById("sea-panel-flag").textContent = v.flag;
    document.getElementById("sea-panel-speed").textContent = v.speed + " kts";
    document.getElementById("sea-panel-heading").textContent = v.heading + "\u00B0";

    // Initial position
    const dt = (Date.now() - Cesium.JulianDate.toDate(v.fetchTime).getTime()) / 1000;
    const pos = deadReckonPosition(v.fetchLat, v.fetchLng, v.velocity, v.heading, dt);
    document.getElementById("sea-panel-lat").textContent = pos.lat.toFixed(4) + "\u00B0";
    document.getElementById("sea-panel-lng").textContent = pos.lng.toFixed(4) + "\u00B0";

    panel.classList.remove("hidden");
  }

  function resetPanelFromSea() {
    selectedVessel = null;
    panel.classList.remove("sea-mode");
    panelTitle.textContent = "Aircraft";
    panelRoute.style.display = "";
    panelBodyAir.style.display = "";
    panelBodySat.style.display = "none";
    panelBodySea.style.display = "none";
  }

  // ═══════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════

  function clearVessels() {
    if (selectedVessel) {
      resetPanelFromSea();
      panel.classList.add("hidden");
    }
    stopTelemetry();

    for (const v of vesselEntities) {
      viewer.entities.remove(v.entity);
    }
    vesselEntities = [];

    maritimeHud.classList.remove("visible");
    maritimeHud.textContent = "0";
  }

  // ═══════════════════════════════════════════
  //  Hover labels
  // ═══════════════════════════════════════════

  const hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  hoverHandler.setInputAction((movement) => {
    for (const v of vesselEntities) {
      v.entity.label.show = false;
    }

    const picked = viewer.scene.pick(movement.endPosition);
    if (Cesium.defined(picked) && picked.id && picked.id._isVessel) {
      const match = vesselEntities.find((v) => v.entity === picked.id);
      if (match) match.entity.label.show = true;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // ═══════════════════════════════════════════
  //  Click handler
  // ═══════════════════════════════════════════

  const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((click) => {
    viewer.trackedEntity = undefined;

    const picked = viewer.scene.pick(click.position);

    if (Cesium.defined(picked) && picked.id && picked.id._isVessel) {
      const match = vesselEntities.find((v) => v.entity === picked.id);
      if (match) {
        showSeaPanel(match);
        return;
      }
    }

    if (selectedVessel) {
      resetPanelFromSea();
      panel.classList.add("hidden");
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.getElementById("panel-close").addEventListener("click", () => {
    if (selectedVessel) resetPanelFromSea();
  });

  console.log("ARGUS-SEA: Maritime module loaded (CallbackProperty positions).");
})();
