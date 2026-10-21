import fs from 'fs';
import path from 'path';

export interface GebcoTileEntry {
  id: string;
  name?: string;
  file: string;
  level?: number;
  stride?: number;
  gridWidth: number;
  gridHeight: number;
  sourceLatStart?: number;
  sourceLatEndExclusive?: number;
  sourceLonStart?: number;
  sourceLonEndExclusive?: number;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  minDepth?: number;
  maxDepth?: number;
  minElevation?: number;
  maxElevation?: number;
  format?: 'int16' | 'json';
  landmarksCount?: number;
  landmarks?: any[];
}

export interface GebcoManifest {
  dataset: string;
  version: string;
  tiles: GebcoTileEntry[];
}

export interface BathymetryResult {
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
  isModeledFallback?: boolean;
  landmarks: any[];
  elevations: number[]; // underwater depth in meters >= 0
  rawElevations?: number[]; // signed elevations in meters (- below sea level, + above)
}

export class GebcoTileManager {
  private baseDir: string | null = null;
  private manifest: GebcoManifest | null = null;
  private tileCache = new Map<string, BathymetryResult>();
  private preloadedPresets: Record<string, BathymetryResult> = {};

  constructor(rootDir: string) {
    this.init(rootDir);
  }

  private init(rootDir: string) {
    // 1. Load embedded offline presets from realBathymetryPresets.json
    try {
      const presetsPath = path.resolve(rootDir, 'src/data/realBathymetryPresets.json');
      if (fs.existsSync(presetsPath)) {
        this.preloadedPresets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
      }
    } catch (e) {
      console.warn('[GEBCO] Could not load embedded presets:', e);
    }

    // 2. Discover tile directories in candidate locations
    const candidates = [
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
            // Check if actual tile files exist in this dir
            const sampleTile = parsed.tiles[0];
            const samplePath = path.join(dir, sampleTile?.file || '');
            const hasFiles = sampleTile && fs.existsSync(samplePath);

            this.baseDir = dir;
            this.manifest = parsed;
            console.log(`[GEBCO] Found manifest with ${parsed.tiles.length} tiles in: ${dir} (files on disk: ${hasFiles})`);
            if (hasFiles) break;
          }
        } catch (e) {
          console.warn(`[GEBCO] Failed parsing manifest in ${dir}:`, e);
        }
      }
    }
  }

  public getManifest(): GebcoManifest | null {
    return this.manifest;
  }

  /**
   * Find bathymetry data by Region ID or Geographic Coordinates
   */
  public async getBathymetry(
    regionId?: string,
    lat?: number,
    lon?: number,
    span: number = 1.2
  ): Promise<BathymetryResult | null> {
    // 1. By explicit Region ID (preset shortcuts)
    if (regionId && (!lat || isNaN(lat)) && regionId !== 'custom' && regionId !== 'custom-coords') {
      return this.getByRegionId(regionId);
    }

    // 2. By Geographic Coordinates
    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      return this.getByCoords(lat, lon, span);
    }

    // Default only if nothing requested
    return this.preloadedPresets['mariana-trench'] || null;
  }

  private async getByRegionId(regionId: string): Promise<BathymetryResult | null> {
    if (this.tileCache.has(regionId)) {
      return this.tileCache.get(regionId)!;
    }

    if (this.preloadedPresets[regionId]) {
      return this.preloadedPresets[regionId];
    }

    if (this.baseDir) {
      const jsonCandidate = path.join(this.baseDir, 'tiles', `${regionId}.json`);
      if (fs.existsSync(jsonCandidate)) {
        try {
          const data: BathymetryResult = JSON.parse(await fs.promises.readFile(jsonCandidate, 'utf8'));
          this.tileCache.set(regionId, data);
          return data;
        } catch (e) {
          console.warn(`[GEBCO] Failed to read tile file ${jsonCandidate}:`, e);
        }
      }
    }

    return null;
  }

  /**
   * Retrieve real bathymetry for arbitrary coordinates
   */
  private async getByCoords(rawLat: number, rawLon: number, rawSpan: number): Promise<BathymetryResult | null> {
    const lat = Math.max(-89.5, Math.min(89.5, rawLat));
    const lon = ((rawLon + 180) % 360 + 360) % 360 - 180;
    const span = Math.min(4.0, Math.max(0.25, rawSpan));

    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}:${span.toFixed(2)}`;
    if (this.tileCache.has(cacheKey)) {
      return this.tileCache.get(cacheKey)!;
    }

    // 1. Search local multi-resolution GEBCO 2026 binary tiles (L4 -> L3 -> L2 -> L1 -> L0)
    if (this.manifest && this.baseDir) {
      const candidates = this.manifest.tiles.filter(t => {
        const minLat = t.bounds?.minLat ?? t.sourceLatStart;
        const maxLat = t.bounds?.maxLat ?? t.sourceLatEndExclusive;
        const minLon = t.bounds?.minLon ?? t.sourceLonStart;
        const maxLon = t.bounds?.maxLon ?? t.sourceLonEndExclusive;

        if (minLat === undefined || maxLat === undefined || minLon === undefined || maxLon === undefined) {
          return false;
        }

        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
      });

      candidates.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

      for (const bestTile of candidates) {
        const tileFilePath = path.join(this.baseDir, bestTile.file);
        if (fs.existsSync(tileFilePath)) {
          // If JSON tile:
          if (tileFilePath.endsWith('.json')) {
            try {
              const data: BathymetryResult = JSON.parse(await fs.promises.readFile(tileFilePath, 'utf8'));
              this.tileCache.set(cacheKey, data);
              return data;
            } catch (e) {
              console.warn(`[GEBCO] Failed reading JSON tile ${tileFilePath}:`, e);
            }
          }

          // If Binary int16 tile (little-endian signed integers in meters):
          try {
            const buffer = await fs.promises.readFile(tileFilePath);
            const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
            const w = bestTile.gridWidth;
            const h = bestTile.gridHeight;

            const targetW = 73;
            const targetH = 73;
            const elevations: number[] = new Array(targetW * targetH);
            const rawElevations: number[] = new Array(targetW * targetH);
            let minDepth = Infinity;
            let maxDepth = -Infinity;
            let minElevation = Infinity;
            let maxElevation = -Infinity;

            const tMinLat = bestTile.bounds?.minLat ?? bestTile.sourceLatStart ?? -90;
            const tMaxLat = bestTile.bounds?.maxLat ?? bestTile.sourceLatEndExclusive ?? 90;
            const tMinLon = bestTile.bounds?.minLon ?? bestTile.sourceLonStart ?? -180;
            const tMaxLon = bestTile.bounds?.maxLon ?? bestTile.sourceLonEndExclusive ?? 180;

            // Target bounding box centered on requested (lat, lon)
            const bMinLat = Math.max(tMinLat, lat - span / 2);
            const bMaxLat = Math.min(tMaxLat, lat + span / 2);
            const bMinLon = Math.max(tMinLon, lon - span / 2);
            const bMaxLon = Math.min(tMaxLon, lon + span / 2);

            // Samples ordered south to north and west to east.
            // Row 0 in Three.js is North (top), Row 72 is South (bottom).
            for (let r = 0; r < targetH; r++) {
              const v = r / (targetH - 1);
              const curLat = bMaxLat - v * (bMaxLat - bMinLat);
              const latNorm = (curLat - tMinLat) / Math.max(0.0001, tMaxLat - tMinLat);
              const srcRow = Math.min(h - 1, Math.max(0, Math.floor(latNorm * (h - 1))));

              for (let c = 0; c < targetW; c++) {
                const u = c / (targetW - 1);
                const curLon = bMinLon + u * (bMaxLon - bMinLon);
                const lonNorm = (curLon - tMinLon) / Math.max(0.0001, tMaxLon - tMinLon);
                const srcCol = Math.min(w - 1, Math.max(0, Math.floor(lonNorm * (w - 1))));

                const srcIdx = srcRow * w + srcCol;
                const elevMeters = int16Array[srcIdx];

                rawElevations[r * targetW + c] = elevMeters;
                // Underwater depth: max(0, -elevationMeters). If elevation > 0 (land), depth is 0.
                const depthMeters = elevMeters <= 0 ? -elevMeters : 0;
                elevations[r * targetW + c] = depthMeters;

                if (depthMeters < minDepth) minDepth = depthMeters;
                if (depthMeters > maxDepth) maxDepth = depthMeters;
                if (elevMeters < minElevation) minElevation = elevMeters;
                if (elevMeters > maxElevation) maxElevation = elevMeters;
              }
            }

            const centerIdx = Math.floor(targetH / 2) * targetW + Math.floor(targetW / 2);
            const centerElev = rawElevations[centerIdx];

            const result: BathymetryResult = {
              id: `gebco-${lat.toFixed(3)}-${lon.toFixed(3)}`,
              name: `GEBCO Sector (${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'})`,
              source: 'GEBCO_2026 Sub-Ice Global Bathymetric Grid',
              resolutionArcSec: (bestTile.stride || 1) * 15,
              bounds: { minLat: bMinLat, maxLat: bMaxLat, minLon: bMinLon, maxLon: bMaxLon },
              gridWidth: targetW,
              gridHeight: targetH,
              minDepth,
              maxDepth,
              minElevation,
              maxElevation,
              centerElevation: centerElev,
              centerDepth: Math.max(0, -centerElev),
              isLand: centerElev > 0,
              isAuthoritative: true,
              landmarks: bestTile.landmarks || [],
              elevations,
              rawElevations
            };

            this.tileCache.set(cacheKey, result);
            return result;
          } catch (binaryErr) {
            console.warn(`[GEBCO] Error reading binary tile ${tileFilePath}:`, binaryErr);
          }
        }
      }
    }

    // 2. Authoritative Online Bathymetry Service (NOAA CoastWatch / PMEL ERDDAP ETOPO Grid)
    // Slices the genuine worldwide 1-arc-minute global relief model for the exact requested coordinates
    const latMin = Number((lat - span / 2).toFixed(4));
    const latMax = Number((lat + span / 2).toFixed(4));
    const lonMin = Number((lon - span / 2).toFixed(4));
    const lonMax = Number((lon + span / 2).toFixed(4));
    const stride = Math.max(1, Math.round((span * 60) / 72));

    const query = `altitude[(${latMin}):${stride}:(${latMax})][(${lonMin}):${stride}:(${lonMax})]`;
    const erddapEndpoints = [
      `https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json?${encodeURIComponent(query)}`,
      `https://data.pmel.noaa.gov/socat/erddap/griddap/etopo180.json?${encodeURIComponent(query)}`
    ];

    for (const url of erddapEndpoints) {
      try {
        const fetchRes = await fetch(url, { signal: AbortSignal.timeout(6500) });
        if (fetchRes.ok) {
          const json: any = await fetchRes.json();
          const rows: [number, number, number][] = json?.table?.rows || [];

          if (rows.length >= 25) {
            const latSet = new Set<number>();
            const lonSet = new Set<number>();
            const valMap = new Map<string, number>();

            for (const [rLat, rLon, rAlt] of rows) {
              latSet.add(rLat);
              lonSet.add(rLon);
              valMap.set(`${rLat.toFixed(5)},${rLon.toFixed(5)}`, rAlt);
            }

            const lats = [...latSet].sort((a, b) => b - a); // North to South
            const lons = [...lonSet].sort((a, b) => a - b); // West to East
            const gridW = lons.length;
            const gridH = lats.length;

            const elevations: number[] = [];
            const rawElevations: number[] = [];
            let minD = Infinity;
            let maxD = -Infinity;
            let minE = Infinity;
            let maxE = -Infinity;

            for (let iy = 0; iy < gridH; iy++) {
              const cLat = lats[iy];
              for (let ix = 0; ix < gridW; ix++) {
                const cLon = lons[ix];
                const rawAlt = valMap.get(`${cLat.toFixed(5)},${cLon.toFixed(5)}`) ?? 0;
                rawElevations.push(rawAlt);

                // Underwater depth: max(0, -elevationMeters). If land (>0), depth = 0.
                const depth = rawAlt <= 0 ? -rawAlt : 0;
                elevations.push(depth);

                if (depth < minD) minD = depth;
                if (depth > maxD) maxD = depth;
                if (rawAlt < minE) minE = rawAlt;
                if (rawAlt > maxE) maxE = rawAlt;
              }
            }

            const centerLatIdx = Math.floor(gridH / 2);
            const centerLonIdx = Math.floor(gridW / 2);
            const centerElev = rawElevations[centerLatIdx * gridW + centerLonIdx] ?? 0;
            const centerDepth = Math.max(0, -centerElev);
            const isLand = centerElev > 0;

            const authoritativeResult: BathymetryResult = {
              id: `authoritative-${lat.toFixed(3)}-${lon.toFixed(3)}`,
              name: `${isLand ? 'Coastal / Land Sector' : 'Ocean Sector'} (${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'})`,
              source: 'NOAA NCEI ETOPO Global Relief Model (Authoritative 1-Arc-Minute Grid)',
              resolutionArcSec: stride * 60,
              bounds: {
                minLat: lats[lats.length - 1],
                maxLat: lats[0],
                minLon: lons[0],
                maxLon: lons[lons.length - 1]
              },
              gridWidth: gridW,
              gridHeight: gridH,
              minDepth: minD,
              maxDepth: maxD,
              minElevation: minE,
              maxElevation: maxE,
              centerElevation: centerElev,
              centerDepth,
              isLand,
              isAuthoritative: true,
              landmarks: [],
              elevations,
              rawElevations
            };

            this.tileCache.set(cacheKey, authoritativeResult);
            return authoritativeResult;
          }
        }
      } catch (err: any) {
        console.warn(`[GEBCO] ERDDAP endpoint ${url.split('?')[0]} failed:`, err?.message || err);
      }
    }

    // 3. Fallback only if both local GEBCO dataset and remote authoritative services are offline
    console.warn(`[GEBCO] Real bathymetry grid unavailable for (${lat}, ${lon}). Generating clearly identified physical model fallback.`);
    return this.createModelledSector(lat, lon, span);
  }

  /**
   * Clearly identified physical model fallback when all authoritative sources are offline.
   * Never labels modeled values as real GEBCO soundings.
   */
  private createModelledSector(lat: number, lon: number, span: number): BathymetryResult {
    const targetW = 73;
    const targetH = 73;
    const elevations: number[] = new Array(targetW * targetH);
    const rawElevations: number[] = new Array(targetW * targetH);

    // Approximate regional abyssal baseline depth
    const baseElev = -(3800 + Math.sin(lat * 0.15) * Math.cos(lon * 0.15) * 600);
    let minD = Infinity;
    let maxD = -Infinity;

    for (let r = 0; r < targetH; r++) {
      const v = (r / (targetH - 1) - 0.5) * 2;
      for (let c = 0; c < targetW; c++) {
        const u = (c / (targetW - 1) - 0.5) * 2;
        const microRelief = Math.sin(u * 5 + lon * 0.1) * Math.cos(v * 4 + lat * 0.1) * 180 +
                            Math.sin(u * 12 + v * 8) * 80;
        const elev = baseElev + microRelief;
        rawElevations[r * targetW + c] = elev;
        const depth = Math.max(0, -elev);
        elevations[r * targetW + c] = depth;

        if (depth < minD) minD = depth;
        if (depth > maxD) maxD = depth;
      }
    }

    const centerElev = rawElevations[Math.floor(targetH / 2) * targetW + Math.floor(targetW / 2)];

    return {
      id: `model-${lat.toFixed(3)}-${lon.toFixed(3)}`,
      name: `Ocean Sector (${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'})`,
      source: 'MARIVEX Ocean Model (Temporary Offline Estimation — Authoritative Grid Offline)',
      resolutionArcSec: 120,
      bounds: {
        minLat: lat - span / 2,
        maxLat: lat + span / 2,
        minLon: lon - span / 2,
        maxLon: lon + span / 2
      },
      gridWidth: targetW,
      gridHeight: targetH,
      minDepth: minD,
      maxDepth: maxD,
      minElevation: -maxD,
      maxElevation: -minD,
      centerElevation: centerElev,
      centerDepth: Math.max(0, -centerElev),
      isLand: false,
      isAuthoritative: false,
      isModeledFallback: true,
      landmarks: [],
      elevations,
      rawElevations
    };
  }
}
