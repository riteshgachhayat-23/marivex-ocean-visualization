import realPresetsJson from '../data/realBathymetryPresets.json';
import {
  gebcoGlobalTileLoader,
  validateCoordinates,
  normalizeLongitude,
  formatCoordinateString,
  doesTileCoverCoordinate
} from './gebcoGlobalTileLoader';

export {
  validateCoordinates,
  normalizeLongitude,
  formatCoordinateString,
  doesTileCoverCoordinate
};

export type BathymetryProvenance =
  | 'authoritative_local'
  | 'authoritative_online'
  | 'preset_regional'
  | 'modelled'
  | 'unavailable';

export interface BathymetricLandmark {
  id: string;
  name: string;
  type: 'trench' | 'seamount' | 'ridge' | 'basin' | 'vent' | 'shelf' | 'slope';
  lat: number;
  lon: number;
  depthMeters: number;
  description: string;
}

export interface BathymetryGridDataset {
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
  sampleBounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  sampleSpacingLat?: number;
  sampleSpacingLon?: number;
  gridWidth: number;
  gridHeight: number;
  elevations: Float32Array; // positive underwater depth in meters (>= 0, NaN for missing/no-data)
  rawElevations?: Float32Array; // signed elevation in meters (- below sea level, + above, NaN for missing)
  validSampleMask?: Uint8Array; // 1 = valid finite elevation sample, 0 = missing / no-data sample
  minDepth: number;
  maxDepth: number;
  minElevation?: number;
  maxElevation?: number;
  centerElevation?: number;
  centerDepth?: number;
  isLand?: boolean;
  hasSignedElevations?: boolean;
  elevationDataKind?: 'signed_land_and_ocean' | 'underwater_depth_only' | 'modelled';
  isAuthoritative?: boolean;
  isModeledFallback?: boolean;
  provenance?: BathymetryProvenance;
  missingSampleCount?: number;
  requestedCoordinates?: {
    latitude: number;
    longitude: number;
    spanDegrees: number;
  };
  sampledCoordinates?: {
    latitude: number;
    longitude: number;
    rowIndex?: number;
    colIndex?: number;
  };
  landmarks: BathymetricLandmark[];
}

export interface FetchBathymetryOptions {
  signal?: AbortSignal;
  mode?: 'auto' | 'real' | 'fallback';
  maxMeshDimension?: number;
  onPreviewDataset?: (preview: BathymetryGridDataset) => void;
}

interface RawPresetRecord {
  id: string;
  name: string;
  source: string;
  resolutionArcSec: number;
  provenance?: BathymetryProvenance;
  hasSignedElevations?: boolean;
  isAuthoritative?: boolean;
  isModeledFallback?: boolean;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  sampleBounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  sampleSpacingLat?: number;
  sampleSpacingLon?: number;
  rowOrder?: 'north-to-south' | 'south-to-north';
  colOrder?: 'west-to-east' | 'east-to-west';
  gridWidth: number;
  gridHeight: number;
  minDepth: number;
  maxDepth: number;
  minElevation?: number;
  maxElevation?: number;
  centerElevation?: number;
  centerDepth?: number;
  isLand?: boolean;
  missingSampleCount?: number;
  landmarks: BathymetricLandmark[];
  elevations: Array<number | null>;
  rawElevations?: Array<number | null>;
  dataset?: {
    id: string;
    name: string;
    source: string;
    provenance: BathymetryProvenance;
    hasSignedElevations?: boolean;
    elevationDataKind?: 'signed_land_and_ocean' | 'underwater_depth_only' | 'modelled';
    isAuthoritative: boolean;
    isModeledFallback: boolean;
    resolutionArcSec: number;
    verticalDatum: string;
    tileId: string | null;
    level: number | null;
  };
  grid?: {
    width: number;
    height: number;
    rowOrder: 'north-to-south' | 'south-to-north';
    colOrder: 'west-to-east';
    bounds: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
    };
    sampleBounds?: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
    };
    sampleSpacingLat?: number;
    sampleSpacingLon?: number;
    hasSignedElevations?: boolean;
    elevationsMeters: Array<number | null>;
    minElevationMeters: number;
    maxElevationMeters: number;
    centerElevationMeters: number | null;
    minDepthMeters: number;
    maxDepthMeters: number;
    centerDepthMeters: number | null;
    isLand: boolean;
    missingSampleCount: number;
    sampledCoordinates?: {
      latitude: number;
      longitude: number;
      rowIndex?: number;
      colIndex?: number;
    };
  };
  requestedCoordinates?: {
    latitude: number;
    longitude: number;
    spanDegrees: number;
  };
  sampledCoordinates?: {
    latitude: number;
    longitude: number;
    rowIndex?: number;
    colIndex?: number;
  };
}

const PRESETS_MAP = realPresetsJson as Record<string, RawPresetRecord>;

/** In-memory client cache of converted Float32Array datasets */
const datasetCache = new Map<string, BathymetryGridDataset>();

/** In-flight promise deduplication for identical coordinate/region queries */
const inFlightDatasetRequests = new Map<string, Promise<BathymetryGridDataset>>();

/**
 * Known geological landmarks mapped to bathymetric regions
 */
export const GEOLOGICAL_LANDMARKS: Record<string, BathymetricLandmark[]> = Object.fromEntries(
  Object.entries(PRESETS_MAP).map(([id, record]) => [id, record.landmarks])
);

/**
 * Converts a raw API response or preset record into a Float32Array-backed BathymetryGridDataset.
 * Supports both the standardized `/api/bathymetry` contract (`dataset` + `grid.elevationsMeters`)
 * and the legacy preset structure (`elevations` + `rawElevations`).
 * Explicitly marks regional JSON files without signed elevations as `hasSignedElevations: false`
 * (`elevationDataKind: 'underwater_depth_only'`).
 */
export function recordToDataset(raw: RawPresetRecord): BathymetryGridDataset {
  const gridBlock = raw.grid;
  const dsBlock = raw.dataset;

  const width = gridBlock?.width ?? raw.gridWidth;
  const height = gridBlock?.height ?? raw.gridHeight;
  const bounds = gridBlock?.bounds ?? raw.bounds;
  const sampleBounds = gridBlock?.sampleBounds ?? raw.sampleBounds ?? bounds;
  const sampleSpacingLat =
    gridBlock?.sampleSpacingLat ??
    raw.sampleSpacingLat ??
    (height > 1 ? Math.abs(sampleBounds.maxLat - sampleBounds.minLat) / (height - 1) : 0);
  const sampleSpacingLon =
    gridBlock?.sampleSpacingLon ??
    raw.sampleSpacingLon ??
    (width > 1 ? Math.abs(sampleBounds.maxLon - sampleBounds.minLon) / (width - 1) : 0);

  const signedSource: Array<number | null> | undefined =
    gridBlock?.elevationsMeters ?? raw.rawElevations;
  const depthSource: Array<number | null> | undefined = raw.elevations;
  const hasSignedElevations =
    typeof dsBlock?.hasSignedElevations === 'boolean'
      ? dsBlock.hasSignedElevations
      : typeof gridBlock?.hasSignedElevations === 'boolean'
        ? gridBlock.hasSignedElevations
        : typeof raw.hasSignedElevations === 'boolean'
          ? raw.hasSignedElevations
          : Array.isArray(signedSource);

  const totalSamples = width * height;
  const elevFloat = new Float32Array(totalSamples);
  const rawElevFloat = new Float32Array(totalSamples);
  const validSampleMask = new Uint8Array(totalSamples);

  let minD = Infinity;
  let maxD = -Infinity;
  let minE = Infinity;
  let maxE = -Infinity;
  let missingCount = 0;

  for (let i = 0; i < totalSamples; i++) {
    let signedVal: number | null = null;

    if (signedSource && i < signedSource.length) {
      const v = signedSource[i];
      if (v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) !== -32768) {
        const numV = Number(v);
        signedVal = Object.is(numV, -0) ? 0 : numV;
      }
    } else if (!signedSource && depthSource && i < depthSource.length) {
      const d = depthSource[i];
      if (d !== null && d !== undefined && Number.isFinite(Number(d)) && Number(d) !== -32768) {
        const numD = Number(d);
        if (numD >= 0) {
          signedVal = numD === 0 ? 0 : -Math.abs(numD);
        }
      }
    }

    if (signedVal === null) {
      rawElevFloat[i] = NaN;
      elevFloat[i] = NaN;
      validSampleMask[i] = 0;
      missingCount++;
      continue;
    }

    const depthVal = Math.max(0, -signedVal);
    rawElevFloat[i] = signedVal;
    elevFloat[i] = depthVal;
    validSampleMask[i] = 1;

    if (depthVal < minD) minD = depthVal;
    if (depthVal > maxD) maxD = depthVal;
    if (signedVal < minE) minE = signedVal;
    if (signedVal > maxE) maxE = signedVal;
  }

  const provenance: BathymetryProvenance =
    dsBlock?.provenance ??
    raw.provenance ??
    (raw.isModeledFallback
      ? 'modelled'
      : PRESETS_MAP[raw.id]
        ? 'preset_regional'
        : 'authoritative_online');

  const isModeledFallback =
    dsBlock?.isModeledFallback ?? raw.isModeledFallback ?? provenance === 'modelled';
  const isAuthoritative =
    dsBlock?.isAuthoritative ?? raw.isAuthoritative ?? !isModeledFallback;

  const centerElevation =
    gridBlock?.centerElevationMeters ??
    raw.centerElevation ??
    (raw.centerDepth !== undefined ? -raw.centerDepth : undefined);
  const centerDepth =
    gridBlock?.centerDepthMeters ??
    raw.centerDepth ??
    (centerElevation !== null && centerElevation !== undefined
      ? Math.max(0, -centerElevation)
      : undefined);

  const isLand = hasSignedElevations
    ? (gridBlock?.isLand ??
      raw.isLand ??
      (centerElevation !== undefined && centerElevation !== null ? centerElevation > 0 : false))
    : false;

  const elevationDataKind: 'signed_land_and_ocean' | 'underwater_depth_only' | 'modelled' =
    isModeledFallback
      ? 'modelled'
      : hasSignedElevations
        ? 'signed_land_and_ocean'
        : 'underwater_depth_only';

  const rawSourceLabel =
    dsBlock?.source ??
    raw.source ??
    'GEBCO / NOAA NCEI 1-Arc-Minute Bathymetric Grid (ETOPO)';
  const sourceLabel =
    !isModeledFallback && !hasSignedElevations && !rawSourceLabel.includes('Depth-Only')
      ? `${rawSourceLabel} (Underwater Depth-Only Regional Extract)`
      : rawSourceLabel;

  return {
    id: dsBlock?.id ?? raw.id,
    name: dsBlock?.name ?? raw.name,
    source: sourceLabel,
    resolutionArcSec: dsBlock?.resolutionArcSec ?? raw.resolutionArcSec ?? 60,
    bounds,
    sampleBounds,
    sampleSpacingLat,
    sampleSpacingLon,
    gridWidth: width,
    gridHeight: height,
    elevations: elevFloat,
    rawElevations: rawElevFloat,
    validSampleMask,
    minDepth: gridBlock?.minDepthMeters ?? raw.minDepth ?? (minD === Infinity ? 0 : minD),
    maxDepth: gridBlock?.maxDepthMeters ?? raw.maxDepth ?? (maxD === -Infinity ? 0 : maxD),
    minElevation:
      gridBlock?.minElevationMeters ??
      raw.minElevation ??
      (minE === Infinity ? -(raw.maxDepth || 0) : minE),
    maxElevation:
      gridBlock?.maxElevationMeters ??
      raw.maxElevation ??
      (maxE === -Infinity ? -(raw.minDepth || 0) : maxE),
    centerElevation: centerElevation ?? undefined,
    centerDepth: centerDepth ?? undefined,
    isLand,
    hasSignedElevations,
    elevationDataKind,
    isAuthoritative,
    isModeledFallback,
    provenance,
    missingSampleCount: gridBlock?.missingSampleCount ?? raw.missingSampleCount ?? missingCount,
    requestedCoordinates: raw.requestedCoordinates,
    sampledCoordinates: raw.sampledCoordinates ?? gridBlock?.sampledCoordinates,
    landmarks: raw.landmarks || []
  };
}

/**
 * Returns an authentic real-world bathymetric grid for a known preset region ID.
 * CRITICAL: Throws an explicit error if the regionId is unknown — NEVER silently returns Mariana Trench.
 */
export function getRealBathymetryDataset(regionId: string): BathymetryGridDataset {
  const normalizedId = (regionId || '').trim();
  const cached = datasetCache.get(`preset:${normalizedId}`);
  if (cached) return cached;

  const raw = PRESETS_MAP[normalizedId];
  if (!raw) {
    throw new Error(`Bathymetric preset dataset for region "${regionId}" was not found.`);
  }

  const dataset = recordToDataset({
    ...raw,
    provenance: 'preset_regional',
    isAuthoritative: true,
    isModeledFallback: false
  });
  datasetCache.set(`preset:${normalizedId}`, dataset);
  return dataset;
}

/**
 * Checks if a regionId exists in the bundled regional presets.
 */
export function hasBathymetryPreset(regionId: string): boolean {
  return Boolean(regionId && Object.prototype.hasOwnProperty.call(PRESETS_MAP, regionId));
}

/**
 * Finds a bundled regional preset that geographically covers (latitude, longitude), if any.
 * Returns null if the coordinate lies outside all 10 regional presets.
 */
export function findPresetCoveringCoordinates(
  latitude: number,
  longitude: number
): BathymetryGridDataset | null {
  const check = validateCoordinates(latitude, longitude);
  if (!check.valid || check.latitude === undefined || check.longitude === undefined) {
    return null;
  }

  for (const [id, raw] of Object.entries(PRESETS_MAP)) {
    if (doesTileCoverCoordinate(raw.bounds, check.latitude, check.longitude)) {
      const baseDs = getRealBathymetryDataset(id);
      const b = baseDs.sampleBounds || baseDs.bounds;
      const dLat =
        baseDs.sampleSpacingLat && baseDs.sampleSpacingLat > 0
          ? baseDs.sampleSpacingLat
          : baseDs.gridHeight > 1
            ? (b.maxLat - b.minLat) / (baseDs.gridHeight - 1)
            : 1;
      const dLon =
        baseDs.sampleSpacingLon && baseDs.sampleSpacingLon > 0
          ? baseDs.sampleSpacingLon
          : baseDs.gridWidth > 1
            ? (b.maxLon - b.minLon) / (baseDs.gridWidth - 1)
            : 1;
      const rowIndex = Math.min(
        baseDs.gridHeight - 1,
        Math.max(0, Math.round((b.maxLat - check.latitude) / Math.max(1e-9, dLat)))
      );
      const colIndex = Math.min(
        baseDs.gridWidth - 1,
        Math.max(0, Math.round((check.longitude - b.minLon) / Math.max(1e-9, dLon)))
      );
      const sampledLat = Number((b.maxLat - rowIndex * dLat).toFixed(6));
      const sampledLon = normalizeLongitude(b.minLon + colIndex * dLon);
      const idx = rowIndex * baseDs.gridWidth + colIndex;
      const rawVal = baseDs.rawElevations ? baseDs.rawElevations[idx] : -baseDs.elevations[idx];
      const hasVal = Number.isFinite(rawVal);

      return {
        ...baseDs,
        centerElevation: hasVal ? rawVal : baseDs.centerElevation,
        centerDepth: hasVal ? Math.max(0, -rawVal) : baseDs.centerDepth,
        isLand: hasVal ? rawVal > 0 : baseDs.isLand,
        requestedCoordinates: {
          latitude: check.latitude,
          longitude: check.longitude,
          spanDegrees: 1.2
        },
        sampledCoordinates: {
          latitude: sampledLat,
          longitude: sampledLon,
          rowIndex,
          colIndex
        }
      };
    }
  }
  return null;
}

/**
 * Synchronous backward-compatible generator for known preset regions.
 */
export function generateBathymetryGrid(
  regionId: string,
  _customBounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  _gridWidth?: number,
  _gridHeight?: number
): BathymetryGridDataset {
  return getRealBathymetryDataset(regionId);
}

/**
 * Unified, authoritative bathymetry data pipeline:
 * 1. Validates requested coordinates or preset region ID.
 * 2. Checks the local GEBCO/regional tile manifest via `gebcoGlobalTileLoader` for covering tiles
 *    (supporting progressive coarse-to-fine LOD preview when multi-level tiles are present).
 * 3. Queries the backend `/api/bathymetry` endpoint for arbitrary global ocean/coastal/land coordinates.
 * 4. Never silently replaces arbitrary coordinates with Mariana Trench (`mariana-trench`).
 */
export async function fetchRealBathymetryGrid(
  regionIdOrLat?: string | number,
  customCoordsOrLon?: { latitude: number; longitude: number; span?: number } | number,
  optionsOrSpan?: FetchBathymetryOptions | number,
  maybeOptions?: FetchBathymetryOptions
): Promise<BathymetryGridDataset> {
  let regionId: string | undefined;
  let customCoords: { latitude: number; longitude: number; span?: number } | undefined;
  let options: FetchBathymetryOptions = {};

  if (typeof regionIdOrLat === 'number' && typeof customCoordsOrLon === 'number') {
    const spanVal = typeof optionsOrSpan === 'number' ? optionsOrSpan : 1.2;
    customCoords = {
      latitude: regionIdOrLat,
      longitude: customCoordsOrLon,
      span: spanVal
    };
    options = (typeof optionsOrSpan === 'object' && optionsOrSpan !== null ? optionsOrSpan : maybeOptions) || {};
  } else {
    regionId = typeof regionIdOrLat === 'string' ? regionIdOrLat : undefined;
    customCoords =
      typeof customCoordsOrLon === 'object' && customCoordsOrLon !== null
        ? customCoordsOrLon
        : undefined;
    options = (typeof optionsOrSpan === 'object' && optionsOrSpan !== null ? optionsOrSpan : maybeOptions) || {};
  }

  const { signal, mode = 'auto', maxMeshDimension = 128, onPreviewDataset } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Bathymetry request was aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  let validatedCoords: { latitude: number; longitude: number; span: number } | undefined;
  if (customCoords) {
    const check = validateCoordinates(customCoords.latitude, customCoords.longitude);
    if (!check.valid || check.latitude === undefined || check.longitude === undefined) {
      throw new Error(check.error || 'Invalid geographic coordinates provided to fetchRealBathymetryGrid.');
    }
    const span = customCoords.span && Number.isFinite(customCoords.span) && customCoords.span > 0
      ? customCoords.span
      : 1.2;
    validatedCoords = {
      latitude: check.latitude,
      longitude: check.longitude,
      span
    };
  }

  const cleanRegionId = (regionId || '').trim();
  if (!validatedCoords && !cleanRegionId) {
    throw new Error('Either customCoords (latitude, longitude) or a valid regionId is required.');
  }

  const cacheKey = validatedCoords
    ? `coord:${validatedCoords.latitude.toFixed(5)},${validatedCoords.longitude.toFixed(5)}:${validatedCoords.span.toFixed(3)}:${mode}`
    : `region:${cleanRegionId}`;

  const inMem = datasetCache.get(cacheKey);
  if (inMem) return inMem;

  // Deduplicate identical concurrent requests when no AbortSignal is attached
  if (!signal) {
    const existingPromise = inFlightDatasetRequests.get(cacheKey);
    if (existingPromise) return existingPromise;
  }

  const executePipeline = async (): Promise<BathymetryGridDataset> => {
    if (signal?.aborted) {
      const abortErr = new Error('Bathymetry request was aborted.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    // STEP 1: Coordinate-based OR Region-ID lookup via unified GebcoGlobalTileLoader
    // (Prioritizes regenerated signed tiles in public/data/bathymetry/tiles/ over static bundled presets)
    if (mode !== 'fallback') {
      try {
        const manifest = await gebcoGlobalTileLoader.loadManifest(signal);
        if (validatedCoords) {
          const coveringTiles = gebcoGlobalTileLoader.findCoveringTiles(
            manifest,
            validatedCoords.latitude,
            validatedCoords.longitude
          );

          if (coveringTiles.length > 0) {
            // If a coarser overview tile (L0-L2) AND a finer tile (L3-L4) both cover the coordinate,
            // emit the coarse preview first if caller provided onPreviewDataset.
            const coarseTile = coveringTiles.find(t => (t.level ?? 4) <= 2);
            const bestTile = coveringTiles[0];

            if (onPreviewDataset && coarseTile && coarseTile.id !== bestTile.id) {
              try {
                const coarseDecoded = await gebcoGlobalTileLoader.fetchTile(coarseTile, signal);
                const previewDs = gebcoGlobalTileLoader.buildMeshDataset(
                  coarseDecoded,
                  Math.min(64, maxMeshDimension),
                  undefined,
                  validatedCoords
                );
                onPreviewDataset(previewDs);
              } catch {
                // Ignore preview error and proceed to best tile
              }
            }

            const decoded = await gebcoGlobalTileLoader.fetchTile(bestTile, signal);
            const dataset = gebcoGlobalTileLoader.buildMeshDataset(
              decoded,
              maxMeshDimension,
              undefined,
              validatedCoords
            );
            dataset.requestedCoordinates = {
              latitude: validatedCoords.latitude,
              longitude: validatedCoords.longitude,
              spanDegrees: validatedCoords.span
            };
            datasetCache.set(cacheKey, dataset);
            return dataset;
          }
        } else if (cleanRegionId) {
          const matchingTile = manifest.tiles.find(t => t.id === cleanRegionId);
          if (matchingTile) {
            const decoded = await gebcoGlobalTileLoader.fetchTile(matchingTile, signal);
            const dataset = gebcoGlobalTileLoader.buildMeshDataset(
              decoded,
              maxMeshDimension,
              GEOLOGICAL_LANDMARKS[cleanRegionId]
            );
            datasetCache.set(cacheKey, dataset);
            datasetCache.set(`preset:${cleanRegionId}`, dataset);
            return dataset;
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        // Proceed to backend /api/bathymetry lookup
      }
    }

    // STEP 2: Query backend `/api/bathymetry` endpoint (supports local tiles, NOAA ERDDAP ETOPO1, GMRT, or labelled fallback)
    try {
      const params = new URLSearchParams();
      if (validatedCoords) {
        params.set('lat', String(validatedCoords.latitude));
        params.set('lon', String(validatedCoords.longitude));
        params.set('span', String(validatedCoords.span));
      } else if (cleanRegionId) {
        params.set('regionId', cleanRegionId);
      }
      if (mode !== 'auto') {
        params.set('mode', mode);
      }
      if (maxMeshDimension) {
        params.set('maxDimension', String(maxMeshDimension));
      }

      const response = await fetch(`/api/bathymetry?${params.toString()}`, { signal });
      if (response.ok) {
        const data = await response.json();
        const hasGridSamples =
          (data?.grid && Array.isArray(data.grid.elevationsMeters) && data.grid.elevationsMeters.length > 0) ||
          (Array.isArray(data?.elevations) && data.elevations.length > 0);

        if (hasGridSamples) {
          const dataset = recordToDataset(data);
          if (validatedCoords && !dataset.requestedCoordinates) {
            dataset.requestedCoordinates = {
              latitude: validatedCoords.latitude,
              longitude: validatedCoords.longitude,
              spanDegrees: validatedCoords.span
            };
          }
          datasetCache.set(cacheKey, dataset);
          if (cleanRegionId && !validatedCoords) {
            datasetCache.set(`preset:${cleanRegionId}`, dataset);
          }
          return dataset;
        }
      } else if (response.status === 400 || response.status === 404 || response.status === 503) {
        const errBody = await response.json().catch(() => ({}));
        if (mode === 'real' || response.status === 400) {
          throw new Error(errBody.error || `Bathymetry request failed with HTTP ${response.status}`);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      if (mode === 'real') throw err;
      console.warn(
        `[MARIVEX] /api/bathymetry unreachable for ${
          validatedCoords
            ? formatCoordinateString(validatedCoords.latitude, validatedCoords.longitude)
            : cleanRegionId
        }:`,
        err
      );
    }

    // STEP 3: Offline fallback handling — NEVER silently return Mariana Trench for a different coordinate!
    if (validatedCoords) {
      const coveringPreset = findPresetCoveringCoordinates(
        validatedCoords.latitude,
        validatedCoords.longitude
      );
      if (coveringPreset) {
        datasetCache.set(cacheKey, coveringPreset);
        return coveringPreset;
      }

      if (mode === 'real') {
        throw new Error(
          `Authoritative bathymetry is unavailable offline for ${formatCoordinateString(
            validatedCoords.latitude,
            validatedCoords.longitude
          )}.`
        );
      }

      // Generate an explicitly labeled offline modelled sector centered on the exact requested coordinates
      const offlineModelled = createClientOfflineModelledDataset(
        validatedCoords.latitude,
        validatedCoords.longitude,
        validatedCoords.span
      );
      datasetCache.set(cacheKey, offlineModelled);
      return offlineModelled;
    }

    // Explicit preset region lookup (throws if cleanRegionId is invalid; never falls back to mariana-trench)
    return getRealBathymetryDataset(cleanRegionId);
  };

  if (signal) {
    return executePipeline();
  }

  const promise = executePipeline();
  inFlightDatasetRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightDatasetRequests.delete(cacheKey);
  }
}

/**
 * Generates an explicitly labeled client-side modelled bathymetry grid centered on (lat, lon)
 * ONLY when both local tiles and the backend server are unreachable in offline mode.
 * Clearly sets `provenance: 'modelled'` and `isModeledFallback: true` so the UI never claims it is real GEBCO data.
 */
function createClientOfflineModelledDataset(
  lat: number,
  lon: number,
  span: number
): BathymetryGridDataset {
  const halfSpan = span / 2;
  const minLat = Math.max(-90, lat - halfSpan);
  const maxLat = Math.min(90, lat + halfSpan);
  const minLon = normalizeLongitude(lon - halfSpan);
  const maxLon = normalizeLongitude(lon + halfSpan);

  const gridSize = 49;
  const total = gridSize * gridSize;
  const elevations = new Float32Array(total);
  const rawElevations = new Float32Array(total);

  const seed = Math.abs(Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453);
  const baseDepth = 1800 + (seed - Math.floor(seed)) * 3200;

  let minD = Infinity;
  let maxD = -Infinity;

  for (let iy = 0; iy < gridSize; iy++) {
    const v = iy / (gridSize - 1);
    const sampleLat = maxLat - v * (maxLat - minLat);
    for (let ix = 0; ix < gridSize; ix++) {
      const u = ix / (gridSize - 1);
      const sampleLon = minLon + u * (maxLon - minLon);

      const ridge = Math.sin(sampleLat * 6.0 + seed) * Math.cos(sampleLon * 6.0 - seed) * 420;
      const detail = Math.sin(sampleLat * 18.0 - sampleLon * 14.0) * 140;
      const depth = Math.max(80, Math.round(baseDepth + ridge + detail));
      const signed = -depth;

      const idx = iy * gridSize + ix;
      elevations[idx] = depth;
      rawElevations[idx] = signed;

      if (depth < minD) minD = depth;
      if (depth > maxD) maxD = depth;
    }
  }

  const centerIdx = Math.floor(gridSize / 2) * gridSize + Math.floor(gridSize / 2);
  const centerDepth = elevations[centerIdx];
  const centerElevation = rawElevations[centerIdx];
  const coordLabel = formatCoordinateString(lat, lon);

  return {
    id: `custom-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    name: `Ocean Sector (${coordLabel})`,
    source: 'Procedural Bathymetric Synthesis (Offline Modelled Fallback — Non-Authoritative)',
    resolutionArcSec: Math.round((span * 3600) / (gridSize - 1)),
    bounds: { minLat, maxLat, minLon, maxLon },
    gridWidth: gridSize,
    gridHeight: gridSize,
    elevations,
    rawElevations,
    validSampleMask: new Uint8Array(total).fill(1),
    minDepth: minD === Infinity ? 0 : minD,
    maxDepth: maxD === -Infinity ? 0 : maxD,
    minElevation: -maxD,
    maxElevation: -minD,
    centerElevation,
    centerDepth,
    isLand: false,
    isAuthoritative: false,
    isModeledFallback: true,
    provenance: 'modelled',
    missingSampleCount: 0,
    requestedCoordinates: {
      latitude: lat,
      longitude: lon,
      spanDegrees: span
    },
    landmarks: [
      {
        id: `lm-offline-${lat.toFixed(2)}-${lon.toFixed(2)}`,
        name: `Modelled Seafloor Center (${coordLabel})`,
        type: 'basin',
        lat,
        lon,
        depthMeters: centerDepth,
        description: `Modelled seafloor estimate at ${coordLabel} (authoritative server offline).`
      }
    ]
  };
}
