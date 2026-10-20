
import { createServer } from "node:http";

const PORT = 5002;
const cache = new Map();

const places = [
  { name: "Mariana Trench", lat: 11.4, lon: 142.2, base: -5700, type: "trench" },
  { name: "Puerto Rico Trench", lat: 19.4, lon: -66.5, base: -4700, type: "trench" },
  { name: "Mid-Atlantic Ridge", lat: 26, lon: -45, base: -3500, type: "ridge" },
  { name: "Bay of Bengal", lat: 15.5, lon: 88, base: -3100, type: "basin" },
  { name: "Arabian Sea", lat: 17, lon: 63, base: -3500, type: "ridge" },
  { name: "Gulf of Mexico", lat: 25.5, lon: -90, base: -3200, type: "shelf" },
  { name: "Bermuda Region", lat: 27, lon: -70, base: -4200, type: "basin" },
];

function respond(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function bounds(lat, lon, span) {
  return {
    north: lat + span / 2,
    south: lat - span / 2,
    east: lon + span / 2,
    west: lon - span / 2,
  };
}

function distance(a, b, c, d) {
  return Math.hypot(
    a - c,
    (b - d) * Math.cos(((a + c) / 2) * Math.PI / 180)
  );
}

// Mathematical terrain estimate. NOT measured bathymetry.
function createModelledGrid(lat, lon, span) {
  const nearest = places.reduce((best, p) =>
    distance(lat, lon, p.lat, p.lon) <
    distance(lat, lon, best.lat, best.lon) ? p : best
  );

  const local = distance(lat, lon, nearest.lat, nearest.lon) < 8
    ? nearest
    : { name: "Open Ocean", base: -3800, type: "basin" };

  const size = 91;
  const elevations = [];
  const b = bounds(lat, lon, span);
  let minimum = Infinity;
  let maximum = -Infinity;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = (col / (size - 1) - 0.5) * 2;
      const z = (row / (size - 1) - 0.5) * 2;

      const texture =
        160 * Math.sin(5 * x + lon * 0.09) *
          Math.cos(4 * z + lat * 0.13) +
        90 * Math.sin(13 * x + 3 * z) +
        40 * Math.sin(29 * x - 17 * z);

      let elevation = local.base + texture;

      if (local.type === "trench") {
        elevation -= 3600 * Math.exp(
          -Math.pow((x + 0.2 * z) / 0.21, 2)
        );
      }

      if (local.type === "ridge") {
        elevation +=
          2000 * Math.exp(
            -Math.pow((x - 0.25 * Math.sin(3 * z)) / 0.26, 2)
          ) -
          350 * Math.exp(-Math.pow(x / 0.08, 2));
      }

      if (local.type === "shelf") {
        elevation +=
          2750 / (1 + Math.exp((z + 0.45) * 14));
      }

      if (local.name === "Bay of Bengal") {
        elevation +=
          1850 / (1 + Math.exp((z + 0.7) * 12));
      }

      elevation = Number(
        clamp(elevation, -11000, 2000).toFixed(1)
      );

      elevations.push(elevation);
      minimum = Math.min(minimum, elevation);
      maximum = Math.max(maximum, elevation);
    }
  }

  return {
    rows: size,
    columns: size,
    elevations,
    latitudeStart: b.north,
    longitudeStart: b.west,
    latitudeStep: -span / (size - 1),
    longitudeStep: span / (size - 1),
    minimumElevationMeters: minimum,
    maximumElevationMeters: maximum,
    validSamples: elevations.length,
    source: `Modelled terrain — ${local.name}`,
    sourceUrl: "",
    dataMode: "modelled",
    method: "Mathematical terrain reconstruction, not measured or scientifically validated bathymetry.",
  };
}

async function getText(url, timeout = 9000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    throw new Error(`Provider HTTP ${response.status}`);
  }

  const text = await response.text();

  if (text.length > 15000000) {
    throw new Error("Provider response exceeds size limit");
  }

  return text;
}

// NOAA ETOPO1, one-arc-minute global elevation grid.
function parseNOAA(text) {
  const json = JSON.parse(text);
  const names = json?.table?.columnNames || [];
  const records = json?.table?.rows || [];

  const latIndex = names.indexOf("latitude");
  const lonIndex = names.indexOf("longitude");
  const altIndex = names.indexOf("altitude");

  if (
    latIndex < 0 ||
    lonIndex < 0 ||
    altIndex < 0 ||
    !records.length
  ) {
    throw new Error("Unexpected NOAA grid response");
  }

  const latitudeSet = new Set();
  const longitudeSet = new Set();
  const values = new Map();

  for (const record of records) {
    const lat = Number(record[latIndex]);
    const lon = Number(record[lonIndex]);
    const raw = record[altIndex];

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const elevation = raw === null ? null : Number(raw);

    latitudeSet.add(lat);
    longitudeSet.add(lon);

    values.set(
      `${lat},${lon}`,
      elevation !== null &&
      Number.isFinite(elevation) &&
      elevation > -13000 &&
      elevation < 10000
        ? elevation
        : null
    );
  }

  const latitudes = [...latitudeSet].sort((a, b) => b - a);
  const longitudes = [...longitudeSet].sort((a, b) => a - b);

  if (
    latitudes.length < 2 ||
    longitudes.length < 2 ||
    latitudes.length * longitudes.length > 55000
  ) {
    throw new Error("Invalid NOAA grid dimensions");
  }

  const elevations = [];
  let min = Infinity;
  let max = -Infinity;
  let valid = 0;

  for (const lat of latitudes) {
    for (const lon of longitudes) {
      const elevation = values.get(`${lat},${lon}`) ?? null;

      elevations.push(elevation);

      if (elevation !== null) {
        min = Math.min(min, elevation);
        max = Math.max(max, elevation);
        valid++;
      }
    }
  }

  if (valid < 25) {
    throw new Error("Insufficient NOAA elevation samples");
  }

  return {
    rows: latitudes.length,
    columns: longitudes.length,
    elevations,
    latitudeStart: latitudes[0],
    longitudeStart: longitudes[0],
    latitudeStep: latitudes[1] - latitudes[0],
    longitudeStep: longitudes[1] - longitudes[0],
    minimumElevationMeters: min,
    maximumElevationMeters: max,
    validSamples: valid,
    source: "NOAA ETOPO1",
    sourceUrl:
      "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.html",
    dataMode: "real",
    method: "Compiled scientific elevation grid",
  };
}

async function fetchNOAA(lat, lon, span) {
  const b = bounds(lat, lon, span);
  const stride = Math.max(1, Math.ceil(span * 60 / 95));

  const round = (n) => Number(n.toFixed(6));

  const south = round(Math.ceil(b.south * 60) / 60);
  const north = round(Math.floor(b.north * 60) / 60);
  const west = round(Math.ceil(b.west * 60) / 60);
  const east = round(Math.floor(b.east * 60) / 60);

  const query =
    `altitude[(${south}):${stride}:(${north})]` +
    `[(${west}):${stride}:(${east})]`;

  const servers = [
    "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json",
    "https://data.pmel.noaa.gov/socat/erddap/griddap/etopo180.json",
  ];

  let lastError;

  for (const server of servers) {
    try {
      return parseNOAA(
        await getText(
          `${server}?${encodeURIComponent(query)}`,
          7000
        )
      );
    } catch (error) {
      lastError = error;
      console.warn("NOAA failed:", error.message);
    }
  }

  throw lastError || new Error("NOAA unavailable");
}

// GMRT GridServer ESRI ASCII grid parser.
function parseGMRT(text) {
  const lines = text.trim().replace(/\r/g, "").split("\n");
  const metadata = {};
  const headerPattern =
    /^(ncols|nrows|xllcorner|xllcenter|yllcorner|yllcenter|cellsize|nodata_value)\s+([^\s]+)/i;

  let index = 0;

  for (; index < Math.min(lines.length, 9); index++) {
    const match = lines[index].trim().match(headerPattern);
    if (!match) break;

    metadata[match[1].toLowerCase()] = Number(match[2]);
  }

  const rows = metadata.nrows;
  const columns = metadata.ncols;
  const cellsize = metadata.cellsize;

  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 2 ||
    columns < 2 ||
    rows * columns > 200000 ||
    !Number.isFinite(cellsize) ||
    cellsize <= 0
  ) {
    throw new Error("Invalid GMRT ASCII grid");
  }

  const raw = lines.slice(index).join(" ").trim().split(/\s+/);

  if (raw.length !== rows * columns) {
    throw new Error("Incomplete GMRT grid");
  }

  const stride = Math.max(
    1,
    Math.ceil(Math.max(rows, columns) / 100)
  );

  const elevations = [];
  let min = Infinity;
  let max = -Infinity;
  let valid = 0;

  for (let row = 0; row < rows; row += stride) {
    for (let col = 0; col < columns; col += stride) {
      const elevation = Number(raw[row * columns + col]);

      const value =
        Number.isFinite(elevation) &&
        elevation !== metadata.nodata_value &&
        elevation > -13000 &&
        elevation < 10000
          ? elevation
          : null;

      elevations.push(value);

      if (value !== null) {
        min = Math.min(min, value);
        max = Math.max(max, value);
        valid++;
      }
    }
  }

  if (valid < 25) {
    throw new Error("GMRT grid contains insufficient data");
  }

  return {
    rows: Math.ceil(rows / stride),
    columns: Math.ceil(columns / stride),
    elevations,
    longitudeStart:
      (metadata.xllcorner ?? metadata.xllcenter) +
      (metadata.xllcorner !== undefined ? cellsize / 2 : 0),
    latitudeStart:
      (metadata.yllcorner ?? metadata.yllcenter) +
      (metadata.yllcorner !== undefined ? cellsize / 2 : 0) +
      (rows - 1) * cellsize,
    latitudeStep: -cellsize * stride,
    longitudeStep: cellsize * stride,
    minimumElevationMeters: min,
    maximumElevationMeters: max,
    validSamples: valid,
    source: "GMRT bathymetry",
    sourceUrl: "https://www.gmrt.org/services/",
    dataMode: "real",
    method: "Global Multi-Resolution Topography compilation",
  };
}

async function fetchGMRT(lat, lon, span) {
  const b = bounds(lat, lon, span);

  const url = new URL(
    "https://www.gmrt.org/services/GridServer"
  );

  for (const [key, value] of Object.entries({
    ...b,
    layer: "topo",
    format: "esriascii",
    mresolution: Math.ceil((span * 111000) / 100),
  })) {
    url.searchParams.set(key, String(value));
  }

  return parseGMRT(await getText(url.toString(), 7000));
}

async function getGrid(lat, lon, span, mode) {
  if (mode === "modelled") {
    return createModelledGrid(lat, lon, span);
  }

  try {
    return await fetchNOAA(lat, lon, span);
  } catch (error) {
    console.warn("NOAA unavailable:", error.message);
  }

  try {
    return await fetchGMRT(lat, lon, span);
  } catch (error) {
    console.warn("GMRT unavailable:", error.message);
  }

  if (mode === "real") {
    throw new Error(
      "Real bathymetry could not be downloaded from NOAA or GMRT."
    );
  }

  return {
    ...createModelledGrid(lat, lon, span),
    warning:
      "External bathymetry providers unavailable. Showing a modelled estimate, not measured bathymetry.",
  };
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return respond(res, 200, { ok: true });
  }

  const url = new URL(
    req.url || "/",
    `http://localhost:${PORT}`
  );

  if (url.pathname === "/api/health") {
    return respond(res, 200, {
      status: "MARIVEX bathymetry backend running",
      modes: ["auto", "real", "modelled"],
    });
  }

  if (
    req.method !== "GET" ||
    url.pathname !== "/api/bathymetry"
  ) {
    return respond(res, 404, { error: "Not found" });
  }

  const latText = url.searchParams.get("lat");
  const lonText = url.searchParams.get("lon");

  const lat = Number(latText);
  const lon = Number(lonText);
  const span = Number(url.searchParams.get("span") || 2);
  const mode = url.searchParams.get("mode") || "auto";

  if (
    latText === null ||
    lonText === null ||
    ![lat, lon, span].every(Number.isFinite) ||
    Math.abs(lat) > 78 ||
    Math.abs(lon) > 180 ||
    span < 0.25 ||
    span > 6 ||
    !["auto", "real", "modelled"].includes(mode)
  ) {
    return respond(res, 400, {
      error: "Invalid coordinates, span or mode",
    });
  }

  if (
    lat + span / 2 > 80 ||
    lat - span / 2 < -80 ||
    lon + span / 2 > 180 ||
    lon - span / 2 < -180
  ) {
    return respond(res, 400, {
      error: "Requested grid crosses a supported boundary",
    });
  }

  const key =
    `${lat.toFixed(3)}:${lon.toFixed(3)}:${span}:${mode}`;

  const cached = cache.get(key);

  if (cached && Date.now() < cached.expires) {
    return respond(res, 200, cached.data);
  }

  try {
    const grid = await getGrid(lat, lon, span, mode);

    const data = {
      ...grid,
      requestedCenter: { latitude: lat, longitude: lon },
      regionSpanDegrees: span,
      verticalUnits: "metres relative to sea level",
      retrievedAt: new Date().toISOString(),
    };

    cache.set(key, {
      data,
      expires:
        Date.now() +
        (data.dataMode === "real" ? 21600000 : 600000),
    });

    if (cache.size > 30) {
      cache.delete(cache.keys().next().value);
    }

    console.log(
      `Bathymetry: ${data.source} (${data.columns} x ${data.rows})`
    );

    return respond(res, 200, data);
  } catch (error) {
    console.error("Bathymetry error:", error);

    return respond(res, 502, {
      error: "Bathymetry unavailable",
      detail: error.message,
    });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(
    `MARIVEX bathymetry: http://localhost:${PORT}`
  );
});
