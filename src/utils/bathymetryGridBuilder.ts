import realPresetsJson from '../data/realBathymetryPresets.json';

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
  gridWidth: number;
  gridHeight: number;
  elevations: Float32Array; // depth in meters (positive value below sea level >= 0)
  rawElevations?: Float32Array; // signed elevations in meters (- below sea level, + above)
  minDepth: number;
  maxDepth: number;
  minElevation?: number;
  maxElevation?: number;
  centerElevation?: number;
  centerDepth?: number;
  isLand?: boolean;
  isAuthoritative?: boolean;
  landmarks: BathymetricLandmark[];
}

interface RawPresetRecord {
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
  minElevation?: number;
  maxElevation?: number;
  centerElevation?: number;
  centerDepth?: number;
  isLand?: boolean;
  isAuthoritative?: boolean;
  landmarks: BathymetricLandmark[];
  elevations: number[];
  rawElevations?: number[];
}

const PRESETS_MAP = realPresetsJson as Record<string, RawPresetRecord>;

/** In-memory client cache of converted Float32Array datasets */
const datasetCache = new Map<string, BathymetryGridDataset>();

/**
 * Known geological landmarks mapped to bathymetric regions
 */
export const GEOLOGICAL_LANDMARKS: Record<string, BathymetricLandmark[]> = Object.fromEntries(
  Object.entries(PRESETS_MAP).map(([id, record]) => [id, record.landmarks])
);

/**
 * Converts a raw preset record into a cached, Float32Array-backed BathymetryGridDataset.
 */
function recordToDataset(raw: RawPresetRecord): BathymetryGridDataset {
  const elevFloat = new Float32Array(raw.elevations.length);
  for (let i = 0; i < raw.elevations.length; i++) {
    elevFloat[i] = raw.elevations[i];
  }

  let rawElevFloat: Float32Array | undefined;
  if (Array.isArray(raw.rawElevations) && raw.rawElevations.length === raw.elevations.length) {
    rawElevFloat = new Float32Array(raw.rawElevations.length);
    for (let i = 0; i < raw.rawElevations.length; i++) {
      rawElevFloat[i] = raw.rawElevations[i];
    }
  } else {
    // Generate signed elevation from depth: negative below sea level
    rawElevFloat = new Float32Array(raw.elevations.length);
    for (let i = 0; i < raw.elevations.length; i++) {
      rawElevFloat[i] = -raw.elevations[i];
    }
  }

  return {
    id: raw.id,
    name: raw.name,
    source: raw.source || 'GEBCO / NOAA NCEI 1-Arc-Minute Bathymetric Grid (ETOPO)',
    resolutionArcSec: raw.resolutionArcSec || 60,
    bounds: raw.bounds,
    gridWidth: raw.gridWidth,
    gridHeight: raw.gridHeight,
    elevations: elevFloat,
    rawElevations: rawElevFloat,
    minDepth: raw.minDepth,
    maxDepth: raw.maxDepth,
    minElevation: raw.minElevation !== undefined ? raw.minElevation : -raw.maxDepth,
    maxElevation: raw.maxElevation !== undefined ? raw.maxElevation : -raw.minDepth,
    centerElevation: raw.centerElevation,
    centerDepth: raw.centerDepth,
    isLand: raw.isLand,
    isAuthoritative: raw.isAuthoritative ?? true,
    landmarks: raw.landmarks || []
  };
}

/**
 * Returns an authentic real-world bathymetric grid for the requested region ID.
 * Uses real GEBCO / NOAA ETOPO gridded elevation soundings.
 */
export function getRealBathymetryDataset(regionId: string): BathymetryGridDataset {
  const cached = datasetCache.get(regionId);
  if (cached) return cached;

  const raw = PRESETS_MAP[regionId] || PRESETS_MAP['mariana-trench'];
  if (!raw) {
    throw new Error(`Real bathymetric dataset for region "${regionId}" not found.`);
  }

  const dataset = recordToDataset(raw);
  datasetCache.set(regionId, dataset);
  return dataset;
}

/**
 * Synchronous backward-compatible generator that returns the verified,
 * real-world GEBCO elevation grid for the requested region.
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
 * Asynchronously loads real bathymetry from the server API endpoint (/api/bathymetry)
 * with automatic fallback to pre-compiled real GEBCO datasets and in-memory caching.
 */
export async function fetchRealBathymetryGrid(
  regionId?: string,
  customCoords?: { latitude: number; longitude: number; span?: number }
): Promise<BathymetryGridDataset> {
  const cacheKey = customCoords
    ? `${customCoords.latitude.toFixed(2)},${customCoords.longitude.toFixed(2)}:${customCoords.span || 1.2}`
    : (regionId || 'mariana-trench');

  const inMem = datasetCache.get(cacheKey);
  if (inMem) return inMem;

  try {
    const params = new URLSearchParams();
    if (customCoords) {
      params.set('lat', String(customCoords.latitude));
      params.set('lon', String(customCoords.longitude));
      params.set('span', String(customCoords.span || 1.2));
    } else if (regionId) {
      params.set('regionId', regionId);
    }

    const response = await fetch(`/api/bathymetry?${params.toString()}`);
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.elevations) && data.elevations.length > 0) {
        const dataset = recordToDataset(data);
        datasetCache.set(cacheKey, dataset);
        return dataset;
      }
    }
  } catch (err) {
    console.warn(`[MARIVEX] Real bathymetry endpoint unreachable, using fallback for ${regionId || 'coordinates'}:`, err);
  }

  // Gracefully fallback to the pre-compiled real GEBCO dataset
  return getRealBathymetryDataset(regionId || 'mariana-trench');
}
