// ─── RUDRAAS ARGUS — Backend Proxy Server ───
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// ── Flightradar24 Credentials ──
const FR24_TOKEN =
  "019d0c75-ef49-7025-8420-0637326b21f9|M6AkQqWssHUKJMNottWa0aIgb9whwDHdwrnH13iD11169a22";
const FR24_API_BASE = "https://fr24api.flightradar24.com/api";
const FR24_RESULT_LIMIT = 20; // Basic tier: max 20 results per request

// ── Proxy endpoint: /api/fr24 ──
app.get("/api/fr24", async (req, res) => {
  try {
    const { lamin, lamax, lomin, lomax } = req.query;

    if (!lamin || !lamax || !lomin || !lomax) {
      return res.status(400).json({ error: "Missing bounding box parameters" });
    }

    // FR24 bounds format: single param "bounds" = "North,South,West,East"
    const boundsStr = `${lamax},${lamin},${lomin},${lomax}`;

    const url =
      `${FR24_API_BASE}/live/flight-positions/full` +
      `?bounds=${boundsStr}` +
      `&limit=${FR24_RESULT_LIMIT}`;

    console.log("ARGUS-SERVER: Fetching FR24 →", url);

    const apiRes = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Version": "v1",
        Authorization: `Bearer ${FR24_TOKEN}`,
      },
    });

    if (!apiRes.ok) {
      const body = await apiRes.text();
      console.error("ARGUS-SERVER: FR24 API error", apiRes.status, body);
      return res
        .status(apiRes.status)
        .json({ error: "FR24 API error", status: apiRes.status, detail: body });
    }

    const data = await apiRes.json();

    // Log the raw response structure for debugging
    const flightCount = Array.isArray(data.data) ? data.data.length : 0;
    console.log("ARGUS-SERVER: FR24 returned", flightCount, "aircraft (pre-filter)");
    if (flightCount > 0) {
      console.log("ARGUS-SERVER: Sample flight keys:", Object.keys(data.data[0]));
    }

    // Server-side geographic filter — FR24 may return flights outside the requested bounds
    if (data.data && Array.isArray(data.data)) {
      const bLamin = parseFloat(lamin);
      const bLamax = parseFloat(lamax);
      const bLomin = parseFloat(lomin);
      const bLomax = parseFloat(lomax);

      data.data = data.data.filter((f) => {
        const fLat = f.lat ?? f.latitude ?? null;
        const fLng = f.lon ?? f.lng ?? f.longitude ?? null;
        if (fLat == null || fLng == null) return false;
        return fLat >= bLamin && fLat <= bLamax && fLng >= bLomin && fLng <= bLomax;
      });

      console.log("ARGUS-SERVER: After geo-filter:", data.data.length, "aircraft in viewport");

      // Apply the limit AFTER geographic filtering
      if (data.data.length > FR24_RESULT_LIMIT) {
        data.data = data.data.slice(0, FR24_RESULT_LIMIT);
      }
    }

    res.json(data);
  } catch (err) {
    console.error("ARGUS-SERVER: Proxy error —", err.message);
    res.status(502).json({ error: "proxy_error", message: err.message });
  }
});

// ── Satellite TLE Cache ──
const CELESTRAK_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const SAT_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const SAT_LIMIT = 300;

let satCache = null;
let satCacheTime = 0;

function parseTLE(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const satellites = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];

    // Basic validation: TLE line 1 starts with "1", line 2 with "2"
    if (tle1.startsWith("1 ") && tle2.startsWith("2 ")) {
      satellites.push({ name: name.trim(), tle1, tle2 });
    }
  }

  return satellites;
}

// ── Proxy endpoint: /api/satellites ──
app.get("/api/satellites", async (req, res) => {
  try {
    const now = Date.now();

    // Serve from cache if fresh
    if (satCache && now - satCacheTime < SAT_CACHE_TTL) {
      console.log("ARGUS-SERVER: Serving", satCache.length, "satellites from cache");
      return res.json({ data: satCache });
    }

    console.log("ARGUS-SERVER: Fetching TLE data from Celestrak...");
    const apiRes = await fetch(CELESTRAK_URL);

    if (!apiRes.ok) {
      const body = await apiRes.text();
      console.error("ARGUS-SERVER: Celestrak error", apiRes.status, body);
      return res
        .status(apiRes.status)
        .json({ error: "Celestrak error", status: apiRes.status });
    }

    const text = await apiRes.text();
    const allSats = parseTLE(text);

    // Slice to keep frontend performant
    satCache = allSats.slice(0, SAT_LIMIT);
    satCacheTime = now;

    console.log(
      `ARGUS-SERVER: Parsed ${allSats.length} satellites, serving ${satCache.length}`
    );

    res.json({ data: satCache });
  } catch (err) {
    console.error("ARGUS-SERVER: Satellite proxy error —", err.message);
    res.status(502).json({ error: "proxy_error", message: err.message });
  }
});

// ── Maritime Simulated Fleet ──
const SERVER_START = Date.now();
const EARTH_RADIUS_KM = 6371;
const KNOTS_TO_KMS = 1.852 / 3600; // knots → km/s

// ── Seeded PRNG (deterministic fleet across restarts within session) ──
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const seaRng = mulberry32(42);

// ── Safe Ocean Zones (strict bounding boxes — no land) ──
const OCEAN_ZONES = [
  { name: "North Atlantic",              minLat: 15,  maxLat: 50,  minLng: -60,  maxLng: -20  },
  { name: "South Atlantic",              minLat: -40, maxLat: -10, minLng: -35,  maxLng: 0    },
  { name: "Indian Ocean",                minLat: -30, maxLat: 10,  minLng: 55,   maxLng: 95   },
  { name: "West Pacific",                minLat: -10, maxLat: 40,  minLng: 135,  maxLng: 170  },
  { name: "East Pacific",                minLat: -10, maxLat: 40,  minLng: -130, maxLng: -90  },
  { name: "Mediterranean",               minLat: 33,  maxLat: 38,  minLng: 5,    maxLng: 20   },
  { name: "Arabian Sea & Persian Gulf",  minLat: 14,  maxLat: 30,  minLng: 48,   maxLng: 70   },
  { name: "Red Sea & Gulf of Aden",      minLat: 11,  maxLat: 29,  minLng: 32,   maxLng: 50   },
  { name: "Gulf of Mexico & Caribbean",  minLat: 10,  maxLat: 30,  minLng: -98,  maxLng: -60  },
  { name: "North Sea",                   minLat: 51,  maxLat: 65,  minLng: -4,   maxLng: 12   },
];

function randomOceanCoord() {
  const zoneIdx = Math.floor(seaRng() * OCEAN_ZONES.length);
  const zone = OCEAN_ZONES[zoneIdx];
  const lat = zone.minLat + seaRng() * (zone.maxLat - zone.minLat);
  const lng = zone.minLng + seaRng() * (zone.maxLng - zone.minLng);
  return { lat, lng, zoneIdx };
}

// Tanker-biased spawn — 40% chance of Arabian Sea/Persian Gulf or Red Sea
const TANKER_HOTSPOT_INDICES = [];
for (let i = 0; i < OCEAN_ZONES.length; i++) {
  if (OCEAN_ZONES[i].name.includes("Arabian") || OCEAN_ZONES[i].name.includes("Red Sea")) {
    TANKER_HOTSPOT_INDICES.push(i);
  }
}

function randomTankerCoord() {
  let zoneIdx;
  if (TANKER_HOTSPOT_INDICES.length > 0 && seaRng() < 0.4) {
    zoneIdx = TANKER_HOTSPOT_INDICES[Math.floor(seaRng() * TANKER_HOTSPOT_INDICES.length)];
  } else {
    zoneIdx = Math.floor(seaRng() * OCEAN_ZONES.length);
  }
  const zone = OCEAN_ZONES[zoneIdx];
  const lat = zone.minLat + seaRng() * (zone.maxLat - zone.minLat);
  const lng = zone.minLng + seaRng() * (zone.maxLng - zone.minLng);
  return { lat, lng, zoneIdx };
}

// ── Named military vessels (kept as elite assets) ──
const MILITARY_SHIPS = [
  { name: "USS Gerald R. Ford (CVN-78)", type: "Carrier", flag: "US", lat: 36.15, lng: 14.50, speed: 18, heading: 90 },
  { name: "USS Dwight D. Eisenhower (CVN-69)", type: "Carrier", flag: "US", lat: 24.80, lng: 58.20, speed: 16, heading: 210 },
  { name: "HMS Queen Elizabeth (R08)", type: "Carrier", flag: "UK", lat: 50.70, lng: -1.10, speed: 14, heading: 180 },
  { name: "HMS Astute (S119)", type: "Submarine", flag: "UK", lat: 56.30, lng: -5.70, speed: 12, heading: 270 },
  { name: "PLAN Shandong (CV-17)", type: "Carrier", flag: "CN", lat: 18.20, lng: 112.30, speed: 20, heading: 135 },
  { name: "PLAN Nanchang (DDG-101)", type: "Destroyer", flag: "CN", lat: 22.50, lng: 118.80, speed: 22, heading: 45 },
  { name: "INS Vikramaditya (R33)", type: "Carrier", flag: "IN", lat: 15.40, lng: 69.20, speed: 16, heading: 250 },
  { name: "INS Kochi (D64)", type: "Destroyer", flag: "IN", lat: 12.80, lng: 72.50, speed: 24, heading: 190 },
  { name: "JS Izumo (DDH-183)", type: "Helicopter Carrier", flag: "JP", lat: 33.50, lng: 135.20, speed: 18, heading: 120 },
  { name: "FS Charles de Gaulle (R91)", type: "Carrier", flag: "FR", lat: 35.80, lng: 18.50, speed: 15, heading: 110 },
  { name: "RFS Admiral Kuznetsov", type: "Carrier", flag: "RU", lat: 69.00, lng: 33.10, speed: 10, heading: 0 },
  { name: "HMAS Hobart (DDG-39)", type: "Destroyer", flag: "AU", lat: -33.80, lng: 151.30, speed: 20, heading: 350 },
  { name: "USS Virginia (SSN-774)", type: "Submarine", flag: "US", lat: 36.90, lng: -76.10, speed: 25, heading: 60 },
  { name: "PLAN Changzheng 18 (SSBN)", type: "Submarine", flag: "CN", lat: 15.00, lng: 115.50, speed: 14, heading: 200 },
  { name: "USS Arleigh Burke (DDG-51)", type: "Destroyer", flag: "US", lat: 35.20, lng: -75.80, speed: 28, heading: 45 },
  { name: "HMS Diamond (D34)", type: "Destroyer", flag: "UK", lat: 33.50, lng: 28.00, speed: 22, heading: 90 },
  { name: "INS Visakhapatnam (D66)", type: "Destroyer", flag: "IN", lat: 17.70, lng: 83.30, speed: 26, heading: 180 },
  { name: "JS Kaga (DDH-184)", type: "Helicopter Carrier", flag: "JP", lat: 26.50, lng: 128.00, speed: 16, heading: 200 },
  { name: "ROKN Sejong the Great (DDG-991)", type: "Destroyer", flag: "KR", lat: 35.10, lng: 129.50, speed: 24, heading: 150 },
  { name: "USS Nimitz (CVN-68)", type: "Carrier", flag: "US", lat: 32.70, lng: -117.20, speed: 20, heading: 270 },
];

// ── Commercial ship name pools ──
const CARGO_NAMES = [
  "Ever Given", "Ever Ace", "Ever Glory", "MSC Gulsun", "MSC Tessa", "MSC Irina",
  "CMA CGM Jacques Saade", "CMA CGM Palais Royal", "COSCO Universe", "COSCO Galaxy",
  "HMM Algeciras", "HMM Oslo", "OOCL Hong Kong", "MOL Triumph", "ONE Aquila",
  "Yang Ming Witness", "Wan Hai 613", "Maersk Essen", "Maersk Eindhoven",
  "Maersk Skarstind", "Eugen Maersk", "Madrid Maersk", "Munich Maersk",
  "MSC Oscar", "MSC Maya", "MSC Zoe", "CSCL Globe", "Barzan", "Al Muraykh",
  "Tihama", "Zhong Yuan", "Xin Shanghai", "Cap San Marco", "Santa Rosa",
  "Rio Negro", "Atlantic Star", "Pacific Voyager", "Indian Explorer",
  "Nordic Spirit", "Baltic Carrier", "Strait Pioneer", "Cape Horizon",
  "Global Meridian", "Trade Wind", "Sea Fortune", "Ocean Trader",
  "Swift Arrow", "Iron Gate", "Silver Bay", "Crystal Tide",
];

const TANKER_NAMES = [
  "Seawise Giant", "TI Europe", "TI Oceania", "Knock Nevis", "Hellespont Alhambra",
  "Eagle Vancouver", "Front Alta", "Suezmax Spirit", "Nordic Zenith", "Crude Carrier IV",
  "Stena Immortal", "Stena Supreme", "Minerva Gloria", "Minerva Nike",
  "Maran Gas Asclepius", "BW Elm", "BW Magnolia", "Hafnia Rhine",
  "Torm Hellerup", "Torm Alexandra", "Scorpio Leo", "Ridgebury Pioneer",
  "Gulf Cobalt", "Arabian Star", "Persian Liberty", "Caspian Voyager",
  "Suez Guardian", "Bosporus Trader", "Horn Explorer", "Malacca Mist",
  "Coral Diamond", "Energy Champion", "Petro Navigator", "Fuel Stream",
  "Oil Quest", "LNG Jurojin", "LNG Sakura", "Pacific Grace",
  "Atlantic Breeze", "Aegean Unity", "Adriatic Flame", "Rotterdam Spirit",
];

const PASSENGER_NAMES = [
  "Oasis of the Seas", "Symphony of the Seas", "Wonder of the Seas", "Harmony of the Seas",
  "Icon of the Seas", "MSC World Europa", "MSC Seascape", "MSC Virtuosa",
  "Costa Toscana", "Costa Smeralda", "AIDAnova", "AIDAcosma",
  "Carnival Celebration", "Carnival Jubilee", "Norwegian Prima", "Norwegian Viva",
  "Celebrity Beyond", "Celebrity Apex", "Disney Wish", "Disney Treasure",
  "Queen Mary 2", "Queen Anne", "Mardi Gras", "Sun Princess",
  "Silver Nova", "Explora I", "Viking Saturn", "Viking Mars",
  "Regent Seven Seas Grandeur", "Oceania Vista", "Azamara Onward",
  "Seabourn Pursuit", "Hurtigruten Roald Amundsen", "Ponant Le Commandant",
];

const FLAGS = ["PA", "LR", "MH", "HK", "SG", "BS", "MT", "CY", "GR", "NO", "DK", "JP", "KR", "DE", "GB", "US", "IT", "FR"];

// Find the best-fit ocean zone for a given coordinate
function findNearestZone(lat, lng) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < OCEAN_ZONES.length; i++) {
    const z = OCEAN_ZONES[i];
    const cLat = (z.minLat + z.maxLat) / 2;
    const cLng = (z.minLng + z.maxLng) / 2;
    const d = (lat - cLat) ** 2 + (lng - cLng) ** 2;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function generateFleet() {
  const fleet = [];

  // Military (the named elite assets — assign to nearest ocean zone)
  for (const ship of MILITARY_SHIPS) {
    fleet.push({ ...ship, category: "military", zoneIdx: findNearestZone(ship.lat, ship.lng) });
  }

  const TARGET = 420;
  const remaining = TARGET - fleet.length;
  const numCargo = Math.round(remaining * 0.50);
  const numTanker = Math.round(remaining * 0.30);
  const numPassenger = remaining - numCargo - numTanker;

  // Generate cargo ships
  for (let i = 0; i < numCargo; i++) {
    const coord = randomOceanCoord();
    const name = i < CARGO_NAMES.length
      ? CARGO_NAMES[i]
      : "Cargo " + String(1000 + i);
    fleet.push({
      name,
      type: "Cargo",
      category: "cargo",
      flag: FLAGS[Math.floor(seaRng() * FLAGS.length)],
      lat: coord.lat,
      lng: coord.lng,
      speed: 10 + Math.floor(seaRng() * 12),
      heading: Math.floor(seaRng() * 360),
      zoneIdx: coord.zoneIdx,
    });
  }

  // Generate tankers (biased toward oil routes)
  for (let i = 0; i < numTanker; i++) {
    const coord = randomTankerCoord();
    const name = i < TANKER_NAMES.length
      ? TANKER_NAMES[i]
      : "Tanker " + String(2000 + i);
    fleet.push({
      name,
      type: "Tanker",
      category: "tanker",
      flag: FLAGS[Math.floor(seaRng() * FLAGS.length)],
      lat: coord.lat,
      lng: coord.lng,
      speed: 8 + Math.floor(seaRng() * 10),
      heading: Math.floor(seaRng() * 360),
      zoneIdx: coord.zoneIdx,
    });
  }

  // Generate passenger ships
  for (let i = 0; i < numPassenger; i++) {
    const coord = randomOceanCoord();
    const name = i < PASSENGER_NAMES.length
      ? PASSENGER_NAMES[i]
      : "Cruise " + String(3000 + i);
    fleet.push({
      name,
      type: "Passenger",
      category: "passenger",
      flag: FLAGS[Math.floor(seaRng() * FLAGS.length)],
      lat: coord.lat,
      lng: coord.lng,
      speed: 14 + Math.floor(seaRng() * 10),
      heading: Math.floor(seaRng() * 360),
      zoneIdx: coord.zoneIdx,
    });
  }

  return fleet;
}

const FULL_FLEET = generateFleet();

// Compute position with zone-boundary bouncing so ships stay in water
function computeNavalPosition(ship) {
  const zone = OCEAN_ZONES[ship.zoneIdx] || OCEAN_ZONES[0];
  const STEP_SEC = 60; // simulate in 60-second steps for accurate bouncing
  const elapsedSec = (Date.now() - SERVER_START) / 1000;
  const totalSteps = Math.floor(elapsedSec / STEP_SEC);

  let lat = ship.lat;
  let lng = ship.lng;
  let heading = ship.heading;

  for (let s = 0; s < totalSteps; s++) {
    const hdgRad = (heading * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const DEG = 180 / Math.PI;
    const distKm = ship.speed * KNOTS_TO_KMS * STEP_SEC;

    lat += (distKm / EARTH_RADIUS_KM) * Math.cos(hdgRad) * DEG;
    lng += cosLat > 1e-6 ? (distKm / (EARTH_RADIUS_KM * cosLat)) * Math.sin(hdgRad) * DEG : 0;

    // Bounce off zone boundaries
    let bounced = false;
    if (lat < zone.minLat) { lat = zone.minLat + (zone.minLat - lat); heading = 360 - heading; bounced = true; }
    if (lat > zone.maxLat) { lat = zone.maxLat - (lat - zone.maxLat); heading = 360 - heading; bounced = true; }
    if (lng < zone.minLng) { lng = zone.minLng + (zone.minLng - lng); heading = (180 - heading + 360) % 360; bounced = true; }
    if (lng > zone.maxLng) { lng = zone.maxLng - (lng - zone.maxLng); heading = (180 - heading + 360) % 360; bounced = true; }

    // Normalize heading
    if (bounced) heading = ((heading % 360) + 360) % 360;
  }

  // Handle remaining fractional step
  const remainSec = elapsedSec - totalSteps * STEP_SEC;
  if (remainSec > 0) {
    const hdgRad = (heading * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const DEG = 180 / Math.PI;
    const distKm = ship.speed * KNOTS_TO_KMS * remainSec;

    lat += (distKm / EARTH_RADIUS_KM) * Math.cos(hdgRad) * DEG;
    lng += cosLat > 1e-6 ? (distKm / (EARTH_RADIUS_KM * cosLat)) * Math.sin(hdgRad) * DEG : 0;
  }

  // Final clamp to zone (safety net)
  lat = Math.max(zone.minLat, Math.min(zone.maxLat, lat));
  lng = Math.max(zone.minLng, Math.min(zone.maxLng, lng));

  return { lat, lng, heading };
}

app.get("/api/maritime", (req, res) => {
  const fleet = FULL_FLEET.map((ship, i) => {
    const pos = computeNavalPosition(ship);
    return {
      id: "NAV-" + String(i).padStart(3, "0"),
      name: ship.name,
      type: ship.type,
      category: ship.category,
      flag: ship.flag,
      lat: pos.lat,
      lng: pos.lng,
      speed: ship.speed,
      heading: pos.heading != null ? pos.heading : ship.heading,
    };
  });

  console.log("ARGUS-SERVER: Serving", fleet.length, "maritime vessels");
  res.json({ data: fleet });
});

// ── Serve static files ──
app.use(express.static(path.join(__dirname)));

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n  RUDRAAS ARGUS server running at http://localhost:${PORT}\n`);
});
