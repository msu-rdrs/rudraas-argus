// ─── RUDRAAS ARGUS — Satellite Tracking Module (v7 — Bulletproof CallbackProperty) ───
// ZERO preUpdate/setInterval position writes. All positions via CallbackProperty.
// trackedEntity explicitly cleared on every click to prevent camera lock.

(function () {
  const satToggle = document.getElementById("sat-toggle");
  const satHud = document.getElementById("satellite-hud");
  const airRefresh = document.getElementById("air-refresh");
  const panel = document.getElementById("aircraft-panel");
  const panelTitle = document.getElementById("panel-title");
  const panelRoute = document.getElementById("panel-route");
  const panelBodyAir = document.getElementById("panel-body");
  const panelBodySat = document.getElementById("panel-body-sat");

  let satActive = false;
  let satEntities = [];
  let selectedSat = null;
  let telemetryInterval = null;

  // Selection overlay
  let trajectoryEntity = null;

  // Config
  const TRAJECTORY_DURATION_MIN = 90;
  const TRAJECTORY_STEP_MIN = 1;
  const TELEMETRY_RATE = 250;

  // ── Toggle Handler ──
  satToggle.addEventListener("click", () => {
    satActive = !satActive;
    satToggle.classList.toggle("active", satActive);

    if (satActive) {
      fetchAndRender();
    } else {
      clearSatellites();
    }
  });

  // ═══════════════════════════════════════════
  //  Smart Sync — exposed globally
  // ═══════════════════════════════════════════

  window._argusSatSync = function () {
    if (!satActive) return false;
    fetchAndRender();
    return true;
  };

  // ── Fetch + Render ──
  async function fetchAndRender() {
    try {
      airRefresh.classList.add("spinning");
      console.log("ARGUS-SAT: Fetching satellite TLE data...");

      const res = await fetch("/api/satellites");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const sats = json.data || [];
      console.log("ARGUS-SAT: Received", sats.length, "satellites");

      // Wipe everything and rebuild
      clearSatellites();
      satActive = true;
      satToggle.classList.add("active");
      ingestSatellites(sats);
      startTelemetry();
    } catch (err) {
      console.error("ARGUS-SAT: Fetch error —", err.message);
    } finally {
      airRefresh.classList.remove("spinning");
    }
  }

  // ═══════════════════════════════════════════
  //  Propagate helper (for telemetry + trajectory)
  // ═══════════════════════════════════════════

  function propagate(satrec, jsDate) {
    try {
      const posVel = satellite.propagate(satrec, jsDate);
      if (!posVel || !posVel.position || posVel.position === false) return null;

      const gmst = satellite.gstime(jsDate);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      if (!geo || geo.height == null || isNaN(geo.height)) return null;

      const lat = satellite.degreesLat(geo.latitude);
      const lng = satellite.degreesLong(geo.longitude);
      if (isNaN(lat) || isNaN(lng)) return null;

      return {
        lat,
        lng,
        altKm: geo.height,
        velocity: posVel.velocity,
      };
    } catch (e) {
      return null;
    }
  }

  // ═══════════════════════════════════════════
  //  Ingest — EXCLUSIVELY CallbackProperty positions.
  //  Cesium calls the callback inside its render
  //  pipeline with the exact time used for the
  //  camera matrix projection. Zero desync.
  //
  //  NO preUpdate. NO setInterval. NO manual
  //  entity.position = ... after creation.
  // ═══════════════════════════════════════════

  function ingestSatellites(sats) {
    for (const sat of sats) {
      try {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);

        // Validate
        const test = propagate(satrec, new Date());
        if (!test) continue;

        // Cache the last known good position for fallback
        const lastGood = Cesium.Cartesian3.fromDegrees(test.lng, test.lat, test.altKm * 1000);

        const entity = viewer.entities.add({
          name: sat.name,
          position: new Cesium.CallbackProperty(function (time, result) {
            try {
              const jsDate = Cesium.JulianDate.toDate(time);
              const posVel = satellite.propagate(satrec, jsDate);
              if (!posVel || !posVel.position || posVel.position === false) {
                return Cesium.Cartesian3.clone(lastGood, result);
              }

              const gmst = satellite.gstime(jsDate);
              const geo = satellite.eciToGeodetic(posVel.position, gmst);
              if (!geo || geo.height == null || isNaN(geo.height)) {
                return Cesium.Cartesian3.clone(lastGood, result);
              }

              const longitude = satellite.degreesLong(geo.longitude);
              const latitude = satellite.degreesLat(geo.latitude);
              const altitude = geo.height * 1000;

              if (isNaN(longitude) || isNaN(latitude) || isNaN(altitude)) {
                return Cesium.Cartesian3.clone(lastGood, result);
              }

              const finalPos = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude, undefined, result);
              if (isNaN(finalPos.x) || isNaN(finalPos.y) || isNaN(finalPos.z)) {
                return Cesium.Cartesian3.clone(lastGood, result);
              }
              Cesium.Cartesian3.clone(finalPos, lastGood);
              return finalPos;
            } catch (e) {
              return Cesium.Cartesian3.clone(lastGood, result);
            }
          }, false),
          point: {
            pixelSize: 5,
            color: Cesium.Color.fromCssColorString("#FF8800"),
            outlineColor: Cesium.Color.fromCssColorString("rgba(255, 136, 0, 0.5)"),
            outlineWidth: 2,
          },
          label: {
            text: sat.name,
            font: "10px Roboto Mono",
            fillColor: Cesium.Color.fromCssColorString("#FF8800"),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            show: false,
          },
        });

        entity._isSatellite = true;

        satEntities.push({
          name: sat.name,
          tle1: sat.tle1,
          tle2: sat.tle2,
          satrec,
          entity,
        });
      } catch (e) {
        // Skip bad TLE
      }
    }

    console.log("ARGUS-SAT: Tracking", satEntities.length, "satellites");
    satHud.textContent = `SATELLITES TRACKED: ${satEntities.length}`;
    satHud.classList.add("visible");
  }

  // ═══════════════════════════════════════════
  //  Telemetry — setInterval updates ONLY the
  //  Intel Panel HTML text. No positions touched.
  // ═══════════════════════════════════════════

  function startTelemetry() {
    stopTelemetry();

    const elAlt = document.getElementById("sat-panel-alt");
    const elVel = document.getElementById("sat-panel-vel");
    const elLat = document.getElementById("sat-panel-lat");
    const elLng = document.getElementById("sat-panel-lng");

    telemetryInterval = setInterval(() => {
      if (!selectedSat) return;

      const jsDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
      const result = propagate(selectedSat.satrec, jsDate);
      if (!result) return;

      elAlt.textContent = result.altKm.toFixed(2) + " km";
      elLat.textContent = result.lat.toFixed(4) + "\u00B0";
      elLng.textContent = result.lng.toFixed(4) + "\u00B0";

      if (result.velocity) {
        const v = result.velocity;
        const speedKms = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        elVel.textContent = speedKms.toFixed(3) + " km/s";
      }
    }, TELEMETRY_RATE);
  }

  function stopTelemetry() {
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
  }

  // ── TLE Data Extraction ──
  function getNoradId(s) {
    if (s.satrec && s.satrec.satnum) return String(s.satrec.satnum);
    if (s.tle1 && s.tle1.length >= 7) return s.tle1.substring(2, 7).trim();
    return "---";
  }

  function getLaunchYear(s) {
    if (s.tle1 && s.tle1.length >= 11) {
      const yy = parseInt(s.tle1.substring(9, 11).trim(), 10);
      if (isNaN(yy)) return "---";
      return String(yy >= 57 ? 1900 + yy : 2000 + yy);
    }
    return "---";
  }

  function getOrbitalPeriod(satrec) {
    if (!satrec || !satrec.no) return "---";
    const periodMin = (2 * Math.PI) / satrec.no;
    return periodMin.toFixed(2) + " min";
  }

  // ═══════════════════════════════════════════
  //  Sensor Footprint — attached to entity,
  //  inherits its CallbackProperty position.
  // ═══════════════════════════════════════════

  function attachFootprint(satObj) {
    const satrec = satObj.satrec;

    function safeFootprintRadius(time) {
      try {
        const jsDate = Cesium.JulianDate.toDate(time);
        const result = propagate(satrec, jsDate);
        if (!result || result.altKm == null || isNaN(result.altKm)) return 500000;
        const r = result.altKm * 1000 * 1.5;
        return (isNaN(r) || r <= 0) ? 500000 : r;
      } catch (e) {
        return 500000;
      }
    }

    if (!satObj.entity.ellipse) {
      satObj.entity.ellipse = {
        show: true,
        semiMajorAxis: new Cesium.CallbackProperty(safeFootprintRadius, false),
        semiMinorAxis: new Cesium.CallbackProperty(safeFootprintRadius, false),
        material: Cesium.Color.fromCssColorString("#FF8800").withAlpha(0.2),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#FF8800").withAlpha(0.8),
        outlineWidth: 2.0,
        height: 0,
        granularity: Cesium.Math.toRadians(1),
      };
    } else {
      satObj.entity.ellipse.show = true;
    }
  }

  function detachFootprint(satObj) {
    if (satObj && satObj.entity && satObj.entity.ellipse) {
      satObj.entity.ellipse.show = false;
    }
  }

  // ═══════════════════════════════════════════
  //  Orbital Trajectory — 90-minute path
  // ═══════════════════════════════════════════

  function createTrajectory(satrec) {
    const now = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const positions = [];

    for (let m = 0; m <= TRAJECTORY_DURATION_MIN; m += TRAJECTORY_STEP_MIN) {
      const futureTime = new Date(now.getTime() + m * 60 * 1000);
      const result = propagate(satrec, futureTime);
      if (!result) continue;
      positions.push(Cesium.Cartesian3.fromDegrees(result.lng, result.lat, result.altKm * 1000));
    }

    if (positions.length < 2) return;

    trajectoryEntity = viewer.entities.add({
      polyline: {
        positions: positions,
        width: 1.5,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString("#FF8800").withAlpha(0.8),
          dashLength: 12,
        }),
        clampToGround: false,
      },
    });
  }

  // ═══════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════

  function clearSelectionOverlays() {
    if (selectedSat) detachFootprint(selectedSat);
    if (trajectoryEntity) {
      viewer.entities.remove(trajectoryEntity);
      trajectoryEntity = null;
    }
  }

  function showSatPanel(s) {
    clearSelectionOverlays();
    selectedSat = s;

    // CRITICAL: prevent camera tracking
    viewer.trackedEntity = undefined;

    panel.classList.add("sat-mode");
    panelTitle.textContent = "SATELLITE INTEL";
    panelRoute.style.display = "none";
    panelBodyAir.style.display = "none";
    panelBodySat.style.display = "block";

    document.getElementById("sat-panel-name").textContent = s.name;
    document.getElementById("sat-panel-norad").textContent = getNoradId(s);
    document.getElementById("sat-panel-launch").textContent = getLaunchYear(s);
    document.getElementById("sat-panel-period").textContent = getOrbitalPeriod(s.satrec);

    const jsDate = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const result = propagate(s.satrec, jsDate);
    if (result) {
      document.getElementById("sat-panel-alt").textContent = result.altKm.toFixed(2) + " km";
      document.getElementById("sat-panel-lat").textContent = result.lat.toFixed(4) + "\u00B0";
      document.getElementById("sat-panel-lng").textContent = result.lng.toFixed(4) + "\u00B0";

      if (result.velocity) {
        const v = result.velocity;
        const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        document.getElementById("sat-panel-vel").textContent = speed.toFixed(3) + " km/s";
      }
    }

    attachFootprint(s);
    createTrajectory(s.satrec);

    panel.classList.remove("hidden");
  }

  function resetPanelToAircraft() {
    clearSelectionOverlays();
    selectedSat = null;
    panel.classList.remove("sat-mode");
    panelTitle.textContent = "AIRCRAFT INTEL";
    panelRoute.style.display = "";
    panelBodyAir.style.display = "";
    panelBodySat.style.display = "none";
  }

  function clearSatellites() {
    if (selectedSat) {
      resetPanelToAircraft();
      panel.classList.add("hidden");
    }
    clearSelectionOverlays();
    stopTelemetry();

    for (const s of satEntities) {
      viewer.entities.remove(s.entity);
    }
    satEntities = [];

    satHud.classList.remove("visible");
    satHud.textContent = "SATELLITES TRACKED: 0";
  }

  // ── Hover labels ──
  const hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  hoverHandler.setInputAction((movement) => {
    for (const s of satEntities) {
      s.entity.label.show = false;
    }

    const picked = viewer.scene.pick(movement.endPosition);
    if (Cesium.defined(picked) && picked.id && picked.id._isSatellite) {
      const match = satEntities.find((s) => s.entity === picked.id);
      if (match) match.entity.label.show = true;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // ── Click handler ──
  const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((click) => {
    // Always prevent camera tracking on any click
    viewer.trackedEntity = undefined;

    const picked = viewer.scene.pick(click.position);

    if (Cesium.defined(picked) && picked.id && picked.id._isSatellite) {
      const match = satEntities.find((s) => s.entity === picked.id);
      if (match) {
        showSatPanel(match);
        return;
      }
    }

    if (selectedSat) {
      resetPanelToAircraft();
      panel.classList.add("hidden");
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.getElementById("panel-close").addEventListener("click", () => {
    if (selectedSat) resetPanelToAircraft();
  });

  console.log("ARGUS-SAT: Module v7 loaded (bulletproof CallbackProperty).");
})();
