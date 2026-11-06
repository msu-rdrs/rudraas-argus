// ─── RUDRAAS ARGUS — Camera network (shared by the globe and the Intel Feed) ───
// All feeds are REAL live webcams — verified embeddable via oEmbed API.
// Orbital cameras use placeholder coordinates (they have no ground fix).

window.ARGUS_CAMERA_FEEDS = [
  // USA
  { id: "CAM-001", name: "NYC TIMES SQUARE",          lat: 40.7580,  lng: -73.9855,  ytId: "rnXIjl_Rzy4", region: "USA" },
  { id: "CAM-002", name: "NYC DUFFY SQUARE",          lat: 40.7590,  lng: -73.9845,  ytId: "iiBTWU2FyFo", region: "USA" },
  { id: "CAM-003", name: "LAS VEGAS STRIP",           lat: 36.1147,  lng: -115.1728, ytId: "-6q-aEQB14E", region: "USA" },
  { id: "CAM-004", name: "LAS VEGAS AERIE VIEW",      lat: 36.1175,  lng: -115.1710, ytId: "jtvmwjzZY0c", region: "USA" },
  { id: "CAM-005", name: "JACKSON HOLE TOWN SQ",      lat: 43.4799,  lng: -110.7624, ytId: "1EiC9bvVGnk", region: "USA" },
  { id: "CAM-006", name: "NEW ORLEANS BOURBON ST",    lat: 29.9584,  lng: -90.0654,  ytId: "Ksrleaxxxhw", region: "USA" },
  { id: "CAM-007", name: "NEW ORLEANS BALCONY",       lat: 29.9588,  lng: -90.0650,  ytId: "rnNPl27Arpk", region: "USA" },
  { id: "CAM-008", name: "KEY WEST DUVAL ST",         lat: 24.5551,  lng: -81.8018,  ytId: "3bXyYuk-XK0", region: "USA" },
  { id: "CAM-009", name: "NIAGARA FALLS",             lat: 43.0896,  lng: -79.0849,  ytId: "qx7gry390YA", region: "USA" },
  // JAPAN
  { id: "CAM-010", name: "TOKYO KABUKICHO LIVE",      lat: 35.6938,  lng: 139.7034,  ytId: "gFRtAAmiFbE", region: "JAPAN" },
  { id: "CAM-011", name: "TOKYO SHIBUYA CROSSING",    lat: 35.6595,  lng: 139.7005,  ytId: "dfVK7ld38Ys", region: "JAPAN" },
  { id: "CAM-012", name: "SHIBUYA SCRAMBLE ALT",      lat: 35.6597,  lng: 139.7003,  ytId: "8H3nRCFVR6Y", region: "JAPAN" },
  // EUROPE
  { id: "CAM-013", name: "DUBLIN TEMPLE BAR",         lat: 53.3454,  lng: -6.2636,   ytId: "3nyPER2kzqk", region: "EUROPE" },
  { id: "CAM-014", name: "DUBLIN COLLINS AVE",        lat: 53.3780,  lng: -6.2500,   ytId: "g1r59JJqY60", region: "EUROPE" },
  { id: "CAM-015", name: "ROME ST PETERS BASILICA",   lat: 41.9022,  lng: 12.4539,   ytId: "VzPbcndoD40", region: "EUROPE" },
  { id: "CAM-016", name: "ROME PIAZZA VENEZIA",       lat: 41.8957,  lng: 12.4823,   ytId: "3PVNKVXo6To", region: "EUROPE" },
  { id: "CAM-017", name: "AMSTERDAM CENTRAAL",        lat: 52.3791,  lng: 4.9003,    ytId: "1phWWCgzXgM", region: "EUROPE" },
  { id: "CAM-018", name: "AMSTERDAM ROOFTOP",         lat: 52.3738,  lng: 4.9100,    ytId: "9Pm6Ji6tm7s", region: "EUROPE" },
  // ASIA-PACIFIC
  { id: "CAM-019", name: "BANGKOK SUKHUMVIT",         lat: 13.7445,  lng: 100.5557,  ytId: "UemFRPrl1hk", region: "ASIA-PACIFIC" },
  { id: "CAM-020", name: "BANGKOK SOI 19",            lat: 13.7430,  lng: 100.5570,  ytId: "Q71sLS8h9a4", region: "ASIA-PACIFIC" },
  { id: "CAM-021", name: "SYDNEY HARBOUR",            lat: -33.8568, lng: 151.2153,  ytId: "5uZa3-RMFos", region: "ASIA-PACIFIC" },
  // AFRICA
  { id: "CAM-022", name: "NAMIBIA DESERT LIVE",       lat: -24.7256, lng: 15.2639,   ytId: "ydYDqZQpim8", region: "AFRICA" },
  // SPACE
  { id: "CAM-023", name: "ISS EARTH VIEW",            lat: 0.0,      lng: 0.0,       ytId: "sWasdbDVNvc", region: "ORBIT" },
  { id: "CAM-024", name: "ISS HD VIEWS",              lat: 10.0,     lng: -30.0,     ytId: "zPH5KtjJFaQ", region: "ORBIT" },
  { id: "CAM-025", name: "NASA EARTH FROM SPACE",     lat: -10.0,    lng: 60.0,      ytId: "vytmBNhc9ig", region: "ORBIT" },
];
