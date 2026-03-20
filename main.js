// ─── RUDRAAS ARGUS — Main Application ───

// ── Boot Sequence ──
(function runBootSequence() {
  const lines = [
    "> INITIALIZING GEOSPATIAL CORE.............. OK",
    "> CONNECTING SATELLITE FEEDS................ OK",
    "> LOADING TERRAIN ENGINE.................... OK",
    "> ESTABLISHING OSINT PIPELINE............... OK",
    "> ACTIVATING SENSOR ARRAY................... OK",
    "> ALL SYSTEMS NOMINAL",
    "> WELCOME, COMMANDER.",
  ];

  const terminal = document.getElementById("boot-terminal");
  let i = 0;

  function printLine() {
    if (i < lines.length) {
      terminal.textContent += (i > 0 ? "\n" : "") + lines[i];
      i++;
      setTimeout(printLine, 300);
    } else {
      setTimeout(() => {
        const bootScreen = document.getElementById("boot-screen");
        bootScreen.classList.add("fade-out");
        setTimeout(() => bootScreen.remove(), 600);
      }, 1000);
    }
  }

  // Let the emblem pulse for 1.5s before terminal text starts
  setTimeout(printLine, 1500);
})();

// Disable the default Cesium Ion token warning
Cesium.Ion.defaultAccessToken = undefined;

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

  skyBox: false,
  skyAtmosphere: false,

  baseLayer: new Cesium.ImageryLayer(
    new Cesium.SingleTileImageryProvider({
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAABl0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYUyZQAAAA1JREFUGFdjYGBg+A8AAQQBAScLuN4AAAAASUVORK5CYII=",
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
    })
  ),

  requestRenderMode: false,
  maximumRenderTimeChange: Infinity,
});

// Deep navy/black background
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#050A15");
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#050A15");

if (viewer.scene.moon) viewer.scene.moon.show = false;
if (viewer.scene.sun) viewer.scene.sun.show = false;

// ── Load Google Photorealistic 3D Tiles ──
(async function loadTiles() {
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(CONFIG.TILES_URL);
    viewer.scene.primitives.add(tileset);
    console.log("ARGUS: Google 3D Tiles loaded.");
  } catch (error) {
    console.error("ARGUS: Failed to load 3D Tiles —", error);
  }
})();

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

// ── Camera Coordinates Display ──
function updateCameraCoords() {
  const carto = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
  if (carto) {
    const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(4);
    const lng = Cesium.Math.toDegrees(carto.longitude).toFixed(4);
    const alt = (carto.height / 1000).toFixed(1);
    document.getElementById("camera-coords").innerHTML =
      `LAT: ${lat}&deg; &nbsp; LNG: ${lng}&deg; &nbsp; ALT: ${alt} km`;
  }
}
viewer.scene.postRender.addEventListener(updateCameraCoords);

// ── Search / Geocode ──
const searchBar = document.getElementById("search-bar");

searchBar.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const query = searchBar.value.trim();
  if (!query) return;

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

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 50000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 },
      duration: 2,
    });
    searchBar.blur();
  } catch (err) {
    console.error("ARGUS: Geocode failed —", err);
  }
});

console.log("ARGUS: System initialized.");
