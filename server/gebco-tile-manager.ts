import fs from 'fs';
import path from 'path';

export type DataProvenance =
  | 'authoritative_local'
  | 'authoritative_online'
  | 'preset_regional'
  | 'modelled'
  | 'unavailable';

export type ElevationValueType =
  | 'original'
  | 'resampled'
  | 'interpolated'
  | 'modelled'
  | 'unknown';

export const INT16_NODATA = -32768;

export interface GebcoTileBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  crossesAntimeridian?: boolean;
}

export interface GebcoTileEntry {
  id: string;
  name?: string;
  file: string;
  level?: number;
  tileRow?: number;
  tileCol?: number;
  row?: number;
  col?: number;
  stride?: number;
  sampleOffsetRow?: number;
  sampleOffsetCol?: number;
  gridWidth: number;
  gridHeight: number;
  sourceLatStart?: number;
  sourceLatEndExclusive?: number;
  sourceLonStart?: number;
  sourceLonEndExclusive?: number;
  bounds?: GebcoTileBounds;
  sampleBounds?: GebcoTileBounds;
  sampleSpacingLat?: number;
  sampleSpacingLon?: number;
  rowOrder?: 'south-to-north' | 'north-to-south';
  colOrder?: 'west-to-east' | 'east-to-west';
  minDepth?: number;
  maxDepth?: number;
  minElevation?: number;
  maxElevation?: number;
  missingSampleCount?: number;
  resolutionArcSec?: number;
  nativeResolutionArcSec?: number;
  source?: string;
  sourceVersion?: string;
  organization?: string;
  sourceUrl?: string;
  units?: 'meters';
  verticalDatum?: string;
  format?: 'int16le' | 'int16' | 'json';
  hasSignedElevations?: boolean;
  provenance?: DataProvenance;
  valueType?: ElevationValueType;
  noDataValue?: number | null;
  landmarksCount?: number;
  landmarks?: any[];
}

export interface GebcoManifest {
  dataset: string;
  organization?: string;
  version: string;
  sourceUrl?: string;
  license?: string;
  verticalDatum?: string;
  units?: 'meters';
  gridIntervalArcSec?: number;
  nativeResolutionArcSec?: number;
  coverage?: 'global' | 'regional_presets' | 'partial' | 'unknown';
  processedAt?: string;
  totalTiles?: number;
  availableLevels?: number[];
  tiles: GebcoTileEntry[];
}

export type BathymetryRetrievalMode = 'auto' | 'real' | 'modelled' | 'fallback';

export interface BathymetryDatasetMetadata {
  id?: string;
  name: string;
  source?: string;
  organization: string;
  version: string;
  sourceUrl?: string;
  nativeResolutionArcSec: number | null;
  resolutionArcSec: number;
  units: 'meters';
  verticalDatum: string;
  processedAt?: string;
  coverage: 'global' | 'regional' | 'sector';
  provenance: DataProvenance;
  hasSignedElevations?: boolean;
  elevationDataKind?: 'signed_land_and_ocean' | 'underwater_depth_only' | 'modelled';
  isAuthoritative?: boolean;
  isModeledFallback?: boolean;
  valueType: ElevationValueType;
  tileId?: string | null;
  level?: number | null;
}

export interface BathymetryGridPayload {
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  width: number;
  height: number;
  rowOrder?: 'north-to-south' | 'south-to-north';
  colOrder?: 'west-to-east' | 'east-to-west';
  sampleBounds?: GebcoTileBounds;
  sampleSpacingLat?: number;
  sampleSpacingLon?: number;
  hasSignedElevations?: boolean;
  /** Canonical signed elevation in meters (negative = below sea level, positive = land, 0 = sea level, null = missing/no-data) */
  elevationsMeters: (number | null)[];
  noDataValue: null;
  validSampleCount: number;
  missingSampleCount: number;
  minElevationMeters: number | null;
  maxElevationMeters: number | null;
  centerElevationMeters: number | null;
  minDepthMeters?: number;
  maxDepthMeters?: number;
  centerDepthMeters: number | null;
  isLand: boolean;
  sampledCoordinates?: {
    latitude: number;
    longitude: number;
    rowIndex?: number;
    colIndex?: number;
  };
}

export interface BathymetryResult {
  status: 'ok' | 'unavailable' | 'error';
  requestedCoordinates?: {
    latitude: number;
    longitude: number;
    spanDegrees?: number;
  };
  sampledCoordinates?: {
    latitude: number;
    longitude: number;
    rowIndex?: number;
    colIndex?: number;
  };
  dataset: BathymetryDatasetMetadata;
  grid: BathymetryGridPayload;
  warning?: string;

  // Backward-compatible fields for existing components
  id: string;
  name: string;
  source: string;
  resolutionArcSec: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  gridWidth: number;
  gridHeight: number;
  minDepth: number;
  maxDepth: number;
  minElevation: number;
  maxElevation: number;
  centerElevation: number | null;
  centerDepth: number | null;
  isLand: boolean;
  hasSignedElevations?: boolean;
  elevationDataKind?: 'signed_land_and_ocean' | 'underwater_depth_only' | 'modelled';
  isAuthoritative: boolean;
  isModeledFallback: boolean;
  provenance: DataProvenance;
  landmarks: any[];
  /** Positive underwater depths in meters (0 for land, NaN/null replaced by 0 only in legacy array; use grid.elevationsMeters for canonical signed values) */
  elevations: number[];
  /** Signed elevations in meters (null represented as NaN when converted to Float32Array on client) */
  rawElevations: (number | null)[];
}

export interface BathymetryQueryOptions {
  regionId?: string;
  tileId?: string;
  lat?: number;
  lon?: number;
  span?: number;
  preferredLevel?: number;
  maxDimension?: number;
  mode?: BathymetryRetrievalMode;
}

const TOTAL_SOURCE_ROWS = 43200;
const TOTAL_SOURCE_COLS = 86400;
const MAX_CACHE_ENTRIES = 64;

export const PYRAMID_LEVEL_SPECS: Record<number, { rows: number; cols: number; stride: number }> = {
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
  let n = ((lon + 180) % 360 + 360) % 360 - 180;
  if (n === -180 && lon > 0) n = 180;
  if (Object.is(n, -0)) n = 0;
  return Number(n.toFixed(6));
}

/**
 * Validates raw geographic coordinates.
 * Latitude must be within [-90, 90].
 * Longitude must be finite (and if strictLon is true, within [-180, 180]).
 */
export function validateCoordinates(
  lat: unknown,
  lon: unknown,
  strictLon: boolean = true
): { valid: boolean; error?: string; latitude: number; longitude: number } {
  const numLat =
    typeof lat === 'number' ? lat : typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : NaN;
  const numLon =
    typeof lon === 'number' ? lon : typeof lon === 'string' && lon.trim() !== '' ? Number(lon) : NaN;

  if (!Number.isFinite(numLat)) {
    return { valid: false, error: 'Latitude must be a finite number between -90 and +90.', latitude: NaN, longitude: NaN };
  }
  if (!Number.isFinite(numLon)) {
    return { valid: false, error: 'Longitude must be a finite number between -180 and +180.', latitude: NaN, longitude: NaN };
  }
  if (numLat < -90 || numLat > 90) {
    return {
      valid: false,
      error: `Latitude ${numLat}° is out of valid range [-90°, +90°].`,
      latitude: numLat,
      longitude: numLon
    };
  }
  if (strictLon && (numLon < -180 || numLon > 180)) {
    return {
      valid: false,
      error: `Longitude ${numLon}° is out of valid range [-180°, +180°].`,
      latitude: numLat,
      longitude: numLon
    };
  }

  return {
    valid: true,
    latitude: Number(numLat.toFixed(6)),
    longitude: normalizeLongitude(numLon)
  };
}

/**
 * Formats latitude and longitude with accurate N/S and E/W hemisphere designators.
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
 * Supports tiles crossing the 180°/-180° antimeridian (where minLon > maxLon or crossesAntimeridian is true).
 */
export function doesTileCoverCoordinate(
  bounds: GebcoTileBounds,
  lat: number,
  lon: number,
  eps: number = 1e-6
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < bounds.minLat - eps || lat > bounds.maxLat + eps) return false;

  const normLon = normalizeLongitude(lon);
  const crossesAntimeridian = bounds.crossesAntimeridian || bounds.minLon > bounds.maxLon;

  if (crossesAntimeridian) {
    return normLon >= bounds.minLon - eps || normLon <= bounds.maxLon + eps;
  }

  // Handle +180 / -180 seam equivalence if tile touches +/-180
  if (Math.abs(normLon - 180) <= eps && Math.abs(bounds.minLon - (-180)) <= eps) {
    return true;
  }
  if (Math.abs(normLon - (-180)) <= eps && Math.abs(bounds.maxLon - 180) <= eps) {
    return true;
  }

  return normLon >= bounds.minLon - eps && normLon <= bounds.maxLon + eps;
}

/**
 * Computes canonical underwater depth from signed elevation in meters.
 * Negative elevation = underwater (depth > 0).
 * Positive elevation = land above sea level (depth = 0).
 * Zero elevation = sea level (depth = 0).
 * Null/NaN = missing measurement (returns null).
 */
export function elevationToDepthMeters(elevationMeters: number | null | undefined): number | null {
  if (elevationMeters === null || elevationMeters === undefined || !Number.isFinite(elevationMeters)) {
    return null;
  }
  return Math.max(0, -elevationMeters);
}

export class GebcoTileManager {
  private baseDir: string | null = null;
  private manifest: GebcoManifest | null = null;
  private tileCache = new Map<string, BathymetryResult>();
  private inFlightRequests = new Map<string, Promise<BathymetryResult | null>>();
  private preloadedPresets: Record<string, any> = {};

  constructor(rootDir: string, customTilesDir?: string) {
    this.init(rootDir, customTilesDir);
  }

  private init(rootDir: string, customTilesDir?: string) {
    // 1. Load embedded regional presets from realBathymetryPresets.json
    try {
      const presetsPath = path.resolve(rootDir, 'src/data/realBathymetryPresets.json');
      if (fs.existsSync(presetsPath)) {
        this.preloadedPresets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
      }
    } catch (e) {
      console.warn('[GEBCO] Could not load embedded regional presets:', e);
    }

    // 2. Discover tile directories in candidate locations
    const candidates = [
      customTilesDir,
      customTilesDir ? path.join(customTilesDir, 'public/data/bathymetry') : undefined,
      process.env.GEBCO_TILES_DIR,
      path.resolve(rootDir, 'data/MARIVEX_GEBCO_TILES'),
      path.resolve(rootDir, 'data/tiles'),
      path.resolve(rootDir, 'public/data/bathymetry'),
      'C:\\Users\\HP\\Downloads\\MARIVEX_GEBCO_TILES'
    ].filter(Boolean) as string[];

    for (const dir of candidates) {
      const manifestFile = path.join(dir, 'manifest.json');
      if (fs.existsSync(manifestFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
          if (parsed && Array.isArray(parsed.tiles)) {
            // Validate tiles and keep only entries whose files exist on disk
            const validTiles: GebcoTileEntry[] = [];
            for (const rawTile of parsed.tiles) {
              if (!rawTile || typeof rawTile.file !== 'string' || !rawTile.id) continue;
              const tilePath = path.join(dir, rawTile.file);
              if (!fs.existsSync(tilePath)) continue;

              const bounds = this.normalizeTileBounds(rawTile);
              if (!bounds) continue;

              const isJson = rawTile.file.endsWith('.json') || rawTile.format === 'json';
              const stride = rawTile.stride || (isJson ? 4 : 1);
              const level = typeof rawTile.level === 'number'
                ? rawTile.level
                : (stride >= 240 ? 0 : stride >= 60 ? 1 : stride >= 16 ? 2 : stride >= 4 ? 3 : 4);

              validTiles.push({
                ...rawTile,
                bounds,
                stride,
                level,
                format: isJson ? 'json' : 'int16le'
              });
            }

            if (validTiles.length > 0) {
              this.baseDir = dir;
              const hasGlobalL0 = validTiles.some(
                t => (t.bounds?.minLat ?? 0) <= -85 && (t.bounds?.maxLat ?? 0) >= 85 &&
                     (t.bounds?.minLon ?? 0) <= -175 && (t.bounds?.maxLon ?? 0) >= 175
              );
              const allJsonPresets = validTiles.every(t => t.format === 'json');

              const binaryTiles = validTiles.filter(t => t.format !== 'json');
              const finestBinaryResArcSec =
                binaryTiles.length > 0
                  ? Math.min(
                      ...binaryTiles.map(
                        t => t.resolutionArcSec || (t.stride ? t.stride * 15 : 15)
                      )
                    )
                  : 60;

              this.manifest = {
                dataset: allJsonPresets
                  ? 'GEBCO / NOAA NCEI Regional Bathymetric Extracts (ETOPO 1-Arc-Minute)'
                  : (parsed.dataset || 'GEBCO_2026 Sub-Ice Global Bathymetric Grid'),
                organization: parsed.organization || 'GEBCO Compilation Group (IHO / IOC) & NOAA NCEI',
                version: allJsonPresets ? (parsed.version || '2024/ETOPO1') : (parsed.version || '2026'),
                sourceUrl: parsed.sourceUrl || 'https://www.gebco.net/data_and_products/gridded_bathymetry_data/',
                license: parsed.license || 'GEBCO IHO/IOC Open Data License',
                verticalDatum: parsed.verticalDatum || 'Mean Sea Level',
                units: 'meters',
                gridIntervalArcSec: allJsonPresets ? 60 : (parsed.finestResolutionArcSec || finestBinaryResArcSec || parsed.gridIntervalArcSec || 15),
                nativeResolutionArcSec: allJsonPresets ? 60 : (parsed.nativeResolutionArcSec || parsed.gridIntervalArcSec || 15),
                coverage: hasGlobalL0 ? 'global' : (parsed.coverage || 'regional_presets'),
                processedAt: parsed.processedAt,
                totalTiles: validTiles.length,
                availableLevels: [...new Set(validTiles.map(t => t.level ?? 0))].sort((a, b) => a - b),
                tiles: validTiles
              };

              // Synchronize preloadedPresets with any on-disk regional JSON tiles in this.baseDir/tiles/
              const tilesSubDir = path.join(dir, 'tiles');
              if (fs.existsSync(tilesSubDir)) {
                try {
                  for (const fname of fs.readdirSync(tilesSubDir)) {
                    if (!fname.endsWith('.json')) continue;
                    const fpath = path.join(tilesSubDir, fname);
                    const diskPreset = JSON.parse(fs.readFileSync(fpath, 'utf8'));
                    const presetId = diskPreset?.id || fname.replace(/\.json$/, '');
                    if (presetId && diskPreset && typeof diskPreset === 'object') {
                      this.preloadedPresets[presetId] = diskPreset;
                    }
                  }
                } catch {
                  // Ignore non-fatal preset sync error during init
                }
              }

              console.log(
                `[GEBCO] Validated manifest with ${validTiles.length} existing tiles in: ${dir} (coverage: ${this.manifest.coverage})`
              );
              if (hasGlobalL0 || (customTilesDir && dir.startsWith(customTilesDir))) break;
            }
          }
        } catch (e) {
          console.warn(`[GEBCO] Failed parsing manifest in ${dir}:`, e);
        }
      }
    }
  }

  public normalizeTileBounds(tile: Partial<GebcoTileEntry>): GebcoTileBounds | null {
    if (tile.bounds &&
        Number.isFinite(tile.bounds.minLat) &&
        Number.isFinite(tile.bounds.maxLat) &&
        Number.isFinite(tile.bounds.minLon) &&
        Number.isFinite(tile.bounds.maxLon)) {
      return {
        minLat: Number(tile.bounds.minLat.toFixed(6)),
        maxLat: Number(tile.bounds.maxLat.toFixed(6)),
        minLon: Number(tile.bounds.minLon.toFixed(6)),
        maxLon: Number(tile.bounds.maxLon.toFixed(6)),
        crossesAntimeridian: tile.bounds.crossesAntimeridian || tile.bounds.minLon > tile.bounds.maxLon
      };
    }

    if (tile.sourceLatStart !== undefined &&
        tile.sourceLatEndExclusive !== undefined &&
        tile.sourceLonStart !== undefined &&
        tile.sourceLonEndExclusive !== undefined) {
      const latStart = tile.sourceLatStart;
      const latEnd = tile.sourceLatEndExclusive;
      const lonStart = tile.sourceLonStart;
      const lonEnd = tile.sourceLonEndExclusive;

      let minLat: number, maxLat: number, minLon: number, maxLon: number;
      if (Math.abs(latStart) > 90 || Math.abs(latEnd) > 90) {
        minLat = -90 + (latStart / TOTAL_SOURCE_ROWS) * 180;
        maxLat = -90 + (latEnd / TOTAL_SOURCE_ROWS) * 180;
      } else {
        minLat = Math.min(latStart, latEnd);
        maxLat = Math.max(latStart, latEnd);
      }

      if (Math.abs(lonStart) > 180 || Math.abs(lonEnd) > 180) {
        minLon = -180 + (lonStart / TOTAL_SOURCE_COLS) * 360;
        maxLon = -180 + (lonEnd / TOTAL_SOURCE_COLS) * 360;
      } else {
        minLon = lonStart;
        maxLon = lonEnd;
      }

      return {
        minLat: Number(minLat.toFixed(6)),
        maxLat: Number(maxLat.toFixed(6)),
        minLon: Number(minLon.toFixed(6)),
        maxLon: Number(maxLon.toFixed(6)),
        crossesAntimeridian: minLon > maxLon
      };
    }

    return null;
  }

  public getManifest(): GebcoManifest | null {
    return this.manifest;
  }

  /**
   * Dynamically inspects the manifest and tile files on disk to report live status.
   */
  public getStatus() {
    const manifestPath = this.baseDir ? path.join(this.baseDir, 'manifest.json') : null;
    const manifestPresent = Boolean(manifestPath && fs.existsSync(manifestPath));
    let totalManifestTiles = 0;
    let verifiedTilesOnDisk = 0;
    let missingTilesCount = 0;
    let invalidSizeTilesCount = 0;
    let binaryPyramidTilesOnDisk = 0;
    let regionalJsonTilesOnDisk = 0;
    let signedRegionalJsonTilesOnDisk = 0;
    let depthOnlyRegionalJsonTilesOnDisk = 0;
    const missingTileFiles: string[] = [];
    const invalidTileFiles: string[] = [];
    const duplicateTileIds: string[] = [];
    const seenTileIds = new Set<string>();
    const levelSet = new Set<number>();
    const verifiedBinaryTiles: GebcoTileEntry[] = [];
    const manifestBinaryLevels = new Set<number>();

    if (manifestPresent && manifestPath && this.baseDir) {
      try {
        const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const tiles: GebcoTileEntry[] = Array.isArray(rawManifest.tiles) ? rawManifest.tiles : [];
        totalManifestTiles = tiles.length;

        for (const t of tiles) {
          if (!t || typeof t.file !== 'string' || !t.id) {
            invalidSizeTilesCount++;
            continue;
          }
          if (seenTileIds.has(t.id)) {
            duplicateTileIds.push(t.id);
            invalidSizeTilesCount++;
            invalidTileFiles.push(t.file);
            continue;
          }
          seenTileIds.add(t.id);

          const isJson = t.file.endsWith('.json') || t.format === 'json';
          const stride = t.stride || (isJson ? 4 : 1);
          const inferredLevel =
            typeof t.level === 'number'
              ? t.level
              : stride >= 240
                ? 0
                : stride >= 60
                  ? 1
                  : stride >= 16
                    ? 2
                    : stride >= 4
                      ? 3
                      : 4;
          if (!isJson) {
            manifestBinaryLevels.add(inferredLevel);
          }

          const fullPath = path.join(this.baseDir, t.file);
          if (!fs.existsSync(fullPath)) {
            missingTilesCount++;
            missingTileFiles.push(t.file);
            continue;
          }
          const stat = fs.statSync(fullPath);
          if (!isJson) {
            const gw = Number(t.gridWidth) || 0;
            const gh = Number(t.gridHeight) || 0;
            const expectedBytes = gw * gh * 2;
            if (gw < 2 || gh < 2 || expectedBytes <= 0 || stat.size !== expectedBytes) {
              invalidSizeTilesCount++;
              invalidTileFiles.push(t.file);
              continue;
            }
            binaryPyramidTilesOnDisk++;
            const normB = this.normalizeTileBounds(t);
            if (normB) verifiedBinaryTiles.push({ ...t, level: inferredLevel, bounds: normB });
          } else {
            if (stat.size <= 2) {
              invalidSizeTilesCount++;
              invalidTileFiles.push(t.file);
              continue;
            }
            regionalJsonTilesOnDisk++;
            try {
              const jsonContent = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              if (Array.isArray(jsonContent.rawElevations) || Array.isArray(jsonContent.grid?.elevationsMeters)) {
                signedRegionalJsonTilesOnDisk++;
              } else {
                depthOnlyRegionalJsonTilesOnDisk++;
              }
            } catch {
              depthOnlyRegionalJsonTilesOnDisk++;
            }
          }
          verifiedTilesOnDisk++;
          levelSet.add(inferredLevel);
        }

        // Also check if tiles/ directory has regional JSON files when manifest only lists binary pyramid tiles
        const tilesDir = path.join(this.baseDir, 'tiles');
        if (regionalJsonTilesOnDisk === 0 && fs.existsSync(tilesDir)) {
          for (const fname of fs.readdirSync(tilesDir)) {
            if (!fname.endsWith('.json')) continue;
            const fullPath = path.join(tilesDir, fname);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size <= 2) continue;
              const jsonContent = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              regionalJsonTilesOnDisk++;
              if (Array.isArray(jsonContent.rawElevations) || Array.isArray(jsonContent.grid?.elevationsMeters)) {
                signedRegionalJsonTilesOnDisk++;
              } else {
                depthOnlyRegionalJsonTilesOnDisk++;
              }
            } catch {
              // Ignore malformed unreferenced JSON
            }
          }
        }
      } catch {
        // Ignore parse error and report 0 verified tiles
      }
    }

    // Verify per-level sector completeness for binary pyramid levels
    const completeLevels: number[] = [];
    const incompleteLevels: Array<{
      level: number;
      expectedTiles: number;
      verifiedTiles: number;
      missingSectorsCount: number;
      sampleMissingSectors: string[];
    }> = [];

    for (const lvl of [...manifestBinaryLevels].sort((a, b) => a - b)) {
      const spec = PYRAMID_LEVEL_SPECS[lvl];
      const tilesAtLevel = verifiedBinaryTiles.filter(t => (t.level ?? 0) === lvl);
      if (!spec) continue;

      const expectedCount = spec.rows * spec.cols;
      const presentSectorKeys = new Set<string>();
      for (const t of tilesAtLevel) {
        const match = /^L(\d+)_r(\d+)_c(\d+)$/i.exec(t.id);
        if (match && Number(match[1]) === lvl) {
          const r = Number(match[2]);
          const c = Number(match[3]);
          if (r >= 0 && r < spec.rows && c >= 0 && c < spec.cols) {
            presentSectorKeys.add(`${r}:${c}`);
          }
        }
      }

      const missingSectors: string[] = [];
      for (let r = 0; r < spec.rows; r++) {
        for (let c = 0; c < spec.cols; c++) {
          if (!presentSectorKeys.has(`${r}:${c}`)) {
            missingSectors.push(`L${lvl}_r${r}_c${c}`);
          }
        }
      }

      // Check uniform dimensions within the level
      const firstTile = tilesAtLevel[0];
      const uniformDims = firstTile
        ? tilesAtLevel.every(
            t => t.gridWidth === firstTile.gridWidth && t.gridHeight === firstTile.gridHeight
          )
        : false;

      if (tilesAtLevel.length === expectedCount && missingSectors.length === 0 && uniformDims) {
        completeLevels.push(lvl);
      } else {
        incompleteLevels.push({
          level: lvl,
          expectedTiles: expectedCount,
          verifiedTiles: tilesAtLevel.length,
          missingSectorsCount: missingSectors.length,
          sampleMissingSectors: missingSectors.slice(0, 5)
        });
      }
    }

    const minLatBin = verifiedBinaryTiles.length > 0 ? Math.min(...verifiedBinaryTiles.map(t => t.bounds!.minLat)) : 0;
    const maxLatBin = verifiedBinaryTiles.length > 0 ? Math.max(...verifiedBinaryTiles.map(t => t.bounds!.maxLat)) : 0;
    const minLonBin = verifiedBinaryTiles.length > 0 ? Math.min(...verifiedBinaryTiles.map(t => t.bounds!.minLon)) : 0;
    const maxLonBin = verifiedBinaryTiles.length > 0 ? Math.max(...verifiedBinaryTiles.map(t => t.bounds!.maxLon)) : 0;

    const hasGlobalBinaryPyramid =
      binaryPyramidTilesOnDisk > 0 &&
      missingTilesCount === 0 &&
      invalidSizeTilesCount === 0 &&
      duplicateTileIds.length === 0 &&
      completeLevels.length > 0 &&
      incompleteLevels.length === 0 &&
      minLatBin <= -85 &&
      maxLatBin >= 85 &&
      minLonBin <= -175 &&
      maxLonBin >= 175;

    const hasCompleteL4Grid = completeLevels.includes(4);
    const finestResolutionArcSec =
      verifiedBinaryTiles.length > 0
        ? Math.min(
            ...verifiedBinaryTiles.map(
              t => t.resolutionArcSec || (t.stride ? t.stride * 15 : 15)
            )
          )
        : 60;

    const coverage = hasGlobalBinaryPyramid
      ? 'global'
      : verifiedTilesOnDisk > 0
        ? 'regional_presets'
        : 'none';

    const coverageTier = hasGlobalBinaryPyramid
      ? hasCompleteL4Grid
        ? 'global_l4_15arcsec_complete'
        : 'global_coarse_pyramid'
      : verifiedTilesOnDisk > 0
        ? 'regional_presets_only'
        : 'none';

    const candidateNcPaths = [
      process.env.GEBCO_INPUT_NC,
      this.baseDir ? path.resolve(this.baseDir, '../../../data/GEBCO_2026_sub_ice.nc') : '',
      this.baseDir ? path.resolve(this.baseDir, 'GEBCO_2026_sub_ice.nc') : ''
    ].filter(Boolean) as string[];
    const gebco2026SourceNetcdfPresent = candidateNcPaths.some(p => fs.existsSync(p));

    return {
      status: 'ok',
      baseDir: this.baseDir,
      manifestPresent,
      dataset: this.manifest?.dataset || 'Unavailable',
      version: this.manifest?.version || 'unknown',
      coverage,
      coverageTier,
      gridIntervalArcSec: hasGlobalBinaryPyramid ? finestResolutionArcSec : 60,
      finestResolutionArcSec: hasGlobalBinaryPyramid ? finestResolutionArcSec : 60,
      totalManifestTiles,
      verifiedTilesOnDisk,
      missingTilesCount,
      invalidSizeTilesCount,
      duplicateTileIds,
      binaryPyramidTilesOnDisk,
      regionalJsonTilesOnDisk,
      signedRegionalJsonTilesOnDisk,
      depthOnlyRegionalJsonTilesOnDisk,
      gebco2026SourceNetcdfPresent,
      availableLevels: [...levelSet].sort((a, b) => a - b),
      completeLevels,
      incompleteLevels,
      hasGlobalBinaryPyramid,
      hasCompleteL4Grid,
      onlineFallbackProviders: ['NOAA ERDDAP (etopo180)', 'GMRT GridServer'],
      missingTileFiles,
      invalidTileFiles
    };
  }

  /**
   * Resolves exact sample-center geometry for a tile or grid, respecting `sampleBounds`,
   * `sampleSpacingLat`, `sampleSpacingLon`, `rowOrder`, and `colOrder` without assuming
   * outer cell boundaries equal sample centers.
   */
  public resolveTileSampleGeometry(tile: {
    gridWidth: number;
    gridHeight: number;
    bounds?: GebcoTileBounds;
    sampleBounds?: GebcoTileBounds;
    sampleSpacingLat?: number;
    sampleSpacingLon?: number;
    sampleOffsetRow?: number;
    sampleOffsetCol?: number;
    resolutionArcSec?: number;
    stride?: number;
    rowOrder?: 'south-to-north' | 'north-to-south';
    colOrder?: 'west-to-east' | 'east-to-west';
    format?: string;
  }) {
    const w = Math.max(1, tile.gridWidth);
    const h = Math.max(1, tile.gridHeight);
    const outerBounds = tile.bounds || { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };

    const outerCrosses = Boolean(outerBounds.crossesAntimeridian || outerBounds.minLon > outerBounds.maxLon);
    const outerLonSpan = outerCrosses
      ? (180 - outerBounds.minLon) + (outerBounds.maxLon + 180)
      : Math.max(0, outerBounds.maxLon - outerBounds.minLon);
    const outerLatSpan = Math.max(0, outerBounds.maxLat - outerBounds.minLat);

    let sBounds: GebcoTileBounds;
    if (tile.sampleBounds) {
      sBounds = tile.sampleBounds;
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
        sBounds = {
          minLat: Number((outerBounds.minLat + (rowOffset + 0.5) * nativeDLat).toFixed(6)),
          maxLat: Number((outerBounds.minLat + ((h - 1) * stride + rowOffset + 0.5) * nativeDLat).toFixed(6)),
          minLon: normalizeLongitude(outerBounds.minLon + (colOffset + 0.5) * nativeDLon),
          maxLon: normalizeLongitude(outerBounds.minLon + ((w - 1) * stride + colOffset + 0.5) * nativeDLon),
          crossesAntimeridian: outerCrosses
        };
      } else {
        sBounds = outerBounds;
      }
    }

    const sMinLat = sBounds.minLat;
    const sMaxLat = sBounds.maxLat;
    const sMinLon = sBounds.minLon;
    const sMaxLon = sBounds.maxLon;
    const crossesAntimeridian = Boolean(
      sBounds.crossesAntimeridian || outerBounds.crossesAntimeridian || sMinLon > sMaxLon
    );

    const totalLonSpan = crossesAntimeridian
      ? (180 - sMinLon) + (sMaxLon + 180)
      : Math.max(0, sMaxLon - sMinLon);

    const dLat =
      tile.sampleSpacingLat && tile.sampleSpacingLat > 0
        ? tile.sampleSpacingLat
        : h > 1
          ? (sMaxLat - sMinLat) / (h - 1)
          : Math.max(1e-6, outerBounds.maxLat - outerBounds.minLat);

    const dLon =
      tile.sampleSpacingLon && tile.sampleSpacingLon > 0
        ? tile.sampleSpacingLon
        : w > 1
          ? totalLonSpan / (w - 1)
          : Math.max(1e-6, outerBounds.maxLon - outerBounds.minLon);

    const rowOrder: 'south-to-north' | 'north-to-south' =
      tile.rowOrder || (tile.format === 'json' ? 'north-to-south' : 'south-to-north');
    const colOrder: 'west-to-east' | 'east-to-west' = tile.colOrder || 'west-to-east';

    const mapCoordinateToIndex = (targetLat: number, targetLon: number) => {
      let rowIndex = 0;
      let sampledLat = (sMinLat + sMaxLat) / 2;
      if (h > 1) {
        if (rowOrder === 'south-to-north') {
          rowIndex = Math.min(h - 1, Math.max(0, Math.round((targetLat - sMinLat) / Math.max(1e-9, dLat))));
          sampledLat = sMinLat + rowIndex * dLat;
        } else {
          rowIndex = Math.min(h - 1, Math.max(0, Math.round((sMaxLat - targetLat) / Math.max(1e-9, dLat))));
          sampledLat = sMaxLat - rowIndex * dLat;
        }
      } else {
        sampledLat = sMinLat;
      }

      const normLon = normalizeLongitude(targetLon);
      const lonOffsetFromWest = crossesAntimeridian
        ? normLon >= sMinLon
          ? normLon - sMinLon
          : (180 - sMinLon) + (normLon + 180)
        : normLon - sMinLon;

      let colIndex = 0;
      let sampledLon = (sMinLon + sMaxLon) / 2;
      if (w > 1) {
        const westColIndex = Math.min(w - 1, Math.max(0, Math.round(lonOffsetFromWest / Math.max(1e-9, dLon))));
        if (colOrder === 'east-to-west') {
          colIndex = (w - 1) - westColIndex;
        } else {
          colIndex = westColIndex;
        }
        sampledLon = normalizeLongitude(sMinLon + westColIndex * dLon);
      } else {
        sampledLon = normalizeLongitude(sMinLon);
      }

      return {
        rowIndex,
        colIndex,
        latitude: Number(sampledLat.toFixed(6)),
        longitude: sampledLon
      };
    };

    return {
      sMinLat,
      sMaxLat,
      sMinLon,
      sMaxLon,
      dLat,
      dLon,
      rowOrder,
      colOrder,
      crossesAntimeridian,
      mapCoordinateToIndex
    };
  }

  public getRawTileBuffer(tileId: string): { buffer: Buffer; tile: GebcoTileEntry; contentType: string } | null {
    if (!this.manifest || !this.baseDir) return null;
    const tile = this.manifest.tiles.find(t => t.id === tileId);
    if (!tile) return null;
    const tilePath = path.join(this.baseDir, tile.file);
    if (!fs.existsSync(tilePath)) return null;
    const buffer = fs.readFileSync(tilePath);
    const contentType = tile.file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    return { buffer, tile, contentType };
  }

  public getRawTileFileBuffer(tileId: string): { buffer: Buffer; tile: GebcoTileEntry; contentType: string } | null {
    return this.getRawTileBuffer(tileId);
  }

  private setCache(key: string, value: BathymetryResult) {
    if (this.tileCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.tileCache.keys().next().value;
      if (oldestKey) this.tileCache.delete(oldestKey);
    }
    this.tileCache.set(key, value);
  }

  /**
   * Deterministic tile lookup for (lat, lon).
   * Never returns an unrelated tile or manifest.tiles[0] when no tile covers the coordinate.
   */
  public findCoveringTiles(lat: number, lon: number, preferredLevel?: number): GebcoTileEntry[] {
    if (!this.manifest) return [];
    const matching = this.manifest.tiles.filter(t => t.bounds && doesTileCoverCoordinate(t.bounds, lat, lon));
    if (matching.length === 0) return [];

    matching.sort((a, b) => {
      const lvlA = a.level ?? 0;
      const lvlB = b.level ?? 0;

      if (preferredLevel !== undefined) {
        const diffA = Math.abs(lvlA - preferredLevel);
        const diffB = Math.abs(lvlB - preferredLevel);
        if (diffA !== diffB) return diffA - diffB;
      }

      // Higher resolution level first
      if (lvlB !== lvlA) return lvlB - lvlA;

      // Smaller geographic area (more specific regional tile) first
      const areaA = this.computeTileArea(a.bounds!);
      const areaB = this.computeTileArea(b.bounds!);
      if (Math.abs(areaA - areaB) > 1e-6) return areaA - areaB;

      // Deterministic ID tie-breaker
      return a.id.localeCompare(b.id);
    });

    return matching;
  }

  private computeTileArea(b: GebcoTileBounds): number {
    const latSpan = Math.max(0.0001, b.maxLat - b.minLat);
    const lonSpan = b.crossesAntimeridian || b.minLon > b.maxLon
      ? (180 - b.minLon) + (b.maxLon + 180)
      : Math.max(0.0001, b.maxLon - b.minLon);
    return latSpan * lonSpan;
  }

  /**
   * Primary entry point to retrieve bathymetry by explicit Region ID or Geographic Coordinates.
   * NEVER falls back to Mariana Trench when an unrelated coordinate or unknown region is requested.
   */
  public async getBathymetry(
    regionId?: string,
    lat?: number,
    lon?: number,
    span: number = 1.2,
    options: { preferredLevel?: number; maxDimension?: number; mode?: BathymetryRetrievalMode } = {}
  ): Promise<BathymetryResult | null> {
    const hasCoords = lat !== undefined && lon !== undefined && !Number.isNaN(lat) && !Number.isNaN(lon);

    // 1. Explicit coordinate lookup takes precedence whenever coordinates are provided
    if (hasCoords) {
      return this.getByCoords(lat!, lon!, span, options);
    }

    // 2. Explicit preset Region ID lookup
    if (regionId && regionId !== 'custom' && regionId !== 'custom-coords') {
      return this.getByRegionId(regionId);
    }

    return null;
  }

  public async getByRegionId(regionId: string): Promise<BathymetryResult | null> {
    const cacheKey = `region:${regionId}`;
    if (this.tileCache.has(cacheKey)) {
      return this.tileCache.get(cacheKey)!;
    }

    let rawPreset: any = null;

    // 1. Prioritize authoritative on-disk regional JSON tile in this.baseDir/tiles/<regionId>.json
    // so regenerated signed elevations on disk always supersede static bundled presets.
    if (this.baseDir) {
      const jsonCandidate = path.join(this.baseDir, 'tiles', `${regionId}.json`);
      if (fs.existsSync(jsonCandidate)) {
        try {
          rawPreset = JSON.parse(await fs.promises.readFile(jsonCandidate, 'utf8'));
          this.preloadedPresets[regionId] = rawPreset;
        } catch (e) {
          console.warn(`[GEBCO] Failed to read tile file ${jsonCandidate}:`, e);
        }
      }
    }

    // 2. Fall back to preloaded presets from src/data/realBathymetryPresets.json only if not on disk
    if (!rawPreset) {
      rawPreset = this.preloadedPresets[regionId];
    }

    if (!rawPreset) {
      // Do NOT fallback to mariana-trench
      return null;
    }

    const converted = this.convertPresetRecordToResult(rawPreset);
    this.setCache(cacheKey, converted);
    return converted;
  }

  private convertPresetRecordToResult(raw: any): BathymetryResult {
    const w = raw.gridWidth || 73;
    const h = raw.gridHeight || 73;
    const total = w * h;
    const elevationsMeters: (number | null)[] = new Array(total);
    const depths: number[] = new Array(total);

    const hasSignedRaw = Array.isArray(raw.elevationsMeters) || Array.isArray(raw.rawElevations);
    const srcSigned = raw.elevationsMeters || raw.rawElevations;
    const srcDepths = raw.elevations || [];
    const elevationDataKind: 'signed_land_and_ocean' | 'underwater_depth_only' = hasSignedRaw
      ? 'signed_land_and_ocean'
      : 'underwater_depth_only';

    let minE = Infinity;
    let maxE = -Infinity;
    let minD = Infinity;
    let maxD = -Infinity;
    let validCount = 0;
    let missingCount = 0;

    for (let i = 0; i < total; i++) {
      let elev: number | null = null;
      if (hasSignedRaw && srcSigned[i] !== null && srcSigned[i] !== undefined && Number.isFinite(Number(srcSigned[i]))) {
        const v = Number(srcSigned[i]);
        if (v !== INT16_NODATA && v >= -12000 && v <= 9000) {
          elev = Object.is(v, -0) ? 0 : v;
        }
      } else if (!hasSignedRaw && srcDepths[i] !== null && srcDepths[i] !== undefined && Number.isFinite(Number(srcDepths[i]))) {
        // Depth-only array: never reconstruct positive land elevation from depth-only values
        const dVal = Number(srcDepths[i]);
        if (dVal !== INT16_NODATA && dVal >= 0 && dVal <= 12000) {
          elev = dVal === 0 ? 0 : -Math.abs(dVal);
        }
      }

      elevationsMeters[i] = elev;
      if (elev !== null) {
        validCount++;
        const d = Math.max(0, -elev);
        depths[i] = d;
        if (elev < minE) minE = elev;
        if (elev > maxE) maxE = elev;
        if (d < minD) minD = d;
        if (d > maxD) maxD = d;
      } else {
        missingCount++;
        depths[i] = 0;
      }
    }

    const centerRow = Math.floor(h / 2);
    const centerCol = Math.floor(w / 2);
    const centerIdx = centerRow * w + centerCol;
    const centerElev = elevationsMeters[centerIdx] ?? null;
    const centerDepth = elevationToDepthMeters(centerElev);
    const isLand = hasSignedRaw ? (centerElev !== null && centerElev > 0) : false;

    const bounds = {
      minLat: Number(raw.bounds.minLat),
      maxLat: Number(raw.bounds.maxLat),
      minLon: Number(raw.bounds.minLon),
      maxLon: Number(raw.bounds.maxLon)
    };
    const sampleBounds = raw.sampleBounds
      ? {
          minLat: Number(raw.sampleBounds.minLat),
          maxLat: Number(raw.sampleBounds.maxLat),
          minLon: Number(raw.sampleBounds.minLon),
          maxLon: Number(raw.sampleBounds.maxLon)
        }
      : bounds;
    const centerLat = Number(((bounds.minLat + bounds.maxLat) / 2).toFixed(4));
    const centerLon = Number(((bounds.minLon + bounds.maxLon) / 2).toFixed(4));
    const resArcSec = raw.resolutionArcSec || 60;

    const geom = this.resolveTileSampleGeometry({
      gridWidth: w,
      gridHeight: h,
      bounds,
      sampleBounds,
      sampleSpacingLat: raw.sampleSpacingLat,
      sampleSpacingLon: raw.sampleSpacingLon,
      resolutionArcSec: resArcSec,
      rowOrder: raw.rowOrder || 'north-to-south',
      colOrder: raw.colOrder || 'west-to-east',
      format: 'json'
    });
    const centerMapped = geom.mapCoordinateToIndex(centerLat, centerLon);
    const sampledCoordinates = {
      latitude: centerMapped.latitude,
      longitude: centerMapped.longitude,
      rowIndex: centerMapped.rowIndex,
      colIndex: centerMapped.colIndex
    };

    const baseSource = raw.source || 'GEBCO / NOAA NCEI 1-Arc-Minute Bathymetric Grid (ETOPO)';
    const sourceLabel = hasSignedRaw
      ? baseSource
      : baseSource.includes('Depth-Only')
        ? baseSource
        : `${baseSource} (Underwater Depth-Only Regional Extract)`;

    const datasetMeta: BathymetryDatasetMetadata = {
      id: raw.id,
      name: sourceLabel,
      source: sourceLabel,
      organization: 'GEBCO / NOAA NCEI',
      version: 'ETOPO1 / GEBCO Regional Extract',
      sourceUrl: 'https://www.gebco.net/',
      nativeResolutionArcSec: resArcSec,
      resolutionArcSec: resArcSec,
      units: 'meters',
      verticalDatum: 'Mean Sea Level',
      coverage: 'regional',
      provenance: 'preset_regional',
      hasSignedElevations: hasSignedRaw,
      elevationDataKind,
      isAuthoritative: true,
      isModeledFallback: false,
      valueType: 'resampled'
    };

    return {
      status: 'ok',
      requestedCoordinates: { latitude: centerLat, longitude: centerLon },
      sampledCoordinates,
      dataset: datasetMeta,
      grid: {
        bounds: {
          west: bounds.minLon,
          south: bounds.minLat,
          east: bounds.maxLon,
          north: bounds.maxLat,
          minLat: bounds.minLat,
          maxLat: bounds.maxLat,
          minLon: bounds.minLon,
          maxLon: bounds.maxLon
        },
        sampleBounds,
        sampleSpacingLat: raw.sampleSpacingLat ?? geom.dLat,
        sampleSpacingLon: raw.sampleSpacingLon ?? geom.dLon,
        hasSignedElevations: hasSignedRaw,
        width: w,
        height: h,
        rowOrder: raw.rowOrder || 'north-to-south',
        colOrder: raw.colOrder || 'west-to-east',
        elevationsMeters,
        noDataValue: null,
        validSampleCount: validCount,
        missingSampleCount: missingCount,
        minElevationMeters: minE === Infinity ? null : minE,
        maxElevationMeters: maxE === -Infinity ? null : maxE,
        centerElevationMeters: centerElev,
        minDepthMeters: minD === Infinity ? 0 : minD,
        maxDepthMeters: maxD === -Infinity ? 0 : maxD,
        centerDepthMeters: centerDepth,
        isLand,
        sampledCoordinates
      },
      id: raw.id,
      name: raw.name,
      source: datasetMeta.name,
      resolutionArcSec: resArcSec,
      bounds,
      gridWidth: w,
      gridHeight: h,
      minDepth: minD === Infinity ? 0 : minD,
      maxDepth: maxD === -Infinity ? 0 : maxD,
      minElevation: minE === Infinity ? 0 : minE,
      maxElevation: maxE === -Infinity ? 0 : maxE,
      centerElevation: centerElev,
      centerDepth,
      isLand,
      hasSignedElevations: hasSignedRaw,
      elevationDataKind,
      isAuthoritative: true,
      isModeledFallback: false,
      provenance: 'preset_regional',
      landmarks: raw.landmarks || [],
      elevations: depths,
      rawElevations: elevationsMeters
    };
  }

  /**
   * Retrieve bathymetry for arbitrary geographic coordinates.
   */
  public async getByCoords(
    rawLat: number,
    rawLon: number,
    rawSpan: number = 1.2,
    options: { preferredLevel?: number; maxDimension?: number; mode?: BathymetryRetrievalMode } = {}
  ): Promise<BathymetryResult | null> {
    const validated = validateCoordinates(rawLat, rawLon, false);
    if (!validated.valid) {
      throw new Error(validated.error || 'Invalid coordinates');
    }

    const lat = validated.latitude;
    const lon = validated.longitude;
    const span = Math.min(10.0, Math.max(0.1, Number.isFinite(rawSpan) ? rawSpan : 1.2));
    const maxDim = Math.min(256, Math.max(16, options.maxDimension || 73));
    const mode = options.mode === 'fallback' ? 'modelled' : (options.mode || 'auto');
    const prefLvl = options.preferredLevel;

    const cacheKey = `coord:${lat.toFixed(5)},${lon.toFixed(5)}:${span.toFixed(3)}:L${prefLvl ?? 'auto'}:D${maxDim}:${mode}`;
    if (this.tileCache.has(cacheKey)) {
      return this.tileCache.get(cacheKey)!;
    }

    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey)!;
    }

    const requestPromise = (async (): Promise<BathymetryResult | null> => {
      if (mode === 'modelled') {
        const modelled = this.createModelledSector(lat, lon, span, maxDim);
        this.setCache(cacheKey, modelled);
        return modelled;
      }

      // 1. Search local verified tiles that genuinely cover (lat, lon)
      const candidates = this.findCoveringTiles(lat, lon, prefLvl);
      for (const bestTile of candidates) {
        if (!this.baseDir) break;
        const tileFilePath = path.join(this.baseDir, bestTile.file);
        if (!fs.existsSync(tileFilePath)) continue;

        // 1a. Regional JSON tile covering (lat, lon)
        if (bestTile.format === 'json' || tileFilePath.endsWith('.json')) {
          try {
            const rawJson = JSON.parse(await fs.promises.readFile(tileFilePath, 'utf8'));
            const converted = this.convertPresetRecordToResult(rawJson);
            // Sample exact center elevation at the requested (lat, lon) within this tile
            const sampled = this.sampleGridAtCoordinate(converted, lat, lon);
            const resultWithCoord: BathymetryResult = {
              ...converted,
              requestedCoordinates: { latitude: lat, longitude: lon, spanDegrees: span },
              sampledCoordinates: sampled.sampledCoordinates,
              centerElevation: sampled.elevation,
              centerDepth: sampled.depth,
              isLand: converted.hasSignedElevations ? sampled.isLand : false,
              grid: {
                ...converted.grid,
                centerElevationMeters: sampled.elevation,
                centerDepthMeters: sampled.depth,
                isLand: converted.hasSignedElevations ? sampled.isLand : false,
                sampledCoordinates: sampled.sampledCoordinates
              }
            };
            this.setCache(cacheKey, resultWithCoord);
            return resultWithCoord;
          } catch (e) {
            console.warn(`[GEBCO] Failed reading JSON tile ${tileFilePath}:`, e);
            continue;
          }
        }

        // 1b. Binary Int16 little-endian GEBCO 2026 tile
        try {
          const buffer = await fs.promises.readFile(tileFilePath);
          const w = bestTile.gridWidth;
          const h = bestTile.gridHeight;
          const expectedBytes = w * h * 2;

          if (buffer.byteLength !== expectedBytes) {
            console.warn(
              `[GEBCO] Corrupted binary tile ${bestTile.id}: expected ${expectedBytes} bytes, got ${buffer.byteLength} bytes.`
            );
            continue;
          }

          const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
          const targetW = Math.min(w, maxDim);
          const targetH = Math.min(h, maxDim);
          const elevationsMeters: (number | null)[] = new Array(targetW * targetH);
          const depths: number[] = new Array(targetW * targetH);

          let minDepth = Infinity;
          let maxDepth = -Infinity;
          let minElevation = Infinity;
          let maxElevation = -Infinity;
          let validCount = 0;
          let missingCount = 0;

          const tBounds = bestTile.bounds!;
          const geom = this.resolveTileSampleGeometry(bestTile);
          const { sMinLat, sMaxLat, sMinLon, sMaxLon, crossesAntimeridian, mapCoordinateToIndex } = geom;

          const useFullTileSamples =
            w <= maxDim && h <= maxDim && (sMaxLat - sMinLat <= span * 1.5 || targetH <= 16);

          const bMinLat = useFullTileSamples
            ? sMinLat
            : Math.min(sMaxLat, Math.max(sMinLat, lat - span / 2));
          const bMaxLat = useFullTileSamples
            ? sMaxLat
            : Math.max(bMinLat, Math.min(sMaxLat, Math.max(sMinLat, lat + span / 2)));

          // Handle antimeridian window clamping against actual sample bounds
          let bMinLon = useFullTileSamples ? sMinLon : lon - span / 2;
          let bMaxLon = useFullTileSamples ? sMaxLon : lon + span / 2;
          if (!useFullTileSamples && !crossesAntimeridian && sMinLon <= sMaxLon) {
            bMinLon = Math.min(sMaxLon, Math.max(sMinLon, bMinLon));
            bMaxLon = Math.max(bMinLon, Math.min(sMaxLon, Math.max(sMinLon, bMaxLon)));
          }

          // Output grid is ordered North-to-South (row 0 = bMaxLat) and West-to-East (col 0 = bMinLon),
          // while sampling the source binary tile using its exact sampleBounds, spacing, rowOrder, and colOrder.
          for (let r = 0; r < targetH; r++) {
            const v = targetH > 1 ? r / (targetH - 1) : 0.5;
            const curLat = bMaxLat - v * (bMaxLat - bMinLat);

            for (let c = 0; c < targetW; c++) {
              const u = targetW > 1 ? c / (targetW - 1) : 0.5;
              const rawCurLon = bMinLon + u * (bMaxLon - bMinLon);
              const curLon = normalizeLongitude(rawCurLon);

              const mapped = mapCoordinateToIndex(curLat, curLon);
              const srcIdx = mapped.rowIndex * w + mapped.colIndex;
              const rawVal = view.getInt16(srcIdx * 2, true); // little-endian signed int16

              const outIdx = r * targetW + c;
              if (rawVal === INT16_NODATA || rawVal < -12000 || rawVal > 9000) {
                elevationsMeters[outIdx] = null;
                depths[outIdx] = 0;
                missingCount++;
              } else {
                elevationsMeters[outIdx] = rawVal;
                const depthMeters = Math.max(0, -rawVal);
                depths[outIdx] = depthMeters;
                validCount++;

                if (depthMeters < minDepth) minDepth = depthMeters;
                if (depthMeters > maxDepth) maxDepth = depthMeters;
                if (rawVal < minElevation) minElevation = rawVal;
                if (rawVal > maxElevation) maxElevation = rawVal;
              }
            }
          }

          if (validCount === 0) {
            console.warn(`[GEBCO] Tile ${bestTile.id} had 0 valid samples for (${lat}, ${lon}).`);
            continue;
          }

          // Directly sample the source binary tile at the exact requested (lat, lon)
          // using the tile's exact sample geometry (sampleBounds, sampleSpacing, rowOrder, colOrder).
          const exactSample = mapCoordinateToIndex(lat, lon);
          const rawCenter = view.getInt16((exactSample.rowIndex * w + exactSample.colIndex) * 2, true);
          const centerElev: number | null =
            rawCenter === INT16_NODATA || rawCenter < -12000 || rawCenter > 9000 ? null : rawCenter;

          const sampledCoordinates = {
            latitude: exactSample.latitude,
            longitude: exactSample.longitude,
            rowIndex: exactSample.rowIndex,
            colIndex: exactSample.colIndex
          };

          const centerDepth = elevationToDepthMeters(centerElev);
          const isLand = centerElev !== null && centerElev > 0;
          const resArcSec = bestTile.resolutionArcSec || (bestTile.stride || 1) * 15;

          const datasetMeta: BathymetryDatasetMetadata = {
            id: bestTile.id,
            name: 'GEBCO_2026 Sub-Ice Global Bathymetric Grid',
            source: 'GEBCO_2026 Sub-Ice Global Bathymetric Grid',
            organization: 'GEBCO Compilation Group (IHO / IOC)',
            version: '2026',
            sourceUrl: 'https://www.gebco.net/data_and_products/gridded_bathymetry_data/',
            nativeResolutionArcSec: 15,
            resolutionArcSec: resArcSec,
            units: 'meters',
            verticalDatum: 'Mean Sea Level',
            processedAt: this.manifest?.processedAt,
            coverage: 'global',
            provenance: 'authoritative_local',
            hasSignedElevations: true,
            elevationDataKind: 'signed_land_and_ocean',
            isAuthoritative: true,
            isModeledFallback: false,
            valueType: (bestTile.stride || 1) === 1 ? 'original' : 'resampled',
            tileId: bestTile.id,
            level: bestTile.level ?? null
          };

          const subWindowBounds = {
            minLat: Number((targetH === h && bMinLat <= sMinLat && bMaxLat >= sMaxLat ? tBounds.minLat : bMinLat).toFixed(6)),
            maxLat: Number((targetH === h && bMinLat <= sMinLat && bMaxLat >= sMaxLat ? tBounds.maxLat : bMaxLat).toFixed(6)),
            minLon: normalizeLongitude(targetW === w && bMinLon <= sMinLon && bMaxLon >= sMaxLon ? tBounds.minLon : bMinLon),
            maxLon: normalizeLongitude(targetW === w && bMinLon <= sMinLon && bMaxLon >= sMaxLon ? tBounds.maxLon : bMaxLon)
          };

          const result: BathymetryResult = {
            status: 'ok',
            requestedCoordinates: { latitude: lat, longitude: lon, spanDegrees: span },
            sampledCoordinates,
            dataset: datasetMeta,
            grid: {
              bounds: {
                west: subWindowBounds.minLon,
                south: subWindowBounds.minLat,
                east: subWindowBounds.maxLon,
                north: subWindowBounds.maxLat,
                minLat: subWindowBounds.minLat,
                maxLat: subWindowBounds.maxLat,
                minLon: subWindowBounds.minLon,
                maxLon: subWindowBounds.maxLon
              },
              sampleBounds: {
                minLat: Number(bMinLat.toFixed(6)),
                maxLat: Number(bMaxLat.toFixed(6)),
                minLon: normalizeLongitude(bMinLon),
                maxLon: normalizeLongitude(bMaxLon)
              },
              sampleSpacingLat: geom.dLat,
              sampleSpacingLon: geom.dLon,
              hasSignedElevations: true,
              width: targetW,
              height: targetH,
              rowOrder: 'north-to-south',
              colOrder: 'west-to-east',
              elevationsMeters,
              noDataValue: null,
              validSampleCount: validCount,
              missingSampleCount: missingCount,
              minElevationMeters: minElevation === Infinity ? null : minElevation,
              maxElevationMeters: maxElevation === -Infinity ? null : maxElevation,
              centerElevationMeters: centerElev,
              minDepthMeters: minDepth === Infinity ? 0 : minDepth,
              maxDepthMeters: maxDepth === -Infinity ? 0 : maxDepth,
              centerDepthMeters: centerDepth,
              isLand,
              sampledCoordinates
            },
            id: `gebco-${bestTile.id}-${lat.toFixed(3)}-${lon.toFixed(3)}`,
            name: `GEBCO Sector (${formatCoordinateString(lat, lon)})`,
            source: datasetMeta.name,
            resolutionArcSec: resArcSec,
            bounds: subWindowBounds,
            gridWidth: targetW,
            gridHeight: targetH,
            minDepth: minDepth === Infinity ? 0 : minDepth,
            maxDepth: maxDepth === -Infinity ? 0 : maxDepth,
            minElevation: minElevation === Infinity ? 0 : minElevation,
            maxElevation: maxElevation === -Infinity ? 0 : maxElevation,
            centerElevation: centerElev,
            centerDepth,
            isLand,
            hasSignedElevations: true,
            elevationDataKind: 'signed_land_and_ocean',
            isAuthoritative: true,
            isModeledFallback: false,
            provenance: 'authoritative_local',
            landmarks: bestTile.landmarks || [],
            elevations: depths,
            rawElevations: elevationsMeters
          };

          this.setCache(cacheKey, result);
          return result;
        } catch (binaryErr) {
          console.warn(`[GEBCO] Error reading binary tile ${tileFilePath}:`, binaryErr);
        }
      }

      // 2. Authoritative Online Bathymetry Service (NOAA CoastWatch / PMEL ERDDAP ETOPO1 Grid)
      const onlineResult = await this.fetchOnlineAuthoritativeGrid(lat, lon, span, maxDim);
      if (onlineResult) {
        this.setCache(cacheKey, onlineResult);
        return onlineResult;
      }

      // 3. Secondary Authoritative Online Service (GMRT GridServer)
      const gmrtResult = await this.fetchGMRTAuthoritativeGrid(lat, lon, span);
      if (gmrtResult) {
        this.setCache(cacheKey, gmrtResult);
        return gmrtResult;
      }

      // 4. If caller requested strictly real authoritative data, return null so API responds with 503 Unavailable
      if (mode === 'real') {
        return null;
      }

      // 5. Clearly identified physical model fallback ONLY when all authoritative sources are unreachable
      console.warn(`[GEBCO] Authoritative bathymetry sources unreachable for (${lat}, ${lon}). Returning explicitly labeled modelled sector.`);
      const modelled = this.createModelledSector(lat, lon, span, maxDim);
      return modelled;
    })();

    this.inFlightRequests.set(cacheKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  public sampleGridAtCoordinate(
    gridResult: BathymetryResult,
    lat: number,
    lon: number
  ): {
    elevation: number | null;
    depth: number | null;
    isLand: boolean;
    sampledCoordinates: { latitude: number; longitude: number; rowIndex: number; colIndex: number };
  } {
    const geom = this.resolveTileSampleGeometry({
      gridWidth: gridResult.gridWidth,
      gridHeight: gridResult.gridHeight,
      bounds: gridResult.bounds,
      sampleBounds: gridResult.grid.sampleBounds || gridResult.bounds,
      sampleSpacingLat: gridResult.grid.sampleSpacingLat,
      sampleSpacingLon: gridResult.grid.sampleSpacingLon,
      rowOrder: gridResult.grid.rowOrder || 'north-to-south',
      colOrder: gridResult.grid.colOrder || 'west-to-east',
      format: 'json'
    });

    const mapped = geom.mapCoordinateToIndex(lat, lon);
    const idx = mapped.rowIndex * gridResult.gridWidth + mapped.colIndex;
    const elev = gridResult.grid.elevationsMeters[idx] ?? null;
    const depth = elevationToDepthMeters(elev);
    const hasSigned = gridResult.hasSignedElevations ?? gridResult.grid.hasSignedElevations ?? true;

    return {
      elevation: elev,
      depth,
      isLand: hasSigned ? (elev !== null && elev > 0) : false,
      sampledCoordinates: {
        latitude: mapped.latitude,
        longitude: mapped.longitude,
        rowIndex: mapped.rowIndex,
        colIndex: mapped.colIndex
      }
    };
  }

  /**
   * Fetches genuine 1-arc-minute (60-arc-second) bathymetry/topography from NOAA ERDDAP (ETOPO1).
   * Handles polar and antimeridian edge cases safely.
   */
  private async fetchOnlineAuthoritativeGrid(
    lat: number,
    lon: number,
    span: number,
    maxDim: number = 73
  ): Promise<BathymetryResult | null> {
    const halfSpan = span / 2;
    const latMin = Number(Math.max(-89.95, Math.min(89.8, lat - halfSpan)).toFixed(4));
    const latMax = Number(Math.min(89.95, Math.max(latMin + 0.1, lat + halfSpan)).toFixed(4));

    // Clamp query window inside [-179.95, 179.95] to avoid ERDDAP antimeridian range rejection
    let lonCenter = lon;
    if (lonCenter + halfSpan > 179.95) lonCenter = 179.95 - halfSpan;
    if (lonCenter - halfSpan < -179.95) lonCenter = -179.95 + halfSpan;
    const lonMin = Number(Math.max(-179.95, lonCenter - halfSpan).toFixed(4));
    const lonMax = Number(Math.min(179.95, Math.max(lonMin + 0.1, lonCenter + halfSpan)).toFixed(4));

    const stride = Math.max(1, Math.round((span * 60) / Math.max(16, maxDim - 1)));
    const query = `altitude[(${latMin}):${stride}:(${latMax})][(${lonMin}):${stride}:(${lonMax})]`;

    const erddapEndpoints = [
      `https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json?${encodeURIComponent(query)}`,
      `https://data.pmel.noaa.gov/socat/erddap/griddap/etopo180.json?${encodeURIComponent(query)}`
    ];

    for (const url of erddapEndpoints) {
      try {
        const fetchRes = await fetch(url, { signal: AbortSignal.timeout(6500) });
        if (!fetchRes.ok) continue;

        const json: any = await fetchRes.json();
        const rows: [number, number, number | null][] = json?.table?.rows || [];
        if (!Array.isArray(rows) || rows.length < 16) continue;

        const latSet = new Set<number>();
        const lonSet = new Set<number>();
        const valMap = new Map<string, number | null>();

        for (const row of rows) {
          if (!Array.isArray(row) || row.length < 3) continue;
          const rLat = Number(row[0]);
          const rLon = Number(row[1]);
          const rAlt = row[2] === null || row[2] === undefined ? null : Number(row[2]);
          if (!Number.isFinite(rLat) || !Number.isFinite(rLon)) continue;

          latSet.add(rLat);
          lonSet.add(rLon);
          const isValidElev = rAlt !== null && Number.isFinite(rAlt) && rAlt !== INT16_NODATA && rAlt >= -12000 && rAlt <= 9000;
          valMap.set(`${rLat.toFixed(5)},${rLon.toFixed(5)}`, isValidElev ? rAlt : null);
        }

        const lats = [...latSet].sort((a, b) => b - a); // North to South
        const lons = [...lonSet].sort((a, b) => a - b); // West to East
        const gridW = lons.length;
        const gridH = lats.length;
        if (gridW < 2 || gridH < 2) continue;

        const elevationsMeters: (number | null)[] = [];
        const depths: number[] = [];
        let minD = Infinity;
        let maxD = -Infinity;
        let minE = Infinity;
        let maxE = -Infinity;
        let validCount = 0;
        let missingCount = 0;

        for (let iy = 0; iy < gridH; iy++) {
          const cLat = lats[iy];
          for (let ix = 0; ix < gridW; ix++) {
            const cLon = lons[ix];
            const rawAlt = valMap.get(`${cLat.toFixed(5)},${cLon.toFixed(5)}`) ?? null;
            elevationsMeters.push(rawAlt);

            if (rawAlt !== null) {
              validCount++;
              const depth = Math.max(0, -rawAlt);
              depths.push(depth);
              if (depth < minD) minD = depth;
              if (depth > maxD) maxD = depth;
              if (rawAlt < minE) minE = rawAlt;
              if (rawAlt > maxE) maxE = rawAlt;
            } else {
              missingCount++;
              depths.push(0);
            }
          }
        }

        if (validCount < 9) continue;

        // Find sample closest to exact requested (lat, lon)
        let bestLatIdx = 0;
        let bestLatDiff = Infinity;
        for (let i = 0; i < lats.length; i++) {
          const d = Math.abs(lats[i] - lat);
          if (d < bestLatDiff) {
            bestLatDiff = d;
            bestLatIdx = i;
          }
        }
        let bestLonIdx = 0;
        let bestLonDiff = Infinity;
        for (let j = 0; j < lons.length; j++) {
          const d = Math.abs(lons[j] - lonCenter);
          if (d < bestLonDiff) {
            bestLonDiff = d;
            bestLonIdx = j;
          }
        }

        const centerElev = elevationsMeters[bestLatIdx * gridW + bestLonIdx] ?? null;
        const centerDepth = elevationToDepthMeters(centerElev);
        const isLand = centerElev !== null && centerElev > 0;
        const resArcSec = stride * 60;
        const sampledCoordinates = {
          latitude: Number(lats[bestLatIdx].toFixed(6)),
          longitude: normalizeLongitude(lons[bestLonIdx]),
          rowIndex: bestLatIdx,
          colIndex: bestLonIdx
        };

        const datasetMeta: BathymetryDatasetMetadata = {
          id: `authoritative-${lat.toFixed(3)}-${lon.toFixed(3)}`,
          name: 'NOAA NCEI ETOPO1 Global Relief Model (1-Arc-Minute Grid)',
          source: 'NOAA NCEI ETOPO1 Global Relief Model (1-Arc-Minute Grid)',
          organization: 'NOAA National Centers for Environmental Information (NCEI)',
          version: 'ETOPO1',
          sourceUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.html',
          nativeResolutionArcSec: 60,
          resolutionArcSec: resArcSec,
          units: 'meters',
          verticalDatum: 'Mean Sea Level',
          coverage: 'global',
          provenance: 'authoritative_online',
          hasSignedElevations: true,
          elevationDataKind: 'signed_land_and_ocean',
          isAuthoritative: true,
          isModeledFallback: false,
          valueType: stride === 1 ? 'original' : 'resampled'
        };

        const bounds = {
          minLat: lats[lats.length - 1],
          maxLat: lats[0],
          minLon: lons[0],
          maxLon: lons[lons.length - 1]
        };

        return {
          status: 'ok',
          requestedCoordinates: { latitude: lat, longitude: lon, spanDegrees: span },
          sampledCoordinates,
          dataset: datasetMeta,
          grid: {
            bounds: {
              west: bounds.minLon,
              south: bounds.minLat,
              east: bounds.maxLon,
              north: bounds.maxLat,
              minLat: bounds.minLat,
              maxLat: bounds.maxLat,
              minLon: bounds.minLon,
              maxLon: bounds.maxLon
            },
            sampleBounds: bounds,
            hasSignedElevations: true,
            width: gridW,
            height: gridH,
            rowOrder: 'north-to-south',
            colOrder: 'west-to-east',
            elevationsMeters,
            noDataValue: null,
            validSampleCount: validCount,
            missingSampleCount: missingCount,
            minElevationMeters: minE === Infinity ? null : minE,
            maxElevationMeters: maxE === -Infinity ? null : maxE,
            centerElevationMeters: centerElev,
            minDepthMeters: minD === Infinity ? 0 : minD,
            maxDepthMeters: maxD === -Infinity ? 0 : maxD,
            centerDepthMeters: centerDepth,
            isLand,
            sampledCoordinates
          },
          id: `authoritative-${lat.toFixed(3)}-${lon.toFixed(3)}`,
          name: `${isLand ? 'Coastal / Land Sector' : 'Ocean Sector'} (${formatCoordinateString(lat, lon)})`,
          source: datasetMeta.name,
          resolutionArcSec: resArcSec,
          bounds,
          gridWidth: gridW,
          gridHeight: gridH,
          minDepth: minD === Infinity ? 0 : minD,
          maxDepth: maxD === -Infinity ? 0 : maxD,
          minElevation: minE === Infinity ? 0 : minE,
          maxElevation: maxE === -Infinity ? 0 : maxE,
          centerElevation: centerElev,
          centerDepth,
          isLand,
          hasSignedElevations: true,
          elevationDataKind: 'signed_land_and_ocean',
          isAuthoritative: true,
          isModeledFallback: false,
          provenance: 'authoritative_online',
          landmarks: [],
          elevations: depths,
          rawElevations: elevationsMeters
        };
      } catch (err: any) {
        console.warn(`[GEBCO] ERDDAP endpoint ${url.split('?')[0]} failed:`, err?.message || err);
      }
    }

    return null;
  }

  /**
   * Secondary authoritative online provider: Global Multi-Resolution Topography (GMRT) GridServer.
   */
  private async fetchGMRTAuthoritativeGrid(
    lat: number,
    lon: number,
    span: number
  ): Promise<BathymetryResult | null> {
    if (Math.abs(lat) > 78) return null; // GMRT Mercator coverage bound
    const halfSpan = span / 2;
    const south = Math.max(-78, lat - halfSpan);
    const north = Math.min(78, lat + halfSpan);
    const west = Math.max(-179.9, lon - halfSpan);
    const east = Math.min(179.9, lon + halfSpan);
    if (north <= south || east <= west) return null;

    try {
      const url = new URL('https://www.gmrt.org/services/GridServer');
      url.searchParams.set('north', String(north));
      url.searchParams.set('south', String(south));
      url.searchParams.set('east', String(east));
      url.searchParams.set('west', String(west));
      url.searchParams.set('layer', 'topo');
      url.searchParams.set('format', 'esriascii');
      url.searchParams.set('mresolution', String(Math.ceil((span * 111000) / 72)));

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6500) });
      if (!res.ok) return null;

      const text = await res.text();
      const lines = text.trim().replace(/\r/g, '').split('\n');
      const meta: Record<string, number> = {};
      let idx = 0;
      for (; idx < Math.min(lines.length, 9); idx++) {
        const m = lines[idx].trim().match(/^(ncols|nrows|xllcorner|xllcenter|yllcorner|yllcenter|cellsize|nodata_value)\s+([^\s]+)/i);
        if (!m) break;
        meta[m[1].toLowerCase()] = Number(m[2]);
      }

      const rows = meta.nrows;
      const cols = meta.ncols;
      const cellsize = meta.cellsize;
      const nodata = meta.nodata_value ?? -9999;
      if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || rows * cols > 200000) {
        return null;
      }

      const rawTokens = lines.slice(idx).join(' ').trim().split(/\s+/);
      if (rawTokens.length !== rows * cols) return null;

      const elevationsMeters: (number | null)[] = [];
      const depths: number[] = [];
      let minE = Infinity;
      let maxE = -Infinity;
      let minD = Infinity;
      let maxD = -Infinity;
      let validCount = 0;
      let missingCount = 0;

      for (let i = 0; i < rawTokens.length; i++) {
        const v = Number(rawTokens[i]);
        if (Number.isFinite(v) && v !== nodata && v >= -12000 && v <= 9000) {
          const rounded = Math.round(v);
          elevationsMeters.push(rounded);
          const d = Math.max(0, -rounded);
          depths.push(d);
          validCount++;
          if (rounded < minE) minE = rounded;
          if (rounded > maxE) maxE = rounded;
          if (d < minD) minD = d;
          if (d > maxD) maxD = d;
        } else {
          elevationsMeters.push(null);
          depths.push(0);
          missingCount++;
        }
      }

      if (validCount < 16) return null;

      const centerRow = Math.floor(rows / 2);
      const centerCol = Math.floor(cols / 2);
      const centerIdx = centerRow * cols + centerCol;
      const centerElev = elevationsMeters[centerIdx] ?? null;
      const centerDepth = elevationToDepthMeters(centerElev);
      const isLand = centerElev !== null && centerElev > 0;
      const resArcSec = Math.max(15, Math.round((cellsize || 0.0166) * 3600));
      const sampledCoordinates = {
        latitude: Number((north - (centerRow / Math.max(1, rows - 1)) * (north - south)).toFixed(6)),
        longitude: normalizeLongitude(west + (centerCol / Math.max(1, cols - 1)) * (east - west)),
        rowIndex: centerRow,
        colIndex: centerCol
      };

      const datasetMeta: BathymetryDatasetMetadata = {
        id: `gmrt-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        name: 'GMRT (Global Multi-Resolution Topography Synthesis)',
        source: 'GMRT (Global Multi-Resolution Topography Synthesis)',
        organization: 'Lamont-Doherty Earth Observatory (LDEO / Columbia University)',
        version: 'GMRT v4',
        sourceUrl: 'https://www.gmrt.org/services/',
        nativeResolutionArcSec: resArcSec,
        resolutionArcSec: resArcSec,
        units: 'meters',
        verticalDatum: 'Mean Sea Level',
        coverage: 'global',
        provenance: 'authoritative_online',
        hasSignedElevations: true,
        elevationDataKind: 'signed_land_and_ocean',
        isAuthoritative: true,
        isModeledFallback: false,
        valueType: 'resampled'
      };

      return {
        status: 'ok',
        requestedCoordinates: { latitude: lat, longitude: lon, spanDegrees: span },
        sampledCoordinates,
        dataset: datasetMeta,
        grid: {
          bounds: {
            west,
            south,
            east,
            north,
            minLat: south,
            maxLat: north,
            minLon: west,
            maxLon: east
          },
          hasSignedElevations: true,
          width: cols,
          height: rows,
          rowOrder: 'north-to-south',
          colOrder: 'west-to-east',
          elevationsMeters,
          noDataValue: null,
          validSampleCount: validCount,
          missingSampleCount: missingCount,
          minElevationMeters: minE === Infinity ? null : minE,
          maxElevationMeters: maxE === -Infinity ? null : maxE,
          centerElevationMeters: centerElev,
          minDepthMeters: minD === Infinity ? 0 : minD,
          maxDepthMeters: maxD === -Infinity ? 0 : maxD,
          centerDepthMeters: centerDepth,
          isLand,
          sampledCoordinates
        },
        id: `gmrt-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        name: `${isLand ? 'Coastal / Land Sector' : 'Ocean Sector'} (${formatCoordinateString(lat, lon)})`,
        source: datasetMeta.name,
        resolutionArcSec: resArcSec,
        bounds: { minLat: south, maxLat: north, minLon: west, maxLon: east },
        gridWidth: cols,
        gridHeight: rows,
        minDepth: minD === Infinity ? 0 : minD,
        maxDepth: maxD === -Infinity ? 0 : maxD,
        minElevation: minE === Infinity ? 0 : minE,
        maxElevation: maxE === -Infinity ? 0 : maxE,
        centerElevation: centerElev,
        centerDepth,
        isLand,
        hasSignedElevations: true,
        elevationDataKind: 'signed_land_and_ocean',
        isAuthoritative: true,
        isModeledFallback: false,
        provenance: 'authoritative_online',
        landmarks: [],
        elevations: depths,
        rawElevations: elevationsMeters
      };
    } catch {
      return null;
    }
  }

  /**
   * Explicitly labeled mathematical fallback when all local and online authoritative providers are unreachable.
   * Never claims to be GEBCO or measured bathymetry.
   */
  public createModelledSector(lat: number, lon: number, span: number, targetDim: number = 73): BathymetryResult {
    const targetW = targetDim;
    const targetH = targetDim;
    const elevationsMeters: (number | null)[] = new Array(targetW * targetH);
    const depths: number[] = new Array(targetW * targetH);

    const baseElev = -(3800 + Math.sin(lat * 0.15) * Math.cos(lon * 0.15) * 600);
    let minD = Infinity;
    let maxD = -Infinity;
    let minE = Infinity;
    let maxE = -Infinity;

    for (let r = 0; r < targetH; r++) {
      const v = (r / Math.max(1, targetH - 1) - 0.5) * 2;
      for (let c = 0; c < targetW; c++) {
        const u = (c / Math.max(1, targetW - 1) - 0.5) * 2;
        const microRelief =
          Math.sin(u * 5 + lon * 0.1) * Math.cos(v * 4 + lat * 0.1) * 180 +
          Math.sin(u * 12 + v * 8) * 80;
        const elev = Math.round(baseElev + microRelief);
        const idx = r * targetW + c;
        elevationsMeters[idx] = elev;
        const depth = Math.max(0, -elev);
        depths[idx] = depth;

        if (depth < minD) minD = depth;
        if (depth > maxD) maxD = depth;
        if (elev < minE) minE = elev;
        if (elev > maxE) maxE = elev;
      }
    }

    const centerRow = Math.floor(targetH / 2);
    const centerCol = Math.floor(targetW / 2);
    const centerIdx = centerRow * targetW + centerCol;
    const centerElev = elevationsMeters[centerIdx] ?? -3800;
    const centerDepth = Math.max(0, -centerElev);
    const south = Math.max(-90, lat - span / 2);
    const north = Math.min(90, lat + span / 2);
    const west = normalizeLongitude(lon - span / 2);
    const east = normalizeLongitude(lon + span / 2);
    const sampledCoordinates = {
      latitude: Number(lat.toFixed(6)),
      longitude: normalizeLongitude(lon),
      rowIndex: centerRow,
      colIndex: centerCol
    };

    const datasetMeta: BathymetryDatasetMetadata = {
      id: `model-${lat.toFixed(3)}-${lon.toFixed(3)}`,
      name: 'MARIVEX Synthetic Parametric Terrain (Offline Fallback — Not Measured Bathymetry)',
      source: 'MARIVEX Synthetic Parametric Terrain (Offline Fallback — Not Measured Bathymetry)',
      organization: 'MARIVEX Offline Fallback Generator',
      version: 'Parametric v1',
      nativeResolutionArcSec: null,
      resolutionArcSec: 120,
      units: 'meters',
      verticalDatum: 'Mean Sea Level',
      coverage: 'sector',
      provenance: 'modelled',
      hasSignedElevations: true,
      elevationDataKind: 'modelled',
      isAuthoritative: false,
      isModeledFallback: true,
      valueType: 'modelled'
    };

    return {
      status: 'ok',
      requestedCoordinates: { latitude: lat, longitude: lon, spanDegrees: span },
      sampledCoordinates,
      dataset: datasetMeta,
      grid: {
        bounds: {
          west,
          south,
          east,
          north,
          minLat: south,
          maxLat: north,
          minLon: west,
          maxLon: east
        },
        hasSignedElevations: true,
        width: targetW,
        height: targetH,
        rowOrder: 'north-to-south',
        colOrder: 'west-to-east',
        elevationsMeters,
        noDataValue: null,
        validSampleCount: targetW * targetH,
        missingSampleCount: 0,
        minElevationMeters: minE,
        maxElevationMeters: maxE,
        centerElevationMeters: centerElev,
        minDepthMeters: minD,
        maxDepthMeters: maxD,
        centerDepthMeters: centerDepth,
        isLand: centerElev > 0,
        sampledCoordinates
      },
      warning: 'Authoritative local tiles and online bathymetry providers are unreachable for this sector. Displaying synthetic modelled terrain.',
      id: `model-${lat.toFixed(3)}-${lon.toFixed(3)}`,
      name: `Modelled Sector (${formatCoordinateString(lat, lon)})`,
      source: datasetMeta.name,
      resolutionArcSec: 120,
      bounds: { minLat: south, maxLat: north, minLon: west, maxLon: east },
      gridWidth: targetW,
      gridHeight: targetH,
      minDepth: minD,
      maxDepth: maxD,
      minElevation: minE,
      maxElevation: maxE,
      centerElevation: centerElev,
      centerDepth,
      isLand: centerElev > 0,
      hasSignedElevations: true,
      elevationDataKind: 'modelled',
      isAuthoritative: false,
      isModeledFallback: true,
      provenance: 'modelled',
      landmarks: [],
      elevations: depths,
      rawElevations: elevationsMeters
    };
  }
}

