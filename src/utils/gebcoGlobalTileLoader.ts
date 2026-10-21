/**
 * MARIVEX — Global GEBCO 2026 Binary Tile Loader
 * 
 * Provides on-demand, multiresolution loading of the complete global GEBCO 2026 sub-ice
 * bathymetry dataset (471 tiles, L0-L4, signed Int16 little-endian elevation values).
 * 
 * Coordinate & Data Conventions:
 * - Geographic bounds: Longitude -180° to +180°, Latitude -90° to +90°
 * - Tile data: Int16 LE elevation in meters (Negative = below sea level, Positive = land, 0 = sea level)
 * - Source array row order: South to North, West to East
 * - Three.js terrain layout: North to South (row 0 at North), West to East (col 0 at West)
 * - Underwater depth (m): max(0, -elevation)
 */

import { BathymetricLandmark, BathymetryGridDataset } from './bathymetryGridBuilder';

export interface GebcoManifestTile {
  id: string;
  file: string;
  level: number; // 0 (global overview) to 4 (native 15-arc-sec)
  stride: number; // 240, 60, 16, 4, 1
  gridWidth: number;
  gridHeight: number;
  sourceLatStart: number;
  sourceLatEndExclusive: number;
  sourceLonStart: number;
  sourceLonEndExclusive: number;
  minElevation: number;
  maxElevation: number;
  format?: string;
  // Normalized geographic bounds in degrees (-90 to +90, -180 to +180)
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

export interface GebcoManifest {
  dataset?: string;
  version?: string;
  verticalDatum?: string;
  gridIntervalArcSec?: number;
  totalTiles?: number;
  tiles: GebcoManifestTile[];
}

export interface TileQueryOptions {
  preferredLevel?: number; // 0 to 4 (default: auto based on coverage)
  maxMeshDimension?: number; // max width/height for Three.js geometry mesh (default: 128)
  signal?: AbortSignal;
}

export interface DecodedGebcoTile {
  manifestTile: GebcoManifestTile;
  gridWidth: number;
  gridHeight: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  // Native Int16 elevation in meters (Negative = underwater, Positive = land)
  rawElevations: Int16Array;
  // Positive depths for 3D terrain rendering (0 for land)
  depths: Float32Array;
  minDepth: number;
  maxDepth: number;
  minElevation: number;
  maxElevation: number;
  sampleElevationAt(lat: number, lon: number): { elevation: number; depth: number; isLand: boolean };
}

// Global grid constants
const TOTAL_SOURCE_ROWS = 43200; // 180 degrees at 15 arc-seconds (1/240 deg)
const TOTAL_SOURCE_COLS = 86400; // 360 degrees at 15 arc-seconds (1/240 deg)
const MAX_CACHE_TILES = 12; // in-memory LRU cache limit

class GebcoGlobalTileLoader {
  private manifest: GebcoManifest | null = null;
  private manifestPromise: Promise<GebcoManifest> | null = null;
  private tileCache = new Map<string, DecodedGebcoTile>();
  private inFlightRequests = new Map<string, Promise<DecodedGebcoTile>>();
  private storageBaseUrl: string;

  constructor() {
    // Configurable base URL: environment variable or relative origin
    const envUrl = (import.meta as any).env?.VITE_GEBCO_STORAGE_URL;
    this.storageBaseUrl = envUrl ? envUrl.replace(/\/+$/, '') : '';
  }

  /**
   * Set custom storage base URL at runtime (e.g. for user-configured R2 / Firebase CDN)
   */
  public setStorageBaseUrl(url: string) {
    this.storageBaseUrl = url.replace(/\/+$/, '');
    this.manifest = null;
    this.manifestPromise = null;
    this.tileCache.clear();
  }

  public getStorageBaseUrl(): string {
    return this.storageBaseUrl;
  }

  /**
   * Normalize longitude to [-180, 180] degrees.
   * Handles 180° antimeridian and out-of-range degrees.
   */
  public normalizeLongitude(lon: number): number {
    let n = ((lon + 180) % 360 + 360) % 360 - 180;
    // Edge case: exactly 180 or -180
    if (n === -180 && lon > 0) n = 180;
    return n;
  }

  /**
   * Clamp latitude to [-90, 90] degrees.
   */
  public clampLatitude(lat: number): number {
    return Math.max(-90, Math.min(90, lat));
  }

  /**
   * Converts manifest tile source boundaries to geographic degrees [-90..90, -180..180].
   * Handles both index coordinates [0..43200, 0..86400] and direct degree coordinates.
   */
  public normalizeTileBounds(tile: Partial<GebcoManifestTile>): {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } {
    let minLat: number;
    let maxLat: number;
    let minLon: number;
    let maxLon: number;

    const latStart = tile.sourceLatStart ?? -90;
    const latEnd = tile.sourceLatEndExclusive ?? 90;
    const lonStart = tile.sourceLonStart ?? -180;
    const lonEnd = tile.sourceLonEndExclusive ?? 180;

    // Check if bounds are index-based [0..43200]
    if (Math.abs(latStart) > 90 || Math.abs(latEnd) > 90) {
      minLat = -90 + (latStart / TOTAL_SOURCE_ROWS) * 180;
      maxLat = -90 + (latEnd / TOTAL_SOURCE_ROWS) * 180;
    } else {
      minLat = Math.min(latStart, latEnd);
      maxLat = Math.max(latStart, latEnd);
    }

    // Check if bounds are index-based [0..86400]
    if (Math.abs(lonStart) > 180 || Math.abs(lonEnd) > 180) {
      minLon = -180 + (lonStart / TOTAL_SOURCE_COLS) * 360;
      maxLon = -180 + (lonEnd / TOTAL_SOURCE_COLS) * 360;
    } else {
      minLon = Math.min(lonStart, lonEnd);
      maxLon = Math.max(lonStart, lonEnd);
    }

    return {
      minLat: Number(minLat.toFixed(6)),
      maxLat: Number(maxLat.toFixed(6)),
      minLon: Number(minLon.toFixed(6)),
      maxLon: Number(maxLon.toFixed(6))
    };
  }

  /**
   * Loads and caches the global GEBCO 2026 manifest.
   */
  public async loadManifest(signal?: AbortSignal): Promise<GebcoManifest> {
    if (this.manifest) return this.manifest;
    if (this.manifestPromise) return this.manifestPromise;

    this.manifestPromise = (async () => {
      const candidates: string[] = [];

      if (this.storageBaseUrl) {
        candidates.push(`${this.storageBaseUrl}/manifest.json`);
      }
      candidates.push('/api/bathymetry/manifest');
      candidates.push('/data/bathymetry/manifest.json');
      candidates.push('/data/gebco_tiles/manifest.json');

      let lastError: Error | null = null;

      for (const url of candidates) {
        try {
          const res = await fetch(url, { signal });
          if (res.ok) {
            const raw = await res.json();
            const tiles: GebcoManifestTile[] = (raw.tiles || []).map((t: any) => {
              const bounds = t.bounds || this.normalizeTileBounds(t);
              return {
                ...t,
                bounds,
                level: typeof t.level === 'number' ? t.level : (t.stride >= 240 ? 0 : t.stride >= 60 ? 1 : t.stride >= 16 ? 2 : t.stride >= 4 ? 3 : 4)
              };
            });

            this.manifest = {
              dataset: raw.dataset || 'GEBCO_2026 Sub-Ice Global Bathymetric Grid',
              version: raw.version || '2026',
              verticalDatum: raw.verticalDatum || 'Mean Sea Level (metres)',
              gridIntervalArcSec: raw.gridIntervalArcSec || 15,
              totalTiles: tiles.length,
              tiles
            };

            return this.manifest;
          }
        } catch (err: any) {
          if (err.name === 'AbortError') throw err;
          lastError = err;
        }
      }

      throw lastError || new Error('Failed to load GEBCO 2026 manifest from available endpoints.');
    })();

    try {
      return await this.manifestPromise;
    } finally {
      this.manifestPromise = null;
    }
  }

  /**
   * Locates the optimal tile covering the requested geographic coordinates.
   * Supports level of detail selection (L0 to L4).
   */
  public findCoveringTile(
    manifest: GebcoManifest,
    latitude: number,
    longitude: number,
    preferredLevel?: number
  ): GebcoManifestTile | null {
    const lat = this.clampLatitude(latitude);
    const lon = this.normalizeLongitude(longitude);
    const eps = 1e-6; // Boundary tolerance

    // Candidate levels in descending order of preference
    const targetLevels = preferredLevel !== undefined
      ? [preferredLevel, 4, 3, 2, 1, 0].filter((v, idx, arr) => arr.indexOf(v) === idx)
      : [4, 3, 2, 1, 0];

    for (const lvl of targetLevels) {
      const candidates = manifest.tiles.filter(t => t.level === lvl);
      for (const tile of candidates) {
        const b = tile.bounds;
        if (
          lat >= b.minLat - eps &&
          lat <= b.maxLat + eps &&
          lon >= b.minLon - eps &&
          lon <= b.maxLon + eps
        ) {
          return tile;
        }
      }
    }

    // Fallback: check any level that covers the coordinate
    for (const tile of manifest.tiles) {
      const b = tile.bounds;
      if (
        lat >= b.minLat - eps &&
        lat <= b.maxLat + eps &&
        lon >= b.minLon - eps &&
        lon <= b.maxLon + eps
      ) {
        return tile;
      }
    }

    // Default to first overview tile if available
    return manifest.tiles[0] || null;
  }

  /**
   * Fetches and decodes a binary Int16 tile into a DecodedGebcoTile.
   */
  public async fetchTile(tile: GebcoManifestTile, signal?: AbortSignal): Promise<DecodedGebcoTile> {
    const cacheKey = tile.id || tile.file;
    const cached = this.tileCache.get(cacheKey);
    if (cached) return cached;

    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) return inFlight;

    const fetchPromise = (async () => {
      // Build candidate URLs
      const urls: string[] = [];
      if (/^https?:\/\//i.test(tile.file)) {
        urls.push(tile.file);
      } else {
        if (this.storageBaseUrl) {
          urls.push(`${this.storageBaseUrl}/${tile.file.replace(/^\/+/, '')}`);
        }
        urls.push(`/data/bathymetry/${tile.file.replace(/^\/+/, '')}`);
        urls.push(`/data/gebco_tiles/${tile.file.replace(/^\/+/, '')}`);
        urls.push(`/api/bathymetry?tileId=${encodeURIComponent(tile.id)}`);
      }

      let arrayBuffer: ArrayBuffer | null = null;
      let lastErr: Error | null = null;

      for (const url of urls) {
        try {
          const res = await fetch(url, { signal });
          if (res.ok) {
            arrayBuffer = await res.arrayBuffer();
            break;
          }
        } catch (e: any) {
          if (e.name === 'AbortError') throw e;
          lastErr = e;
        }
      }

      if (!arrayBuffer) {
        throw lastErr || new Error(`Could not retrieve GEBCO tile ${tile.id} (${tile.file}).`);
      }

      // Validate byte length against expected dimensions: gridWidth * gridHeight * 2 bytes (Int16)
      const expectedBytes = tile.gridWidth * tile.gridHeight * 2;
      let rawElevations: Int16Array;

      if (arrayBuffer.byteLength === expectedBytes) {
        // Native binary Int16 little-endian
        rawElevations = this.decodeInt16LE(arrayBuffer);
      } else {
        // Handle JSON fallback if tile was served as JSON format
        try {
          const text = new TextDecoder('utf-8').decode(arrayBuffer);
          const json = JSON.parse(text);
          if (Array.isArray(json.elevations)) {
            rawElevations = new Int16Array(json.elevations.length);
            for (let i = 0; i < json.elevations.length; i++) {
              rawElevations[i] = -json.elevations[i]; // JSON stored positive depth
            }
          } else {
            throw new Error(`Unexpected tile payload size (${arrayBuffer.byteLength} bytes vs expected ${expectedBytes} bytes).`);
          }
        } catch {
          throw new Error(`Invalid tile file size for ${tile.id}: received ${arrayBuffer.byteLength} bytes, expected ${expectedBytes} bytes.`);
        }
      }

      // Convert raw elevations to positive underwater depths and compute min/max
      const totalPoints = tile.gridWidth * tile.gridHeight;
      const depths = new Float32Array(totalPoints);
      let minDepth = Infinity;
      let maxDepth = -Infinity;
      let minElevation = Infinity;
      let maxElevation = -Infinity;

      for (let i = 0; i < totalPoints; i++) {
        const elev = rawElevations[i];
        if (elev < minElevation) minElevation = elev;
        if (elev > maxElevation) maxElevation = elev;

        const depth = Math.max(0, -elev);
        depths[i] = depth;
        if (depth < minDepth) minDepth = depth;
        if (depth > maxDepth) maxDepth = depth;
      }

      const decoded: DecodedGebcoTile = {
        manifestTile: tile,
        gridWidth: tile.gridWidth,
        gridHeight: tile.gridHeight,
        bounds: tile.bounds,
        rawElevations,
        depths,
        minDepth: minDepth === Infinity ? 0 : minDepth,
        maxDepth: maxDepth === -Infinity ? 0 : maxDepth,
        minElevation: minElevation === Infinity ? 0 : minElevation,
        maxElevation: maxElevation === -Infinity ? 0 : maxElevation,
        sampleElevationAt: (lat: number, lon: number) => {
          return this.sampleTileElevation(decoded, lat, lon);
        }
      };

      // Manage LRU cache size
      if (this.tileCache.size >= MAX_CACHE_TILES) {
        const oldestKey = this.tileCache.keys().next().value;
        if (oldestKey) this.tileCache.delete(oldestKey);
      }

      this.tileCache.set(cacheKey, decoded);
      return decoded;
    })();

    this.inFlightRequests.set(cacheKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  /**
   * Decodes an ArrayBuffer into signed Int16 array adhering strictly to Little-Endian convention.
   */
  public decodeInt16LE(buffer: ArrayBuffer): Int16Array {
    const int16 = new Int16Array(buffer.byteLength / 2);
    const view = new DataView(buffer);
    for (let i = 0; i < int16.length; i++) {
      int16[i] = view.getInt16(i * 2, true); // true = Little-Endian
    }
    return int16;
  }

  /**
   * Precise coordinate to grid index sampling with South-to-North binary row ordering.
   */
  public sampleTileElevation(
    tile: DecodedGebcoTile,
    latitude: number,
    longitude: number
  ): { elevation: number; depth: number; isLand: boolean } {
    const lat = this.clampLatitude(latitude);
    const lon = this.normalizeLongitude(longitude);
    const b = tile.bounds;

    const latSpan = b.maxLat - b.minLat;
    const lonSpan = b.maxLon - b.minLon;

    // Fractional position in tile (0 to 1)
    const u = lonSpan > 0 ? Math.min(1, Math.max(0, (lon - b.minLon) / lonSpan)) : 0.5;
    const v = latSpan > 0 ? Math.min(1, Math.max(0, (lat - b.minLat) / latSpan)) : 0.5;

    // Source data is ordered South-to-North (row 0 at south, row gridHeight - 1 at north)
    const colIdx = Math.min(tile.gridWidth - 1, Math.max(0, Math.round(u * (tile.gridWidth - 1))));
    const rowIdx = Math.min(tile.gridHeight - 1, Math.max(0, Math.round(v * (tile.gridHeight - 1))));

    const sampleIdx = rowIdx * tile.gridWidth + colIdx;
    const elev = tile.rawElevations[sampleIdx] ?? 0;
    const depth = Math.max(0, -elev);

    return {
      elevation: elev,
      depth,
      isLand: elev > 0
    };
  }

  /**
   * Converts a DecodedGebcoTile into the Three.js BathymetryGridDataset representation.
   * Applies North-to-South row ordering for the 3D surface mesh.
   */
  public buildMeshDataset(
    tile: DecodedGebcoTile,
    maxMeshDimension = 128,
    landmarks: BathymetricLandmark[] = []
  ): BathymetryGridDataset {
    const srcW = tile.gridWidth;
    const srcH = tile.gridHeight;

    // Downsample stride if tile resolution exceeds GPU mesh size
    const strideX = Math.max(1, Math.ceil(srcW / maxMeshDimension));
    const strideY = Math.max(1, Math.ceil(srcH / maxMeshDimension));

    const meshW = Math.ceil(srcW / strideX);
    const meshH = Math.ceil(srcH / strideY);
    const totalVertices = meshW * meshH;

    const elevations = new Float32Array(totalVertices);
    let minD = Infinity;
    let maxD = -Infinity;

    // Invert vertical axis: iy = 0 is North (v=1), iy = meshH - 1 is South (v=0)
    for (let iy = 0; iy < meshH; iy++) {
      const srcRow = Math.min(srcH - 1, (meshH - 1 - iy) * strideY); // flip South-to-North to North-to-South

      for (let ix = 0; ix < meshW; ix++) {
        const srcCol = Math.min(srcW - 1, ix * strideX);
        const srcIdx = srcRow * srcW + srcCol;
        const rawElev = tile.rawElevations[srcIdx];
        const depth = Math.max(0, -rawElev);

        const outIdx = iy * meshW + ix;
        elevations[outIdx] = depth;

        if (depth < minD) minD = depth;
        if (depth > maxD) maxD = depth;
      }
    }

    return {
      id: tile.manifestTile.id,
      name: `${tile.manifestTile.id} (GEBCO 2026 L${tile.manifestTile.level})`,
      source: `GEBCO_2026 Sub-Ice Global Bathymetric Grid (L${tile.manifestTile.level} · 15" stride ${tile.manifestTile.stride})`,
      resolutionArcSec: 15 * tile.manifestTile.stride,
      bounds: tile.bounds,
      gridWidth: meshW,
      gridHeight: meshH,
      elevations,
      minDepth: minD === Infinity ? 0 : minD,
      maxDepth: maxD === -Infinity ? 0 : maxD,
      landmarks
    };
  }

  /**
   * High-level entry point: Given coordinates and options, returns a complete 3D mesh dataset
   * backed by authentic GEBCO 2026 elevations.
   */
  public async loadDatasetForCoordinates(
    latitude: number,
    longitude: number,
    options: TileQueryOptions = {}
  ): Promise<{
    dataset: BathymetryGridDataset;
    decodedTile: DecodedGebcoTile;
    sampledAtCenter: { elevation: number; depth: number; isLand: boolean };
  }> {
    const manifest = await this.loadManifest(options.signal);
    const tile = this.findCoveringTile(manifest, latitude, longitude, options.preferredLevel);

    if (!tile) {
      throw new Error(`No GEBCO 2026 tile found covering coordinates ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°.`);
    }

    const decoded = await this.fetchTile(tile, options.signal);
    const sampled = decoded.sampleElevationAt(latitude, longitude);
    const dataset = this.buildMeshDataset(decoded, options.maxMeshDimension || 128);

    return {
      dataset,
      decodedTile: decoded,
      sampledAtCenter: sampled
    };
  }
}

export const gebcoGlobalTileLoader = new GebcoGlobalTileLoader();
export default gebcoGlobalTileLoader;
