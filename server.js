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
    console.log("ARGUS-SERVER: FR24 returned", flightCount, "aircraft");
    if (flightCount > 0) {
      console.log("ARGUS-SERVER: Sample flight keys:", Object.keys(data.data[0]));
    }

    // Enforce the limit on our side too, just in case
    if (data.data && Array.isArray(data.data) && data.data.length > FR24_RESULT_LIMIT) {
      data.data = data.data.slice(0, FR24_RESULT_LIMIT);
    }

    res.json(data);
  } catch (err) {
    console.error("ARGUS-SERVER: Proxy error —", err.message);
    res.status(502).json({ error: "proxy_error", message: err.message });
  }
});

// ── Serve static files ──
app.use(express.static(path.join(__dirname)));

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n  RUDRAAS ARGUS server running at http://localhost:${PORT}\n`);
});
