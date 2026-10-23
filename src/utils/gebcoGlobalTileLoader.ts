import type { BathymetryGridDataset, BathymetricLandmark, BathymetryProvenance } from './bathymetryGridBuilder';

export const INT16_NODATA = -32768;

export interface GebcoTileBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  crossesAntimeridian?: boolean;
}

export interface GebcoManifestTile {
  id: string;
  name?: string;
  file: string;
  format?: 'int16le' | 'int16' | 'json' | string;
  level?: number;
  tileRow?: number;
  tileCol?: number;
  row?: number;
  col?: number;
  stride?: number;
  sampleOffsetRow?: number;
  sampleOffsetCol?: number;
  resolutionArcSec?: number;
  nativeResolutionArcSec?: number;
  rowOrder?: 'south-to-north' | 'north-to-south';
  colOrder?: 'west-to-east' | 'east-to-west';
  gridWidth: number;
  gridHeight: number;
  bounds?: GebcoTileBounds;
  sampleBounds?: GebcoTileBounds;
  sampleSpacingLat?: number;
  sampleSpacingLon?: number;
  minDepth?: number;
  maxDepth?: number;
  minElevation?: number;
  maxElevation?: number;
  missingSampleCount?: number;
  hasSignedElevations?: boolean;
  provenance?: BathymetryProvenance;
  landmarksCount?: number;
  landmarks?: BathymetricLandmark[];
}

export interface GebcoTileManifest {
  dataset: string;
  version?: string;
  license?: string;
  verticalDatum?: string;
  gridIntervalArcSec?: number;
  nativeResolutionArcSec?: number;
  finestResolutionArcSec?: number;
  coverage: 'global' | 'partial' | 'regional_presets' | 'unknown';
  coverageTier?: string;
  hasL4HighResolution?: boolean;
  totalTiles?: number;
  completeLevels?: number[];
  incompleteLevels?: number[];
  processedAt?: string;
  tiles: GebcoManifestTile[];
}

export interface DecodedGebcoTile {
  manifestTile: GebcoManifestTile;
  gridWidth: number;
  gridHeight: number;
  rowOrder: 'south-to-north' | 'north-to-south';
  colOrder: 'west-to-east' | 'east-to-west';
  bounds: GebcoTileBounds;
  sampleBounds: GebcoTileBounds;
  sampleSpacingLat: number;
  sampleSpacingLon: number;
  rawElevations: Float32Array;
  depths: Float32Array;
  validSampleMask: Uint8Array;
  minDepth: number;
  maxDepth: number;
  minElevation: number;
  maxElevation: number;
  missingSampleCount: number;
  landmarks: BathymetricLandmark[];
  sourceName: string;
  resolutionArcSec: number;
  hasSignedElevations?: boolean;
  provenance: BathymetryProvenance;
  sampleElevationAt: (
    lat: number,
    lon: number
  ) => {
    elevation: number | null;
    depth: number | null;
    isLand: boolean;
    sampledCoordinates: {
      latitude: number;
      longitude: number;
      rowIndex: number;
      colIndex: number;
    };
  };
}

const PYRAMID_LEVEL_SPECS: Record<number, { rows: number; cols: number; stride: number }> = {
  0: { rows: 1, cols: 1, stride: 240 },
  1: { rows: 2, cols: 4, stride: 60 },
  2: { rows: 6, cols: 12, stride: 16 },
  3: { rows: 10, cols: 20, stride: 4 },
  4: { rows: 36, cols: 72, stride: 1 }
};

/**
 * Normalizes any finite longitude into [-180, 180].
 * Preserves +180 when input is +180.
 */
export function normalizeLongitude(lon: number): number {
  if (!Number.isFinite(lon)) return NaN;
  let n = (((lon + 180) % 360) + 360) % 360 - 180;
  if (n === -180 && lon > 0) n = 180;
  if (Object.is(n, -0)) n = 0;
  return Number(n.toFixed(6));
}

/**
 * Validates geographic coordinates.
 */
export function validateCoordinates(
  lat: unknown,
  lon: unknown,
  strictLon: boolean = true
): { valid: boolean; error?: string; latitude?: number; longitude?: number } {
  const numLat =
    typeof lat === 'number' ? lat : typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : NaN;
  const numLon =
    typeof lon === 'number' ? lon : typeof lon === 'string' && lon.trim() !== '' ? Number(lon) : NaN;

  if (!Number.isFinite(numLat)) {
    return { valid: false, error: 'Latitude must be a finite number between -90 and +90.' };
  }
  if (!Number.isFinite(numLon)) {
    return { valid: false, error: 'Longitude must be a finite number between -180 and +180.' };
  }
  if (numLat < -90 || numLat > 90) {
    return {
      valid: false,
      error: `Latitude ${numLat}° is out of valid range [-90°, +90°].`
    };
  }
  if (strictLon && (numLon < -180 || numLon > 180)) {
    return {
      valid: false,
      error: `Longitude ${numLon}° is out of valid range [-180°, +180°].`
    };
  }

  return {
    valid: true,
    latitude: Number(numLat.toFixed(6)),
    longitude: normalizeLongitude(numLon)
  };
}

/**
 * Formats latitude and longitude with N/S and E/W hemisphere designators.
 */
export function formatCoordinateString(lat: number, lon: number, decimals: number = 2): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Unknown Coordinates';
  const normLon = normalizeLongitude(lon);
  const latHemi = lat >= 0 ? 'N' : 'S';
  const lonHemi = normLon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(decimals)}°${latHemi}, ${Math.abs(normLon).toFixed(decimals)}°${lonHemi}`;
}

/**
 * Checks whether a geographic bounding box covers (lat, lon).
 * Supports antimeridian-crossing bounds.
 */
export function doesTileCoverCoordinate(
  bounds: GebcoTileBounds,
  lat: number,
  lon: number,
  eps: number = 1e-6
): boolean {
  if (!bounds || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < bounds.minLat - eps || lat > bounds.maxLat + eps) return false;

  const normLon = normalizeLongitude(lon);
  const crossesAntimeridian = Boolean(bounds.crossesAntimeridian || bounds.minLon > bounds.maxLon);

  if (crossesAntimeridian) {
    return normLon >= bounds.minLon - eps || normLon <= bounds.maxLon + eps;
  }

  if (Math.abs(normLon - 180) <= eps && Math.abs(bounds.minLon - -180) <= eps) {
    return true;
  }
  if (Math.abs(normLon - -180) <= eps && Math.abs(bounds.maxLon - 180) <= eps) {
    return true;
  }

  return normLon >= bounds.minLon - eps && normLon <= bounds.maxLon + eps;
}

/**
 * Infers and verifies dataset coverage from explicit manifest metadata AND verified
 * per-level geographic sector coverage.
 *
 * Guarantees:
 * - Never infers `global` coverage merely because a manifest contains a binary tile or a level-0 tile.
 * - Requires both explicit `coverage: "global"` metadata AND verified complete pyramid levels
 *   spanning `[-90, 90] x [-180, 180]` with zero incomplete levels before reporting `global`.
 * - Distinguishes `global`, `partial`, `regional_presets`, and `unknown`.
 */
export function inferManifestCoverage(
  raw: any,
  validTiles: GebcoManifestTile[]
): {
  coverage: 'global' | 'partial' | 'regional_presets' | 'unknown';
  completeLevels: number[];
  incompleteLevels: number[];
} {
  if (!Array.isArray(validTiles) || validTiles.length === 0) {
    return { coverage: 'unknown', completeLevels: [], incompleteLevels: [] };
  }

  const declared =
    typeof raw?.coverage === 'string' ? raw.coverage.trim().toLowerCase() : '';

  const binaryTiles = validTiles.filter(
    (t) => t.format === 'int16le' || t.format === 'int16' || (typeof t.file === 'string' && t.file.endsWith('.bin'))
  );
  const jsonTiles = validTiles.filter(
    (t) => t.format === 'json' || (typeof t.file === 'string' && t.file.endsWith('.json'))
  );

  // Regional JSON presets only (no binary pyramid tiles)
  if (binaryTiles.length === 0) {
    if (
      declared === 'regional_presets' ||
      declared === 'regional' ||
      jsonTiles.length > 0
    ) {
      return { coverage: 'regional_presets', completeLevels: [], incompleteLevels: [] };
    }
    return { coverage: 'unknown', completeLevels: [], incompleteLevels: [] };
  }

  // Group binary tiles by pyramid level and verify sector completeness and geographic bounds
  const byLevel = new Map<number, GebcoManifestTile[]>();
  for (const t of binaryTiles) {
    const lvl = typeof t.level === 'number' && Number.isFinite(t.level) ? t.level : 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(t);
  }

  const completeLevels: number[] = [];
  const incompleteLevels: number[] = [];

  for (const [lvl, lvlTiles] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const spec = PYRAMID_LEVEL_SPECS[lvl];
    if (!spec) {
      incompleteLevels.push(lvl);
      continue;
    }

    const expectedCount = spec.rows * spec.cols;
    const expLatSpan = 180.0 / spec.rows;
    const expLonSpan = 360.0 / spec.cols;
    const sectorSet = new Set<string>();
    let levelValid = true;

    for (const t of lvlTiles) {
      const declaredR =
        typeof t.tileRow === 'number'
          ? t.tileRow
          : typeof t.row === 'number'
            ? t.row
            : null;
      const declaredC =
        typeof t.tileCol === 'number'
          ? t.tileCol
          : typeof t.col === 'number'
            ? t.col
            : null;

      let parsedR: number | null = null;
      let parsedC: number | null = null;
      const m = /^L(\d+)_r(\d+)_c(\d+)$/i.exec(String(t.id || ''));
      if (m && Number(m[1]) === lvl) {
        parsedR = Number(m[2]);
        parsedC = Number(m[3]);
      }

      if (declaredR !== null && parsedR !== null && declaredR !== parsedR) {
        levelValid = false;
        break;
      }
      if (declaredC !== null && parsedC !== null && declaredC !== parsedC) {
        levelValid = false;
        break;
      }

      const rIdx = declaredR !== null ? declaredR : parsedR;
      const cIdx = declaredC !== null ? declaredC : parsedC;
      if (
        rIdx === null ||
        cIdx === null ||
        rIdx < 0 ||
        rIdx >= spec.rows ||
        cIdx < 0 ||
        cIdx >= spec.cols
      ) {
        levelValid = false;
        break;
      }

      const expMinLat = -90.0 + rIdx * expLatSpan;
      const expMaxLat = -90.0 + (rIdx + 1) * expLatSpan;
      const expMinLon = -180.0 + cIdx * expLonSpan;
      const expMaxLon = -180.0 + (cIdx + 1) * expLonSpan;

      const tb = t.bounds;
      if (
        !tb ||
        Math.abs(tb.minLat - expMinLat) > 1e-2 ||
        Math.abs(tb.maxLat - expMaxLat) > 1e-2 ||
        Math.abs(tb.minLon - expMinLon) > 1e-2 ||
        Math.abs(tb.maxLon - expMaxLon) > 1e-2
      ) {
        levelValid = false;
        break;
      }

      const key = `${rIdx}:${cIdx}`;
      if (sectorSet.has(key)) {
        levelValid = false;
        break;
      }
      sectorSet.add(key);
    }

    if (levelValid && lvlTiles.length === expectedCount && sectorSet.size === expectedCount) {
      completeLevels.push(lvl);
    } else {
      incompleteLevels.push(lvl);
    }
  }

  const minLat = Math.min(...binaryTiles.map((t) => t.bounds?.minLat ?? 90));
  const maxLat = Math.max(...binaryTiles.map((t) => t.bounds?.maxLat ?? -90));
  const minLon = Math.min(...binaryTiles.map((t) => t.bounds?.minLon ?? 180));
  const maxLon = Math.max(...binaryTiles.map((t) => t.bounds?.maxLon ?? -180));
  const spansFullGlobe =
    minLat <= -89.9 && maxLat >= 89.9 && minLon <= -179.9 && maxLon >= 179.9;

  if (declared === 'regional_presets' || declared === 'regional') {
    return { coverage: 'regional_presets', completeLevels, incompleteLevels };
  }

  if (declared === 'partial') {
    return { coverage: 'partial', completeLevels, incompleteLevels };
  }

  // If any binary pyramid level is incomplete or does not cover the full globe, it is partial
  if (incompleteLevels.length > 0 || !spansFullGlobe) {
    return { coverage: 'partial', completeLevels, incompleteLevels };
  }

  // Only report 'global' when explicitly declared AND verified complete across all present pyramid levels
  if (declared === 'global' && completeLevels.length > 0 && incompleteLevels.length === 0 && spansFullGlobe) {
    return { coverage: 'global', completeLevels, incompleteLevels };
  }

  return { coverage: 'unknown', completeLevels, incompleteLevels };
}

/**
 * Validates a raw manifest JSON payload and normalizes tile entries and coverage metadata.
 */
export function parseAndValidateManifest(raw: any): GebcoTileManifest {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tiles)) {
    throw new Error('Invalid bathymetry manifest: missing tiles array.');
  }

  const validTiles: GebcoManifestTile[] = [];
  for (const item of raw.tiles) {
    if (!item || typeof item.id !== 'string' || typeof item.file !== 'string') continue;
    const b = item.bounds;
    if (
      !b ||
      !Number.isFinite(Number(b.minLat)) ||
      !Number.isFinite(Number(b.maxLat)) ||
      !Number.isFinite(Number(b.minLon)) ||
      !Number.isFinite(Number(b.maxLon)) ||
      Number(b.minLat) >= Number(b.maxLat)
    ) {
      continue;
    }

    const gw = Number(item.gridWidth);
    const gh = Number(item.gridHeight);
    if (!Number.isFinite(gw) || !Number.isFinite(gh) || gw < 2 || gh < 2) continue;

    const isJson = item.file.endsWith('.json') || item.format === 'json';
    const stride = Number.isFinite(Number(item.stride)) && Number(item.stride) > 0
      ? Number(item.stride)
      : isJson
        ? 4
        : 1;
    const level =
      typeof item.level === 'number' && Number.isFinite(item.level)
        ? item.level
        : stride >= 240
          ? 0
          : stride >= 60
            ? 1
            : stride >= 16
              ? 2
              : stride >= 4
                ? 3
                : 4;

    const normalizedTile: GebcoManifestTile = {
      ...item,
      id: item.id,
      file: item.file,
      format: isJson ? 'json' : 'int16le',
      level,
      stride,
      gridWidth: gw,
      gridHeight: gh,
      bounds: {
        minLat: Number(b.minLat),
        maxLat: Number(b.maxLat),
        minLon: Number(b.minLon),
        maxLon: Number(b.maxLon),
        crossesAntimeridian: Boolean(b.crossesAntimeridian || Number(b.minLon) > Number(b.maxLon))
      },
      sampleBounds: item.sampleBounds
        ? {
            minLat: Number(item.sampleBounds.minLat),
            maxLat: Number(item.sampleBounds.maxLat),
            minLon: Number(item.sampleBounds.minLon),
            maxLon: Number(item.sampleBounds.maxLon),
            crossesAntimeridian: Boolean(
              item.sampleBounds.crossesAntimeridian ||
                Number(item.sampleBounds.minLon) > Number(item.sampleBounds.maxLon)
            )
          }
        : undefined
    };

    validTiles.push(normalizedTile);
  }

  const coverageInfo = inferManifestCoverage(raw, validTiles);

  return {
    dataset: String(raw.dataset || 'GEBCO Bathymetric Dataset'),
    version: raw.version,
    license: raw.license,
    verticalDatum: raw.verticalDatum || 'Mean Sea Level (metres)',
    gridIntervalArcSec: Number(raw.gridIntervalArcSec) || 60,
    nativeResolutionArcSec: Number(raw.nativeResolutionArcSec) || Number(raw.gridIntervalArcSec) || 15,
    finestResolutionArcSec: Number(raw.finestResolutionArcSec) || Number(raw.gridIntervalArcSec) || 60,
    coverage: coverageInfo.coverage,
    coverageTier: raw.coverageTier,
    hasL4HighResolution: Boolean(raw.hasL4HighResolution && coverageInfo.completeLevels.includes(4)),
    totalTiles: validTiles.length,
    completeLevels: coverageInfo.completeLevels,
    incompleteLevels: coverageInfo.incompleteLevels,
    processedAt: raw.processedAt,
    tiles: validTiles
  };
}

export class GebcoGlobalTileLoader {
  private manifestCache: GebcoTileManifest | null = null;
  private manifestPromise: Promise<GebcoTileManifest> | null = null;
  private tileCache = new Map<string, DecodedGebcoTile>();
  private maxCachedTiles = 24;

  public normalizeLongitude(lon: number): number {
    return normalizeLongitude(lon);
  }

  public async loadManifest(signal?: AbortSignal): Promise<GebcoTileManifest> {
    if (this.manifestCache) return this.manifestCache;
    if (this.manifestPromise && !signal) return this.manifestPromise;

    const fetchTask = async (): Promise<GebcoTileManifest> => {
      const response = await fetch('/data/bathymetry/manifest.json', { signal });
      if (!response.ok) {
        throw new Error(`Failed to load bathymetry manifest: HTTP ${response.status}`);
      }
      const raw = await response.json();
      const validated = parseAndValidateManifest(raw);
      this.manifestCache = validated;
      return validated;
    };

    if (signal) {
      return fetchTask();
    }

    this.manifestPromise = fetchTask();
    try {
      return await this.manifestPromise;
    } finally {
      this.manifestPromise = null;
    }
  }

  private computeTileArea(b: GebcoTileBounds): number {
    const latSpan = Math.max(1e-6, b.maxLat - b.minLat);
    const lonSpan =
      b.crossesAntimeridian || b.minLon > b.maxLon
        ? 180 - b.minLon + (b.maxLon + 180)
        : Math.max(1e-6, b.maxLon - b.minLon);
    return latSpan * lonSpan;
  }

  /**
   * Finds all tiles in the manifest whose geographic bounds genuinely cover (lat, lon),
   * ordered from best match (or preferredLevel) to coarsest.
   * Never returns an unrelated fallback tile when no tile covers the coordinate.
   */
  public findCoveringTiles(
    manifest: { tiles: GebcoManifestTile[] },
    lat: number,
    lon: number,
    preferredLevel?: number
  ): GebcoManifestTile[] {
    if (!manifest || !Array.isArray(manifest.tiles)) return [];
    const check = validateCoordinates(lat, lon, false);
    if (!check.valid || check.latitude === undefined || check.longitude === undefined) {
      return [];
    }

    const matching = manifest.tiles.filter(
      (t) => t.bounds && doesTileCoverCoordinate(t.bounds, check.latitude!, check.longitude!)
    );
    if (matching.length === 0) return [];

    matching.sort((a, b) => {
      const lvlA = a.level ?? 0;
      const lvlB = b.level ?? 0;

      if (preferredLevel !== undefined) {
        const diffA = Math.abs(lvlA - preferredLevel);
        const diffB = Math.abs(lvlB - preferredLevel);
        if (diffA !== diffB) return diffA - diffB;
      }

      if (lvlB !== lvlA) return lvlB - lvlA;

      const areaA = this.computeTileArea(a.bounds!);
      const areaB = this.computeTileArea(b.bounds!);
      if (Math.abs(areaA - areaB) > 1e-6) return areaA - areaB;

      return String(a.id).localeCompare(String(b.id));
    });

    return matching;
  }

  /**
   * Returns the single highest-priority tile covering (lat, lon), or null if none.
   */
  public findCoveringTile(
    manifest: { tiles: GebcoManifestTile[] },
    lat: number,
    lon: number,
    preferredLevel?: number
  ): GebcoManifestTile | null {
    const matches = this.findCoveringTiles(manifest, lat, lon, preferredLevel);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Resolves exact sample-center geometry for a tile, respecting `sampleBounds`,
   * `sampleSpacingLat`, `sampleSpacingLon`, `sampleOffsetRow`, `sampleOffsetCol`,
   * and `stride` without assuming outer sector boundaries equal sample centers.
   */
  public resolveTileSampleGeometry(tile: {
    gridWidth: number;
    gridHeight: number;
    bounds: GebcoTileBounds;
    sampleBounds?: GebcoTileBounds;
    sampleSpacingLat?: number;
    sampleSpacingLon?: number;
    sampleOffsetRow?: number;
    sampleOffsetCol?: number;
    resolutionArcSec?: number;
    stride?: number;
    format?: string;
  }): {
    sampleBounds: GebcoTileBounds;
    sampleSpacingLat: number;
    sampleSpacingLon: number;
    crossesAntimeridian: boolean;
  } {
    const w = Math.max(1, tile.gridWidth);
    const h = Math.max(1, tile.gridHeight);
    const outerBounds = tile.bounds;
    const outerCrosses = Boolean(outerBounds.crossesAntimeridian || outerBounds.minLon > outerBounds.maxLon);
    const outerLonSpan = outerCrosses
      ? 180 - outerBounds.minLon + (outerBounds.maxLon + 180)
      : Math.max(0, outerBounds.maxLon - outerBounds.minLon);
    const outerLatSpan = Math.max(0, outerBounds.maxLat - outerBounds.minLat);

    let sampleBounds: GebcoTileBounds;
    if (tile.sampleBounds) {
      sampleBounds = tile.sampleBounds;
    } else {
      const resArcSec = tile.resolutionArcSec || (tile.stride ? tile.stride * 15 : 0);
      const cellDeg = resArcSec > 0 ? resArcSec / 3600 : 0;
      const isJson = tile.format === 'json';
      if (
        !isJson &&
        cellDeg > 0 &&
        h >= 2 &&
        w >= 2 &&
        Math.abs(outerLatSpan - h * cellDeg) <= cellDeg * 0.15 &&
        Math.abs(outerLonSpan - w * cellDeg) <= cellDeg * 0.15
      ) {
        const stride = Math.max(1, tile.stride || 1);
        const rowOffset =
          typeof tile.sampleOffsetRow === 'number' ? tile.sampleOffsetRow : Math.floor(stride / 2);
        const colOffset =
          typeof tile.sampleOffsetCol === 'number' ? tile.sampleOffsetCol : Math.floor(stride / 2);
        const sampleDLat = outerLatSpan / h;
        const sampleDLon = outerLonSpan / w;
        const nativeDLat = sampleDLat / stride;
        const nativeDLon = sampleDLon / stride;
        sampleBounds = {
          minLat: Number((outerBounds.minLat + (rowOffset + 0.5) * nativeDLat).toFixed(6)),
          maxLat: Number(
            (outerBounds.minLat + ((h - 1) * stride + rowOffset + 0.5) * nativeDLat).toFixed(6)
          ),
          minLon: normalizeLongitude(outerBounds.minLon + (colOffset + 0.5) * nativeDLon),
          maxLon: normalizeLongitude(
            outerBounds.minLon + ((w - 1) * stride + colOffset + 0.5) * nativeDLon
          ),
          crossesAntimeridian: outerCrosses
        };
      } else {
        sampleBounds = outerBounds;
      }
    }

    const crossesAntimeridian = Boolean(
      sampleBounds.crossesAntimeridian ||
        outerBounds.crossesAntimeridian ||
        sampleBounds.minLon > sampleBounds.maxLon
    );
    const sLonSpan = crossesAntimeridian
      ? 180 - sampleBounds.minLon + (sampleBounds.maxLon + 180)
      : Math.max(0, sampleBounds.maxLon - sampleBounds.minLon);

    const sampleSpacingLat =
      tile.sampleSpacingLat && tile.sampleSpacingLat > 0
        ? tile.sampleSpacingLat
        : h > 1
          ? (sampleBounds.maxLat - sampleBounds.minLat) / (h - 1)
          : Math.max(1e-6, outerLatSpan);

    const sampleSpacingLon =
      tile.sampleSpacingLon && tile.sampleSpacingLon > 0
        ? tile.sampleSpacingLon
        : w > 1
          ? sLonSpan / (w - 1)
          : Math.max(1e-6, outerLonSpan);

    return {
      sampleBounds,
      sampleSpacingLat,
      sampleSpacingLon,
      crossesAntimeridian
    };
  }

  /**
   * Maps a requested (lat, lon) to the nearest actual sample in `tile`, returning both
   * the elevation/depth and the exact sampled cell-center coordinates.
   */
  public sampleTileElevation(
    tile: DecodedGebcoTile,
    lat: number,
    lon: number
  ): {
    elevation: number | null;
    depth: number | null;
    isLand: boolean;
    sampledCoordinates: {
      latitude: number;
      longitude: number;
      rowIndex: number;
      colIndex: number;
    };
  } {
    const w = Math.max(1, tile.gridWidth);
    const h = Math.max(1, tile.gridHeight);
    const geom = this.resolveTileSampleGeometry({
      gridWidth: w,
      gridHeight: h,
      bounds: tile.bounds,
      sampleBounds: tile.sampleBounds || tile.manifestTile?.sampleBounds,
      sampleSpacingLat: tile.sampleSpacingLat ?? tile.manifestTile?.sampleSpacingLat,
      sampleSpacingLon: tile.sampleSpacingLon ?? tile.manifestTile?.sampleSpacingLon,
      sampleOffsetRow: tile.manifestTile?.sampleOffsetRow,
      sampleOffsetCol: tile.manifestTile?.sampleOffsetCol,
      resolutionArcSec: tile.resolutionArcSec ?? tile.manifestTile?.resolutionArcSec,
      stride: tile.manifestTile?.stride,
      format: tile.manifestTile?.format
    });

    const sb = geom.sampleBounds;
    const dLat = Math.max(1e-9, geom.sampleSpacingLat);
    const dLon = Math.max(1e-9, geom.sampleSpacingLon);
    const rowOrder = tile.rowOrder || tile.manifestTile?.rowOrder || 'south-to-north';
    const colOrder = tile.colOrder || tile.manifestTile?.colOrder || 'west-to-east';

    let rowIndex = 0;
    let sampledLat = sb.minLat;
    if (h > 1) {
      if (rowOrder === 'south-to-north') {
        rowIndex = Math.min(h - 1, Math.max(0, Math.round((lat - sb.minLat) / dLat)));
        sampledLat = sb.minLat + rowIndex * dLat;
      } else {
        rowIndex = Math.min(h - 1, Math.max(0, Math.round((sb.maxLat - lat) / dLat)));
        sampledLat = sb.maxLat - rowIndex * dLat;
      }
    }

    const normLon = normalizeLongitude(lon);
    const lonOffsetFromWest = geom.crossesAntimeridian
      ? normLon >= sb.minLon
        ? normLon - sb.minLon
        : 180 - sb.minLon + (normLon + 180)
      : normLon - sb.minLon;

    let colIndex = 0;
    let sampledLon = normalizeLongitude(sb.minLon);
    if (w > 1) {
      const westColIndex = Math.min(w - 1, Math.max(0, Math.round(lonOffsetFromWest / dLon)));
      colIndex = colOrder === 'east-to-west' ? w - 1 - westColIndex : westColIndex;
      sampledLon = normalizeLongitude(sb.minLon + westColIndex * dLon);
    }

    const idx = rowIndex * w + colIndex;
    const rawVal = tile.rawElevations[idx];
    const hasSigned =
      typeof tile.hasSignedElevations === 'boolean'
        ? tile.hasSignedElevations
        : typeof tile.manifestTile?.hasSignedElevations === 'boolean'
          ? tile.manifestTile.hasSignedElevations
          : tile.manifestTile?.format !== 'json';

    if (!Number.isFinite(rawVal)) {
      return {
        elevation: null,
        depth: null,
        isLand: false,
        sampledCoordinates: {
          latitude: Number(sampledLat.toFixed(6)),
          longitude: sampledLon,
          rowIndex,
          colIndex
        }
      };
    }

    const cleanElev = Object.is(rawVal, -0) ? 0 : rawVal;
    const depth = Math.max(0, -cleanElev);

    return {
      elevation: cleanElev,
      depth,
      isLand: hasSigned ? cleanElev > 0 : false,
      sampledCoordinates: {
        latitude: Number(sampledLat.toFixed(6)),
        longitude: sampledLon,
        rowIndex,
        colIndex
      }
    };
  }

  /**
   * Fetches and decodes a binary Int16LE or regional JSON tile.
   */
  public async fetchTile(tileMeta: GebcoManifestTile, signal?: AbortSignal): Promise<DecodedGebcoTile> {
    const cached = this.tileCache.get(tileMeta.id);
    if (cached) return cached;

    const cleanRel = tileMeta.file.replace(/^\/+/, '');
    const url = `/data/bathymetry/${cleanRel}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch tile ${tileMeta.id} from ${url}: HTTP ${response.status}`);
    }

    const isJson = tileMeta.format === 'json' || tileMeta.file.endsWith('.json');
    let decoded: DecodedGebcoTile;

    if (isJson) {
      const raw = await response.json();
      const w = Number(raw.gridWidth || tileMeta.gridWidth);
      const h = Number(raw.gridHeight || tileMeta.gridHeight);
      const total = w * h;
      const rawElevations = new Float32Array(total);
      const depths = new Float32Array(total);
      const validSampleMask = new Uint8Array(total);

      const hasSignedElevations =
        typeof raw.hasSignedElevations === 'boolean'
          ? raw.hasSignedElevations
          : Array.isArray(raw.rawElevations) || Array.isArray(raw.grid?.elevationsMeters);

      const signedArr: Array<number | null> | undefined =
        raw.rawElevations ?? raw.grid?.elevationsMeters;
      const depthArr: Array<number | null> | undefined = raw.elevations;

      let minD = Infinity;
      let maxD = -Infinity;
      let minE = Infinity;
      let maxE = -Infinity;
      let missingCount = 0;

      for (let i = 0; i < total; i++) {
        let val: number | null = null;
        if (signedArr && i < signedArr.length) {
          const v = signedArr[i];
          if (v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) !== INT16_NODATA) {
            const nv = Number(v);
            val = Object.is(nv, -0) ? 0 : nv;
          }
        } else if (!signedArr && depthArr && i < depthArr.length) {
          const d = depthArr[i];
          if (d !== null && d !== undefined && Number.isFinite(Number(d)) && Number(d) !== INT16_NODATA) {
            const nd = Number(d);
            if (nd >= 0) {
              val = nd === 0 ? 0 : -Math.abs(nd);
            }
          }
        }

        if (val === null) {
          rawElevations[i] = NaN;
          depths[i] = NaN;
          validSampleMask[i] = 0;
          missingCount++;
          continue;
        }

        const dVal = Math.max(0, -val);
        rawElevations[i] = val;
        depths[i] = dVal;
        validSampleMask[i] = 1;
        if (dVal < minD) minD = dVal;
        if (dVal > maxD) maxD = dVal;
        if (val < minE) minE = val;
        if (val > maxE) maxE = val;
      }

      const bounds: GebcoTileBounds = raw.bounds || tileMeta.bounds || { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };
      const geom = this.resolveTileSampleGeometry({
        gridWidth: w,
        gridHeight: h,
        bounds,
        sampleBounds: raw.sampleBounds || tileMeta.sampleBounds,
        sampleSpacingLat: raw.sampleSpacingLat ?? tileMeta.sampleSpacingLat,
        sampleSpacingLon: raw.sampleSpacingLon ?? tileMeta.sampleSpacingLon,
        resolutionArcSec: raw.resolutionArcSec || tileMeta.resolutionArcSec || 60,
        stride: tileMeta.stride,
        format: 'json'
      });

      const baseSource =
        raw.source || 'GEBCO / NOAA NCEI 1-Arc-Minute Bathymetric Grid (ETOPO)';
      const sourceName = hasSignedElevations
        ? baseSource
        : baseSource.includes('Depth-Only')
          ? baseSource
          : `${baseSource} (Underwater Depth-Only Regional Extract)`;

      decoded = {
        manifestTile: {
          ...tileMeta,
          hasSignedElevations
        },
        gridWidth: w,
        gridHeight: h,
        rowOrder: raw.rowOrder || tileMeta.rowOrder || 'north-to-south',
        colOrder: raw.colOrder || tileMeta.colOrder || 'west-to-east',
        bounds,
        sampleBounds: geom.sampleBounds,
        sampleSpacingLat: geom.sampleSpacingLat,
        sampleSpacingLon: geom.sampleSpacingLon,
        rawElevations,
        depths,
        validSampleMask,
        minDepth: minD === Infinity ? 0 : minD,
        maxDepth: maxD === -Infinity ? 0 : maxD,
        minElevation: minE === Infinity ? 0 : minE,
        maxElevation: maxE === -Infinity ? 0 : maxE,
        missingSampleCount: missingCount,
        landmarks: raw.landmarks || tileMeta.landmarks || [],
        sourceName,
        resolutionArcSec: raw.resolutionArcSec || tileMeta.resolutionArcSec || 60,
        hasSignedElevations,
        provenance: tileMeta.provenance || 'preset_regional',
        sampleElevationAt: (lat: number, lon: number) => this.sampleTileElevation(decoded, lat, lon)
      };
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const w = tileMeta.gridWidth;
      const h = tileMeta.gridHeight;
      const expectedBytes = w * h * 2;
      if (arrayBuffer.byteLength !== expectedBytes) {
        throw new Error(
          `Binary tile ${tileMeta.id} byte length mismatch: expected ${expectedBytes}, got ${arrayBuffer.byteLength}`
        );
      }

      const view = new DataView(arrayBuffer);
      const total = w * h;
      const rawElevations = new Float32Array(total);
      const depths = new Float32Array(total);
      const validSampleMask = new Uint8Array(total);

      let minD = Infinity;
      let maxD = -Infinity;
      let minE = Infinity;
      let maxE = -Infinity;
      let missingCount = 0;

      for (let i = 0; i < total; i++) {
        const v = view.getInt16(i * 2, true);
        if (v === INT16_NODATA || v < -12000 || v > 9000) {
          rawElevations[i] = NaN;
          depths[i] = NaN;
          validSampleMask[i] = 0;
          missingCount++;
          continue;
        }
        const dVal = Math.max(0, -v);
        rawElevations[i] = v;
        depths[i] = dVal;
        validSampleMask[i] = 1;
        if (dVal < minD) minD = dVal;
        if (dVal > maxD) maxD = dVal;
        if (v < minE) minE = v;
        if (v > maxE) maxE = v;
      }

      const outerBounds: GebcoTileBounds = tileMeta.bounds || { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };
      const geom = this.resolveTileSampleGeometry({
        gridWidth: w,
        gridHeight: h,
        bounds: outerBounds,
        sampleBounds: tileMeta.sampleBounds,
        sampleSpacingLat: tileMeta.sampleSpacingLat,
        sampleSpacingLon: tileMeta.sampleSpacingLon,
        sampleOffsetRow: tileMeta.sampleOffsetRow,
        sampleOffsetCol: tileMeta.sampleOffsetCol,
        resolutionArcSec: tileMeta.resolutionArcSec,
        stride: tileMeta.stride,
        format: 'int16le'
      });

      decoded = {
        manifestTile: {
          ...tileMeta,
          bounds: outerBounds,
          hasSignedElevations: true
        },
        gridWidth: w,
        gridHeight: h,
        rowOrder: tileMeta.rowOrder || 'south-to-north',
        colOrder: tileMeta.colOrder || 'west-to-east',
        bounds: outerBounds,
        sampleBounds: geom.sampleBounds,
        sampleSpacingLat: geom.sampleSpacingLat,
        sampleSpacingLon: geom.sampleSpacingLon,
        rawElevations,
        depths,
        validSampleMask,
        minDepth: minD === Infinity ? 0 : minD,
        maxDepth: maxD === -Infinity ? 0 : maxD,
        minElevation: minE === Infinity ? 0 : minE,
        maxElevation: maxE === -Infinity ? 0 : maxE,
        missingSampleCount: missingCount,
        landmarks: tileMeta.landmarks || [],
        sourceName: 'GEBCO_2026 Sub-Ice Global Bathymetric Grid',
        resolutionArcSec: tileMeta.resolutionArcSec || (tileMeta.stride || 1) * 15,
        hasSignedElevations: true,
        provenance: tileMeta.provenance || 'authoritative_local',
        sampleElevationAt: (lat: number, lon: number) => this.sampleTileElevation(decoded, lat, lon)
      };
    }

    if (this.tileCache.size >= this.maxCachedTiles) {
      const oldest = this.tileCache.keys().next().value;
      if (oldest) this.tileCache.delete(oldest);
    }
    this.tileCache.set(tileMeta.id, decoded);
    return decoded;
  }

  public buildMeshDataset(
    tile: DecodedGebcoTile,
    maxMeshDimension = 128,
    customLandmarks?: BathymetricLandmark[],
    centerCoords?: { latitude: number; longitude: number; span?: number }
  ): BathymetryGridDataset {
    const srcW = tile.gridWidth;
    const srcH = tile.gridHeight;

    const meshW = Math.min(srcW, Math.max(2, maxMeshDimension));
    const meshH = Math.min(srcH, Math.max(2, maxMeshDimension));
    const totalVertices = meshW * meshH;

    const resolvedGeom = this.resolveTileSampleGeometry({
      gridWidth: srcW,
      gridHeight: srcH,
      bounds: tile.bounds,
      sampleBounds: tile.sampleBounds || tile.manifestTile?.sampleBounds,
      sampleSpacingLat: tile.sampleSpacingLat ?? tile.manifestTile?.sampleSpacingLat,
      sampleSpacingLon: tile.sampleSpacingLon ?? tile.manifestTile?.sampleSpacingLon,
      sampleOffsetRow: tile.manifestTile?.sampleOffsetRow,
      sampleOffsetCol: tile.manifestTile?.sampleOffsetCol,
      resolutionArcSec: tile.resolutionArcSec ?? tile.manifestTile?.resolutionArcSec,
      stride: tile.manifestTile?.stride,
      format: tile.manifestTile?.format
    });

    const elevations = new Float32Array(totalVertices);
    const rawElevations = new Float32Array(totalVertices);
    const validSampleMask = new Uint8Array(totalVertices);
    let minD = Infinity;
    let maxD = -Infinity;
    let minE = Infinity;
    let maxE = -Infinity;
    let missingCount = 0;

    const colOrder = tile.colOrder || tile.manifestTile?.colOrder || 'west-to-east';
    const hasSignedElevations =
      typeof tile.hasSignedElevations === 'boolean'
        ? tile.hasSignedElevations
        : typeof tile.manifestTile?.hasSignedElevations === 'boolean'
          ? tile.manifestTile.hasSignedElevations
          : tile.manifestTile?.format !== 'json';

    // Output row iy = 0 is North (snRow = srcH - 1), iy = meshH - 1 is South (snRow = 0)
    // Output col ix = 0 is West (weCol = 0), ix = meshW - 1 is East (weCol = srcW - 1)
    let firstSnRow = 0;
    let lastSnRow = srcH - 1;
    let firstWeCol = 0;
    let lastWeCol = srcW - 1;

    for (let iy = 0; iy < meshH; iy++) {
      const v = meshH > 1 ? iy / (meshH - 1) : 0;
      const snRow = Math.min(srcH - 1, Math.max(0, Math.round((1 - v) * (srcH - 1))));
      const srcRow = tile.rowOrder === 'south-to-north' ? snRow : srcH - 1 - snRow;
      if (iy === 0) lastSnRow = snRow;
      if (iy === meshH - 1) firstSnRow = snRow;

      for (let ix = 0; ix < meshW; ix++) {
        const u = meshW > 1 ? ix / (meshW - 1) : 0;
        const weCol = Math.min(srcW - 1, Math.max(0, Math.round(u * (srcW - 1))));
        const srcCol = colOrder === 'east-to-west' ? srcW - 1 - weCol : weCol;
        if (iy === 0 && ix === 0) firstWeCol = weCol;
        if (iy === 0 && ix === meshW - 1) lastWeCol = weCol;

        const srcIdx = srcRow * srcW + srcCol;
        const rawElev = tile.rawElevations[srcIdx];
        const outIdx = iy * meshW + ix;

        if (!Number.isFinite(rawElev)) {
          rawElevations[outIdx] = NaN;
          elevations[outIdx] = NaN;
          validSampleMask[outIdx] = 0;
          missingCount++;
          continue;
        }

        const cleanElev = Object.is(rawElev, -0) ? 0 : rawElev;
        const depth = Math.max(0, -cleanElev);
        rawElevations[outIdx] = cleanElev;
        elevations[outIdx] = depth;
        validSampleMask[outIdx] = 1;

        if (depth < minD) minD = depth;
        if (depth > maxD) maxD = depth;
        if (cleanElev < minE) minE = cleanElev;
        if (cleanElev > maxE) maxE = cleanElev;
      }
    }

    const sb = resolvedGeom.sampleBounds;
    const meshSampleBounds = {
      minLat: Number((sb.minLat + firstSnRow * resolvedGeom.sampleSpacingLat).toFixed(6)),
      maxLat: Number((sb.minLat + lastSnRow * resolvedGeom.sampleSpacingLat).toFixed(6)),
      minLon: this.normalizeLongitude(sb.minLon + firstWeCol * resolvedGeom.sampleSpacingLon),
      maxLon: this.normalizeLongitude(sb.minLon + lastWeCol * resolvedGeom.sampleSpacingLon)
    };
    const crossesAntimeridian = meshSampleBounds.minLon > meshSampleBounds.maxLon;
    const meshLonSpan = crossesAntimeridian
      ? 180 - meshSampleBounds.minLon + (meshSampleBounds.maxLon + 180)
      : Math.max(0, meshSampleBounds.maxLon - meshSampleBounds.minLon);
    const meshSpacingLat =
      meshH > 1
        ? Number(((meshSampleBounds.maxLat - meshSampleBounds.minLat) / (meshH - 1)).toFixed(6))
        : resolvedGeom.sampleSpacingLat;
    const meshSpacingLon =
      meshW > 1
        ? Number((meshLonSpan / (meshW - 1)).toFixed(6))
        : resolvedGeom.sampleSpacingLon;

    const effectiveResArcSec =
      meshW === srcW && meshH === srcH
        ? tile.resolutionArcSec
        : Math.round(Math.max(meshSpacingLat, meshSpacingLon) * 3600);

    const centerLat = centerCoords?.latitude ?? (tile.bounds.minLat + tile.bounds.maxLat) / 2;
    const centerLon = centerCoords?.longitude ?? (tile.bounds.minLon + tile.bounds.maxLon) / 2;
    const centerSample = this.sampleTileElevation(tile, centerLat, centerLon);

    return {
      id: tile.manifestTile.id,
      name:
        tile.manifestTile.name ||
        `${tile.manifestTile.id} (GEBCO 2026 L${tile.manifestTile.level})`,
      source: tile.sourceName,
      resolutionArcSec: effectiveResArcSec,
      bounds: tile.bounds,
      sampleBounds: meshSampleBounds,
      sampleSpacingLat: meshSpacingLat,
      sampleSpacingLon: meshSpacingLon,
      gridWidth: meshW,
      gridHeight: meshH,
      elevations,
      rawElevations,
      validSampleMask,
      minDepth: minD === Infinity ? 0 : minD,
      maxDepth: maxD === -Infinity ? 0 : maxD,
      minElevation: minE === Infinity ? 0 : minE,
      maxElevation: maxE === -Infinity ? 0 : maxE,
      centerElevation: centerSample.elevation ?? undefined,
      centerDepth: centerSample.depth ?? undefined,
      requestedCoordinates: centerCoords
        ? {
            latitude: centerCoords.latitude,
            longitude: centerCoords.longitude,
            spanDegrees: centerCoords.span ?? 1.2
          }
        : undefined,
      sampledCoordinates: centerSample.sampledCoordinates,
      isLand: hasSignedElevations ? centerSample.isLand : false,
      hasSignedElevations,
      elevationDataKind: hasSignedElevations ? 'signed_land_and_ocean' : 'underwater_depth_only',
      isAuthoritative: true,
      isModeledFallback: false,
      provenance: tile.provenance,
      missingSampleCount: missingCount,
      landmarks: customLandmarks ?? tile.landmarks
    };
  }
}

export const gebcoGlobalTileLoader = new GebcoGlobalTileLoader();