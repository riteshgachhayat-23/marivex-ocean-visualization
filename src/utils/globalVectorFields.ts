
export type VectorDataKind = "winds" | "currents";

export interface GlobalVectorField {
  kind: VectorDataKind;
  source: string;
  validTime: string;
  retrievedAt: string;
  latitudeStart: number;
  longitudeStart: number;
  latitudeStep: number;
  longitudeStep: number;
  rows: number;
  columns: number;
  cells: Array<[number, number] | null>;
  validSamples: number;
}

export interface VectorSample {
  east: number;
  north: number;
  speed: number;
}

const cache = new Map<
  VectorDataKind,
  { data: GlobalVectorField; expires: number }
>();

const DEG = Math.PI / 180;

function normalizeLongitude(value: number) {
  return (
    ((value + 180) % 360 + 360) % 360 - 180
  );
}

function isNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

type APIRecord = {
  latitude?: number;
  longitude?: number;
  hourly?: Record<string, number[] | string[]>;
  reason?: string;
};

async function requestBatch(
  kind: VectorDataKind,
  points: Array<{
    latitude: number;
    longitude: number;
  }>,
  signal?: AbortSignal
): Promise<{
  records: APIRecord[];
  source: string;
}> {
  const wind = kind === "winds";

  const speedKey = wind
    ? "wind_speed_10m"
    : "ocean_current_velocity";

  const directionKey = wind
    ? "wind_direction_10m"
    : "ocean_current_direction";

  const params = new URLSearchParams({
    latitude: points.map(p => p.latitude).join(","),
    longitude: points.map(p => p.longitude).join(","),
    hourly: `${speedKey},${directionKey}`,
    forecast_hours: "3",
    timezone: "GMT",
  });

  if (wind) {
    params.set("wind_speed_unit", "ms");
  } else {
    params.set("cell_selection", "sea");
    params.set("wind_speed_unit", "kmh");
  }

  const endpoints = wind
    ? [
        {
          url: "https://api.open-meteo.com/v1/gfs",
          source: "NOAA GFS via Open-Meteo",
        },
        {
          url: "https://api.open-meteo.com/v1/forecast",
          source: "Open-Meteo best-match forecast",
        },
      ]
    : [
        {
          url: "https://marine-api.open-meteo.com/v1/marine",
          source: "Open-Meteo Marine current model",
        },
      ];

  let lastError = "Provider unavailable";

  for (const endpoint of endpoints) {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, 11000);

    const cancel = () => controller.abort();

    signal?.addEventListener("abort", cancel, {
      once: true,
    });

    try {
      const response = await fetch(
        `${endpoint.url}?${params}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = await response.json();

      const records: APIRecord[] = Array.isArray(raw)
        ? raw
        : [raw];

      if (records.length !== points.length) {
        throw new Error("Incomplete API location batch");
      }

      return {
        records,
        source: endpoint.source,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new DOMException(
          "Cancelled",
          "AbortError"
        );
      }

      lastError =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  throw new Error(lastError);
}

export async function loadGlobalVectorField(
  kind: VectorDataKind,
  signal?: AbortSignal
): Promise<GlobalVectorField> {
  const cached = cache.get(kind);

  if (
    cached &&
    cached.expires > Date.now()
  ) {
    return cached.data;
  }

  // Coarse grid for global-scale model visualization.
  // It cannot resolve small storm eyes.
  const latitudeStart = -70;
  const longitudeStart = -180;
  const latitudeStep = 20;
  const longitudeStep = 20;
  const rows = 8;
  const columns = 18;

  const locations: Array<{
    latitude: number;
    longitude: number;
  }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      locations.push({
        latitude: latitudeStart + row * latitudeStep,
        longitude: longitudeStart + col * longitudeStep,
      });
    }
  }

  const cells: Array<[number, number] | null> =
    Array(locations.length).fill(null);

  let validSamples = 0;
  let validTime = "";
  let source = "";
  let lastError = "";

  const batches = [];

  for (
    let offset = 0;
    offset < locations.length;
    offset += 18
  ) {
    batches.push({
      offset,
      points: locations.slice(offset, offset + 18),
    });
  }

  // Four concurrent requests at a time.
  for (let start = 0; start < batches.length; start += 4) {
    if (signal?.aborted) {
      throw new DOMException("Cancelled", "AbortError");
    }

    const group = batches.slice(start, start + 4);

    const results = await Promise.allSettled(
      group.map(batch =>
        requestBatch(kind, batch.points, signal)
      )
    );

    results.forEach((result, batchIndex) => {
      if (result.status === "rejected") {
        lastError = String(result.reason);
        return;
      }

      const { records, source: receivedSource } =
        result.value;

      const batch = group[batchIndex];
      source = receivedSource;

      records.forEach((record, index) => {
        const hourly = record.hourly;

        if (!hourly) return;

        const speedKey =
          kind === "winds"
            ? "wind_speed_10m"
            : "ocean_current_velocity";

        const directionKey =
          kind === "winds"
            ? "wind_direction_10m"
            : "ocean_current_direction";

        const speeds = hourly[speedKey] as number[];
        const directions = hourly[directionKey] as number[];

        const speed = speeds?.[0];
        const direction = directions?.[0];

        if (
          !isNumber(speed) ||
          !isNumber(direction) ||
          speed < 0
        ) {
          return;
        }

        // Marine API velocity in km/h -> m/s.
        const metersPerSecond =
          kind === "currents" ? speed / 3.6 : speed;

        const angle = direction * DEG;

        // Wind direction = FROM bearing.
        // Ocean current direction = direction of flow.
        const sign = kind === "winds" ? -1 : 1;

        if (
          kind === "currents" &&
          isNumber(record.latitude) &&
          isNumber(record.longitude)
        ) {
          const wanted = batch.points[index];

          const lonDifference = Math.abs(
            normalizeLongitude(
              wanted.longitude - record.longitude
            )
          );

          const separation = Math.hypot(
            wanted.latitude - record.latitude,
            lonDifference *
              Math.cos(wanted.latitude * DEG)
          );

          if (separation > 8) return;
        }

        cells[batch.offset + index] = [
          sign * metersPerSecond * Math.sin(angle),
          sign * metersPerSecond * Math.cos(angle),
        ];

        validSamples++;

        if (!validTime) {
          const times = hourly.time as string[];

          if (times?.[0]) {
            validTime = times[0] + " UTC";
          }
        }
      });
    });
  }

  if (signal?.aborted) {
    throw new DOMException("Cancelled", "AbortError");
  }

  if (validSamples < 10) {
    throw new Error(
      `${kind} data unavailable: ${lastError || "No usable vectors returned"}`
    );
  }

  const data: GlobalVectorField = {
    kind,
    source,
    validTime: validTime || "Unknown",
    retrievedAt: new Date().toISOString(),
    latitudeStart,
    longitudeStart,
    latitudeStep,
    longitudeStep,
    rows,
    columns,
    cells,
    validSamples,
  };

  cache.set(kind, {
    data,
    expires: Date.now() + 45 * 60 * 1000,
  });

  return data;
}

export function sampleVector(
  field: GlobalVectorField,
  latitude: number,
  longitude: number
): VectorSample | null {
  const ry =
    (latitude - field.latitudeStart) /
    field.latitudeStep;

  if (ry < 0 || ry > field.rows - 1) {
    return null;
  }

  const row = Math.min(
    field.rows - 2,
    Math.floor(ry)
  );

  const ty = THREEClamp(ry - row);

  const rx =
    ((
      normalizeLongitude(longitude) -
      field.longitudeStart
    ) / field.longitudeStep + field.columns) %
    field.columns;

  const col = Math.floor(rx);
  const next = (col + 1) % field.columns;
  const tx = rx - col;

  const neighbours = [
    [row, col, (1 - tx) * (1 - ty)],
    [row, next, tx * (1 - ty)],
    [row + 1, col, (1 - tx) * ty],
    [row + 1, next, tx * ty],
  ];

  let east = 0;
  let north = 0;
  let weight = 0;

  for (const [r, c, w] of neighbours) {
    const cell = field.cells[
      r * field.columns + c
    ];

    if (!cell) continue;

    east += cell[0] * w;
    north += cell[1] * w;
    weight += w;
  }

  if (weight < 0.18) return null;

  east /= weight;
  north /= weight;

  return {
    east,
    north,
    speed: Math.hypot(east, north),
  };
}

function THREEClamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
