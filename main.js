// ─── RUDRAAS ARGUS — Main Application ───

// ── Boot Sequence ──
(function runBootSequence() {
  const steps = [
    "Geospatial core",
    "Terrain & imagery",
    "OSINT pipeline",
    "Sensor layers",
  ];

  const bootScreen = document.getElementById("boot-screen");
  const list = document.getElementById("boot-terminal");
  const bar = document.getElementById("boot-progress-bar");
  let i = 0;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    bar.style.width = "100%";
    bootScreen.classList.add("fade-out");
    setTimeout(() => bootScreen.remove(), 500);
  }

  function nextStep() {
    if (finished) return;
    if (i > 0) {
      const prev = list.lastElementChild;
      prev.classList.add("done");
      prev.querySelector(".state").textContent = "OK";
      prev.querySelector(".state").className = "state ok";
    }
    if (i < steps.length) {
      const li = document.createElement("li");
      li.innerHTML = '<span></span><span class="state">…</span>';
      li.firstChild.textContent = steps[i];
      list.appendChild(li);
      i++;
      bar.style.width = Math.round((i / (steps.length + 1)) * 100) + "%";
      setTimeout(nextStep, 260);
    } else {
      const li = document.createElement("li");
      li.className = "done";
      li.innerHTML = '<span>All systems nominal</span><span class="state ok">READY</span>';
      list.appendChild(li);
      bar.style.width = "100%";
      setTimeout(finish, 450);
    }
  }

  bootScreen.addEventListener("click", finish);
  setTimeout(nextStep, 500);
})();

// Disable the default Cesium Ion token warning
Cesium.Ion.defaultAccessToken = undefined;

// Authenticate Google Maps 3D Tiles
Cesium.GoogleMaps.defaultApiKey = CONFIG.GOOGLE_MAPS_API_KEY;

// ── Initialize the Cesium Viewer ──
const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  vrButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  sceneModePicker: false,
  selectionIndicator: false,
  navigationHelpButton: false,
  navigationInstructionsInitiallyVisible: false,
  creditContainer: document.createElement("div"),

  skyAtmosphere: new Cesium.SkyAtmosphere(),
  shadows: true,
  terrainShadows: Cesium.ShadowMode.ENABLED,

  baseLayer: false,

  requestRenderMode: false,
  maximumRenderTimeChange: Infinity,
});

// Ensure the Cesium clock ticks in real-time (drives satellite propagation)
viewer.clock.shouldAnimate = true;
viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
viewer.clock.multiplier = 1;

// Let Cesium use its default background — imagery needs light to reflect

// ── Dynamic Lighting & Atmosphere ──
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.dynamicAtmosphereLighting = true;
viewer.scene.sun = new Cesium.Sun();
viewer.scene.moon = new Cesium.Moon();

// ── Procedural 3D Cloud Layer ──
var cloudCollection = viewer.scene.primitives.add(new Cesium.CloudCollection());
for (var ci = 0; ci < 300; ci++) {
  var cLng = Math.random() * 360 - 180;
  var cLat = Math.random() * 120 - 60;
  var cAlt = Math.random() * 6000 + 4000;
  cloudCollection.add({
    position: Cesium.Cartesian3.fromDegrees(cLng, cLat, cAlt),
    scale: new Cesium.Cartesian2(Math.random() * 60000 + 20000, Math.random() * 15000 + 5000),
    maximumSize: new Cesium.Cartesian3(80000, 80000, 20000),
    slice: Math.random() * 0.5 + 0.3,
  });
}
console.log("ARGUS-GEO: Atmospheric Engine and Volumetric Clouds online.");

// ── Google Earth-style camera controls ──
var ssccc = viewer.scene.screenSpaceCameraController;
ssccc.enableInputs = true;
ssccc.enableZoom = true;
ssccc.enableRotate = true;
ssccc.enableTilt = true;
ssccc.enableTranslate = true;
ssccc.enableLook = true;
// Allow zooming much closer to terrain (10m)
ssccc.minimumZoomDistance = 10;
ssccc.maximumZoomDistance = 50000000;

// ── Load Esri Base Map + Google 3D Tiles ──
Cesium.ArcGisMapServerImageryProvider.fromUrl(
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
).then(function (provider) {
  viewer.imageryLayers.addImageryProvider(provider);
  console.log("ARGUS-GEO: Esri Oceans/Base loaded.");

  // Once base is loaded, overlay the Google 3D Tiles
  loadGoogle3DTiles();
}).catch(function (err) {
  console.error("ARGUS-GEO: Esri Imagery failed", err);
});

async function loadGoogle3DTiles() {
  try {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(tileset);
    console.log("ARGUS-GEO: Google Photorealistic 3D Tiles engaged.");
  } catch (error) {
    console.error("ARGUS-GEO: 3D Tiles failed. Check your API Key and ensure Map Tiles API is enabled.", error);
  }
}

// ── Default Camera — India ──
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, 5000000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-90),
    roll: 0,
  },
});

// ── UTC Clock ──
function updateClock() {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, "0");
  const m = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  document.getElementById("utc-clock").textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// ── Camera Coordinates Display (status bar) ──
const coordValues = document.querySelectorAll("#camera-coords .v");
let lastCoords = {};
function updateCameraCoords() {
  const carto = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
  if (carto) {
    const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(4);
    const lng = Cesium.Math.toDegrees(carto.longitude).toFixed(4);
    const alt = (carto.height / 1000).toFixed(1);
    if (lat === lastCoords.lat && lng === lastCoords.lng && alt === lastCoords.alt) return;
    lastCoords = { lat, lng, alt };
    coordValues[0].textContent = lat + "\u00B0";
    coordValues[1].textContent = lng + "\u00B0";
    coordValues[2].textContent = Number(alt).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";
  }
}
viewer.scene.postRender.addEventListener(updateCameraCoords);

// ── Search / Geocode + Airport Code Lookup ──
const searchBar = document.getElementById("search-bar");
const searchDropdown = document.getElementById("search-dropdown");
let searchReticle = null;
let searchHistory = [];

function saveToHistory(name, lat, lng) {
  const targetName = name.toUpperCase();
  searchHistory = searchHistory.filter(function (item) { return item.name !== targetName; });
  searchHistory.unshift({ name: targetName, lat: lat, lng: lng });
  if (searchHistory.length > 5) searchHistory.pop();
}

function updateHistoryUI() {
  searchDropdown.innerHTML = "";

  if (searchHistory.length === 0) {
    searchDropdown.classList.add("hidden");
    return;
  }

  searchHistory.forEach(function (item) {
    const div = document.createElement("div");
    div.className = "search-history-item";
    div.textContent = item.name;
    div.addEventListener("click", function () {
      flyToTarget(item.lat, item.lng, item.name);
      searchDropdown.classList.add("hidden");
      searchBar.value = item.name;
      searchBar.blur();
    });
    searchDropdown.appendChild(div);
  });

  searchDropdown.classList.remove("hidden");
}

// Show history dropdown on focus (if input is empty and history exists)
searchBar.addEventListener("focus", function () {
  if (searchBar.value.trim().length === 0 && searchHistory.length > 0) {
    updateHistoryUI();
  }
});

// Predictive autocomplete on input
searchBar.addEventListener("input", function (e) {
  var val = e.target.value.toUpperCase();
  searchDropdown.innerHTML = "";

  // If empty, show recent history
  if (val.length === 0) {
    updateHistoryUI();
    return;
  }

  // Filter strategic cities for predictive typing
  var matches = strategicCities.filter(function (city) {
    return city.name.includes(val);
  }).slice(0, 6);

  if (matches.length > 0) {
    searchDropdown.classList.remove("hidden");
    matches.forEach(function (match) {
      var div = document.createElement("div");
      div.textContent = match.name;
      div.className = "autocomplete-item";
      div.addEventListener("click", function () {
        flyToTarget(match.lat, match.lng, match.name);
        searchBar.value = match.name;
        searchDropdown.classList.add("hidden");
        saveToHistory(match.name, match.lat, match.lng);
        searchBar.blur();
      });
      searchDropdown.appendChild(div);
    });
  } else {
    // No local matches — prompt for deep search
    var div = document.createElement("div");
    div.textContent = "Press Enter to search worldwide";
    div.className = "search-prompt";
    searchDropdown.appendChild(div);
    searchDropdown.classList.remove("hidden");
  }
});

// Hide dropdown when clicking outside
document.addEventListener("click", function (e) {
  if (!searchBar.contains(e.target) && !searchDropdown.contains(e.target)) {
    searchDropdown.classList.add("hidden");
  }
});

function flyToTarget(lat, lng, label) {
  console.log("ARGUS: Flying to", label, "→", lat.toFixed(4), lng.toFixed(4));

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat, 15000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
    duration: 2.5,
  });

  // Drop a target reticle for 5 seconds
  if (searchReticle) {
    viewer.entities.remove(searchReticle);
    searchReticle = null;
  }

  searchReticle = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString("#D97757").withAlpha(0.9),
      outlineColor: Cesium.Color.fromCssColorString("#D97757").withAlpha(0.3),
      outlineWidth: 6,
    },
    label: {
      text: label.toUpperCase(),
      font: "12px 'JetBrains Mono', monospace",
      fillColor: Cesium.Color.fromCssColorString("#D97757"),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -14),
    },
    ellipse: {
      semiMajorAxis: 2000,
      semiMinorAxis: 2000,
      material: Cesium.Color.fromCssColorString("#D97757").withAlpha(0.08),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#D97757").withAlpha(0.4),
      outlineWidth: 1,
      height: 0,
    },
  });

}

// Remove reticle on any click
const reticleHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
reticleHandler.setInputAction(() => {
  if (searchReticle) {
    viewer.entities.remove(searchReticle);
    searchReticle = null;
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

searchBar.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const query = searchBar.value.trim();
  if (!query) return;

  // Check 1: Airport IATA code (exactly 3 letters)
  if (/^[A-Za-z]{3}$/.test(query) && typeof window._argusLookupAirport === "function") {
    const apt = window._argusLookupAirport(query);
    if (apt) {
      const aptLabel = query.toUpperCase() + " — " + apt.name;
      flyToTarget(apt.lat, apt.lng, aptLabel);
      saveToHistory(aptLabel, apt.lat, apt.lng);
      searchBar.blur();
      return;
    }
  }

  // Check 2: Global geocoding via Nominatim
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { "User-Agent": "RUDRAAS-ARGUS/1.0" },
    });
    const data = await res.json();

    if (data.length === 0) {
      console.warn("ARGUS: No results for", query);
      return;
    }

    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    const displayName = data[0].display_name
      ? data[0].display_name.split(",")[0]
      : query;

    flyToTarget(lat, lon, displayName);
    saveToHistory(displayName, lat, lon);
    searchBar.blur();
  } catch (err) {
    console.error("ARGUS: Geocode failed —", err);
  }
});

// ── Country Borders (GeoJSON) + Hover Tooltip ──
(function loadCountryBorders() {
  const tooltip = document.getElementById("geo-tooltip");

  viewer.dataSources.add(
    Cesium.GeoJsonDataSource.load(
      "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson"
    )
  ).then(function (dataSource) {
    const entities = dataSource.entities.values;

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];

      if (entity.polygon) {
        // Keep polygon for hover-tooltips — near-invisible but pickable
        entity.polygon.material = Cesium.Color.fromCssColorString("#D97757").withAlpha(0.01);
        entity.polygon.outline = false;
        entity.polygon.height = 100;

        // Extract coordinates to draw terrain-clamped polylines
        const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());

        const createBorderLine = (positions) => {
          dataSource.entities.add({
            polyline: {
              positions: positions,
              width: 1.5,
              material: Cesium.Color.fromCssColorString("#FAF9F5").withAlpha(0.45),
              clampToGround: true,
            },
          });
        };

        if (hierarchy) {
          createBorderLine(hierarchy.positions);
          if (hierarchy.holes) {
            hierarchy.holes.forEach((hole) => createBorderLine(hole.positions));
          }
        }
      }
    }
    console.log("ARGUS-GEO: Unbreakable draped borders initialized.");
  }).catch(function (error) {
    console.error("ARGUS-GEO: Border load failed.", error);
  });

  // Hover handler for country tooltip
  const geoHover = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  geoHover.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.endPosition);

    if (Cesium.defined(picked) && picked.id) {
      let name = null;
      const props = picked.id.properties;
      if (props) {
        const raw = props.admin || props.name || props.ADMIN;
        if (raw) {
          name = raw.getValue ? raw.getValue() : raw;
        }
      }
      if (!name && picked.id.name) {
        name = picked.id.name;
      }
      if (!name) {
        tooltip.style.display = "none";
        return;
      }
      tooltip.textContent = name;
      tooltip.style.left = movement.endPosition.x + 16 + "px";
      tooltip.style.top = movement.endPosition.y + 16 + "px";
      tooltip.style.display = "block";
    } else {
      tooltip.style.display = "none";
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
})();

// ── Strategic City Hubs (hardcoded — zero network/WebGL overhead) ──
const strategicCities = [
  // North America
  { name: "WASHINGTON D.C.", lat: 38.8951, lng: -77.0364 },
  { name: "NEW YORK", lat: 40.7128, lng: -74.0060 },
  { name: "LOS ANGELES", lat: 34.0522, lng: -118.2437 },
  { name: "SAN FRANCISCO", lat: 37.7749, lng: -122.4194 },
  { name: "CHICAGO", lat: 41.8781, lng: -87.6298 },
  { name: "TORONTO", lat: 43.6510, lng: -79.3470 },
  // Europe
  { name: "LONDON", lat: 51.5074, lng: -0.1278 },
  { name: "PARIS", lat: 48.8566, lng: 2.3522 },
  { name: "BERLIN", lat: 52.5200, lng: 13.4050 },
  { name: "FRANKFURT", lat: 50.1109, lng: 8.6821 },
  { name: "MOSCOW", lat: 55.7558, lng: 37.6173 },
  { name: "KYIV", lat: 50.4501, lng: 30.5234 },
  { name: "ROME", lat: 41.9028, lng: 12.4964 },
  // Middle East & Africa
  { name: "DUBAI", lat: 25.2048, lng: 55.2708 },
  { name: "RIYADH", lat: 24.7136, lng: 46.6753 },
  { name: "TEL AVIV", lat: 32.0853, lng: 34.7818 },
  { name: "CAIRO", lat: 30.0444, lng: 31.2357 },
  { name: "TEHRAN", lat: 35.6892, lng: 51.3890 },
  { name: "JOHANNESBURG", lat: -26.2041, lng: 28.0473 },
  // Asia
  { name: "NEW DELHI", lat: 28.6139, lng: 77.2090 },
  { name: "MUMBAI", lat: 19.0760, lng: 72.8777 },
  { name: "BANGALORE", lat: 12.9716, lng: 77.5946 },
  { name: "BEIJING", lat: 39.9042, lng: 116.4074 },
  { name: "SHANGHAI", lat: 31.2304, lng: 121.4737 },
  { name: "TOKYO", lat: 35.6762, lng: 139.6503 },
  { name: "SEOUL", lat: 37.5665, lng: 126.9780 },
  { name: "SINGAPORE", lat: 1.3521, lng: 103.8198 },
  { name: "TAIPEI", lat: 25.0330, lng: 121.5654 },
  // South America & Oceania
  { name: "SAO PAULO", lat: -23.5505, lng: -46.6333 },
  { name: "BUENOS AIRES", lat: -34.6037, lng: -58.3816 },
  { name: "SYDNEY", lat: -33.8688, lng: 151.2093 },
  { name: "CANBERRA", lat: -35.2809, lng: 149.1300 },
];

strategicCities.forEach(function (city) {
  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(city.lng, city.lat),
    point: {
      pixelSize: 3,
      color: Cesium.Color.WHITE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: city.name,
      font: '11px "JetBrains Mono", monospace',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -8),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4000000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
});
console.log("ARGUS-GEO: Strategic hubs initialized.");

// ── Tactical Navigation Controls ──
(function initNavControls() {
  var ZOOM_MIN = 10;
  var ZOOM_MAX = 50000000;
  var LOG_MIN = Math.log(ZOOM_MIN);
  var LOG_MAX = Math.log(ZOOM_MAX);

  // ── Custom vertical zoom slider (pure pointer events — no <input>) ──
  var track = document.getElementById("zoom-slider-track");
  var thumb = document.getElementById("zoom-slider-thumb");
  var dragging = false;
  var PADDING = 12; // top/bottom padding inside the track

  function altToPercent(alt) {
    // 0% = top = zoomed in (low alt), 100% = bottom = zoomed out (high alt)
    var clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, alt));
    return (Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  }

  function percentToAlt(pct) {
    return Math.exp(LOG_MIN + pct * (LOG_MAX - LOG_MIN));
  }

  function setThumbFromAlt(alt) {
    var pct = altToPercent(alt);
    var usable = track.clientHeight - PADDING * 2;
    thumb.style.top = (PADDING + pct * usable) + "px";
  }

  function handleSliderPointer(clientY) {
    var rect = track.getBoundingClientRect();
    var usable = rect.height - PADDING * 2;
    var y = clientY - rect.top - PADDING;
    var pct = Math.max(0, Math.min(1, y / usable));
    var newAlt = percentToAlt(pct);

    // Preserve current heading and pitch — only change altitude
    var carto = viewer.camera.positionCartographic;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, newAlt),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
      },
    });
  }

  track.addEventListener("pointerdown", function (e) {
    dragging = true;
    thumb.classList.add("dragging");
    track.setPointerCapture(e.pointerId);
    handleSliderPointer(e.clientY);
  });

  track.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    handleSliderPointer(e.clientY);
  });

  track.addEventListener("pointerup", function (e) {
    dragging = false;
    thumb.classList.remove("dragging");
  });

  track.addEventListener("pointercancel", function () {
    dragging = false;
    thumb.classList.remove("dragging");
  });

  // Sync thumb position from camera every frame
  viewer.scene.postRender.addEventListener(function () {
    if (dragging) return;
    setThumbFromAlt(viewer.camera.positionCartographic.height);
  });

  // ── + / - buttons — preserve heading and pitch ──
  document.getElementById("nav-zoom-in").addEventListener("click", function () {
    var carto = viewer.camera.positionCartographic;
    var newAlt = Math.max(carto.height * 0.4, ZOOM_MIN);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, newAlt),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
      duration: 0.4,
    });
  });

  document.getElementById("nav-zoom-out").addEventListener("click", function () {
    var carto = viewer.camera.positionCartographic;
    var newAlt = Math.min(carto.height * 2.5, ZOOM_MAX);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, newAlt),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
      duration: 0.4,
    });
  });

  // ── Home button ──
  document.getElementById("nav-home").addEventListener("click", function () {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, 5000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.5,
    });
  });

  // ── Reset North ──
  document.getElementById("nav-north").addEventListener("click", function () {
    var carto = viewer.camera.positionCartographic;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height),
      orientation: {
        heading: 0,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
      duration: 0.6,
    });
  });

  // ── 3D Tilt toggle ──
  var isTilted = false;
  var tiltBtn = document.getElementById("nav-tilt");

  tiltBtn.addEventListener("click", function () {
    if (!isTilted) {
      viewer.camera.flyTo({
        destination: viewer.camera.position,
        orientation: {
          heading: viewer.camera.heading,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 0.8,
      });
      isTilted = true;
      tiltBtn.classList.add("nav-active");
    } else {
      viewer.camera.flyTo({
        destination: viewer.camera.position,
        orientation: {
          heading: viewer.camera.heading,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
        duration: 0.8,
      });
      isTilted = false;
      tiltBtn.classList.remove("nav-active");
    }
  });

  console.log("ARGUS: Navigation controls initialized.");
})();

console.log("ARGUS: System initialized.");
