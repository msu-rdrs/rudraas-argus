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
      // Last line printed — wait 1s then fade out
      setTimeout(() => {
        const bootScreen = document.getElementById("boot-screen");
        bootScreen.classList.add("fade-out");
        // Remove from DOM after fade completes
        setTimeout(() => bootScreen.remove(), 500);
      }, 1000);
    }
  }

  printLine();
})();

// Disable the default Cesium Ion token warning
Cesium.Ion.defaultAccessToken = undefined;

// ── Initialize the Cesium Viewer ──
const viewer = new Cesium.Viewer("cesiumContainer", {
  // Disable all UI widgets
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
  creditContainer: document.createElement("div"), // hide credits

  // Black sky background
  skyBox: false,
  skyAtmosphere: false,

  // Use a simple black base imagery instead of Bing
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.SingleTileImageryProvider({
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAABl0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYUyZQAAAA1JREFUGFdjYGBg+A8AAQQBAScLuN4AAAAASUVORK5CYII=",
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
    })
  ),

  // Smooth rendering
  requestRenderMode: false,
  maximumRenderTimeChange: Infinity,
});

// Black background for space
viewer.scene.backgroundColor = Cesium.Color.BLACK;
viewer.scene.globe.baseColor = Cesium.Color.BLACK;

// Disable the moon and sun for clean look (guard against undefined when skyBox is off)
if (viewer.scene.moon) viewer.scene.moon.show = false;
if (viewer.scene.sun) viewer.scene.sun.show = false;

// ── Load Google Photorealistic 3D Tiles ──
(async function loadTiles() {
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(CONFIG.TILES_URL);
    viewer.scene.primitives.add(tileset);
    console.log("ARGUS: Google 3D Tiles loaded successfully.");
  } catch (error) {
    console.error("ARGUS: Failed to load 3D Tiles —", error);
  }
})();

// ── Set Default Camera — India ──
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
  const camera = viewer.camera;
  const carto = Cesium.Cartographic.fromCartesian(camera.positionWC);

  if (carto) {
    const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(4);
    const lng = Cesium.Math.toDegrees(carto.longitude).toFixed(4);
    const alt = (carto.height / 1000).toFixed(1); // convert to km

    document.getElementById("camera-coords").innerHTML =
      `LAT: ${lat}&deg; &nbsp; LNG: ${lng}&deg; &nbsp; ALT: ${alt} km`;
  }
}

// Update coordinates on every render frame
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
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-60),
        roll: 0,
      },
      duration: 2,
    });

    // Clear focus so keyboard doesn't interfere with globe controls
    searchBar.blur();
  } catch (err) {
    console.error("ARGUS: Geocode failed —", err);
  }
});

console.log("ARGUS: System initialized.");
