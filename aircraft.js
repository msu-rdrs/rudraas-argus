// ─── RUDRAAS ARGUS — Aircraft Tracking Module (v6 — Airport DB + Route Lines) ───
// Smart sync, dead reckoning, trailing paths, geodesic origin trajectories.

(function () {
  const MILITARY_PREFIXES = [
    "RCH", "EVAC", "JAKE", "CNV", "VALOR", "PAT", "REACH", "NAVY", "ARMY",
  ];
  const EARTH_RADIUS = 6371000;
  const TRAIL_MAX_POINTS = 30;
  const TRAIL_SAMPLE_INTERVAL = 1000;
  const AIRPORT_DB_URL =
    "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json";

  let isActive = false;

  // aircraftState: id -> { entity, trailEntity, routeEntity, lat, lng, alt,
  //   velocity, heading, callsign, type, origIata, history[], lastTrailTime, lastUpdate }
  const aircraftState = new Map();
  const aircraftRaw   = new Map();

  // Airport lookup: IATA code (uppercase) -> { name, lat, lng }
  const airportByIata = new Map();
  let airportDbLoaded = false;

  const airToggle   = document.getElementById("air-toggle");
  const airRefresh  = document.getElementById("air-refresh");
  const aircraftHud = document.getElementById("aircraft-hud");
  const panel       = document.getElementById("aircraft-panel");
  const panelClose  = document.getElementById("panel-close");

  // ═══════════════════════════════════════════
  //  Airport Database Loader
  // ═══════════════════════════════════════════

  (async function loadAirportDb() {
    try {
      console.log("ARGUS-AIR: Loading airport database...");
      const res = await fetch(AIRPORT_DB_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // The mwgg/Airports JSON is an object keyed by ICAO code.
      // Each entry has: iata, name, lat, lon, etc.
      for (const icao in data) {
        const apt = data[icao];
        const iata = (apt.iata || "").trim().toUpperCase();
        if (iata && iata.length === 3 && apt.lat != null && apt.lon != null) {
          airportByIata.set(iata, {
            name: apt.name || iata,
            lat: parseFloat(apt.lat),
            lng: parseFloat(apt.lon),
          });
        }
      }

      airportDbLoaded = true;
      console.log(`ARGUS-AIR: Airport DB loaded — ${airportByIata.size} IATA entries.`);
    } catch (err) {
      console.warn("ARGUS-AIR: Airport DB failed to load —", err.message);
    }
  })();

  // Look up airport by IATA code. Returns { name, lat, lng } or null.
  function lookupAirport(iata) {
    if (!iata || !airportDbLoaded) return null;
    return airportByIata.get(iata.trim().toUpperCase()) || null;
  }

  // Return full name for an IATA code, or the code itself as fallback.
  function airportDisplayName(iata) {
    if (!iata) return "N/A";
    const apt = lookupAirport(iata);
    return apt ? `${iata} — ${apt.name}` : iata;
  }

  // ═══════════════════════════════════════════
  //  SVG Airplane Icon Generator (48x48 canvas)
  // ═══════════════════════════════════════════

  const iconCache = {};

  function makeAircraftIcon(fillColor) {
    if (iconCache[fillColor]) return iconCache[fillColor];

    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;

    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(2, -14);
    ctx.lineTo(16, -2);
    ctx.lineTo(16, 2);
    ctx.lineTo(2, -2);
    ctx.lineTo(2, 10);
    ctx.lineTo(8, 16);
    ctx.lineTo(8, 18);
    ctx.lineTo(2, 14);
    ctx.lineTo(1, 18);
    ctx.lineTo(-1, 18);
    ctx.lineTo(-2, 14);
    ctx.lineTo(-8, 18);
    ctx.lineTo(-8, 16);
    ctx.lineTo(-2, 10);
    ctx.lineTo(-2, -2);
    ctx.lineTo(-16, 2);
    ctx.lineTo(-16, -2);
    ctx.lineTo(-2, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, -16, 1.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    iconCache[fillColor] = canvas.toDataURL();
    return iconCache[fillColor];
  }

  const ICON_COMMERCIAL = makeAircraftIcon("#00E5FF");
  const ICON_MILITARY   = makeAircraftIcon("#FF8C00");
  const ICON_UNKNOWN    = makeAircraftIcon("#6B7280");

  // ═══════════════════════════════════════════
  //  Classification helpers
  // ═══════════════════════════════════════════

  function classifyAircraft(callsign) {
    if (!callsign || callsign.trim() === "") return "unknown";
    const cs = callsign.trim().toUpperCase();
    for (const prefix of MILITARY_PREFIXES) {
      if (cs.startsWith(prefix)) return "military";
    }
    return "commercial";
  }

  function getIconForType(t) {
    if (t === "military") return ICON_MILITARY;
    if (t === "commercial") return ICON_COMMERCIAL;
    return ICON_UNKNOWN;
  }

  function getLabelColorForType(t) {
    if (t === "military") return Cesium.Color.fromCssColorString("#FF8C00");
    if (t === "commercial") return Cesium.Color.fromCssColorString("#00E5FF");
    return Cesium.Color.fromCssColorString("#6B7280");
  }

  function getTrailColorForType(t) {
    if (t === "military") return Cesium.Color.fromCssColorString("#FF8C00").withAlpha(0.4);
    if (t === "commercial") return Cesium.Color.fromCssColorString("#00E5FF").withAlpha(0.4);
    return Cesium.Color.fromCssColorString("#6B7280").withAlpha(0.4);
  }

  function getRouteColorForType(t) {
    if (t === "military") return Cesium.Color.fromCssColorString("#FF8C00").withAlpha(0.3);
    if (t === "commercial") return Cesium.Color.fromCssColorString("#00E5FF").withAlpha(0.3);
    return Cesium.Color.fromCssColorString("#6B7280").withAlpha(0.3);
  }

  // ═══════════════════════════════════════════
  //  Camera bounding box
  // ═══════════════════════════════════════════

  function getCameraBounds() {
    const rect = viewer.camera.computeViewRectangle();
    if (!rect) return null;
    return {
      lamin: Math.max(Cesium.Math.toDegrees(rect.south), -90),
      lamax: Math.min(Cesium.Math.toDegrees(rect.north), 90),
      lomin: Math.max(Cesium.Math.toDegrees(rect.west), -180),
      lomax: Math.min(Cesium.Math.toDegrees(rect.east), 180),
    };
  }

  // ═══════════════════════════════════════════
  //  Remove a single aircraft + trail + route
  // ═══════════════════════════════════════════

  function removeAircraft(id) {
    const ac = aircraftState.get(id);
    if (!ac) return;
    viewer.entities.remove(ac.entity);
    if (ac.trailEntity) viewer.entities.remove(ac.trailEntity);
    if (ac.routeEntity) viewer.entities.remove(ac.routeEntity);
    aircraftState.delete(id);
    aircraftRaw.delete(id);
  }

  function clearAllAircraft() {
    for (const [id] of aircraftState) {
      removeAircraft(id);
    }
  }

  // ═══════════════════════════════════════════
  //  Build trail polyline positions
  // ═══════════════════════════════════════════

  function buildTrailPositions(ac) {
    const positions = [];
    for (const pt of ac.history) {
      positions.push(Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, pt.alt));
    }
    positions.push(Cesium.Cartesian3.fromDegrees(ac.lng, ac.lat, ac.alt));
    return positions;
  }

  // ═══════════════════════════════════════════
  //  Create / update origin route line
  // ═══════════════════════════════════════════

  function createRouteEntity(origIata, ac) {
    const apt = lookupAirport(origIata);
    if (!apt) return null;

    return viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          apt.lng, apt.lat, 0,
          ac.lng,  ac.lat,  ac.alt,
        ]),
        width: 1.5,
        material: new Cesium.PolylineDashMaterialProperty({
          color: getRouteColorForType(ac.type),
          dashLength: 16,
        }),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });
  }

  function updateRouteEntity(ac) {
    if (!ac.routeEntity || !ac.origIata) return;
    const apt = lookupAirport(ac.origIata);
    if (!apt) return;

    ac.routeEntity.polyline.positions = Cesium.Cartesian3.fromDegreesArrayHeights([
      apt.lng, apt.lat, 0,
      ac.lng,  ac.lat,  ac.alt,
    ]);
  }

  // ═══════════════════════════════════════════
  //  Fetch from FR24 proxy
  // ═══════════════════════════════════════════

  async function fetchAircraft() {
    if (!isActive) return;

    const bounds = getCameraBounds();
    if (!bounds) return;

    airRefresh.classList.add("spinning");

    try {
      const params = new URLSearchParams({
        lamin: bounds.lamin.toFixed(2),
        lamax: bounds.lamax.toFixed(2),
        lomin: bounds.lomin.toFixed(2),
        lomax: bounds.lomax.toFixed(2),
      });

      const res = await fetch(`/api/fr24?${params}`);
      if (!res.ok) { showFeedOffline(); return; }

      const json = await res.json();
      if (json.error) { showFeedOffline(); return; }

      hideFeedOffline();

      const flights = json.data || [];
      ingestFR24(flights);
    } catch (err) {
      console.error("ARGUS-AIR: Fetch failed —", err);
      showFeedOffline();
    } finally {
      airRefresh.classList.remove("spinning");
    }
  }

  // ═══════════════════════════════════════════
  //  Ingest FR24 data — SMART SYNC
  // ═══════════════════════════════════════════

  function ingestFR24(flights) {
    const now = performance.now();
    const freshIds = new Set();

    for (const f of flights) {
      const id       = f.flight_id || f.flightId || f.fr24_id || f.id || null;
      const callsign = (f.callsign || f.flight || "").trim();
      const lat      = f.lat ?? f.latitude ?? null;
      const lng      = f.lon ?? f.lng ?? f.longitude ?? null;
      const altFeet  = f.alt ?? f.altitude ?? f.alt_baro ?? null;
      const spdKts   = f.spd ?? f.speed ?? f.ground_speed ?? f.gspeed ?? null;
      const track    = f.track ?? f.heading ?? f.dir ?? null;
      const origIata = (f.orig_iata || f.origin || "").trim().toUpperCase();

      if (id == null || lat == null || lng == null) continue;

      freshIds.add(id);
      aircraftRaw.set(id, f);

      const altMeters = altFeet != null ? altFeet * 0.3048 : 1000;
      const velMs     = spdKts != null ? spdKts * 0.514444 : 0;
      const hdg       = track != null ? track : 0;
      const type      = classifyAircraft(callsign);
      const icon      = getIconForType(type);
      const labelClr  = getLabelColorForType(type);
      const trailClr  = getTrailColorForType(type);
      const rotation  = Cesium.Math.toRadians(-hdg);

      if (aircraftState.has(id)) {
        // ── UPDATE existing ──
        const ac = aircraftState.get(id);
        ac.lat = lat;
        ac.lng = lng;
        ac.alt = altMeters;
        ac.velocity = velMs;
        ac.heading = hdg;
        ac.callsign = callsign;
        ac.type = type;
        ac.origIata = origIata;
        ac.lastUpdate = now;

        ac.entity.position = Cesium.Cartesian3.fromDegrees(lng, lat, altMeters);
        ac.entity.billboard.image = icon;
        ac.entity.billboard.rotation = rotation;
        ac.entity.label.text = callsign || id;
        ac.entity.label.fillColor = labelClr;

        if (ac.trailEntity) ac.trailEntity.polyline.material = trailClr;

        // Update route line endpoint to fresh position
        updateRouteEntity(ac);

        // If we didn't have a route before (DB wasn't loaded yet), try now
        if (!ac.routeEntity && origIata) {
          ac.routeEntity = createRouteEntity(origIata, ac);
        }
      } else {
        // ── CREATE new ──
        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lng, lat, altMeters),
          billboard: {
            image: icon,
            width: 22,
            height: 22,
            rotation: rotation,
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: callsign || id,
            font: "11px 'Roboto Mono', monospace",
            fillColor: labelClr,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entity._flightId = id;

        const trailEntity = viewer.entities.add({
          polyline: {
            positions: [Cesium.Cartesian3.fromDegrees(lng, lat, altMeters)],
            width: 2,
            material: trailClr,
            clampToGround: false,
          },
        });

        // Build the temporary ac object so createRouteEntity can read ac.type / ac.alt
        const acObj = {
          entity,
          trailEntity,
          routeEntity: null,
          lat, lng,
          alt: altMeters,
          velocity: velMs,
          heading: hdg,
          callsign,
          type,
          origIata,
          history: [{ lat, lng, alt: altMeters }],
          lastTrailTime: now,
          lastUpdate: now,
        };

        // Create geodesic route line from origin airport
        if (origIata) {
          acObj.routeEntity = createRouteEntity(origIata, acObj);
        }

        aircraftState.set(id, acObj);
      }
    }

    // ── REMOVE stale ──
    for (const [id] of aircraftState) {
      if (!freshIds.has(id)) {
        removeAircraft(id);
      }
    }

    aircraftHud.textContent = `AIRCRAFT TRACKED: ${aircraftState.size}`;
  }

  // ═══════════════════════════════════════════
  //  Dead Reckoning + Trail Sampling — 60fps
  // ═══════════════════════════════════════════

  let lastFrameTime = performance.now();

  function deadReckon() {
    if (!isActive || aircraftState.size === 0) {
      lastFrameTime = performance.now();
      return;
    }

    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    if (dt <= 0 || dt > 2) return;

    const DEG = 180 / Math.PI;

    for (const [, ac] of aircraftState) {
      // ── Move the aircraft ──
      if (ac.velocity > 0) {
        const hdgRad = (ac.heading * Math.PI) / 180;
        const latRad = (ac.lat * Math.PI) / 180;
        const cosLat = Math.cos(latRad);

        const dist = ac.velocity * dt;
        const dLat = (dist * Math.cos(hdgRad)) / EARTH_RADIUS * DEG;
        const dLng =
          cosLat > 1e-6
            ? (dist * Math.sin(hdgRad)) / (EARTH_RADIUS * cosLat) * DEG
            : 0;

        ac.lat += dLat;
        ac.lng += dLng;

        ac.entity.position = Cesium.Cartesian3.fromDegrees(ac.lng, ac.lat, ac.alt);

        // Keep the route line tip tracking the aircraft
        updateRouteEntity(ac);
      }

      // ── Sample trail point every 1s ──
      if (now - ac.lastTrailTime >= TRAIL_SAMPLE_INTERVAL) {
        ac.history.push({ lat: ac.lat, lng: ac.lng, alt: ac.alt });

        if (ac.history.length > TRAIL_MAX_POINTS) {
          ac.history.shift();
        }

        ac.lastTrailTime = now;

        if (ac.trailEntity) {
          ac.trailEntity.polyline.positions = buildTrailPositions(ac);
        }
      }
    }
  }

  viewer.scene.preUpdate.addEventListener(deadReckon);

  // ═══════════════════════════════════════════
  //  Feed status
  // ═══════════════════════════════════════════

  function showFeedOffline() {
    aircraftHud.textContent = "AIR FEED OFFLINE";
    aircraftHud.style.color = "#FF4D4D";
    aircraftHud.style.borderColor = "rgba(255, 77, 77, 0.3)";
  }

  function hideFeedOffline() {
    aircraftHud.style.color = "";
    aircraftHud.style.borderColor = "";
  }

  // ═══════════════════════════════════════════
  //  Toggle AIR on / off
  // ═══════════════════════════════════════════

  function toggleTracking() {
    isActive = !isActive;

    if (isActive) {
      airToggle.classList.add("active");
      airRefresh.classList.add("active");
      aircraftHud.classList.add("visible");
      lastFrameTime = performance.now();
      console.log("ARGUS-AIR: Tracking ACTIVE (manual refresh mode)");
    } else {
      airToggle.classList.remove("active");
      airRefresh.classList.remove("active");
      aircraftHud.classList.remove("visible");
      panel.classList.add("hidden");
      clearAllAircraft();
      console.log("ARGUS-AIR: Tracking DISABLED");
    }
  }

  airToggle.addEventListener("click", toggleTracking);

  // ═══════════════════════════════════════════
  //  Refresh button → manual fetch
  // ═══════════════════════════════════════════

  airRefresh.addEventListener("click", () => {
    if (!isActive) return;
    fetchAircraft();
  });

  // ═══════════════════════════════════════════
  //  Click → Intel Panel
  // ═══════════════════════════════════════════

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction(function (click) {
    if (!isActive) return;

    const picked = viewer.scene.pick(click.position);

    if (Cesium.defined(picked) && picked.id && picked.id._flightId) {
      const id = picked.id._flightId;
      const f = aircraftRaw.get(id);
      if (!f) return;

      const callsign = (f.callsign || f.flight || "").trim() || "---";
      const country  = f.orig_country || f.origin_country || f.country || "---";
      const altFeet  = f.alt ?? f.altitude ?? f.alt_baro;
      const spdKts   = f.spd ?? f.speed ?? f.ground_speed ?? f.gspeed;
      const track    = f.track ?? f.heading ?? f.dir;
      const origIata = (f.orig_iata || f.origin || "").trim().toUpperCase() || "";
      const destIata = (f.dest_iata || f.destination || "").trim().toUpperCase() || "";
      const reg      = (f.reg || f.registration || "").trim() || "CLASSIFIED";
      const acType   = (f.type || f.equipment || f.aircraft_type || "").trim() || "CLASSIFIED";

      let operator = (f.airline || f.operated_as || f.painted_as || f.operator || "").trim();
      if (!operator && callsign && callsign !== "---" && callsign.length >= 3) {
        operator = callsign.substring(0, 3).toUpperCase();
      }
      if (!operator) operator = "PRIVATE / CLASSIFIED";

      // Resolve full airport names
      const origName = lookupAirport(origIata);
      const destName = lookupAirport(destIata);
      const codesLine = `${origIata || "N/A"}-${destIata || "N/A"}`;
      const namesLine = `${origName ? origName.name : (origIata || "N/A")} &rarr; ${destName ? destName.name : (destIata || "N/A")}`;

      document.getElementById("panel-route-text").innerHTML =
        `${codesLine} | ${namesLine}`;
      document.getElementById("panel-callsign").textContent = callsign;
      document.getElementById("panel-operator").textContent = operator;
      document.getElementById("panel-reg").textContent      = reg;
      document.getElementById("panel-type").textContent     = acType;
      document.getElementById("panel-country").textContent  = country;
      document.getElementById("panel-altitude").textContent =
        altFeet != null ? Number(altFeet).toFixed(0) + " ft" : "---";
      document.getElementById("panel-speed").textContent =
        spdKts != null ? Number(spdKts).toFixed(0) + " kts" : "---";
      document.getElementById("panel-heading").textContent =
        track != null ? Number(track).toFixed(1) + "\u00B0" : "---";
      document.getElementById("panel-icao").textContent =
        (f.icao24 || f.icao || id || "---").toString().toUpperCase();

      panel.classList.remove("hidden");
    } else {
      panel.classList.add("hidden");
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  panelClose.addEventListener("click", () => panel.classList.add("hidden"));

  console.log("ARGUS-AIR: Module v6 loaded (airport DB, route lines, smart sync).");
})();
