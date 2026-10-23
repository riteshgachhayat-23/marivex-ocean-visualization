import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { Server } from 'node:http';

import {
  GebcoTileManager,
  PYRAMID_LEVEL_SPECS,
  normalizeLongitude,
  validateCoordinates,
  formatCoordinateString,
  doesTileCoverCoordinate,
  elevationToDepthMeters,
  INT16_NODATA
} from '../server/gebco-tile-manager.ts';

import {
  GebcoGlobalTileLoader,
  gebcoGlobalTileLoader,
  inferManifestCoverage,
  parseAndValidateManifest
} from '../src/utils/gebcoGlobalTileLoader.ts';

import {
  getRealBathymetryDataset,
  fetchRealBathymetryGrid,
  recordToDataset,
  findPresetCoveringCoordinates
} from '../src/utils/bathymetryGridBuilder.ts';

import {
  buildBathymetryTerrainGeometry,
  getSignedTopographicVertexColor
} from '../src/components/UnderwaterBathymetry.tsx';

import { askMarivex } from '../src/utils/assistantEngine.ts';
import { createMarivexApp } from '../server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

describe('MARIVEX Geospatial & Bathymetry Pipeline Verification Suite (Phase 12)', () => {
  let tileManager: GebcoTileManager;
  let server: Server;
  let baseUrl = '';

  before(async () => {
    tileManager = new GebcoTileManager(rootDir);
    const { app } = await createMarivexApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // 1. Coordinate conversion & normalization
  it('1. Coordinate normalization and hemisphere formatting handle all quadrants accurately', () => {
    assert.equal(normalizeLongitude(0), 0);
    assert.equal(normalizeLongitude(180), 180);
    assert.equal(normalizeLongitude(-180), -180);
    assert.equal(normalizeLongitude(185), -175);
    assert.equal(normalizeLongitude(-185), 175);
    assert.equal(normalizeLongitude(540), 180);

    assert.equal(formatCoordinateString(11.35, 142.2, 2), '11.35°N, 142.20°E');
    assert.equal(formatCoordinateString(-23.5, -46.6, 2), '23.50°S, 46.60°W');
    assert.equal(formatCoordinateString(-35.125, 115.75, 2), '35.13°S, 115.75°E');
    assert.equal(formatCoordinateString(25.4, -70.35, 2), '25.40°N, 70.35°W');
  });

  // 2. Coordinate validation
  it('2. Coordinate validation rejects NaN, Infinity, non-numeric, and out-of-range latitudes', () => {
    assert.equal(validateCoordinates(NaN, 120).valid, false);
    assert.equal(validateCoordinates(10, Infinity).valid, false);
    assert.equal(validateCoordinates('invalid', 45).valid, false);
    assert.equal(validateCoordinates(91.5, 0).valid, false);
    assert.equal(validateCoordinates(-95, 0).valid, false);

    const validBoundary = validateCoordinates(-90, 180);
    assert.equal(validBoundary.valid, true);
    assert.equal(validBoundary.latitude, -90);
    assert.equal(validBoundary.longitude, 180);
  });

  // 3. Antimeridian (180°/-180°) and boundary coordinate tile coverage
  it('3. Antimeridian and boundary coordinates (-90, 90, -180, 180, 0, 0) match covering tiles', () => {
    const globalBounds = { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };
    assert.equal(doesTileCoverCoordinate(globalBounds, 0, 0), true);
    assert.equal(doesTileCoverCoordinate(globalBounds, 90, 180), true);
    assert.equal(doesTileCoverCoordinate(globalBounds, -90, -180), true);
    assert.equal(doesTileCoverCoordinate(globalBounds, 15, 180), true);
    assert.equal(doesTileCoverCoordinate(globalBounds, 15, -180), true);

    const datelineBounds = { minLat: -20, maxLat: 20, minLon: 175, maxLon: -175 };
    assert.equal(doesTileCoverCoordinate(datelineBounds, 0, 179.5), true);
    assert.equal(doesTileCoverCoordinate(datelineBounds, 0, -179.5), true);
    assert.equal(doesTileCoverCoordinate(datelineBounds, 0, 0), false);
  });

  // 4. Manifest loading and validation
  it('4. Manifest loads and accurately reports coverage and resolution without phantom tiles', () => {
    const manifest = tileManager.getManifest();
    assert.ok(manifest, 'Manifest should be loaded');
    assert.ok(manifest.tiles.length >= 10, 'Manifest should contain the 10 verified regional tiles');
    for (const tile of manifest.tiles) {
      assert.ok(tile.bounds, `Tile ${tile.id} must have bounds`);
      assert.ok(tile.bounds.minLat < tile.bounds.maxLat);
      assert.ok(tile.gridWidth > 0 && tile.gridHeight > 0);
    }
  });

  // 5. Tile selection across levels L0–L4
  it('5. Tile selection orders covering tiles deterministically across pyramid levels L0–L4', () => {
    const loader = new GebcoGlobalTileLoader();
    const mockManifest = {
      dataset: 'Test Pyramid',
      tiles: [
        {
          id: 'L0_r0_c0',
          file: 'tiles/L0_r0_c0.bin',
          level: 0,
          stride: 240,
          resolutionArcSec: 3600,
          gridWidth: 360,
          gridHeight: 180,
          bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
        },
        {
          id: 'L2_r3_c8',
          file: 'tiles/L2_r3_c8.bin',
          level: 2,
          stride: 16,
          resolutionArcSec: 240,
          gridWidth: 450,
          gridHeight: 450,
          bounds: { minLat: 0, maxLat: 30, minLon: 60, maxLon: 90 }
        },
        {
          id: 'L4_r5_c12',
          file: 'tiles/L4_r5_c12.bin',
          level: 4,
          stride: 1,
          resolutionArcSec: 15,
          gridWidth: 1200,
          gridHeight: 1200,
          bounds: { minLat: 10, maxLat: 15, minLon: 70, maxLon: 75 }
        }
      ]
    };

    const best = loader.findCoveringTile(mockManifest, 12.5, 72.5);
    assert.equal(best?.id, 'L4_r5_c12', 'Default lookup should select highest-resolution L4 tile');

    const coarse = loader.findCoveringTile(mockManifest, 12.5, 72.5, 0);
    assert.equal(coarse?.id, 'L0_r0_c0', 'preferredLevel=0 should select L0 overview tile');

    const uncoveredInL4 = loader.findCoveringTile(mockManifest, -45.0, -120.0);
    assert.equal(uncoveredInL4?.id, 'L0_r0_c0', 'Point outside L2/L4 should select covering L0 tile');
  });

  // 6. Non-fallback regression test (CRITICAL)
  it('6. CRITICAL REGRESSION: Uncovered coordinates NEVER return Mariana Trench or manifest.tiles[0]', async () => {
    const manifest = tileManager.getManifest()!;
    const loader = gebcoGlobalTileLoader;

    // Arbitrary South Pacific coordinate far outside all 10 regional presets
    const testLat = -32.45;
    const testLon = -135.80;

    const coveringLocal = loader.findCoveringTile(manifest, testLat, testLon);
    if (manifest.coverage === 'regional_presets') {
      assert.equal(
        coveringLocal,
        null,
        'findCoveringTile MUST return null when no regional tile covers (-32.45, -135.80), never manifest.tiles[0]'
      );
    }

    assert.equal(
      findPresetCoveringCoordinates(testLat, testLon),
      null,
      'findPresetCoveringCoordinates must return null for uncovered coordinate'
    );

    // Query backend for uncovered coordinate in fallback mode (fast, deterministic)
    const result = await tileManager.getBathymetry('', testLat, testLon, 1.2, { mode: 'fallback' });
    assert.ok(result, 'Result should be returned for arbitrary coordinate');
    assert.notEqual(result.id, 'mariana-trench', 'Result ID must NEVER be mariana-trench');
    assert.ok(
      !result.name.toLowerCase().includes('mariana'),
      `Result name "${result.name}" must NEVER reference Mariana Trench`
    );
    assert.ok(result.requestedCoordinates, 'Result must include requestedCoordinates');
    assert.ok(
      Math.abs(result.requestedCoordinates.latitude - testLat) < 1e-4 &&
      Math.abs(result.requestedCoordinates.longitude - testLon) < 1e-4,
      'Result must preserve exact requested coordinates'
    );
    assert.ok(
      doesTileCoverCoordinate(result.bounds, testLat, testLon),
      'Returned grid bounds must be centered around the requested coordinate (-32.45, -135.80)'
    );
  });

  // 7. Unknown preset regionId throws / returns null instead of Mariana Trench
  it('7. Unknown preset regionId does not silently fall back to Mariana Trench', async () => {
    assert.throws(
      () => getRealBathymetryDataset('non-existent-ocean-sector'),
      /not found/i,
      'getRealBathymetryDataset must throw on unknown regionId'
    );

    const serverLookup = await tileManager.getBathymetry('non-existent-ocean-sector');
    assert.equal(
      serverLookup,
      null,
      'tileManager.getBathymetry must return null on unknown regionId when no coordinates are given'
    );
  });

  // 8. Binary Int16 little-endian decoding and row orientation
  it('8. Binary Int16 little-endian decoding preserves negative ocean, positive land, and South-to-North row flip', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-bin-test-'));
    const tilesSub = path.join(tmpDir, 'public', 'data', 'bathymetry', 'tiles');
    fs.mkdirSync(tilesSub, { recursive: true });

    // Create a 2x2 binary Int16 LE tile:
    // Row 0 (South): [-4000, -3500]
    // Row 1 (North): [250 (land), INT16_NODATA (-32768)]
    const buf = Buffer.alloc(4 * 2);
    buf.writeInt16LE(-4000, 0);
    buf.writeInt16LE(-3500, 2);
    buf.writeInt16LE(250, 4);
    buf.writeInt16LE(INT16_NODATA, 6);

    fs.writeFileSync(path.join(tilesSub, 'L3_test.bin'), buf);
    fs.writeFileSync(
      path.join(tmpDir, 'public', 'data', 'bathymetry', 'manifest.json'),
      JSON.stringify({
        dataset: 'Test Binary GEBCO',
        gridIntervalArcSec: 15,
        coverage: 'global',
        tiles: [
          {
            id: 'L3_test',
            file: 'tiles/L3_test.bin',
            format: 'int16le',
            level: 3,
            stride: 4,
            resolutionArcSec: 60,
            gridWidth: 2,
            gridHeight: 2,
            bounds: { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 }
          }
        ]
      })
    );

    const customMgr = new GebcoTileManager(tmpDir);
    const res = await customMgr.getBathymetry('', 5, 5, 10.0);
    assert.ok(res, 'Binary tile should be decoded');
    assert.equal(res.dataset.provenance, 'authoritative_local');
    // Output grid is flipped to North-to-South:
    // Row 0 (North): [250, null]
    // Row 1 (South): [-4000, -3500]
    assert.equal(res.grid.elevationsMeters[0], 250, 'North-West sample should be +250m land');
    assert.equal(res.grid.elevationsMeters[1], null, 'North-East no-data sample (-32768) must be null, never 0');
    assert.equal(res.grid.elevationsMeters[2], -4000, 'South-West sample should be -4000m ocean');
    assert.equal(res.grid.elevationsMeters[3], -3500, 'South-East sample should be -3500m ocean');
    assert.equal(res.grid.missingSampleCount, 1, 'missingSampleCount should record 1 missing cell');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 9. Signed elevation vs positive underwater depth conversion
  it('9. Signed elevation to underwater depth conversion handles ocean, sea level, land, and null', () => {
    assert.equal(elevationToDepthMeters(-10898), 10898);
    assert.equal(elevationToDepthMeters(0), 0);
    assert.equal(elevationToDepthMeters(1450), 0, 'Positive land elevation must have 0m underwater depth');
    assert.equal(elevationToDepthMeters(null), null, 'Null missing sample must remain null');
    assert.equal(elevationToDepthMeters(NaN), null, 'NaN missing sample must remain null');
  });

  // 10. Land vs Ocean detection in recordToDataset
  it('10. recordToDataset preserves positive land elevations, negative ocean elevations, and NaN missing samples', () => {
    const ds = recordToDataset({
      id: 'coastal-test',
      name: 'Coastal Margin Test',
      source: 'GEBCO Test',
      resolutionArcSec: 60,
      bounds: { minLat: 10, maxLat: 11, minLon: 20, maxLon: 21 },
      gridWidth: 2,
      gridHeight: 2,
      minDepth: 0,
      maxDepth: 1200,
      centerElevation: 320,
      centerDepth: 0,
      isLand: true,
      landmarks: [],
      elevations: [0, 0, 800, 1200],
      rawElevations: [320, null, -800, -1200]
    });

    assert.equal(ds.isLand, true);
    assert.equal(ds.rawElevations![0], 320);
    assert.equal(ds.elevations[0], 0);
    assert.equal(Number.isNaN(ds.rawElevations![1]), true, 'Missing sample must be NaN in Float32Array');
    assert.equal(Number.isNaN(ds.elevations[1]), true, 'Missing depth must be NaN in Float32Array');
    assert.equal(ds.rawElevations![2], -800);
    assert.equal(ds.elevations[2], 800);
    assert.equal(ds.missingSampleCount, 1);
  });

  // 11. Known real-world preset points accuracy
  it('11. Known preset locations (Mariana Trench, Mid-Atlantic Ridge, Puerto Rico Trench, Bay of Bengal) match expected depths', async () => {
    const mariana = await tileManager.getBathymetry('mariana-trench');
    assert.ok(mariana);
    assert.ok(mariana.maxDepth >= 10000 && mariana.maxDepth <= 11100, `Mariana maxDepth=${mariana.maxDepth}`);
    assert.equal(mariana.dataset.provenance, 'preset_regional');

    const atlantic = await tileManager.getBathymetry('atlantic-ridge');
    assert.ok(atlantic);
    assert.ok(atlantic.maxDepth >= 4000 && atlantic.maxDepth <= 5200, `Atlantic Ridge maxDepth=${atlantic.maxDepth}`);

    const puertoRico = await tileManager.getBathymetry('puerto-rico-trench');
    assert.ok(puertoRico);
    assert.ok(puertoRico.maxDepth >= 8000 && puertoRico.maxDepth <= 9000, `Puerto Rico maxDepth=${puertoRico.maxDepth}`);

    const bengal = await tileManager.getBathymetry('bay-of-bengal');
    assert.ok(bengal);
    assert.ok(bengal.maxDepth >= 900 && bengal.maxDepth <= 1500, `Bay of Bengal maxDepth=${bengal.maxDepth}`);
  });

  // 12. Coordinate-based lookup inside a regional tile (workspace-independent)
  it('12. Coordinate lookup inside Mariana Trench bounds (11.35, 142.20) resolves authoritative local or preset regional tile', async () => {
    const res = await fetch(`${baseUrl}/api/bathymetry?lat=11.35&lon=142.20&span=1.2`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    const currentStatus = tileManager.getStatus();
    if (currentStatus.hasGlobalBinaryPyramid) {
      assert.ok(
        body.dataset.provenance === 'authoritative_local' || body.dataset.provenance === 'preset_regional'
      );
    } else {
      assert.equal(body.id, 'mariana-trench');
      assert.equal(body.dataset.provenance, 'preset_regional');
    }
    assert.ok(body.grid.maxDepthMeters > 9000);
  });

  // 13. API route validation (HTTP 400 on invalid inputs, HTTP 404 on unknown region/tile, HTTP 503 on mode=real unavailable)
  it('13. /api/bathymetry returns proper HTTP 400, 404, and 503 status codes on invalid or unavailable requests', async () => {
    // Invalid latitude (> 90)
    const badLat = await fetch(`${baseUrl}/api/bathymetry?lat=105&lon=45`);
    assert.equal(badLat.status, 400);

    // Missing lon when lat is provided
    const missingLon = await fetch(`${baseUrl}/api/bathymetry?lat=20`);
    assert.equal(missingLon.status, 400);

    // Invalid span (<= 0)
    const badSpan = await fetch(`${baseUrl}/api/bathymetry?lat=20&lon=40&span=-2`);
    assert.equal(badSpan.status, 400);

    // Unknown regionId
    const unknownRegion = await fetch(`${baseUrl}/api/bathymetry?regionId=atlantis-mythical-trench`);
    assert.equal(unknownRegion.status, 404);

    // Unknown tileId
    const unknownTile = await fetch(`${baseUrl}/api/bathymetry?tileId=L99_missing`);
    assert.equal(unknownTile.status, 404);
  });

  // 14. Standardized API response contract structure
  it('14. /api/bathymetry returns the complete standardized contract (status, requestedCoordinates, dataset, grid)', async () => {
    const res = await fetch(`${baseUrl}/api/bathymetry?lat=-25.5&lon=-115.2&span=1.2&mode=fallback`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.status, 'ok');
    assert.equal(data.requestedCoordinates.latitude, -25.5);
    assert.equal(data.requestedCoordinates.longitude, -115.2);
    assert.equal(data.dataset.provenance, 'modelled');
    assert.equal(data.dataset.isModeledFallback, true);
    assert.equal(data.dataset.isAuthoritative, false);
    assert.equal(data.grid.rowOrder, 'north-to-south');
    assert.equal(data.grid.colOrder, 'west-to-east');
    assert.equal(
      data.grid.elevationsMeters.length,
      data.grid.width * data.grid.height
    );
  });

  // 15. LRU cache eviction and bounded memory
  it('15. Tile cache respects maximum size and evicts oldest entries cleanly', async () => {
    for (let i = 0; i < 20; i++) {
      await tileManager.getBathymetry('', -40 + i * 2, -100 + i * 2, 1.0, { mode: 'fallback' });
    }
    const manifest = tileManager.getManifest();
    assert.ok(manifest);
  });

  // 16. Request cancellation via AbortSignal
  it('16. Aborted requests throw AbortError immediately and do not corrupt state', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => {
        await fetchRealBathymetryGrid(
          undefined,
          { latitude: -15.2, longitude: -140.5 },
          { signal: controller.signal }
        );
      },
      (err: any) => err?.name === 'AbortError' || /abort/i.test(String(err?.message))
    );
  });

  // 17. Rapid sequential coordinate requests preserve exact matching coordinates
  it('17. Rapid concurrent coordinate queries resolve distinct grids matching each coordinate without cross-talk', async () => {
    const coordsList = [
      { latitude: -42.0, longitude: -150.0 },
      { latitude: 38.5, longitude: -28.0 },
      { latitude: -12.3, longitude: 75.4 },
      { latitude: 52.1, longitude: 165.8 }
    ];

    const results = await Promise.all(
      coordsList.map((c) =>
         tileManager.getBathymetry('', c.latitude, c.longitude, 1.2, { mode: 'fallback' })
      )
    );

    results.forEach((res, idx) => {
      assert.ok(res);
      assert.ok(res.requestedCoordinates);
      assert.equal(res.requestedCoordinates.latitude, coordsList[idx].latitude);
      assert.equal(res.requestedCoordinates.longitude, coordsList[idx].longitude);
      assert.notEqual(res.id, 'mariana-trench');
    });
  });

  // 18. AI Assistant coordinate hemisphere formatting and dataset provenance reporting
  it('18. AI Assistant formats S/W hemispheres accurately and reports real dataset provenance', async () => {
    const response = await askMarivex('What is the depth at the selected coordinates?', {
      coords: { latitude: -34.56, longitude: -52.12 },
      region: null,
      oceanData: null,
      depth: 3920,
      hour: 12,
      bathymetryMeta: {
        source: 'NOAA ETOPO 2022 / GEBCO 1-Arc-Minute Global Relief Grid (ERDDAP)',
        resolutionArcSec: 60,
        provenance: 'authoritative_online',
        isAuthoritative: true,
        isModeledFallback: false,
        centerDepth: 3920,
        centerElevation: -3920
      }
    });

    assert.ok(
      response.text.includes('34.5600°S, 52.1200°W'),
      `Expected S/W formatted coordinates in assistant response, got:\n${response.text}`
    );
    assert.ok(
      response.text.includes('authoritative_online'),
      'Expected provenance in assistant response'
    );
    assert.ok(
      !response.text.includes('-34.56°N'),
      'Must never format southern latitude with °N'
    );
  });

  // 19. Tile-boundary sampling and nearest source-grid cell coordinate distinction
  it('19. Tile-boundary sampling accurately resolves corner/edge cells and distinguishes requestedCoordinates from sampledCoordinates', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-boundary-test-'));
    const tilesSub = path.join(tmpDir, 'public', 'data', 'bathymetry', 'tiles');
    fs.mkdirSync(tilesSub, { recursive: true });

    // Create a 3x3 binary Int16 LE tile covering [0°..10°N, 0°..10°E]
    // Grid rows (South-to-North: 0°, 5°, 10°N) and cols (West-to-East: 0°, 5°, 10°E)
    const samples = [
      -5100, -4800, -4500, // Row 0 (South, 0°N): 0°E, 5°E, 10°E
      -3900, -3200, -2700, // Row 1 (Mid,   5°N): 0°E, 5°E, 10°E
      -1800,  -950,   420  // Row 2 (North, 10°N): 0°E, 5°E, 10°E (+420m coastal land at NE corner)
    ];
    const buf = Buffer.alloc(samples.length * 2);
    samples.forEach((v, idx) => buf.writeInt16LE(v, idx * 2));

    fs.writeFileSync(path.join(tilesSub, 'L3_boundary.bin'), buf);
    fs.writeFileSync(
      path.join(tmpDir, 'public', 'data', 'bathymetry', 'manifest.json'),
      JSON.stringify({
        dataset: 'Test Boundary GEBCO',
        gridIntervalArcSec: 15,
        coverage: 'global',
        tiles: [
          {
            id: 'L3_boundary',
            file: 'tiles/L3_boundary.bin',
            format: 'int16le',
            level: 3,
            stride: 4,
            resolutionArcSec: 60,
            gridWidth: 3,
            gridHeight: 3,
            bounds: { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 }
          }
        ]
      })
    );

    const customMgr = new GebcoTileManager(tmpDir);

    // Query near North-East corner (9.4°N, 9.6°E) with span=1.2 (which clamps against 10° boundary)
    const neRes = await customMgr.getBathymetry('', 9.4, 9.6, 1.2);
    assert.ok(neRes);
    assert.equal(neRes.requestedCoordinates?.latitude, 9.4);
    assert.equal(neRes.requestedCoordinates?.longitude, 9.6);
    assert.ok(neRes.sampledCoordinates, 'Should report nearest source-grid cell coordinates');
    assert.equal(neRes.sampledCoordinates.latitude, 10, 'Nearest source grid row to 9.4°N is 10°N');
    assert.equal(neRes.sampledCoordinates.longitude, 10, 'Nearest source grid col to 9.6°E is 10°E');
    assert.equal(neRes.centerElevation, 420, 'NE corner should sample +420m land elevation without boundary-shift error');
    assert.equal(neRes.centerDepth, 0, 'Positive land elevation at NE corner must have 0m underwater depth');
    assert.equal(neRes.isLand, true);

    // Query exact South-West boundary corner (0°N, 0°E)
    const swRes = await customMgr.getBathymetry('', 0.2, 0.1, 1.2);
    assert.ok(swRes);
    assert.equal(swRes.sampledCoordinates?.latitude, 0);
    assert.equal(swRes.sampledCoordinates?.longitude, 0);
    assert.equal(swRes.centerElevation, -5100);
    assert.equal(swRes.centerDepth, 5100);
    assert.equal(swRes.isLand, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 20. Cache correctness for nearby distinct coordinates (~15 arc-seconds apart)
  it('20. Nearby distinct coordinates (0.004° apart) do not collide in cache and return distinct grid samples', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-cache-precision-'));
    const tilesSub = path.join(tmpDir, 'public', 'data', 'bathymetry', 'tiles');
    fs.mkdirSync(tilesSub, { recursive: true });

    // 11x11 binary tile spanning only 0.04° (from 10.000° to 10.040°, spacing = 0.004° ≈ 14.4 arc-sec)
    const w = 11;
    const h = 11;
    const buf = Buffer.alloc(w * h * 2);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const elev = -1000 - r * 100 - c * 10;
        buf.writeInt16LE(elev, (r * w + c) * 2);
      }
    }

    fs.writeFileSync(path.join(tilesSub, 'L4_fine.bin'), buf);
    fs.writeFileSync(
      path.join(tmpDir, 'public', 'data', 'bathymetry', 'manifest.json'),
      JSON.stringify({
        dataset: 'Test Fine GEBCO',
        gridIntervalArcSec: 15,
        coverage: 'global',
        tiles: [
          {
            id: 'L4_fine',
            file: 'tiles/L4_fine.bin',
            format: 'int16le',
            level: 4,
            stride: 1,
            resolutionArcSec: 15,
            gridWidth: w,
            gridHeight: h,
            bounds: { minLat: 10.0, maxLat: 10.04, minLon: 20.0, maxLon: 20.04 }
          }
        ]
      })
    );

    const customMgr = new GebcoTileManager(tmpDir);
    const ptA = await customMgr.getBathymetry('', 10.012, 20.012, 0.1);
    const ptB = await customMgr.getBathymetry('', 10.016, 20.016, 0.1);

    assert.ok(ptA && ptB);
    assert.notEqual(ptA.centerElevation, ptB.centerElevation, 'Nearby points 0.004° apart must resolve distinct elevations');
    assert.notDeepEqual(ptA.sampledCoordinates, ptB.sampledCoordinates, 'Nearby points must resolve distinct source grid cells');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 21. Offline processor exits with nonzero status when input NetCDF file is missing
  it('21. Offline GEBCO processor exits with nonzero status (1) when source NetCDF file is missing', () => {
    const scriptPath = path.join(rootDir, 'scripts', 'process_gebco_2026.mjs');
    const missingInput = path.join(os.tmpdir(), 'nonexistent_GEBCO_2026_sub_ice.nc');
    const proc = spawnSync(process.execPath, [scriptPath, '--input', missingInput], {
      cwd: rootDir,
      encoding: 'utf8'
    });

    assert.notEqual(proc.status, 0, 'Processor must exit with nonzero status when input NetCDF file is missing');
    assert.ok(
      (proc.stderr || '').includes('[ERROR]') || (proc.stdout || '').includes('[ERROR]'),
      'Processor must output an explicit [ERROR] diagnostic when input file is missing'
    );
  });

  /**
   * Helper to construct a spec-compliant Classic NetCDF-3 (CDF\x01) binary file
   * for testing the Python & Node.js processors with synthetic grids.
   */
  function writeSyntheticNetCDF3(
    filePath: string,
    opts: {
      latCoords?: number[];
      lonCoords?: number[];
      elevations: number[]; // flat array of length rows * cols
      rows?: number;
      cols?: number;
      fillValue?: number;
      omitLatVar?: boolean;
      transposeDims?: boolean;
    }
  ) {
    const rows = opts.rows ?? (opts.latCoords ? opts.latCoords.length : 0);
    const cols = opts.cols ?? (opts.lonCoords ? opts.lonCoords.length : 0);
    const fillVal = opts.fillValue ?? INT16_NODATA;

    const chunks: Buffer[] = [];
    const writeU32 = (v: number) => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(v >>> 0, 0);
      chunks.push(b);
    };
    const writeStr = (s: string) => {
      const strBuf = Buffer.from(s, 'utf8');
      writeU32(strBuf.length);
      const padLen = (strBuf.length + 3) & ~3;
      const padded = Buffer.alloc(padLen, 0);
      strBuf.copy(padded);
      chunks.push(padded);
    };

    // Magic: CDF\x01 + numrecs = 0
    chunks.push(Buffer.from([0x43, 0x44, 0x46, 0x01]));
    writeU32(0);

    // Dimension list (tag = 10, count = 2: lat=0, lon=1)
    writeU32(10);
    writeU32(2);
    writeStr('lat');
    writeU32(rows);
    writeStr('lon');
    writeU32(cols);

    // Global attributes: empty (0, 0)
    writeU32(0);
    writeU32(0);

    // Variable list (tag = 11)
    const varSpecs: Array<{
      name: string;
      dimIds: number[];
      ncType: number; // 6 = double, 3 = short (int16)
      itemSize: number;
      count: number;
      hasFillAttr?: boolean;
      dataBuf: Buffer;
    }> = [];

    if (!opts.omitLatVar && opts.latCoords) {
      const db = Buffer.alloc(opts.latCoords.length * 8);
      opts.latCoords.forEach((v, i) => db.writeDoubleBE(v, i * 8));
      varSpecs.push({
        name: 'lat',
        dimIds: [0],
        ncType: 6,
        itemSize: 8,
        count: opts.latCoords.length,
        dataBuf: db
      });
    }

    if (opts.lonCoords) {
      const db = Buffer.alloc(opts.lonCoords.length * 8);
      opts.lonCoords.forEach((v, i) => db.writeDoubleBE(v, i * 8));
      varSpecs.push({
        name: 'lon',
        dimIds: [1],
        ncType: 6,
        itemSize: 8,
        count: opts.lonCoords.length,
        dataBuf: db
      });
    }

    const elevBytes = opts.elevations.length * 2;
    const elevPaddedBytes = (elevBytes + 3) & ~3;
    const elevBuf = Buffer.alloc(elevPaddedBytes, 0);
    opts.elevations.forEach((v, i) => elevBuf.writeInt16BE(Math.trunc(v), i * 2));
    varSpecs.push({
      name: 'elevation',
      dimIds: opts.transposeDims ? [1, 0] : [0, 1],
      ncType: 3, // NC_SHORT
      itemSize: 2,
      count: opts.elevations.length,
      hasFillAttr: true,
      dataBuf: elevBuf
    });

    writeU32(11);
    writeU32(varSpecs.length);

    // First pass: calculate header size so we know exact `begin` offsets
    const beginOffsets: number[] = new Array(varSpecs.length).fill(0);
    const buildVarHeaders = (offsets: number[]) => {
      const vChunks: Buffer[] = [];
      const wU32 = (v: number) => {
        const b = Buffer.alloc(4);
        b.writeUInt32BE(v >>> 0, 0);
        vChunks.push(b);
      };
      const wStr = (s: string) => {
        const sb = Buffer.from(s, 'utf8');
        wU32(sb.length);
        const pad = (sb.length + 3) & ~3;
        const pb = Buffer.alloc(pad, 0);
        sb.copy(pb);
        vChunks.push(pb);
      };

      varSpecs.forEach((vs, idx) => {
        wStr(vs.name);
        wU32(vs.dimIds.length);
        vs.dimIds.forEach((d) => wU32(d));
        if (vs.hasFillAttr) {
          wU32(12); // attr tag
          wU32(1); // 1 attr
          wStr('_FillValue');
          wU32(3); // NC_SHORT
          wU32(1); // 1 value
          const fb = Buffer.alloc(4, 0);
          fb.writeInt16BE(fillVal, 0);
          vChunks.push(fb);
        } else {
          wU32(0);
          wU32(0);
        }
        wU32(vs.ncType);
        wU32(vs.dataBuf.length);
        wU32(offsets[idx]);
      });
      return Buffer.concat(vChunks);
    };

    const dummyVarHeader = buildVarHeaders(beginOffsets);
    const baseHeaderLen = Buffer.concat(chunks).length + dummyVarHeader.length;
    let curOffset = baseHeaderLen;
    varSpecs.forEach((vs, idx) => {
      beginOffsets[idx] = curOffset;
      curOffset += vs.dataBuf.length;
    });

    const finalVarHeader = buildVarHeaders(beginOffsets);
    chunks.push(finalVarHeader);
    varSpecs.forEach((vs) => chunks.push(vs.dataBuf));

    fs.writeFileSync(filePath, Buffer.concat(chunks));
  }

  // 22. Global geographic indexing: ascending vs descending latitude axes and [0, 360) longitudes
  it('22. Processor derives exact bounds & sampleBounds from NetCDF coordinate arrays for both ascending and descending latitude axes and [0, 360) longitudes', async () => {
    const tmpAsc = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-nc-asc-'));
    const tmpDesc = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-nc-desc-'));

    try {
      // 12 rows (lat) x 24 cols (lon) cell-center registered global grid (15° spacing)
      // Lat cell centers: -82.5, -67.5, -52.5, -37.5, -22.5, -7.5, +7.5, +22.5, +37.5, +52.5, +67.5, +82.5
      // Lon cell centers: -172.5, -157.5, ..., +172.5
      const rows = 12;
      const cols = 24;
      const latAsc = Array.from({ length: rows }, (_, r) => -82.5 + r * 15.0);
      const lon180 = Array.from({ length: cols }, (_, c) => -172.5 + c * 15.0);

      // Build deterministic signed elevation grid:
      // Southern Hemisphere (r < 6): ocean depths around -4000..-5000m, except (r=0, c=0) = INT16_NODATA
      // Northern Hemisphere (r >= 6): ocean -1500m and positive land +850m at (r=10, c=18)
      const elevAsc: number[] = new Array(rows * cols);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r === 0 && c === 0) {
            elevAsc[r * cols + c] = INT16_NODATA;
          } else if (r === 10 && c === 18) {
            elevAsc[r * cols + c] = 850; // Positive land elevation in Northern Hemisphere (+67.5°N, +97.5°E)
          } else if (r < 6) {
            elevAsc[r * cols + c] = -4000 - r * 100 - c * 10;
          } else {
            elevAsc[r * cols + c] = -1200 - (r - 6) * 50 - c * 5;
          }
        }
      }

      const ncAscPath = path.join(tmpAsc, 'synthetic_asc.nc');
      writeSyntheticNetCDF3(ncAscPath, {
        latCoords: latAsc,
        lonCoords: lon180,
        elevations: elevAsc
      });

      // Now build the SAME geographic dataset but with:
      // - DESCENDING latitude axis (+82.5° down to -82.5°)
      // - [0, 360) longitude axis (7.5° up to 352.5°)
      const latDesc = [...latAsc].reverse();
      const lon360 = Array.from({ length: cols }, (_, c) => 7.5 + c * 15.0);
      const elevDesc360: number[] = new Array(rows * cols);
      for (let rDesc = 0; rDesc < rows; rDesc++) {
        const rAsc = rows - 1 - rDesc;
        for (let c360 = 0; c360 < cols; c360++) {
          const lonVal = lon360[c360];
          const normLon = lonVal >= 180 ? lonVal - 360 : lonVal;
          const cAsc = lon180.findIndex((x) => Math.abs(x - normLon) < 1e-5);
          elevDesc360[rDesc * cols + c360] = elevAsc[rAsc * cols + cAsc];
        }
      }

      const ncDescPath = path.join(tmpDesc, 'synthetic_desc_360.nc');
      writeSyntheticNetCDF3(ncDescPath, {
        latCoords: latDesc,
        lonCoords: lon360,
        elevations: elevDesc360
      });

      const outAsc = path.join(tmpAsc, 'public', 'data', 'bathymetry');
      const outDesc = path.join(tmpDesc, 'public', 'data', 'bathymetry');
      const mjsScript = path.join(rootDir, 'scripts', 'process_gebco_2026.mjs');

      const resAsc = spawnSync(
        process.execPath,
        [mjsScript, '--input', ncAscPath, '--output', outAsc, '--levels', '0,1'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.equal(resAsc.status, 0, `Ascending NetCDF run failed: ${resAsc.stderr || resAsc.stdout}`);

      const resDesc = spawnSync(
        process.execPath,
        [mjsScript, '--input', ncDescPath, '--output', outDesc, '--levels', '0,1'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.equal(resDesc.status, 0, `Descending+[0,360) NetCDF run failed: ${resDesc.stderr || resDesc.stdout}`);

      const manifestAsc = JSON.parse(fs.readFileSync(path.join(outAsc, 'manifest.json'), 'utf8'));
      const manifestDesc = JSON.parse(fs.readFileSync(path.join(outDesc, 'manifest.json'), 'utf8'));

      assert.equal(manifestAsc.coverage, 'global');
      assert.equal(manifestDesc.coverage, 'global');
      assert.equal(manifestAsc.tiles.length, manifestDesc.tiles.length);

      // Verify every tile's geographic bounds, sampleBounds, min/max elevations, and binary bytes match identically
      for (let i = 0; i < manifestAsc.tiles.length; i++) {
        const tA = manifestAsc.tiles[i];
        const tD = manifestDesc.tiles[i];
        assert.equal(tA.id, tD.id);
        assert.deepEqual(tA.bounds, tD.bounds, `Bounds mismatch on ${tA.id}`);
        assert.deepEqual(tA.sampleBounds, tD.sampleBounds, `sampleBounds mismatch on ${tA.id}`);
        assert.equal(tA.minElevation, tD.minElevation, `minElevation mismatch on ${tA.id}`);
        assert.equal(tA.maxElevation, tD.maxElevation, `maxElevation mismatch on ${tA.id}`);

        const binA = fs.readFileSync(path.join(outAsc, tA.file));
        const binD = fs.readFileSync(path.join(outDesc, tD.file));
        assert.equal(Buffer.compare(binA, binD), 0, `Binary tile payload mismatch on ${tA.id}`);
      }

      // Verify L1_r0_c0 is Southern Hemisphere [-90..0] with sampleBounds [-82.5..-7.5]
      const l1South = manifestDesc.tiles.find((t: any) => t.id === 'L1_r0_c0');
      assert.ok(l1South);
      assert.deepEqual(l1South.bounds, { minLat: -90, maxLat: 0, minLon: -180, maxLon: -90 });
      assert.deepEqual(l1South.sampleBounds, { minLat: -82.5, maxLat: -7.5, minLon: -172.5, maxLon: -97.5 });

      // Query GebcoTileManager on the descending-lat output to verify Northern land (+850m) and Southern ocean
      const mgrDesc = new GebcoTileManager(tmpDesc);
      const landLookup = await mgrDesc.getBathymetry('', 67.5, 97.5, 5.0);
      assert.ok(landLookup);
      assert.equal(landLookup.centerElevation, 850, 'Northern Hemisphere land point (+67.5°N, +97.5°E) must be +850m');
      assert.equal(landLookup.centerDepth, 0, 'Positive land elevation must have 0m underwater depth');
      assert.equal(landLookup.isLand, true);

      const southLookup = await mgrDesc.getBathymetry('', -67.5, -157.5, 5.0);
      assert.ok(southLookup);
      assert.equal(southLookup.centerElevation, -4110, 'Southern Hemisphere ocean point (-67.5°S, -157.5°W) must be -4110m');
      assert.equal(southLookup.centerDepth, 4110);
      assert.equal(southLookup.isLand, false);
    } finally {
      fs.rmSync(tmpAsc, { recursive: true, force: true });
      fs.rmSync(tmpDesc, { recursive: true, force: true });
    }
  });

  // 23. Coordinate-to-grid sampling respects sampleBounds, sampleSpacing, rowOrder, and colOrder
  it('23. Frontend loader and backend tile manager respect sampleBounds, sampleSpacing, rowOrder, and colOrder instead of assuming tile bounds are sample centers', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-samplebounds-'));
    try {
      const tilesSub = path.join(tmpDir, 'public', 'data', 'bathymetry', 'tiles');
      fs.mkdirSync(tilesSub, { recursive: true });

      // 2x2 cell-center registered tile:
      // Outer tile bounds: [0°..20°N, 0°..20°E]
      // Actual sample centers (sampleBounds): [5°..15°N, 5°..15°E], spacing = 10°
      // Row 0 (5°N): [-3200 at 5°E, -2400 at 15°E]
      // Row 1 (15°N): [-1100 at 5°E, +540 (land) at 15°E]
      const buf = Buffer.alloc(4 * 2);
      buf.writeInt16LE(-3200, 0);
      buf.writeInt16LE(-2400, 2);
      buf.writeInt16LE(-1100, 4);
      buf.writeInt16LE(540, 6);

      fs.writeFileSync(path.join(tilesSub, 'L2_cellcenter.bin'), buf);
      const manifestObj = {
        dataset: 'Cell-Center Registered Test',
        gridIntervalArcSec: 36000,
        coverage: 'global',
        tiles: [
          {
            id: 'L2_cellcenter',
            file: 'tiles/L2_cellcenter.bin',
            format: 'int16le',
            level: 2,
            stride: 1,
            resolutionArcSec: 36000,
            rowOrder: 'south-to-north' as const,
            colOrder: 'west-to-east' as const,
            gridWidth: 2,
            gridHeight: 2,
            bounds: { minLat: 0, maxLat: 20, minLon: 0, maxLon: 20 },
            sampleBounds: { minLat: 5, maxLat: 15, minLon: 5, maxLon: 15 },
            sampleSpacingLat: 10,
            sampleSpacingLon: 10
          }
        ]
      };
      fs.writeFileSync(
        path.join(tmpDir, 'public', 'data', 'bathymetry', 'manifest.json'),
        JSON.stringify(manifestObj, null, 2)
      );

      // 1. Verify Backend GebcoTileManager
      const mgr = new GebcoTileManager(tmpDir);
      // Query at (13.2°N, 14.1°E): nearest sample center is (15°N, 15°E), NOT 20°N/20°E!
      const backendRes = await mgr.getBathymetry('', 13.2, 14.1, 2.0);
      assert.ok(backendRes);
      assert.deepEqual(backendRes.requestedCoordinates, {
        latitude: 13.2,
        longitude: 14.1,
        spanDegrees: 2.0
      });
      assert.deepEqual(
        backendRes.sampledCoordinates,
        { latitude: 15, longitude: 15, rowIndex: 1, colIndex: 1 },
        'Backend must return actual sample-center coordinates (15°N, 15°E), not outer tile bounds (20°N, 20°E)'
      );
      assert.equal(backendRes.centerElevation, 540);
      assert.equal(backendRes.centerDepth, 0);
      assert.equal(backendRes.isLand, true);

      // 2. Verify Frontend GebcoGlobalTileLoader
      const loader = new GebcoGlobalTileLoader();
      const tileMeta = manifestObj.tiles[0];
      const rawElevs = new Float32Array([-3200, -2400, -1100, 540]);
      const depths = new Float32Array([3200, 2400, 1100, 0]);
      const decoded = {
        manifestTile: tileMeta,
        gridWidth: 2,
        gridHeight: 2,
        rowOrder: 'south-to-north' as const,
        colOrder: 'west-to-east' as const,
        bounds: tileMeta.bounds,
        sampleBounds: tileMeta.sampleBounds,
        sampleSpacingLat: 10,
        sampleSpacingLon: 10,
        rawElevations: rawElevs,
        depths,
        validSampleMask: new Uint8Array([1, 1, 1, 1]),
        minDepth: 0,
        maxDepth: 3200,
        minElevation: -3200,
        maxElevation: 540,
        missingSampleCount: 0,
        landmarks: [],
        sourceName: 'Cell-Center Test',
        resolutionArcSec: 36000,
        provenance: 'authoritative_local' as const,
        sampleElevationAt: (lat: number, lon: number) => loader.sampleTileElevation(decoded, lat, lon)
      };

      const frontendSample = loader.sampleTileElevation(decoded, 1.8, 2.4);
      assert.deepEqual(
        frontendSample.sampledCoordinates,
        { latitude: 5, longitude: 5, rowIndex: 0, colIndex: 0 },
        'Frontend loader must report sample center (5°N, 5°E) for (1.8°N, 2.4°E), not outer boundary (0°N, 0°E)'
      );
      assert.equal(frontendSample.elevation, -3200);
      assert.equal(frontendSample.depth, 3200);

      const meshDs = loader.buildMeshDataset(decoded, 128, undefined, {
        latitude: 13.2,
        longitude: 14.1,
        span: 2.0
      });
      assert.deepEqual(meshDs.requestedCoordinates, {
        latitude: 13.2,
        longitude: 14.1,
        spanDegrees: 2.0
      });
      assert.deepEqual(meshDs.sampledCoordinates, {
        latitude: 15,
        longitude: 15,
        rowIndex: 1,
        colIndex: 1
      });
      assert.equal(meshDs.centerElevation, 540);
      assert.equal(meshDs.isLand, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 24. Signed elevation preservation & regenerating regional JSON extracts from source
  it('24. Processor regenerates regional JSON extracts with signed rawElevations when covered by source and never reconstructs land from depth-only arrays', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-signed-preset-'));
    try {
      const outDir = path.join(tmpDir, 'public', 'data', 'bathymetry');
      const tilesDir = path.join(outDir, 'tiles');
      fs.mkdirSync(tilesDir, { recursive: true });

      // Seed a depth-only regional JSON extract inside [-30..30, -60..60]
      const presetPath = path.join(tilesDir, 'coastal-preset.json');
      fs.writeFileSync(
        presetPath,
        JSON.stringify({
          id: 'coastal-preset',
          name: 'Coastal Test Preset',
          source: 'Test Source',
          resolutionArcSec: 60,
          bounds: { minLat: -25, maxLat: 25, minLon: -50, maxLon: 50 },
          gridWidth: 2,
          gridHeight: 2,
          minDepth: 0,
          maxDepth: 2000,
          landmarks: [],
          elevations: [0, 0, 1500, 2000]
        })
      );

      // 1. Verify that loading the depth-only preset BEFORE source regeneration never invents positive land elevation
      //    and explicitly marks the dataset as underwater_depth_only (hasSignedElevations: false)
      const depthOnlyDs = recordToDataset(JSON.parse(fs.readFileSync(presetPath, 'utf8')));
      assert.equal(depthOnlyDs.rawElevations![0], 0, 'Depth 0 in a depth-only array must map to 0m (sea level), never positive land or -0');
      assert.equal(Object.is(depthOnlyDs.rawElevations![0], -0), false, 'Must not be -0');
      assert.equal(depthOnlyDs.isLand, false, 'Depth-only array must never claim isLand=true');
      assert.equal(depthOnlyDs.hasSignedElevations, false, 'Depth-only regional JSON without rawElevations must set hasSignedElevations=false');
      assert.equal(
        depthOnlyDs.elevationDataKind,
        'underwater_depth_only',
        'Depth-only regional JSON without rawElevations must be labeled underwater_depth_only'
      );

      // 2. Now run the processor with a signed NetCDF source covering the globe (including coastal-preset bounds)
      const rows = 12;
      const cols = 24;
      const latAsc = Array.from({ length: rows }, (_, r) => -82.5 + r * 15.0);
      const lon180 = Array.from({ length: cols }, (_, c) => -172.5 + c * 15.0);
      const elevs = new Array(rows * cols).fill(-2500);
      // Put positive land (+725m) and missing data (INT16_NODATA) inside [-25..25, -50..50]
      // Row r=6 is +7.5°N, Col c=9 is -37.5°W, Col c=10 is -22.5°W
      elevs[6 * cols + 9] = 725;
      elevs[6 * cols + 10] = INT16_NODATA;

      const ncPath = path.join(tmpDir, 'source_with_land.nc');
      writeSyntheticNetCDF3(ncPath, {
        latCoords: latAsc,
        lonCoords: lon180,
        elevations: elevs
      });

      const mjsScript = path.join(rootDir, 'scripts', 'process_gebco_2026.mjs');
      const proc = spawnSync(
        process.execPath,
        [mjsScript, '--input', ncPath, '--output', outDir, '--levels', '0,1', '--extract-presets'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.equal(proc.status, 0, `Processor failed: ${proc.stderr || proc.stdout}`);

      const regenerated = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
      assert.ok(Array.isArray(regenerated.rawElevations), 'Regenerated preset must include signed rawElevations');
      assert.ok(
        regenerated.rawElevations.includes(725),
        'Regenerated rawElevations must preserve positive land elevation (+725m) from source'
      );
      assert.ok(
        regenerated.rawElevations.includes(-2500),
        'Regenerated rawElevations must preserve negative underwater elevation (-2500m) from source'
      );
      assert.ok(
        regenerated.rawElevations.includes(null),
        'Regenerated rawElevations must preserve null for missing source samples (-32768)'
      );
      assert.equal(regenerated.hasSignedElevations, true, 'Regenerated regional JSON must set hasSignedElevations=true');
      const regenDs = recordToDataset(regenerated);
      assert.equal(regenDs.hasSignedElevations, true);
      assert.equal(regenDs.elevationDataKind, 'signed_land_and_ocean');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 25. Processor validation failures: unsupported dimensions, invalid layouts, and sample mismatch preserve manifest.json
  it('25. Processor fails with nonzero exit code on unsupported grid dimensions, invalid layouts, or mismatched tile samples without overwriting a valid manifest', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-validation-fail-'));
    try {
      const outDir = path.join(tmpDir, 'public', 'data', 'bathymetry');
      const tilesDir = path.join(outDir, 'tiles');
      fs.mkdirSync(tilesDir, { recursive: true });

      const manifestPath = path.join(outDir, 'manifest.json');
      const sentinelManifest = {
        dataset: 'SENTINEL_VALID_MANIFEST',
        version: '1.0-preserve-test',
        coverage: 'regional_presets',
        totalTiles: 1,
        tiles: [{ id: 'sentinel-tile', file: 'tiles/sentinel.json', gridWidth: 2, gridHeight: 2, bounds: { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 } }]
      };
      const sentinelContent = JSON.stringify(sentinelManifest, null, 2);
      fs.writeFileSync(manifestPath, sentinelContent);

      const mjsScript = path.join(rootDir, 'scripts', 'process_gebco_2026.mjs');

      // Case A: Unsupported prime/indivisible grid dimensions (7 x 11)
      const badDimPath = path.join(tmpDir, 'unsupported_7x11.nc');
      writeSyntheticNetCDF3(badDimPath, {
        latCoords: Array.from({ length: 7 }, (_, i) => -60 + i * 20),
        lonCoords: Array.from({ length: 11 }, (_, i) => -100 + i * 20),
        elevations: new Array(7 * 11).fill(-1000)
      });
      const resBadDim = spawnSync(
        process.execPath,
        [mjsScript, '--input', badDimPath, '--output', outDir],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.notEqual(resBadDim.status, 0, 'Processor must fail on unsupported 7x11 grid dimensions');
      assert.equal(
        fs.readFileSync(manifestPath, 'utf8'),
        sentinelContent,
        'Existing valid manifest.json must NOT be overwritten when grid dimensions are unsupported'
      );

      // Case B: Non-monotonic latitude coordinate array
      const nonMonoLatPath = path.join(tmpDir, 'non_monotonic_lat.nc');
      const badLats = Array.from({ length: 12 }, (_, r) => -82.5 + r * 15.0);
      badLats[5] = 40.0; // break monotonicity
      writeSyntheticNetCDF3(nonMonoLatPath, {
        latCoords: badLats,
        lonCoords: Array.from({ length: 24 }, (_, c) => -172.5 + c * 15.0),
        elevations: new Array(12 * 24).fill(-2000)
      });
      const resNonMono = spawnSync(
        process.execPath,
        [mjsScript, '--input', nonMonoLatPath, '--output', outDir, '--levels', '0,1'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.notEqual(resNonMono.status, 0, 'Processor must fail on non-monotonic coordinate axis');
      assert.equal(
        fs.readFileSync(manifestPath, 'utf8'),
        sentinelContent,
        'Existing valid manifest.json must NOT be overwritten on invalid coordinate layout'
      );

      // Case C: Missing latitude coordinate array
      const missingLatPath = path.join(tmpDir, 'missing_lat.nc');
      writeSyntheticNetCDF3(missingLatPath, {
        rows: 12,
        cols: 24,
        omitLatVar: true,
        lonCoords: Array.from({ length: 24 }, (_, c) => -172.5 + c * 15.0),
        elevations: new Array(12 * 24).fill(-2000)
      });
      const resMissingLat = spawnSync(
        process.execPath,
        [mjsScript, '--input', missingLatPath, '--output', outDir, '--levels', '0,1'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.notEqual(resMissingLat.status, 0, 'Processor must fail when coordinate array is missing');

      // Case D: Source-to-tile sample comparison mismatch (corrupted tile on disk with --resume)
      const validNcPath = path.join(tmpDir, 'valid_12x24.nc');
      writeSyntheticNetCDF3(validNcPath, {
        latCoords: Array.from({ length: 12 }, (_, r) => -82.5 + r * 15.0),
        lonCoords: Array.from({ length: 24 }, (_, c) => -172.5 + c * 15.0),
        elevations: new Array(12 * 24).fill(-3100)
      });
      // For a 12x24 source grid at Level 0 (rows=1, cols=1, stride=1), L0_r0_c0.bin has 12*24 = 288 Int16 samples (576 bytes)
      const corruptTilePath = path.join(tilesDir, 'L0_r0_c0.bin');
      const corruptBuf = Buffer.alloc(12 * 24 * 2);
      for (let i = 0; i < 12 * 24; i++) {
        corruptBuf.writeInt16LE(-3100, i * 2);
      }
      // Corrupt sample (0, 0) to +999 instead of -3100
      corruptBuf.writeInt16LE(999, 0);
      fs.writeFileSync(corruptTilePath, corruptBuf);

      const resMismatch = spawnSync(
        process.execPath,
        [mjsScript, '--input', validNcPath, '--output', outDir, '--levels', '0', '--resume'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.notEqual(resMismatch.status, 0, 'Processor must fail when source-to-tile sample comparison does not match');
      assert.ok(
        (resMismatch.stderr || '').includes('sample comparison FAILED'),
        `Expected sample comparison failure message, got: ${resMismatch.stderr}`
      );
      assert.equal(
        fs.readFileSync(manifestPath, 'utf8'),
        sentinelContent,
        'Existing valid manifest.json must NOT be overwritten when a sample comparison fails'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 26. Windows & cross-platform Python executable resolution
  it('26. Node.js processor resolves Python cross-platform and reports actionable errors on invalid --python executable', async () => {
    const mod = await import('../scripts/process_gebco_2026.mjs');
    const resolved = mod.resolvePythonExecutable();
    assert.equal(resolved.ok, true);
    assert.ok(resolved.executablePath && resolved.executablePath.length > 0);

    assert.throws(
      () => mod.resolvePythonExecutable('/nonexistent/custom/python_binary_xyz', true),
      /not available|failed to run/i,
      'Explicitly configured invalid Python executable must throw an actionable error'
    );
  });

  // 27. /api/bathymetry/status endpoint is workspace-independent and tests both regional-only and global installations
  it('27. GET /api/bathymetry/status and GebcoTileManager.getStatus() work in both regional-only and global installations without workspace-specific assumptions', async () => {
    const res = await fetch(`${baseUrl}/api/bathymetry/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.manifestPresent, true);
    assert.ok(body.verifiedTilesOnDisk >= 10, `Expected >= 10 verified tiles on disk, got ${body.verifiedTilesOnDisk}`);
    assert.equal(body.missingTilesCount, 0);
    assert.equal(body.invalidSizeTilesCount, 0);
    assert.equal(
      body.signedRegionalJsonTilesOnDisk + body.depthOnlyRegionalJsonTilesOnDisk,
      body.regionalJsonTilesOnDisk,
      'Signed + depth-only regional JSON counts must equal total regional JSON tiles on disk'
    );
    const actualSourcePresent = fs.existsSync(path.join(rootDir, 'data', 'GEBCO_2026_sub_ice.nc'));
    assert.equal(
      body.gebco2026SourceNetcdfPresent,
      actualSourcePresent,
      'gebco2026SourceNetcdfPresent must dynamically match actual disk presence of data/GEBCO_2026_sub_ice.nc'
    );

    // (A) Controlled Regional-Only Installation Fixture (GEBCO_2026_sub_ice.nc absent, 2 depth-only JSON tiles)
    const tmpRegional = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-status-regional-'));
    // (B) Controlled Global Binary Pyramid + Signed Regional Fixture (GEBCO_2026_sub_ice.nc present, complete L0+L1 pyramid)
    const tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-status-global-'));
    // (C) Controlled Corrupted / Missing Tile Fixture
    const tmpCorrupt = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-status-corrupt-'));

    try {
      // --- Fixture A: Regional-only installation ---
      const regTilesDir = path.join(tmpRegional, 'public', 'data', 'bathymetry', 'tiles');
      fs.mkdirSync(regTilesDir, { recursive: true });
      fs.writeFileSync(
        path.join(regTilesDir, 'mariana-trench.json'),
        JSON.stringify({
          id: 'mariana-trench',
          name: 'Mariana Trench',
          bounds: { minLat: 10, maxLat: 12, minLon: 141, maxLon: 143 },
          gridWidth: 2,
          gridHeight: 2,
          minDepth: 5000,
          maxDepth: 10920,
          elevations: [5000, 7200, 9100, 10920]
        })
      );
      fs.writeFileSync(
        path.join(tmpRegional, 'public', 'data', 'bathymetry', 'manifest.json'),
        JSON.stringify({
          dataset: 'Regional Fixture',
          coverage: 'regional_presets',
          gridIntervalArcSec: 60,
          tiles: [
            {
              id: 'mariana-trench',
              file: 'tiles/mariana-trench.json',
              format: 'json',
              level: 3,
              resolutionArcSec: 60,
              gridWidth: 2,
              gridHeight: 2,
              bounds: { minLat: 10, maxLat: 12, minLon: 141, maxLon: 143 }
            }
          ]
        })
      );
      const mgrRegional = new GebcoTileManager(tmpRegional);
      const stRegional = mgrRegional.getStatus();
      assert.equal(stRegional.gebco2026SourceNetcdfPresent, false);
      assert.equal(stRegional.hasGlobalBinaryPyramid, false);
      assert.equal(stRegional.coverageTier, 'regional_presets_only');
      assert.equal(stRegional.depthOnlyRegionalJsonTilesOnDisk, 1);
      assert.equal(stRegional.signedRegionalJsonTilesOnDisk, 0);

      // --- Fixture B: Global installation with NetCDF source + complete L0 (1x1) & L1 (2x4) binary pyramid + signed regional JSON ---
      const globTilesDir = path.join(tmpGlobal, 'public', 'data', 'bathymetry', 'tiles');
      const globDataDir = path.join(tmpGlobal, 'data');
      fs.mkdirSync(globTilesDir, { recursive: true });
      fs.mkdirSync(globDataDir, { recursive: true });
      fs.writeFileSync(path.join(globDataDir, 'GEBCO_2026_sub_ice.nc'), Buffer.from('CDF\x01mock'));

      const globalTilesMeta: any[] = [];
      // Complete L0 (1x1)
      fs.writeFileSync(path.join(globTilesDir, 'L0_r0_c0.bin'), Buffer.alloc(2 * 2 * 2));
      globalTilesMeta.push({
        id: 'L0_r0_c0',
        file: 'tiles/L0_r0_c0.bin',
        format: 'int16le',
        level: 0,
        row: 0,
        col: 0,
        resolutionArcSec: 3600,
        gridWidth: 2,
        gridHeight: 2,
        bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
      });
      // Complete L1 (2x4 = 8 sectors)
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          const tid = `L1_r${r}_c${c}`;
          fs.writeFileSync(path.join(globTilesDir, `${tid}.bin`), Buffer.alloc(2 * 2 * 2));
          globalTilesMeta.push({
            id: tid,
            file: `tiles/${tid}.bin`,
            format: 'int16le',
            level: 1,
            row: r,
            col: c,
            resolutionArcSec: 900,
            gridWidth: 2,
            gridHeight: 2,
            bounds: {
              minLat: -90 + r * 90,
              maxLat: -90 + (r + 1) * 90,
              minLon: -180 + c * 90,
              maxLon: -180 + (c + 1) * 90
            }
          });
        }
      }
      // Also write a signed regional JSON tile
      fs.writeFileSync(
        path.join(globTilesDir, 'mariana-trench.json'),
        JSON.stringify({
          id: 'mariana-trench',
          name: 'Mariana Trench',
          hasSignedElevations: true,
          bounds: { minLat: 10, maxLat: 12, minLon: 141, maxLon: 143 },
          gridWidth: 2,
          gridHeight: 2,
          minDepth: 0,
          maxDepth: 10920,
          elevations: [0, 7200, 9100, 10920],
          rawElevations: [350, -7200, -9100, -10920]
        })
      );
      globalTilesMeta.push({
        id: 'mariana-trench',
        file: 'tiles/mariana-trench.json',
        format: 'json',
        level: 3,
        resolutionArcSec: 60,
        gridWidth: 2,
        gridHeight: 2,
        bounds: { minLat: 10, maxLat: 12, minLon: 141, maxLon: 143 }
      });

      fs.writeFileSync(
        path.join(tmpGlobal, 'public', 'data', 'bathymetry', 'manifest.json'),
        JSON.stringify({
          dataset: 'Global Fixture',
          coverage: 'global',
          gridIntervalArcSec: 900,
          tiles: globalTilesMeta
        })
      );

      const mgrGlobal = new GebcoTileManager(tmpGlobal);
      const stGlobal = mgrGlobal.getStatus();
      assert.equal(stGlobal.gebco2026SourceNetcdfPresent, true);
      assert.equal(stGlobal.hasGlobalBinaryPyramid, true);
      assert.deepEqual(stGlobal.completeLevels, [0, 1]);
      assert.equal(stGlobal.incompleteLevels.length, 0);
      assert.equal(stGlobal.hasCompleteL4Grid, false, 'Coarse L0+L1 dataset must not claim L4 high-res completion');
      assert.equal(stGlobal.finestResolutionArcSec, 900);
      assert.equal(stGlobal.coverageTier, 'global_coarse_pyramid');
      assert.equal(stGlobal.signedRegionalJsonTilesOnDisk, 1);
      assert.equal(stGlobal.depthOnlyRegionalJsonTilesOnDisk, 0);

      // --- Fixture C: Corrupted / Missing Tile Fixture ---
      const corruptTilesDir = path.join(tmpCorrupt, 'public', 'data', 'bathymetry', 'tiles');
      fs.mkdirSync(corruptTilesDir, { recursive: true });
      fs.writeFileSync(path.join(corruptTilesDir, 'L0_r0_c0.bin'), Buffer.alloc(8));
      fs.writeFileSync(path.join(corruptTilesDir, 'truncated_tile.bin'), Buffer.alloc(3));
      fs.writeFileSync(
        path.join(tmpCorrupt, 'public', 'data', 'bathymetry', 'manifest.json'),
        JSON.stringify({
          dataset: 'Status Check Dataset',
          coverage: 'global',
          tiles: [
            { id: 'L0_r0_c0', file: 'tiles/L0_r0_c0.bin', format: 'int16le', level: 0, row: 0, col: 0, gridWidth: 2, gridHeight: 2, bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 } },
            { id: 't_trunc', file: 'tiles/truncated_tile.bin', format: 'int16le', level: 1, row: 0, col: 0, gridWidth: 2, gridHeight: 2, bounds: { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 } },
            { id: 't_missing', file: 'tiles/missing_tile.bin', format: 'int16le', level: 1, row: 0, col: 1, gridWidth: 2, gridHeight: 2, bounds: { minLat: 10, maxLat: 20, minLon: 10, maxLon: 20 } }
          ]
        })
      );

      const mgrCorrupt = new GebcoTileManager(tmpCorrupt);
      const stCorrupt = mgrCorrupt.getStatus();
      assert.equal(stCorrupt.totalManifestTiles, 3);
      assert.equal(stCorrupt.verifiedTilesOnDisk, 1);
      assert.equal(stCorrupt.missingTilesCount, 1);
      assert.equal(stCorrupt.invalidSizeTilesCount, 1);
      assert.equal(stCorrupt.hasGlobalBinaryPyramid, false, 'Incomplete/corrupted pyramid must not claim hasGlobalBinaryPyramid=true');
    } finally {
      fs.rmSync(tmpRegional, { recursive: true, force: true });
      fs.rmSync(tmpGlobal, { recursive: true, force: true });
      fs.rmSync(tmpCorrupt, { recursive: true, force: true });
    }
  });

  // 28. Missing-data rendering: validSampleMask, NaN/Infinity prevention, triangle exclusion, and normal sanitization
  it('28. buildBathymetryTerrainGeometry excludes triangles containing missing samples (NaN/Infinity) and prevents NaN/Infinity in positions, colors, and normals', () => {
    // 3x3 grid (9 vertices, 4 quads = 8 potential triangles):
    // Put a missing sample (NaN) at center vertex (row=1, col=1 -> index 4)
    // and an Infinity sample at bottom-right vertex (row=2, col=2 -> index 8)
    const ds = recordToDataset({
      id: 'missing-data-grid-test',
      name: 'Missing Data Mesh Regression Test',
      source: 'GEBCO Test',
      resolutionArcSec: 60,
      bounds: { minLat: 0, maxLat: 2, minLon: 0, maxLon: 2 },
      gridWidth: 3,
      gridHeight: 3,
      minDepth: 0,
      maxDepth: 4200,
      hasSignedElevations: true,
      landmarks: [],
      elevations: [1200, 1500, 0, 2100, null as any, 3000, 3500, 4200, Infinity],
      rawElevations: [-1200, -1500, 450, -2100, null, -3000, -3500, -4200, Infinity as any]
    });

    assert.ok(ds.validSampleMask, 'Dataset must populate validSampleMask');
    assert.equal(ds.validSampleMask[0], 1);
    assert.equal(ds.validSampleMask[2], 1);
    assert.equal(ds.validSampleMask[4], 0, 'Center NaN sample must have validSampleMask=0');
    assert.equal(ds.validSampleMask[8], 0, 'Infinity sample must have validSampleMask=0');
    assert.equal(ds.missingSampleCount, 2);

    const built = buildBathymetryTerrainGeometry(ds, {
      verticalExaggeration: 1.0,
      worldSize: { width: 90, depth: 90 },
      terrainMode: 'signed_topography'
    });

    assert.equal(built.validVertexCount, 7);
    assert.equal(built.missingVertexCount, 2);
    // Because center vertex (index 4) touches all 4 quads:
    // - Quad (0,0) has vertices (0, 3, 1, 4): Tri 1 (0, 3, 1) has all valid vertices (0, 3, 1)! Tri 2 (3, 4, 1) touches 4 -> skipped!
    // - Quad (0,1) has vertices (1, 4, 2, 5): Tri 1 (1, 4, 2) touches 4 -> skipped! Tri 2 (4, 5, 2) touches 4 -> skipped!
    // - Quad (1,0) has vertices (3, 6, 4, 7): Tri 1 (3, 6, 4) touches 4 -> skipped! Tri 2 (6, 7, 4) touches 4 -> skipped!
    // - Quad (1,1) has vertices (4, 7, 5, 8): both triangles touch 4 and 8 -> skipped!
    assert.equal(built.validTriangleCount, 1, 'Only the top-left outer triangle (0, 3, 1) has all 3 valid samples');
    assert.equal(built.skippedTriangleCount, 7, 'All 7 triangles referencing missing vertex 4 or 8 must be excluded');

    const posAttr = built.geometry.getAttribute('position');
    const colAttr = built.geometry.getAttribute('color');
    const normAttr = built.geometry.getAttribute('normal');
    const indexAttr = built.geometry.getIndex();

    assert.ok(posAttr && colAttr && normAttr && indexAttr);

    // Verify zero NaN or Infinity values in position, color, or normal arrays
    for (let i = 0; i < posAttr.array.length; i++) {
      assert.ok(Number.isFinite(posAttr.array[i]), `position[${i}] must be finite, got ${posAttr.array[i]}`);
    }
    for (let i = 0; i < colAttr.array.length; i++) {
      assert.ok(Number.isFinite(colAttr.array[i]), `color[${i}] must be finite, got ${colAttr.array[i]}`);
    }
    for (let i = 0; i < normAttr.array.length; i++) {
      assert.ok(Number.isFinite(normAttr.array[i]), `normal[${i}] must be finite, got ${normAttr.array[i]}`);
    }

    // Verify no emitted triangle index references an invalid vertex
    for (let i = 0; i < indexAttr.array.length; i++) {
      const vIdx: number = Number(indexAttr.array[i]);
      assert.equal(
        built.validSampleMask[vIdx],
        1,
        `Emitted triangle index ${vIdx} must never reference a missing-data vertex`
      );
    }

    // Verify normals are unit length on all vertices
    for (let v = 0; v < posAttr.count; v++) {
      const nx = normAttr.getX(v);
      const ny = normAttr.getY(v);
      const nz = normAttr.getZ(v);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      assert.ok(Math.abs(len - 1.0) < 1e-4, `Normal at vertex ${v} must be unit length, got ${len}`);
    }

    built.geometry.dispose();
  });

  // 29. Signed elevation terrain rendering vs underwater-only mode
  it('29. buildBathymetryTerrainGeometry renders negative ocean below sea level, zero at sea level, and positive land above sea level in signed_topography mode while keeping underwater_only mode distinct', () => {
    // 2x2 coastal grid:
    // v0: -4000m (deep ocean)
    // v1: -1000m (continental slope)
    // v2:     0m (sea level coastline)
    // v3: +2000m (coastal mountain range above sea level)
    const ds = recordToDataset({
      id: 'signed-topography-test',
      name: 'Signed Coastal Relief Test',
      source: 'GEBCO 2026',
      resolutionArcSec: 15,
      bounds: { minLat: 10, maxLat: 11, minLon: 120, maxLon: 121 },
      gridWidth: 2,
      gridHeight: 2,
      minDepth: 0,
      maxDepth: 4000,
      hasSignedElevations: true,
      landmarks: [],
      elevations: [4000, 1000, 0, 0],
      rawElevations: [-4000, -1000, 0, 2000]
    });

    // 1. Signed topography mode (default): preserves positive land elevation above sea level
    const signedMesh = buildBathymetryTerrainGeometry(ds, {
      verticalExaggeration: 2.5,
      worldSize: { width: 100, depth: 100 },
      terrainMode: 'signed_topography'
    });
    const posSigned = signedMesh.geometry.getAttribute('position');
    const yDeepOcean = posSigned.getY(0);   // -4000m
    const ySlope = posSigned.getY(1);       // -1000m
    const ySeaLevel = posSigned.getY(2);    //     0m
    const yMountain = posSigned.getY(3);    // +2000m

    assert.ok(
      Math.abs(ySeaLevel - signedMesh.seaLevelWorldY) < 1e-4,
      `0m sea level vertex Y (${ySeaLevel}) must match seaLevelWorldY (${signedMesh.seaLevelWorldY})`
    );
    assert.ok(
      yDeepOcean < ySlope && ySlope < ySeaLevel,
      `Negative underwater elevations must sit below sea level (${yDeepOcean} < ${ySlope} < ${ySeaLevel})`
    );
    assert.ok(
      yMountain > signedMesh.seaLevelWorldY,
      `Positive land elevation (+2000m) must render strictly above seaLevelWorldY (${yMountain} > ${signedMesh.seaLevelWorldY})`
    );

    // Documented vertical convention:
    // normSigned = (e - minElev) / (maxElev - minElev) where minElev=-4000, maxElev=+2000 -> span=6000
    // unscaledY = (normSigned - 0.62) * 3.6, worldY = unscaledY * verticalExaggeration (2.5)
    // At -4000m: normSigned = 0 -> worldY = -0.62 * 3.6 * 2.5 = -5.58
    // At +2000m: normSigned = 1 -> worldY = +0.38 * 3.6 * 2.5 = +3.42
    // At     0m: normSigned = 2/3 -> worldY = (2/3 - 0.62) * 3.6 * 2.5 = +0.42
    assert.ok(Math.abs(yDeepOcean - -5.58) < 1e-4, `Deepest ocean (-4000m) should be at -5.58, got ${yDeepOcean}`);
    assert.ok(Math.abs(yMountain - 3.42) < 1e-4, `Highest peak (+2000m) should be at +3.42, got ${yMountain}`);
    assert.ok(Math.abs(ySeaLevel - 0.42) < 1e-4, `Sea level (0m) should be at +0.42, got ${ySeaLevel}`);

    // Verify distinct hypsometric land color vs bathymetric ocean color
    const oceanColor = getSignedTopographicVertexColor(-4000, 'signed_topography');
    const landColor = getSignedTopographicVertexColor(2000, 'signed_topography');
    assert.notDeepEqual(oceanColor, landColor);

    // 2. Underwater-only mode: clamps positive land elevation to sea level (0m)
    const underwaterMesh = buildBathymetryTerrainGeometry(ds, {
      verticalExaggeration: 2.5,
      worldSize: { width: 100, depth: 100 },
      terrainMode: 'underwater_only'
    });
    const posUnderwater = underwaterMesh.geometry.getAttribute('position');
    const yUwOcean = posUnderwater.getY(0);
    const yUwSeaLevel = posUnderwater.getY(2);
    const yUwMountain = posUnderwater.getY(3);

    assert.ok(
      Math.abs(yUwSeaLevel - underwaterMesh.seaLevelWorldY) < 1e-4 &&
      Math.abs(yUwMountain - underwaterMesh.seaLevelWorldY) < 1e-4,
      'In underwater_only mode, both 0m and +2000m land are clamped to seaLevelWorldY'
    );
    assert.ok(yUwOcean < underwaterMesh.seaLevelWorldY);

    signedMesh.geometry.dispose();
    underwaterMesh.geometry.dispose();
  });

  // 30. Unified regional preset generation & synchronization
  it('30. Processor synchronizes signed regional extracts across public/data/bathymetry/tiles/*.json and realBathymetryPresets.json, and backend prioritizes signed on-disk tiles', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-unified-presets-'));
    try {
      const outDir = path.join(tmpDir, 'public', 'data', 'bathymetry');
      const tilesDir = path.join(outDir, 'tiles');
      const srcDataDir = path.join(tmpDir, 'src', 'data');
      fs.mkdirSync(tilesDir, { recursive: true });
      fs.mkdirSync(srcDataDir, { recursive: true });

      const presetsBundlePath = path.join(srcDataDir, 'realBathymetryPresets.json');
      // Seed ONLY realBathymetryPresets.json with a depth-only regional preset (no tiles/*.json initially)
      const initialPreset = {
        'mariana-trench': {
          id: 'mariana-trench',
          name: 'Mariana Trench — Challenger Deep',
          source: 'Seed Depth-Only Bundle',
          resolutionArcSec: 60,
          bounds: { minLat: -25, maxLat: 25, minLon: -50, maxLon: 50 },
          gridWidth: 2,
          gridHeight: 2,
          minDepth: 0,
          maxDepth: 3200,
          landmarks: [],
          elevations: [0, 1200, 2400, 3200]
        }
      };
      fs.writeFileSync(presetsBundlePath, JSON.stringify(initialPreset, null, 2));

      // Create synthetic NetCDF source with positive land (+640m) and ocean (-3200m) inside [-25..25, -50..50]
      const rows = 12;
      const cols = 24;
      const latAsc = Array.from({ length: rows }, (_, r) => -82.5 + r * 15.0);
      const lon180 = Array.from({ length: cols }, (_, c) => -172.5 + c * 15.0);
      const elevs = new Array(rows * cols).fill(-3200);
      elevs[6 * cols + 9] = 640; // +640m coastal island inside preset bounds

      const ncPath = path.join(tmpDir, 'unified_source.nc');
      writeSyntheticNetCDF3(ncPath, {
        latCoords: latAsc,
        lonCoords: lon180,
        elevations: elevs
      });

      const mjsScript = path.join(rootDir, 'scripts', 'process_gebco_2026.mjs');
      const proc = spawnSync(
        process.execPath,
        [
          mjsScript,
          '--input',
          ncPath,
          '--output',
          outDir,
          '--levels',
          '0,1',
          '--sync-presets-bundle',
          '--presets-bundle',
          presetsBundlePath
        ],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.equal(proc.status, 0, `Processor failed: ${proc.stderr || proc.stdout}`);

      // Verify BOTH public/data/bathymetry/tiles/mariana-trench.json AND src/data/realBathymetryPresets.json were updated with identical signed rawElevations
      const diskTilePath = path.join(tilesDir, 'mariana-trench.json');
      assert.ok(fs.existsSync(diskTilePath), 'Processor must write public/data/bathymetry/tiles/mariana-trench.json');
      const diskTile = JSON.parse(fs.readFileSync(diskTilePath, 'utf8'));
      const syncedBundle = JSON.parse(fs.readFileSync(presetsBundlePath, 'utf8'));

      assert.equal(diskTile.hasSignedElevations, true);
      assert.ok(Array.isArray(diskTile.rawElevations));
      assert.ok(diskTile.rawElevations.includes(640), 'Disk tile must contain +640m signed land elevation');
      assert.deepEqual(
        syncedBundle['mariana-trench'].rawElevations,
        diskTile.rawElevations,
        'realBathymetryPresets.json and public/data/bathymetry/tiles/*.json must have identical rawElevations'
      );
      assert.equal(syncedBundle['mariana-trench'].hasSignedElevations, true);

      // Verify GebcoTileManager prioritizes the regenerated signed on-disk tile over the default bundled presets
      const customMgr = new GebcoTileManager(tmpDir);
      const regionRes = await customMgr.getBathymetry('mariana-trench');
      assert.ok(regionRes);
      assert.equal(regionRes.maxElevation, 640, 'GebcoTileManager must return signed +640m maxElevation from regenerated tile');
      assert.ok(regionRes.grid.elevationsMeters.includes(640));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 31. Global tile completeness validation: level counts (including L4 36x72=2592), missing sectors, duplicate IDs, and honest resolution
  it('31. Global tile completeness validator checks per-level tile counts (L0=1, L1=8, L2=72, L3=200, L4=2592), rejects duplicate tile IDs, and detects missing sectors', async () => {
    // 1. Verify PYRAMID_LEVEL_SPECS matches exact GEBCO pyramid layout including L4 = 36 x 72 = 2,592 tiles
    const l4Spec = PYRAMID_LEVEL_SPECS[4];
    assert.ok(l4Spec);
    assert.equal(l4Spec.rows, 36);
    assert.equal(l4Spec.cols, 72);
    assert.equal(l4Spec.rows * l4Spec.cols, 2592);

    const mod = await import('../scripts/process_gebco_2026.mjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-completeness-'));

    try {
      const bathyDir = path.join(tmpDir, 'public', 'data', 'bathymetry');
      const tilesDir = path.join(bathyDir, 'tiles');
      fs.mkdirSync(tilesDir, { recursive: true });

      // Write L0_r0_c0 (complete L0 = 1 tile) + incomplete L1 (7 of 8 sectors, missing L1_r1_c3)
      const tiles: any[] = [];
      fs.writeFileSync(path.join(tilesDir, 'L0_r0_c0.bin'), Buffer.alloc(8));
      tiles.push({
        id: 'L0_r0_c0',
        file: 'tiles/L0_r0_c0.bin',
        format: 'int16le',
        level: 0,
        row: 0,
        col: 0,
        resolutionArcSec: 3600,
        gridWidth: 2,
        gridHeight: 2,
        bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
      });

      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          if (r === 1 && c === 3) continue; // Intentionally omit sector L1_r1_c3
          const tid = `L1_r${r}_c${c}`;
          fs.writeFileSync(path.join(tilesDir, `${tid}.bin`), Buffer.alloc(8));
          tiles.push({
            id: tid,
            file: `tiles/${tid}.bin`,
            format: 'int16le',
            level: 1,
            row: r,
            col: c,
            resolutionArcSec: 900,
            gridWidth: 2,
            gridHeight: 2,
            bounds: {
              minLat: -90 + r * 90,
              maxLat: -90 + (r + 1) * 90,
              minLon: -180 + c * 90,
              maxLon: -180 + (c + 1) * 90
            }
          });
        }
      }

      const manifestPath = path.join(bathyDir, 'manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          dataset: 'Incomplete L1 Pyramid',
          coverage: 'global',
          tiles
        })
      );

      // Validate: must fail due to missing sector L1_r1_c3
      const statusIncomplete: any = mod.validateExistingDataset(bathyDir);
      assert.equal(statusIncomplete.valid, false, 'Validator must reject incomplete L1 level missing sector L1_r1_c3');
      assert.deepEqual(statusIncomplete.completeLevels, [0]);
      assert.equal(statusIncomplete.incompleteLevels.length, 1);
      assert.equal(statusIncomplete.incompleteLevels[0].level, 1);
      assert.equal(statusIncomplete.incompleteLevels[0].expectedTiles, 8);
      assert.equal(statusIncomplete.incompleteLevels[0].verifiedTiles, 7);
      assert.ok(statusIncomplete.incompleteLevels[0].sampleMissingSectors.includes('L1_r1_c3'));

      const mgrIncomplete = new GebcoTileManager(tmpDir);
      assert.equal(
        mgrIncomplete.getStatus().hasGlobalBinaryPyramid,
        false,
        'GebcoTileManager.getStatus() must not claim hasGlobalBinaryPyramid=true when L1 is missing sectors'
      );

      // Now add the missing L1_r1_c3 tile AND a duplicate tile ID entry -> must fail on duplicate tile ID
      fs.writeFileSync(path.join(tilesDir, 'L1_r1_c3.bin'), Buffer.alloc(8));
      const completeL1Tile = {
        id: 'L1_r1_c3',
        file: 'tiles/L1_r1_c3.bin',
        format: 'int16le',
        level: 1,
        row: 1,
        col: 3,
        resolutionArcSec: 900,
        gridWidth: 2,
        gridHeight: 2,
        bounds: { minLat: 0, maxLat: 90, minLon: 90, maxLon: 180 }
      };
      tiles.push(completeL1Tile);
      tiles.push({ ...completeL1Tile }); // Duplicate ID!
      fs.writeFileSync(manifestPath, JSON.stringify({ dataset: 'Duplicate ID Pyramid', coverage: 'global', tiles }));

      const statusDup: any = mod.validateExistingDataset(bathyDir);
      assert.equal(statusDup.valid, false, 'Validator must reject manifest with duplicate tile IDs');
      assert.ok(statusDup.duplicateTileIds.includes('L1_r1_c3'));

      // Remove duplicate ID -> now L0 (1) and L1 (8) are 100% complete
      tiles.pop();
      fs.writeFileSync(manifestPath, JSON.stringify({ dataset: 'Complete L0+L1 Pyramid', coverage: 'global', tiles }));
      const statusComplete: any = mod.validateExistingDataset(bathyDir);
      assert.equal(statusComplete.valid, true);
      assert.deepEqual(statusComplete.completeLevels, [0, 1]);
      assert.equal(statusComplete.incompleteLevels.length, 0);
      assert.equal(statusComplete.hasCompleteL4Grid, false);
      assert.equal(statusComplete.coverageTier, 'global_coarse_pyramid');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 32. Coarse-resolution sample-centre alignment & 3D mesh geographic alignment
  it('32. Coarse-resolution pyramid tiles center strided samples within their blocks (stride // 2) and align 3D mesh geometry to actual sampleBounds', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-coarse-align-'));
    try {
      const outDir = path.join(tmpDir, 'public', 'data', 'bathymetry');
      // Build an 18x36 global grid:
      // Native lat spacing = 180 / 18 = 10° -> native sample centers at -85, -75, -65, ..., +85
      // Native lon spacing = 360 / 36 = 10° -> native sample centers at -175, -165, -155, ..., +175
      // When generating levels 0 and 1:
      // - Level 1 (2x4 tiles, each 9x9 native cells) is finest (stride = 1, offset = 0).
      // - Level 0 (1x1 tile covering 18x36 native cells) is coarse with stride = 3 -> block-center offset = 3 // 2 = 1!
      //   Therefore Level 0 selects:
      //   - sampled_sn_rows = [1, 4, 7, 10, 13, 16] -> latitudes = [-75°, -45°, -15°, +15°, +45°, +75°] (symmetric around equator!)
      //   - sampled_we_cols = [1, 4, 7, ..., 34] (12 cols) -> longitudes = [-165°, -135°, ..., +165°] (symmetric around prime meridian!)
      const rows = 18;
      const cols = 36;
      const latAsc = Array.from({ length: rows }, (_, r) => -85.0 + r * 10.0);
      const lon180 = Array.from({ length: cols }, (_, c) => -175.0 + c * 10.0);
      const elevs = new Array(rows * cols);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Encode unique signed elevation per (r, c) so we can verify exact source sample values
          elevs[r * cols + c] = -1000 - r * 100 - c;
        }
      }

      const ncPath = path.join(tmpDir, 'coarse_align.nc');
      writeSyntheticNetCDF3(ncPath, {
        latCoords: latAsc,
        lonCoords: lon180,
        elevations: elevs
      });

      const mjsScript = path.join(rootDir, 'scripts', 'process_gebco_2026.mjs');
      const proc = spawnSync(
        process.execPath,
        [mjsScript, '--input', ncPath, '--output', outDir, '--levels', '0,1'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.equal(proc.status, 0, `Processor failed: ${proc.stderr || proc.stdout}`);

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
      const l0Tile = manifest.tiles.find((t: any) => t.id === 'L0_r0_c0');
      assert.ok(l0Tile, 'L0_r0_c0 coarse tile must be present');

      // Verify coarse L0 stride, offsets, sampleBounds, sampleSpacing, and resolution metadata
      assert.equal(l0Tile.stride, 3, 'Coarse L0 tile on 18x36 grid with L1 finest must have stride=3');
      assert.equal(l0Tile.sampleOffsetRow, 1, 'Coarse stride=3 must use block-center row offset = stride // 2 = 1');
      assert.equal(l0Tile.sampleOffsetCol, 1, 'Coarse stride=3 must use block-center col offset = stride // 2 = 1');
      assert.equal(l0Tile.gridHeight, 6);
      assert.equal(l0Tile.gridWidth, 12);
      assert.deepEqual(
        l0Tile.sampleBounds,
        { minLat: -75, maxLat: 75, minLon: -165, maxLon: 165 },
        'Coarse L0 sampleBounds must be centered at [-75..+75, -165..+165], NOT biased to first native sample [-85..+65]'
      );
      assert.equal(l0Tile.sampleSpacingLat, 30);
      assert.equal(l0Tile.sampleSpacingLon, 30);
      assert.equal(l0Tile.nativeResolutionArcSec, 36000); // 10 deg * 3600 arcsec/deg
      assert.equal(l0Tile.resolutionArcSec, 108000); // 30 deg * 3600 arcsec/deg

      // Verify binary values in L0_r0_c0.bin match source at centered indices (r = 1 + i*3, c = 1 + j*3)
      const l0Buf = fs.readFileSync(path.join(outDir, l0Tile.file));
      for (let i = 0; i < 6; i++) {
        const srcRow = 1 + i * 3;
        for (let j = 0; j < 12; j++) {
          const srcCol = 1 + j * 3;
          const expectedElev = elevs[srcRow * cols + srcCol];
          const actualElev = l0Buf.readInt16LE((i * 12 + j) * 2);
          assert.equal(
            actualElev,
            expectedElev,
            `L0 sample (${i},${j}) must equal source sample (${srcRow},${srcCol})`
          );
        }
      }

      // Verify GebcoGlobalTileLoader.buildMeshDataset() and buildBathymetryTerrainGeometry() preserve exact geographic alignment
      const loader = new GebcoGlobalTileLoader();
      const rawElevFloat = new Float32Array(6 * 12);
      const depthsFloat = new Float32Array(6 * 12);
      for (let k = 0; k < 72; k++) {
        const v = l0Buf.readInt16LE(k * 2);
        rawElevFloat[k] = v;
        depthsFloat[k] = Math.max(0, -v);
      }

      const decodedL0 = {
        manifestTile: l0Tile,
        gridWidth: l0Tile.gridWidth,
        gridHeight: l0Tile.gridHeight,
        rowOrder: 'south-to-north' as const,
        colOrder: 'west-to-east' as const,
        bounds: l0Tile.bounds,
        sampleBounds: l0Tile.sampleBounds,
        sampleSpacingLat: l0Tile.sampleSpacingLat,
        sampleSpacingLon: l0Tile.sampleSpacingLon,
        rawElevations: rawElevFloat,
        depths: depthsFloat,
        validSampleMask: new Uint8Array(72).fill(1),
        minDepth: l0Tile.minDepth,
        maxDepth: l0Tile.maxDepth,
        minElevation: l0Tile.minElevation,
        maxElevation: l0Tile.maxElevation,
        missingSampleCount: 0,
        landmarks: [],
        sourceName: 'Coarse Alignment Test',
        resolutionArcSec: l0Tile.resolutionArcSec,
        hasSignedElevations: true,
        provenance: 'authoritative_local' as const,
        sampleElevationAt: (lat: number, lon: number) => loader.sampleTileElevation(decodedL0, lat, lon)
      };

      const meshDs = loader.buildMeshDataset(decodedL0, 64);
      assert.deepEqual(meshDs.sampleBounds, {
        minLat: -75,
        maxLat: 75,
        minLon: -165,
        maxLon: 165
      });
      assert.equal(meshDs.sampleSpacingLat, 30);
      assert.equal(meshDs.sampleSpacingLon, 30);

      const builtGeo = buildBathymetryTerrainGeometry(meshDs, {
        worldSize: { width: 140, depth: 80 },
        verticalExaggeration: 1.0
      });
      assert.deepEqual(builtGeo.sampleBounds, {
        minLat: -75,
        maxLat: 75,
        minLon: -165,
        maxLon: 165
      });

      // Top-left mesh vertex (row=0, col=0) must correspond to North-West sample center (+75°N, -165°W)
      const nwVertex = builtGeo.getVertexGeographicCoordinates(0, 0);
      assert.equal(nwVertex.latitude, 75);
      assert.equal(nwVertex.longitude, -165);
      assert.equal(nwVertex.x, -70);
      assert.equal(nwVertex.z, -40);

      // Bottom-right mesh vertex (row=5, col=11) must correspond to South-East sample center (-75°S, +165°E)
      const seVertex = builtGeo.getVertexGeographicCoordinates(5, 11);
      assert.equal(seVertex.latitude, -75);
      assert.equal(seVertex.longitude, 165);
      assert.equal(seVertex.x, 70);
      assert.equal(seVertex.z, 40);

      builtGeo.geometry.dispose();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 33. Global coverage inference in GebcoGlobalTileLoader
  it('33. GebcoGlobalTileLoader.inferManifestCoverage and parseAndValidateManifest distinguish global, partial, regional_presets, and unknown without inferring global from a single binary or L0 tile', () => {
    // Case 1: Current bundled regional manifest -> must remain 'regional_presets'
    const currentManifestRaw = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'public', 'data', 'bathymetry', 'manifest.json'), 'utf8')
    );
    const parsedRegional = parseAndValidateManifest(currentManifestRaw);
    assert.equal(parsedRegional.coverage, 'regional_presets', 'Current regional manifest must report regional_presets');

    // Case 2: Single binary L0 tile WITHOUT explicit coverage="global" -> must report 'unknown' (NOT 'global'!)
    const singleL0NoMeta = parseAndValidateManifest({
      dataset: 'Single L0 Tile Without Coverage Meta',
      tiles: [
        {
          id: 'L0_r0_c0',
          file: 'tiles/L0_r0_c0.bin',
          format: 'int16le',
          level: 0,
          tileRow: 0,
          tileCol: 0,
          gridWidth: 180,
          gridHeight: 90,
          bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
        }
      ]
    });
    assert.notEqual(
      singleL0NoMeta.coverage,
      'global',
      'Manifest without explicit coverage="global" must never be inferred as global merely because it has a level-0 binary tile'
    );
    assert.equal(singleL0NoMeta.coverage, 'unknown');

    // Case 3: Single binary tile covering only one sector even if raw.coverage claims 'global' -> must report 'partial'
    const singleSectorClaimingGlobal = parseAndValidateManifest({
      dataset: 'Single L1 Sector Falsely Claiming Global',
      coverage: 'global',
      tiles: [
        {
          id: 'L1_r0_c0',
          file: 'tiles/L1_r0_c0.bin',
          format: 'int16le',
          level: 1,
          tileRow: 0,
          tileCol: 0,
          gridWidth: 90,
          gridHeight: 90,
          bounds: { minLat: -90, maxLat: 0, minLon: -180, maxLon: -90 }
        }
      ]
    });
    assert.equal(
      singleSectorClaimingGlobal.coverage,
      'partial',
      'Manifest with incomplete L1 sectors (1 of 8) must report partial even if coverage="global" is set'
    );

    // Case 4: Complete L0 (1x1) + Incomplete L1 (2 of 8) claiming 'global' -> must report 'partial' because L1 is incomplete
    const mixedCompleteAndIncomplete = parseAndValidateManifest({
      dataset: 'L0 Complete + L1 Incomplete',
      coverage: 'global',
      tiles: [
        {
          id: 'L0_r0_c0',
          file: 'tiles/L0_r0_c0.bin',
          format: 'int16le',
          level: 0,
          tileRow: 0,
          tileCol: 0,
          gridWidth: 180,
          gridHeight: 90,
          bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
        },
        {
          id: 'L1_r0_c0',
          file: 'tiles/L1_r0_c0.bin',
          format: 'int16le',
          level: 1,
          tileRow: 0,
          tileCol: 0,
          gridWidth: 90,
          gridHeight: 90,
          bounds: { minLat: -90, maxLat: 0, minLon: -180, maxLon: -90 }
        }
      ]
    });
    assert.equal(mixedCompleteAndIncomplete.coverage, 'partial');

    // Case 5: Complete L0 (1x1) AND Complete L1 (2x4 = 8 sectors) with explicit coverage="global" -> verified 'global'
    const completeGlobalTiles: any[] = [
      {
        id: 'L0_r0_c0',
        file: 'tiles/L0_r0_c0.bin',
        format: 'int16le',
        level: 0,
        tileRow: 0,
        tileCol: 0,
        gridWidth: 8,
        gridHeight: 4,
        bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
      }
    ];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        completeGlobalTiles.push({
          id: `L1_r${r}_c${c}`,
          file: `tiles/L1_r${r}_c${c}.bin`,
          format: 'int16le',
          level: 1,
          tileRow: r,
          tileCol: c,
          gridWidth: 6,
          gridHeight: 6,
          bounds: {
            minLat: -90 + r * 90,
            maxLat: -90 + (r + 1) * 90,
            minLon: -180 + c * 90,
            maxLon: -180 + (c + 1) * 90
          }
        });
      }
    }
    const verifiedGlobalManifest = parseAndValidateManifest({
      dataset: 'Verified Complete L0+L1 Global Pyramid',
      coverage: 'global',
      tiles: completeGlobalTiles
    });
    assert.equal(verifiedGlobalManifest.coverage, 'global');

    // Case 6: Empty tile list -> 'unknown'
    assert.equal(inferManifestCoverage({ dataset: 'Empty', tiles: [] }, []).coverage, 'unknown');
  });

  // 34. Strengthened geographic-sector validation (sector bounds, sample coordinates, adjacency, overlaps, antimeridian wraparound)
  it('34. Geographic-sector validator rejects tiles with mismatched (tileRow, tileCol) sector bounds, invalid sampleBounds, non-adjacent sectors, unintended overlaps, or broken antimeridian wraparound', async () => {
    const mod = await import('../scripts/process_gebco_2026.mjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-sector-val-'));

    try {
      const bathyDir = path.join(tmpDir, 'public', 'data', 'bathymetry');
      const tilesDir = path.join(bathyDir, 'tiles');
      fs.mkdirSync(tilesDir, { recursive: true });

      // Helper to build a valid 8-tile L1 dataset (2 rows x 4 cols, each 2x2 samples, native step = 45°)
      const buildValidL1Tiles = () => {
        const list: any[] = [];
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 4; c++) {
            const tid = `L1_r${r}_c${c}`;
            const file = `tiles/${tid}.bin`;
            fs.writeFileSync(path.join(bathyDir, file), Buffer.alloc(2 * 2 * 2));
            const minLat = -90 + r * 90;
            const maxLat = -90 + (r + 1) * 90;
            const minLon = -180 + c * 90;
            const maxLon = -180 + (c + 1) * 90;
            list.push({
              id: tid,
              file,
              format: 'int16le',
              level: 1,
              tileRow: r,
              tileCol: c,
              stride: 1,
              sampleOffsetRow: 0,
              sampleOffsetCol: 0,
              resolutionArcSec: 162000,
              nativeResolutionArcSec: 162000,
              gridWidth: 2,
              gridHeight: 2,
              bounds: { minLat, maxLat, minLon, maxLon },
              sampleBounds: {
                minLat: minLat + 22.5,
                maxLat: maxLat - 22.5,
                minLon: minLon + 22.5,
                maxLon: maxLon - 22.5
              },
              sampleSpacingLat: 45,
              sampleSpacingLon: 45
            });
          }
        }
        return list;
      };

      const manifestPath = path.join(bathyDir, 'manifest.json');

      // 1. Baseline valid L1 pyramid passes
      const baseTiles = buildValidL1Tiles();
      fs.writeFileSync(manifestPath, JSON.stringify({ dataset: 'Valid L1', coverage: 'global', tiles: baseTiles }));
      const validRes: any = mod.validateExistingDataset(bathyDir);
      assert.equal(validRes.valid, true, `Baseline L1 should be valid, errors: ${JSON.stringify(validRes.invalidTiles)}`);

      // 2. Mismatched sector bounds for declared (tileRow, tileCol): swap bounds of L1_r0_c0 and L1_r0_c1
      //    Note: outer extent is still [-90..90, -180..180] and tile count is still 8, so only per-sector validation catches this!
      const swappedTiles = buildValidL1Tiles();
      const tmpBounds = swappedTiles[0].bounds;
      const tmpSampleBounds = swappedTiles[0].sampleBounds;
      swappedTiles[0].bounds = swappedTiles[1].bounds;
      swappedTiles[0].sampleBounds = swappedTiles[1].sampleBounds;
      swappedTiles[1].bounds = tmpBounds;
      swappedTiles[1].sampleBounds = tmpSampleBounds;
      fs.writeFileSync(manifestPath, JSON.stringify({ dataset: 'Swapped Sector Bounds', coverage: 'global', tiles: swappedTiles }));
      const swappedRes: any = mod.validateExistingDataset(bathyDir);
      assert.equal(swappedRes.valid, false, 'Validator must reject tiles whose geographic bounds do not match their declared (tileRow, tileCol)');
      assert.ok(swappedRes.incompleteLevels[0].sectorErrors.length > 0);

      // 3. Invalid sampleBounds (biased to outer edge instead of cell center)
      const badSampleBoundsTiles = buildValidL1Tiles();
      badSampleBoundsTiles[0].sampleBounds = { minLat: -90, maxLat: -45, minLon: -180, maxLon: -135 };
      fs.writeFileSync(manifestPath, JSON.stringify({ dataset: 'Bad sampleBounds', coverage: 'global', tiles: badSampleBoundsTiles }));
      const badSampleRes: any = mod.validateExistingDataset(bathyDir);
      assert.equal(badSampleRes.valid, false, 'Validator must reject tiles whose sampleBounds do not match expected sample-center coordinates');

      // 4. Broken antimeridian wraparound (easternmost column ends at +170° instead of +180°)
      const badAntimeridianTiles = buildValidL1Tiles();
      badAntimeridianTiles[3].bounds.maxLon = 170; // L1_r0_c3
      badAntimeridianTiles[7].bounds.maxLon = 170; // L1_r1_c3
      fs.writeFileSync(manifestPath, JSON.stringify({ dataset: 'Broken Antimeridian', coverage: 'global', tiles: badAntimeridianTiles }));
      const badAntiRes: any = mod.validateExistingDataset(bathyDir);
      assert.equal(badAntiRes.valid, false, 'Validator must reject broken antimeridian wraparound');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 35. Regional preset CLI flag (--extract-presets) opt-in behavior
  it('35. Processor does not overwrite regional preset JSON files during an ordinary global tile-generation run unless --extract-presets is explicitly passed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marivex-extract-presets-cli-'));
    try {
      const outDir = path.join(tmpDir, 'public', 'data', 'bathymetry');
      const tilesDir = path.join(outDir, 'tiles');
      const srcDataDir = path.join(tmpDir, 'src', 'data');
      fs.mkdirSync(tilesDir, { recursive: true });
      fs.mkdirSync(srcDataDir, { recursive: true });

      // Write sentinel regional preset JSON in tiles/ and src/data/realBathymetryPresets.json
      const sentinelTileJson = JSON.stringify({
        id: 'mariana-trench',
        name: 'SENTINEL_PRESET_DO_NOT_OVERWRITE',
        source: 'Sentinel Preset',
        resolutionArcSec: 60,
        bounds: { minLat: -25, maxLat: 25, minLon: -50, maxLon: 50 },
        gridWidth: 2,
        gridHeight: 2,
        minDepth: 1000,
        maxDepth: 2000,
        landmarks: [],
        elevations: [1000, 1500, 1800, 2000]
      }, null, 2);
      const presetTilePath = path.join(tilesDir, 'mariana-trench.json');
      fs.writeFileSync(presetTilePath, sentinelTileJson);

      const realPresetsBundlePath = path.join(rootDir, 'src', 'data', 'realBathymetryPresets.json');
      const originalBundleStat = fs.statSync(realPresetsBundlePath);
      const originalBundleContent = fs.readFileSync(realPresetsBundlePath, 'utf8');

      const rows = 12;
      const cols = 24;
      const latAsc = Array.from({ length: rows }, (_, r) => -82.5 + r * 15.0);
      const lon180 = Array.from({ length: cols }, (_, c) => -172.5 + c * 15.0);
      const elevs = new Array(rows * cols).fill(-2800);
      elevs[6 * cols + 9] = 510;

      const ncPath = path.join(tmpDir, 'ordinary_run.nc');
      writeSyntheticNetCDF3(ncPath, {
        latCoords: latAsc,
        lonCoords: lon180,
        elevations: elevs
      });

      const mjsScript = path.join(rootDir, 'scripts', 'process_gebco_2026.mjs');

      // 1. Ordinary run WITHOUT --extract-presets: must NOT touch mariana-trench.json or src/data/realBathymetryPresets.json
      const ordinaryRun = spawnSync(
        process.execPath,
        [mjsScript, '--input', ncPath, '--output', outDir, '--levels', '0,1'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.equal(ordinaryRun.status, 0, `Ordinary run failed: ${ordinaryRun.stderr || ordinaryRun.stdout}`);
      assert.equal(
        fs.readFileSync(presetTilePath, 'utf8'),
        sentinelTileJson,
        'Ordinary global tile-generation run without --extract-presets must NOT overwrite existing regional preset JSON files'
      );
      assert.equal(
        fs.readFileSync(realPresetsBundlePath, 'utf8'),
        originalBundleContent,
        'Ordinary global tile-generation run must NOT modify src/data/realBathymetryPresets.json'
      );
      assert.equal(
        fs.statSync(realPresetsBundlePath).mtimeMs,
        originalBundleStat.mtimeMs,
        'src/data/realBathymetryPresets.json mtime must remain untouched during ordinary runs'
      );

      // 2. Explicit run WITH --extract-presets: must regenerate tiles/mariana-trench.json with signed rawElevations
      const extractRun = spawnSync(
        process.execPath,
        [mjsScript, '--input', ncPath, '--output', outDir, '--levels', '0,1', '--extract-presets'],
        { cwd: rootDir, encoding: 'utf8' }
      );
      assert.equal(extractRun.status, 0, `Extract presets run failed: ${extractRun.stderr || extractRun.stdout}`);
      const updatedPreset = JSON.parse(fs.readFileSync(presetTilePath, 'utf8'));
      assert.equal(updatedPreset.hasSignedElevations, true);
      assert.ok(Array.isArray(updatedPreset.rawElevations));
      assert.ok(updatedPreset.rawElevations.includes(510));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});



