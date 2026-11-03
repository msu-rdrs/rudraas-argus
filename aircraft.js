// ─── RUDRAAS ARGUS — Aircraft Tracking Module (v7 — CallbackProperty Positions) ───
// Smart sync, CallbackProperty dead reckoning, trailing paths, geodesic routes.
// ZERO preUpdate position writes. All movement via Cesium's render pipeline.

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
  //   velocity, heading, callsign, type, origIata, history[], lastTrailTime,
  //   fetchTime (JulianDate), fetchLat, fetchLng }
  const aircraftState = new Map();
  const aircraftRaw   = new Map();

  // Airport lookup
  const airportByIata = new Map();
  let airportDbLoaded = false;

  const airToggle   = document.getElementById("air-toggle");
  const airRefresh  = document.getElementById("air-refresh");
  const aircraftHud = document.getElementById("aircraft-hud");
  const panel       = document.getElementById("aircraft-panel");
  const panelClose  = document.getElementById("panel-close");

  // Trail sampling interval
  let trailInterval = null;

  // ═══════════════════════════════════════════
  //  Airport Database Loader
  // ═══════════════════════════════════════════

  (async function loadAirportDb() {
    try {
      console.log("ARGUS-AIR: Loading airport database...");
      const res = await fetch(AIRPORT_DB_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

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

  function lookupAirport(iata) {
    if (!iata || !airportDbLoaded) return null;
    return airportByIata.get(iata.trim().toUpperCase()) || null;
  }

  // Expose globally so the search bar can resolve airport codes
  window._argusLookupAirport = lookupAirport;

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

  const ICON_COMMERCIAL = makeAircraftIcon("#F2C14E");
  const ICON_MILITARY   = makeAircraftIcon("#E5484D");
  const ICON_UNKNOWN    = makeAircraftIcon("#F2C14E");

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
    if (t === "military") return Cesium.Color.fromCssColorString("#E5484D");
    if (t === "commercial") return Cesium.Color.fromCssColorString("#F2C14E");
    return Cesium.Color.fromCssColorString("#F2C14E");
  }

  function getTrailColorForType(t) {
    if (t === "military") return Cesium.Color.fromCssColorString("#E5484D").withAlpha(0.7);
    if (t === "commercial") return Cesium.Color.fromCssColorString("#F2C14E").withAlpha(0.7);
    return Cesium.Color.fromCssColorString("#F2C14E").withAlpha(0.7);
  }

  function getRouteColorForType(t) {
    if (t === "military") return Cesium.Color.fromCssColorString("#E5484D").withAlpha(0.8);
    if (t === "commercial") return Cesium.Color.fromCssColorString("#F2C14E").withAlpha(0.8);
    return Cesium.Color.fromCssColorString("#F2C14E").withAlpha(0.8);
  }

  // ═══════════════════════════════════════════
  //  Dead reckoning math — pure function
  //  Given a base position, velocity, heading,
  //  and elapsed seconds, returns new lat/lng.
  // ═══════════════════════════════════════════

  function deadReckonPosition(baseLat, baseLng, velocity, headingDeg, dtSeconds) {
    // Strict null/NaN guards — return base position if anything is invalid
    if (!isFinite(baseLat) || !isFinite(baseLng)) {
      return { lat: baseLat || 0, lng: baseLng || 0 };
    }
    if (!isFinite(velocity) || velocity <= 0 ||
        !isFinite(dtSeconds) || dtSeconds <= 0 ||
        !isFinite(headingDeg)) {
      return { lat: baseLat, lng: baseLng };
    }

    const dt = Math.min(dtSeconds, 120);
    const hdgRad = (headingDeg * Math.PI) / 180;
    const latRad = (baseLat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const DEG = 180 / Math.PI;

    const dist = velocity * dt;
    const dLat = (dist * Math.cos(hdgRad)) / EARTH_RADIUS * DEG;
    const dLng = cosLat > 1e-6
      ? (dist * Math.sin(hdgRad)) / (EARTH_RADIUS * cosLat) * DEG
      : 0;

    const newLat = baseLat + dLat;
    const newLng = baseLng + dLng;

    // Final NaN guard
    if (isNaN(newLat) || isNaN(newLng)) {
      return { lat: baseLat, lng: baseLng };
    }
    return { lat: newLat, lng: newLng };
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
  //  Create origin route line
  // ═══════════════════════════════════════════

  function createRouteEntity(origIata, ac) {
    const apt = lookupAirport(origIata);
    if (!apt) return null;

    return viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(function (time, result) {
          try {
            if (!ac.fetchTime) {
              return Cesium.Cartesian3.fromDegreesArrayHeights([0, 0, 0, 0, 0, 0]);
            }
            const dt = Cesium.JulianDate.secondsDifference(time, ac.fetchTime);
            const pos = deadReckonPosition(ac.fetchLat, ac.fetchLng, ac.velocity, ac.heading, isFinite(dt) ? dt : 0);

            if (isNaN(pos.lat) || isNaN(pos.lng) || !isFinite(ac.alt)) {
              return Cesium.Cartesian3.fromDegreesArrayHeights([0, 0, 0, 0, 0, 0]);
            }

            const arr = Cesium.Cartesian3.fromDegreesArrayHeights([
              apt.lng, apt.lat, 0,
              pos.lng, pos.lat, ac.alt,
            ]);

            // Final Cartesian3 NaN guard
            for (let i = 0; i < arr.length; i++) {
              if (isNaN(arr[i].x) || isNaN(arr[i].y) || isNaN(arr[i].z)) {
                return Cesium.Cartesian3.fromDegreesArrayHeights([0, 0, 0, 0, 0, 0]);
              }
            }

            return arr;
          } catch (e) {
            return Cesium.Cartesian3.fromDegreesArrayHeights([0, 0, 0, 0, 0, 0]);
          }
        }, false),
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

  // ═══════════════════════════════════════════
  //  Get current dead-reckoned position for an
  //  aircraft state object. Used by CallbackProperty.
  // ═══════════════════════════════════════════

  function getCurrentPosition(ac) {
    if (!ac.fetchTime) return { lat: ac.fetchLat || 0, lng: ac.fetchLng || 0 };
    const now = Cesium.JulianDate.now();
    const dt = Cesium.JulianDate.secondsDifference(now, ac.fetchTime);
    if (!isFinite(dt)) return { lat: ac.fetchLat || 0, lng: ac.fetchLng || 0 };
    return deadReckonPosition(ac.fetchLat, ac.fetchLng, ac.velocity, ac.heading, dt);
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
  //  Positions use CallbackProperty with dead
  //  reckoning. ZERO manual entity.position = ...
  // ═══════════════════════════════════════════

  function ingestFR24(flights) {
    const fetchTime = Cesium.JulianDate.now();
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
        // ── UPDATE existing — reset the dead reckoning base ──
        const ac = aircraftState.get(id);
        ac.fetchLat = lat;
        ac.fetchLng = lng;
        ac.lat = lat;
        ac.lng = lng;
        ac.alt = altMeters;
        ac.velocity = velMs;
        ac.heading = hdg;
        ac.callsign = callsign;
        ac.type = type;
        ac.origIata = origIata;
        ac.fetchTime = Cesium.JulianDate.clone(fetchTime);

        // Update visual properties (NOT position — CallbackProperty handles that)
        ac.entity.billboard.image = icon;
        ac.entity.billboard.rotation = rotation;
        ac.entity.label.text = callsign || id;
        ac.entity.label.fillColor = labelClr;

        if (ac.trailEntity) ac.trailEntity.polyline.material = trailClr;

        // Try creating route if DB wasn't loaded before
        if (!ac.routeEntity && origIata) {
          ac.routeEntity = createRouteEntity(origIata, ac);
        }
      } else {
        // ── CREATE new — position is a CallbackProperty ──
        const acObj = {
          entity: null,
          trailEntity: null,
          routeEntity: null,
          fetchLat: lat,
          fetchLng: lng,
          lat, lng,
          alt: altMeters,
          velocity: velMs,
          heading: hdg,
          callsign,
          type,
          origIata,
          fetchTime: Cesium.JulianDate.clone(fetchTime),
          history: [{ lat, lng, alt: altMeters }],
          lastTrailTime: performance.now(),
        };

        // Cache a safe fallback position from the raw API data
        const safeFallback = Cesium.Cartesian3.fromDegrees(lng, lat, altMeters);

        const entity = viewer.entities.add({
          // CallbackProperty: Cesium calls this inside its render pipeline
          // with its own time, synced to the camera matrix. Zero desync.
          position: new Cesium.CallbackProperty(function (time, result) {
            try {
              if (!acObj.fetchTime) {
                return Cesium.Cartesian3.clone(safeFallback, result);
              }
              const dt = Cesium.JulianDate.secondsDifference(time, acObj.fetchTime);
              const pos = deadReckonPosition(acObj.fetchLat, acObj.fetchLng, acObj.velocity, acObj.heading, dt);

              if (isNaN(pos.lat) || isNaN(pos.lng) || !isFinite(acObj.alt)) {
                return Cesium.Cartesian3.clone(safeFallback, result);
              }

              return Cesium.Cartesian3.fromDegrees(pos.lng, pos.lat, acObj.alt, undefined, result);
            } catch (e) {
              return Cesium.Cartesian3.clone(safeFallback, result);
            }
          }, false),
          billboard: {
            image: icon,
            width: 22,
            height: 22,
            rotation: rotation,
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          },
          label: {
            text: callsign || id,
            font: "11px 'JetBrains Mono', monospace",
            fillColor: labelClr,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500000),
          },
        });
        entity._flightId = id;
        acObj.entity = entity;

        const trailEntity = viewer.entities.add({
          polyline: {
            positions: [Cesium.Cartesian3.fromDegrees(lng, lat, altMeters), Cesium.Cartesian3.fromDegrees(lng, lat, altMeters)],
            width: 2,
            material: trailClr,
            clampToGround: false,
          },
        });
        acObj.trailEntity = trailEntity;

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

    aircraftHud.textContent = aircraftState.size.toLocaleString("en-US");
  }

  // ═══════════════════════════════════════════
  //  Trail Sampling — setInterval, NOT preUpdate
  //  Only samples position and updates polyline.
  //  ZERO entity.position writes.
  // ═══════════════════════════════════════════

  function startTrailSampling() {
    stopTrailSampling();
    trailInterval = setInterval(() => {
      if (!isActive || aircraftState.size === 0) return;

      for (const [, ac] of aircraftState) {
        const pos = getCurrentPosition(ac);
        // Update the state's lat/lng for trail history
        ac.lat = pos.lat;
        ac.lng = pos.lng;

        ac.history.push({ lat: pos.lat, lng: pos.lng, alt: ac.alt });
        if (ac.history.length > TRAIL_MAX_POINTS) {
          ac.history.shift();
        }

        if (ac.trailEntity) {
          const positions = [];
          for (const pt of ac.history) {
            positions.push(Cesium.Cartesian3.fromDegrees(pt.lng, pt.lat, pt.alt));
          }
          // Add current dead-reckoned position as the trail tip
          positions.push(Cesium.Cartesian3.fromDegrees(pos.lng, pos.lat, ac.alt));
          ac.trailEntity.polyline.positions = positions;
        }
      }
    }, TRAIL_SAMPLE_INTERVAL);
  }

  function stopTrailSampling() {
    if (trailInterval) {
      clearInterval(trailInterval);
      trailInterval = null;
    }
  }

  // ═══════════════════════════════════════════
  //  Feed status
  // ═══════════════════════════════════════════

  function showFeedOffline() {
    aircraftHud.textContent = "Offline";
    aircraftHud.classList.add("error");
  }

  function hideFeedOffline() {
    aircraftHud.classList.remove("error");
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
      startTrailSampling();
      console.log("ARGUS-AIR: Tracking ACTIVE (manual refresh mode)");
    } else {
      airToggle.classList.remove("active");
      airRefresh.classList.remove("active");
      aircraftHud.classList.remove("visible");
      panel.classList.add("hidden");
      stopTrailSampling();
      clearAllAircraft();
      console.log("ARGUS-AIR: Tracking DISABLED");
    }
  }

  airToggle.addEventListener("click", toggleTracking);

  // ═══════════════════════════════════════════
  //  Refresh button → Smart Sync
  // ═══════════════════════════════════════════

  airRefresh.addEventListener("click", () => {
    let didSync = false;

    if (isActive) {
      fetchAircraft();
      didSync = true;
    }

    if (typeof window._argusSatSync === "function") {
      const satSynced = window._argusSatSync();
      if (satSynced) didSync = true;
    }

    if (typeof window._argusSeaSync === "function") {
      const seaSynced = window._argusSeaSync();
      if (seaSynced) didSync = true;
    }

    if (typeof window._argusHazSync === "function") {
      const hazSynced = window._argusHazSync();
      if (hazSynced) didSync = true;
    }

    if (!didSync) return;
  });

  // ═══════════════════════════════════════════
  //  Click → Intel Panel
  // ═══════════════════════════════════════════

  const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  clickHandler.setInputAction(function (click) {
    if (!isActive) return;

    const picked = viewer.scene.pick(click.position);

    // Skip satellite entities
    if (Cesium.defined(picked) && picked.id && picked.id._isSatellite) return;

    if (Cesium.defined(picked) && picked.id && picked.id._flightId) {
      // Prevent camera from tracking the entity
      viewer.trackedEntity = undefined;

      const id = picked.id._flightId;
      const f = aircraftRaw.get(id);
      if (!f) return;

      // Reset panel to aircraft mode
      panel.classList.remove("sat-mode", "sea-mode", "haz-mode", "cctv-mode");
      document.getElementById("panel-title").textContent = "Aircraft";
      document.getElementById("panel-route").style.display = "";
      document.getElementById("panel-body").style.display = "";
      ["panel-body-sat", "panel-body-sea", "panel-body-haz", "panel-body-cctv"].forEach((bid) => {
        const el = document.getElementById(bid);
        if (el) el.style.display = "none";
      });

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

      const origName = lookupAirport(origIata);
      const destName = lookupAirport(destIata);
      const codesLine = `${origIata || "N/A"}-${destIata || "N/A"}`;
      const namesLine = `${origName ? origName.name : (origIata || "N/A")} &rarr; ${destName ? destName.name : (destIata || "N/A")}`;

      document.getElementById("panel-route-text").innerHTML =
        `${codesLine}<br><span style="color:var(--text-2);font-family:var(--font-ui);font-weight:400">${namesLine}</span>`;
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

  console.log("ARGUS-AIR: Module v7 loaded (CallbackProperty positions, smart sync).");
})();
