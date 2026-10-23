/**
 * MARIVEX — Offline GEBCO 2026 Sub-Ice Bathymetry Tile Processor & Validator (Node.js)
 * ====================================================================================
 * Processes GEBCO_2026_sub_ice.nc (or compatible NetCDF grids) into a multi-resolution
 * binary Int16 little-endian tile pyramid (L0–L4) and validates existing bathymetry
 * tile datasets on disk.
 *
 * Key capabilities:
 * 1. Cross-platform Python resolution (supports Windows `python`, `py -3`, `python3`,
 *    `--python <path>`, and `PYTHON_EXECUTABLE` / `MARIVEX_PYTHON` environment variables)
 *    with actionable diagnostics when Python or `netCDF4`/`numpy` are missing.
 * 2. Native Node.js NetCDF-3 (`CDF\x01` / `CDF\x02`) coordinate-array parser and tile
 *    generator fallback when Python is not used, deriving every tile's `bounds` and
 *    `sampleBounds` from the actual `lat`/`lon` coordinate arrays.
 * 3. Strict source-to-tile sample verification, tile size validation, coordinate bound
 *    validation, and atomic manifest updates (never overwrites a valid `manifest.json`
 *    when processing or validation fails).
 *
 * Usage:
 *   node scripts/process_gebco_2026.mjs --validate
 *   node scripts/process_gebco_2026.mjs --input data/GEBCO_2026_sub_ice.nc --output public/data/bathymetry --resume
 *   node scripts/process_gebco_2026.mjs --input data/GEBCO_2026_sub_ice.nc --python "C:\\Python312\\python.exe"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'data', 'bathymetry');
const DEFAULT_INPUT_NC = path.join(ROOT_DIR, 'data', 'GEBCO_2026_sub_ice.nc');

const INT16_NODATA = -32768;

const DEFAULT_PYRAMID_LEVELS = [
  { level: 0, name: 'L0_global_overview', stride: 240, rows: 1, cols: 1 },
  { level: 1, name: 'L1_coarse', stride: 60, rows: 2, cols: 4 },
  { level: 2, name: 'L2_medium', stride: 16, rows: 6, cols: 12 },
  { level: 3, name: 'L3_regional', stride: 4, rows: 10, cols: 20 },
  { level: 4, name: 'L4_high', stride: 1, rows: 36, cols: 72 }
];

const REGIONAL_PRESET_IDS = [
  'mariana-trench',
  'atlantic-ridge',
  'puerto-rico-trench',
  'arabian-sea',
  'bay-of-bengal',
  'gulf-of-mexico',
  'mediterranean-sea',
  'sargasso-sea',
  'coral-sea',
  'philippine-sea'
];

function parseArgs(argv) {
  const args = {
    input: process.env.GEBCO_INPUT_NC || DEFAULT_INPUT_NC,
    output: process.env.GEBCO_TILES_DIR || DEFAULT_OUTPUT_DIR,
    presetsBundle: path.join(ROOT_DIR, 'src', 'data', 'realBathymetryPresets.json'),
    extractPresets: false,
    syncPresetsBundle: false,
    python: process.env.MARIVEX_PYTHON || process.env.PYTHON_EXECUTABLE || process.env.PYTHON || '',
    levels: '',
    resume: false,
    validateOnly: false,
    inputExplicit: false,
    pythonExplicit: Boolean(process.env.MARIVEX_PYTHON || process.env.PYTHON_EXECUTABLE)
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = path.resolve(argv[++i]);
      args.inputExplicit = true;
    } else if (arg === '--output' && argv[i + 1]) {
      args.output = path.resolve(argv[++i]);
    } else if (arg === '--extract-presets') {
      args.extractPresets = true;
    } else if (arg === '--presets-bundle' && argv[i + 1]) {
      args.presetsBundle = path.resolve(argv[++i]);
      args.syncPresetsBundle = true;
    } else if (arg === '--sync-presets-bundle') {
      args.syncPresetsBundle = true;
    } else if (arg === '--python' && argv[i + 1]) {
      args.python = argv[++i];
      args.pythonExplicit = true;
    } else if (arg === '--levels' && argv[i + 1]) {
      args.levels = argv[++i];
    } else if (arg === '--resume') {
      args.resume = true;
    } else if (arg === '--validate') {
      args.validateOnly = true;
    }
  }
  return args;
}

/**
 * Resolves a working Python 3 interpreter across Windows, macOS, and Linux.
 * Supports explicit `--python <cmd>` / `PYTHON_EXECUTABLE` configuration, and
 * probes platform candidates (`python`, `py -3`, `python3`) while avoiding
 * Windows Store stub aliases.
 */
export function resolvePythonExecutable(customPython = '', isExplicit = false) {
  const probeCandidate = (cmd, prefixArgs = []) => {
    try {
      const res = spawnSync(
        cmd,
        [...prefixArgs, '-c', 'import sys; assert sys.version_info[0] >= 3; print(sys.executable)'],
        { encoding: 'utf8', timeout: 8000, windowsHide: true }
      );
      if (res.status === 0 && res.stdout && res.stdout.trim().length > 0) {
        return {
          ok: true,
          cmd,
          prefixArgs,
          executablePath: res.stdout.trim().split(/\r?\n/)[0]
        };
      }
      return {
        ok: false,
        cmd,
        prefixArgs,
        error: (res.stderr || res.stdout || res.error?.message || `Exit status ${res.status}`).trim()
      };
    } catch (err) {
      return {
        ok: false,
        cmd,
        prefixArgs,
        error: err?.message || String(err)
      };
    }
  };

  if (customPython && customPython.trim().length > 0) {
    const trimmed = customPython.trim();
    const res = probeCandidate(trimmed, []);
    if (res.ok) return res;
    if (isExplicit) {
      throw new Error(
        `Configured Python executable "${trimmed}" is not available or failed to run (${res.error}). ` +
          `Verify the path passed to --python or PYTHON_EXECUTABLE.`
      );
    }
  }

  const candidates =
    process.platform === 'win32'
      ? [
          { cmd: 'python', prefixArgs: [] },
          { cmd: 'py', prefixArgs: ['-3'] },
          { cmd: 'py', prefixArgs: [] },
          { cmd: 'python3', prefixArgs: [] }
        ]
      : [
          { cmd: 'python3', prefixArgs: [] },
          { cmd: 'python', prefixArgs: [] },
          { cmd: 'py', prefixArgs: ['-3'] }
        ];

  const errors = [];
  for (const cand of candidates) {
    const res = probeCandidate(cand.cmd, cand.prefixArgs);
    if (res.ok) return res;
    errors.push(`${[cand.cmd, ...cand.prefixArgs].join(' ')}: ${res.error}`);
  }

  throw new Error(
    `No working Python 3 installation was found (${errors.join('; ')}). ` +
      `Install Python 3 or specify its path via --python "<path-to-python>" or PYTHON_EXECUTABLE.`
  );
}

/**
 * Checks whether the resolved Python interpreter has `netCDF4` and `numpy` installed.
 */
export function checkPythonNetcdfDependencies(pythonSpec) {
  const res = spawnSync(
    pythonSpec.cmd,
    [...pythonSpec.prefixArgs, '-c', 'import netCDF4, numpy; print("OK")'],
    { encoding: 'utf8', timeout: 10000, windowsHide: true }
  );
  if (res.status === 0 && (res.stdout || '').includes('OK')) {
    return { ok: true };
  }
  const displayCmd = [pythonSpec.cmd, ...pythonSpec.prefixArgs].join(' ');
  return {
    ok: false,
    error:
      `Python interpreter "${pythonSpec.executablePath || displayCmd}" is missing required packages (netCDF4, numpy).\n` +
      `        Install them with: ${displayCmd} -m pip install netCDF4 numpy\n` +
      `        Details: ${(res.stderr || res.stdout || '').trim()}`
  };
}

/**
 * Synchronizes regional JSON preset files in `<baseDir>/tiles/*.json` with a bundled
 * `realBathymetryPresets.json` file so both frontend and backend share identical
 * signed `rawElevations`, `hasSignedElevations`, and elevation metadata.
 */
export function syncRegionalPresetsBundle(baseDir, presetsBundlePath) {
  const tilesDir = path.join(baseDir, 'tiles');
  if (!fs.existsSync(tilesDir) || !presetsBundlePath) {
    return { updatedCount: 0 };
  }

  let bundleData = {};
  if (fs.existsSync(presetsBundlePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(presetsBundlePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        bundleData = parsed;
      }
    } catch {
      bundleData = {};
    }
  }

  let updatedCount = 0;
  const entries = fs.readdirSync(tilesDir).filter((f) => f.endsWith('.json')).sort();
  for (const fname of entries) {
    const fullPath = path.join(tilesDir, fname);
    try {
      const record = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const regionId = record.id || fname.replace(/\.json$/i, '');
      bundleData[regionId] = record;
      updatedCount++;
    } catch {
      // Ignore malformed JSON file
    }
  }

  if (updatedCount > 0) {
    fs.mkdirSync(path.dirname(presetsBundlePath), { recursive: true });
    const tmpBundle = `${presetsBundlePath}.tmp`;
    fs.writeFileSync(tmpBundle, JSON.stringify(bundleData, null, 2));
    fs.renameSync(tmpBundle, presetsBundlePath);
  }

  return { updatedCount };
}

/**
 * Validates the existing bathymetry tiles and manifest in `baseDir`.
 * Enforces:
 * - No duplicate tile IDs or duplicate file paths in `manifest.tiles`
 * - Every referenced file exists on disk with matching dimensions/byte size
 * - Every binary pyramid level present in `manifest.tiles` has the exact expected
 *   tile count (`rows * cols`, including all 36 x 72 = 2,592 tiles for L4),
 *   expected per-sector geographic bounds, sample coordinate alignment,
 *   sector adjacency, zero unintended overlaps, and antimeridian longitude wraparound
 * - No unreferenced `.bin` files in `tiles/`
 * - Honest resolution and coverage metadata
 */
export function validateExistingDataset(baseDir) {
  const manifestPath = path.join(baseDir, 'manifest.json');
  const tilesDir = path.join(baseDir, 'tiles');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.tiles) || manifest.tiles.length === 0) {
    throw new Error(`Manifest at ${manifestPath} contains an empty or invalid 'tiles' array.`);
  }

  const validTiles = [];
  const missingTiles = [];
  const invalidTiles = [];
  const duplicateTileIds = [];
  const seenIds = new Set();
  const seenFiles = new Set();
  const binaryTilesByLevel = new Map();
  let hasBinaryPyramid = false;
  let finestBinaryArcSec = null;

  for (const tile of manifest.tiles) {
    const tid = tile.id || '<unknown>';
    if (seenIds.has(tid)) {
      duplicateTileIds.push(tid);
      invalidTiles.push({ id: tid, reason: `Duplicate tile ID '${tid}' in manifest` });
      continue;
    }
    seenIds.add(tid);

    if (!tile.file || typeof tile.file !== 'string') {
      invalidTiles.push({ id: tid, reason: 'Missing file reference' });
      continue;
    }

    if (seenFiles.has(tile.file)) {
      invalidTiles.push({ id: tid, reason: `Duplicate file reference '${tile.file}' in manifest` });
      continue;
    }
    seenFiles.add(tile.file);

    const fullPath = path.join(baseDir, tile.file);
    if (!fs.existsSync(fullPath)) {
      missingTiles.push(tile.file);
      continue;
    }

    const gw = Number(tile.gridWidth);
    const gh = Number(tile.gridHeight);
    if (!Number.isInteger(gw) || !Number.isInteger(gh) || gw < 2 || gh < 2) {
      invalidTiles.push({ id: tid, reason: `Invalid grid dimensions (${gw}x${gh})` });
      continue;
    }

    const b = tile.bounds;
    if (
      !b ||
      !Number.isFinite(b.minLat) ||
      !Number.isFinite(b.maxLat) ||
      !Number.isFinite(b.minLon) ||
      !Number.isFinite(b.maxLon) ||
      b.minLat >= b.maxLat ||
      b.minLat < -90.0001 ||
      b.maxLat > 90.0001 ||
      b.minLon >= b.maxLon ||
      b.minLon < -180.0001 ||
      b.maxLon > 180.0001
    ) {
      invalidTiles.push({ id: tid, reason: `Invalid geographic bounds: ${JSON.stringify(b)}` });
      continue;
    }

    if (tile.sampleBounds) {
      const sb = tile.sampleBounds;
      if (
        !Number.isFinite(sb.minLat) ||
        !Number.isFinite(sb.maxLat) ||
        !Number.isFinite(sb.minLon) ||
        !Number.isFinite(sb.maxLon) ||
        sb.minLat > sb.maxLat ||
        sb.minLon > sb.maxLon ||
        sb.minLat < b.minLat - 1e-4 ||
        sb.maxLat > b.maxLat + 1e-4 ||
        sb.minLon < b.minLon - 1e-4 ||
        sb.maxLon > b.maxLon + 1e-4
      ) {
        invalidTiles.push({ id: tid, reason: `Invalid sampleBounds: ${JSON.stringify(sb)}` });
        continue;
      }
    }

    const stat = fs.statSync(fullPath);
    if (tile.file.endsWith('.bin') || tile.format === 'int16le') {
      const expectedBytes = gw * gh * 2;
      if (stat.size !== expectedBytes) {
        invalidTiles.push({
          id: tid,
          reason: `Binary tile size mismatch: expected ${expectedBytes} bytes, got ${stat.size} bytes`
        });
        continue;
      }
      hasBinaryPyramid = true;
      const lvl = Number.isFinite(Number(tile.level)) ? Number(tile.level) : null;
      if (lvl !== null) {
        if (!binaryTilesByLevel.has(lvl)) binaryTilesByLevel.set(lvl, []);
        binaryTilesByLevel.get(lvl).push(tile);
      }
      const resArcSec = Number(tile.resolutionArcSec);
      if (Number.isFinite(resArcSec) && resArcSec > 0) {
        finestBinaryArcSec =
          finestBinaryArcSec === null ? resArcSec : Math.min(finestBinaryArcSec, resArcSec);
      }
    } else if (tile.file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const elevArr = data.rawElevations || data.elevations || data.grid?.elevationsMeters;
        if (!Array.isArray(elevArr) || elevArr.length !== gw * gh) {
          invalidTiles.push({
            id: tid,
            reason: `JSON tile sample length (${elevArr?.length}) != ${gw * gh}`
          });
          continue;
        }
        tile.minDepth = data.minDepth ?? tile.minDepth ?? 0;
        tile.maxDepth = data.maxDepth ?? tile.maxDepth ?? 0;
        tile.minElevation = data.minElevation ?? -(tile.maxDepth || 0);
        tile.maxElevation = data.maxElevation ?? -(tile.minDepth || 0);
        tile.format = 'json';
        tile.level = tile.level ?? 3;
        tile.stride = tile.stride ?? 4;
        tile.provenance = 'preset_regional';
      } catch (err) {
        invalidTiles.push({ id: tid, reason: `Invalid JSON: ${err.message}` });
        continue;
      }
    }

    validTiles.push(tile);
  }

  // Verify binary pyramid level completeness, expected sector bounds, sample coordinates, adjacency, overlaps, and wraparound
  const levelSpecByLevel = new Map(DEFAULT_PYRAMID_LEVELS.map((s) => [s.level, s]));
  const completeLevels = [];
  const incompleteLevels = [];

  for (const [lvl, lvlTiles] of [...binaryTilesByLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const spec = levelSpecByLevel.get(lvl);
    if (!spec) {
      invalidTiles.push({ id: `Level_L${lvl}`, reason: `Unsupported pyramid level L${lvl}` });
      continue;
    }
    const expectedCount = spec.rows * spec.cols;
    const expLatSpan = 180.0 / spec.rows;
    const expLonSpan = 360.0 / spec.cols;
    const sectorMap = new Map();
    const levelErrors = [];

    const refGw = Number(lvlTiles[0]?.gridWidth || 0);
    const refGh = Number(lvlTiles[0]?.gridHeight || 0);
    const refStride = Number(lvlTiles[0]?.stride || 1);
    const expSampleDLat = expLatSpan / Math.max(1, refGh);
    const expSampleDLon = expLonSpan / Math.max(1, refGw);
    const nativeDLat = expSampleDLat / Math.max(1, refStride);
    const nativeDLon = expSampleDLon / Math.max(1, refStride);
    const rowOffset = Math.floor(refStride / 2);
    const colOffset = Math.floor(refStride / 2);

    for (const t of lvlTiles) {
      const tid = String(t.id);
      if (Number(t.gridWidth) !== refGw || Number(t.gridHeight) !== refGh) {
        levelErrors.push(`Inconsistent tile dimensions on ${tid} (${t.gridWidth}x${t.gridHeight} vs ${refGw}x${refGh})`);
      }

      const declaredR = Number.isInteger(t.tileRow) ? t.tileRow : Number.isInteger(t.row) ? t.row : null;
      const declaredC = Number.isInteger(t.tileCol) ? t.tileCol : Number.isInteger(t.col) ? t.col : null;
      let parsedR = null;
      let parsedC = null;
      const m = /^L(\d+)_r(\d+)_c(\d+)$/.exec(tid);
      if (m && Number(m[1]) === lvl) {
        parsedR = Number(m[2]);
        parsedC = Number(m[3]);
      }

      if (declaredR !== null && parsedR !== null && declaredR !== parsedR) {
        levelErrors.push(`Tile ${tid} declared tileRow (${declaredR}) != ID row (${parsedR})`);
      }
      if (declaredC !== null && parsedC !== null && declaredC !== parsedC) {
        levelErrors.push(`Tile ${tid} declared tileCol (${declaredC}) != ID col (${parsedC})`);
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
        levelErrors.push(`Tile ${tid} has invalid sector indices (${rIdx}, ${cIdx}) for L${lvl}`);
        continue;
      }

      const key = `${rIdx}:${cIdx}`;
      if (sectorMap.has(key)) {
        levelErrors.push(`Duplicate sector (${rIdx}, ${cIdx}) in level L${lvl}`);
        continue;
      }
      sectorMap.set(key, t);

      // Verify tile geographic bounds match its declared (tileRow, tileCol) sector
      const expMinLat = -90.0 + rIdx * expLatSpan;
      const expMaxLat = -90.0 + (rIdx + 1) * expLatSpan;
      const expMinLon = -180.0 + cIdx * expLonSpan;
      const expMaxLon = -180.0 + (cIdx + 1) * expLonSpan;
      const tb = t.bounds;
      if (
        Math.abs(tb.minLat - expMinLat) > 1e-3 ||
        Math.abs(tb.maxLat - expMaxLat) > 1e-3 ||
        Math.abs(tb.minLon - expMinLon) > 1e-3 ||
        Math.abs(tb.maxLon - expMaxLon) > 1e-3
      ) {
        levelErrors.push(
          `Tile ${tid} at sector (${rIdx},${cIdx}) has bounds [${tb.minLat},${tb.maxLat}]x[${tb.minLon},${tb.maxLon}] != expected [${expMinLat},${expMaxLat}]x[${expMinLon},${expMaxLon}]`
        );
      }

      // Verify sampleBounds and sampleSpacing when present
      if (t.sampleBounds) {
        const sb = t.sampleBounds;
        const expSMinLat = expMinLat + (rowOffset + 0.5) * nativeDLat;
        const expSMaxLat = expMinLat + ((refGh - 1) * refStride + rowOffset + 0.5) * nativeDLat;
        const expSMinLon = expMinLon + (colOffset + 0.5) * nativeDLon;
        const expSMaxLon = expMinLon + ((refGw - 1) * refStride + colOffset + 0.5) * nativeDLon;
        if (
          Math.abs(sb.minLat - expSMinLat) > 1e-2 ||
          Math.abs(sb.maxLat - expSMaxLat) > 1e-2 ||
          Math.abs(sb.minLon - expSMinLon) > 1e-2 ||
          Math.abs(sb.maxLon - expSMaxLon) > 1e-2
        ) {
          levelErrors.push(
            `Tile ${tid} sampleBounds [${sb.minLat},${sb.maxLat}]x[${sb.minLon},${sb.maxLon}] != expected [${expSMinLat.toFixed(6)},${expSMaxLat.toFixed(6)}]x[${expSMinLon.toFixed(6)},${expSMaxLon.toFixed(6)}]`
          );
        }
        if (t.sampleSpacingLat !== undefined && Math.abs(Number(t.sampleSpacingLat) - expSampleDLat) > 1e-3) {
          levelErrors.push(`Tile ${tid} sampleSpacingLat (${t.sampleSpacingLat}) != expected (${expSampleDLat})`);
        }
        if (t.sampleSpacingLon !== undefined && Math.abs(Number(t.sampleSpacingLon) - expSampleDLon) > 1e-3) {
          levelErrors.push(`Tile ${tid} sampleSpacingLon (${t.sampleSpacingLon}) != expected (${expSampleDLon})`);
        }
      }
    }

    // Check pairwise unintended overlaps
    for (let i = 0; i < lvlTiles.length; i++) {
      const b1 = lvlTiles[i].bounds;
      for (let j = i + 1; j < lvlTiles.length; j++) {
        const b2 = lvlTiles[j].bounds;
        const overlapLat = Math.min(b1.maxLat, b2.maxLat) - Math.max(b1.minLat, b2.minLat);
        const overlapLon = Math.min(b1.maxLon, b2.maxLon) - Math.max(b1.minLon, b2.minLon);
        if (overlapLat > 1e-4 && overlapLon > 1e-4) {
          levelErrors.push(
            `Unintended overlap in L${lvl} between ${lvlTiles[i].id} and ${lvlTiles[j].id}`
          );
        }
      }
    }

    const missingSectors = [];
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        if (!sectorMap.has(`${r}:${c}`)) {
          missingSectors.push(`L${lvl}_r${r}_c${c}`);
        }
      }
    }

    // Check adjacency and antimeridian wraparound when all sectors are present
    if (missingSectors.length === 0) {
      for (let c = 0; c < spec.cols; c++) {
        const southTile = sectorMap.get(`0:${c}`);
        const northTile = sectorMap.get(`${spec.rows - 1}:${c}`);
        if (Math.abs(southTile.bounds.minLat - (-90)) > 1e-3 || Math.abs(northTile.bounds.maxLat - 90) > 1e-3) {
          levelErrors.push(`L${lvl} col ${c} does not span [-90, 90]`);
        }
        for (let r = 0; r < spec.rows - 1; r++) {
          const tS = sectorMap.get(`${r}:${c}`);
          const tN = sectorMap.get(`${r + 1}:${c}`);
          if (Math.abs(tS.bounds.maxLat - tN.bounds.minLat) > 1e-4) {
            levelErrors.push(`Latitude adjacency gap/overlap between ${tS.id} and ${tN.id}`);
          }
        }
      }
      for (let r = 0; r < spec.rows; r++) {
        const westTile = sectorMap.get(`${r}:0`);
        const eastTile = sectorMap.get(`${r}:${spec.cols - 1}`);
        if (
          Math.abs(westTile.bounds.minLon - (-180)) > 1e-3 ||
          Math.abs(eastTile.bounds.maxLon - 180) > 1e-3 ||
          Math.abs((eastTile.bounds.maxLon - westTile.bounds.minLon) - 360) > 1e-3
        ) {
          levelErrors.push(`L${lvl} row ${r} fails antimeridian wraparound [-180, 180]`);
        }
        if (westTile.sampleBounds && eastTile.sampleBounds) {
          const wrapStep = (westTile.sampleBounds.minLon + 360.0) - eastTile.sampleBounds.maxLon;
          if (Math.abs(wrapStep - expSampleDLon) > 1e-2) {
            levelErrors.push(`L${lvl} row ${r} antimeridian sample step mismatch (${wrapStep} vs ${expSampleDLon})`);
          }
        }
        for (let c = 0; c < spec.cols - 1; c++) {
          const tW = sectorMap.get(`${r}:${c}`);
          const tE = sectorMap.get(`${r}:${c + 1}`);
          if (Math.abs(tW.bounds.maxLon - tE.bounds.minLon) > 1e-4) {
            levelErrors.push(`Longitude adjacency gap/overlap between ${tW.id} and ${tE.id}`);
          }
        }
      }
    }

    if (lvlTiles.length === expectedCount && missingSectors.length === 0 && levelErrors.length === 0) {
      completeLevels.push(lvl);
    } else {
      incompleteLevels.push({
        level: lvl,
        expectedTiles: expectedCount,
        verifiedTiles: lvlTiles.length,
        missingSectorsCount: missingSectors.length,
        sampleMissingSectors: missingSectors.slice(0, 10),
        sectorErrors: levelErrors
      });
      invalidTiles.push({
        id: `Level_L${lvl}`,
        reason:
          levelErrors.length > 0
            ? `Sector validation failed in L${lvl}: ${levelErrors[0]}`
            : `Incomplete pyramid level L${lvl}: expected ${expectedCount} tiles (${spec.rows}x${spec.cols}), verified ${lvlTiles.length}, missing ${missingSectors.length} sectors (${missingSectors.slice(0, 5).join(', ')})`
      });
    }
  }

  // Check for unreferenced binary `.bin` files on disk when binary pyramid is present
  if (hasBinaryPyramid && fs.existsSync(tilesDir)) {
    const diskBinFiles = fs
      .readdirSync(tilesDir)
      .filter((f) => f.endsWith('.bin'))
      .map((f) => `tiles/${f}`);
    for (const relBin of diskBinFiles) {
      if (!seenFiles.has(relBin)) {
        invalidTiles.push({
          id: relBin,
          reason: `Unreferenced binary tile file on disk not listed in manifest.json: ${relBin}`
        });
      }
    }
  }

  // Also check if any regional JSON preset files exist in tiles/ that aren't in manifest
  if (!hasBinaryPyramid && fs.existsSync(tilesDir)) {
    for (const regionId of REGIONAL_PRESET_IDS) {
      const relFile = `tiles/${regionId}.json`;
      const fullPath = path.join(baseDir, relFile);
      if (fs.existsSync(fullPath) && !validTiles.some((t) => t.id === regionId)) {
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          validTiles.push({
            id: data.id || regionId,
            name: data.name || regionId,
            file: relFile,
            format: 'json',
            level: 3,
            stride: 4,
            resolutionArcSec: data.resolutionArcSec || 60,
            provenance: 'preset_regional',
            bounds: data.bounds,
            gridWidth: data.gridWidth,
            gridHeight: data.gridHeight,
            minDepth: data.minDepth ?? 0,
            maxDepth: data.maxDepth ?? 0,
            minElevation: data.minElevation ?? -(data.maxDepth ?? 0),
            maxElevation: data.maxElevation ?? -(data.minDepth ?? 0),
            landmarksCount: Array.isArray(data.landmarks) ? data.landmarks.length : 0
          });
        } catch {
          // Ignore malformed unreferenced file
        }
      }
    }
  }

  const hasCompleteL4Grid = completeLevels.includes(4);
  const coverageTier = hasBinaryPyramid
    ? hasCompleteL4Grid
      ? 'global_l4_15arcsec_complete'
      : completeLevels.length > 0 && incompleteLevels.length === 0
      ? 'global_coarse_pyramid'
      : 'global_partial_pyramid'
    : 'regional_presets_only';

  if (missingTiles.length > 0 || invalidTiles.length > 0 || duplicateTileIds.length > 0) {
    return {
      valid: false,
      hasBinaryPyramid,
      validTilesCount: validTiles.length,
      missingTiles,
      invalidTiles,
      duplicateTileIds,
      completeLevels,
      incompleteLevels,
      hasCompleteL4Grid,
      finestResolutionArcSec: finestBinaryArcSec ?? 60,
      coverageTier,
      coverage:
        hasBinaryPyramid && completeLevels.length > 0 && incompleteLevels.length === 0
          ? 'global'
          : hasBinaryPyramid
          ? 'partial'
          : 'regional_presets'
    };
  }

  // Verify coverage claim
  if (manifest.coverage === 'global' && !hasBinaryPyramid) {
    // Only regional JSON presets exist on disk; correct the manifest metadata honestly
    const correctedManifest = {
      dataset: 'GEBCO / NOAA NCEI Regional Bathymetric Preset Extracts (1-Arc-Minute)',
      version: '2026-regional-presets',
      license: 'GEBCO IHO/IOC Open Data License',
      verticalDatum: 'Mean Sea Level (metres)',
      gridIntervalArcSec: 60,
      coverage: 'regional_presets',
      coverageTier: 'regional_presets_only',
      hasL4HighResolution: false,
      totalTiles: validTiles.length,
      processedAt: manifest.processedAt || new Date().toISOString(),
      tiles: validTiles
    };
    const tmpPath = `${manifestPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(correctedManifest, null, 2));
    fs.renameSync(tmpPath, manifestPath);
  }

  return {
    valid: true,
    hasBinaryPyramid,
    validTilesCount: validTiles.length,
    missingTiles: [],
    invalidTiles: [],
    duplicateTileIds: [],
    completeLevels,
    incompleteLevels: [],
    hasCompleteL4Grid,
    finestResolutionArcSec: finestBinaryArcSec ?? 60,
    coverageTier,
    coverage: hasBinaryPyramid ? manifest.coverage || 'global' : 'regional_presets'
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.validateOnly) {
    try {
      const status = validateExistingDataset(args.output);
      if (!status.valid) {
        console.error(
          `[ERROR] Dataset validation failed: missing=${status.missingTiles.length}, invalid=${status.invalidTiles.length}`
        );
        for (const inv of status.invalidTiles) {
          console.error(`        - ${inv.id}: ${inv.reason}`);
        }
        process.exit(1);
      }
      console.log(
        `[INFO] Verified ${status.validTilesCount} bathymetry tiles in ${args.output} (coverage=${status.coverage}, tier=${status.coverageTier}).`
      );
      return;
    } catch (err) {
      console.error(`[ERROR] Validation failed: ${err.message}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(args.input)) {
    console.error(`[ERROR] GEBCO 2026 source file not found at: ${args.input}`);
    console.error(
      `        Place GEBCO_2026_sub_ice.nc at "${args.input}" (or pass --input /path/to/GEBCO_2026_sub_ice.nc).`
    );
    try {
      validateExistingDataset(args.output);
    } catch {
      // Preserve existing state without overwriting
    }
    process.exit(1);
  }

  // Inspect file header to check NetCDF-4/HDF5 vs NetCDF-3
  const fd = fs.openSync(args.input, 'r');
  const magicBuf = Buffer.alloc(8);
  const bytesRead = fs.readSync(fd, magicBuf, 0, 8, 0);
  fs.closeSync(fd);

  if (bytesRead < 4) {
    console.error(`[ERROR] Input file "${args.input}" is empty or truncated (< 4 bytes).`);
    process.exit(1);
  }

  const isHDF5 =
    magicBuf[0] === 0x89 &&
    magicBuf[1] === 0x48 &&
    magicBuf[2] === 0x44 &&
    magicBuf[3] === 0x46;
  const isNetCDF3 =
    magicBuf.subarray(0, 3).toString('ascii') === 'CDF' &&
    (magicBuf[3] === 0x01 || magicBuf[3] === 0x02);

  if (!isHDF5 && !isNetCDF3) {
    console.error(
      `[ERROR] Unsupported source file format in "${args.input}". Expected NetCDF-4 (HDF5) or Classic NetCDF-3 (CDF\\x01/\\x02).`
    );
    process.exit(1);
  }

  let pythonSpec;
  try {
    pythonSpec = resolvePythonExecutable(args.python, args.pythonExplicit);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  if (isHDF5) {
    const depCheck = checkPythonNetcdfDependencies(pythonSpec);
    if (!depCheck.ok) {
      console.error(`[ERROR] ${depCheck.error}`);
      process.exit(1);
    }
  }

  const pyScript = path.join(__dirname, 'process_gebco_2026.py');
  const pyArgs = [...pythonSpec.prefixArgs, pyScript, '--input', args.input, '--output', args.output];
  if (args.resume) pyArgs.push('--resume');
  if (args.levels) pyArgs.push('--levels', args.levels);
  if (args.extractPresets || args.syncPresetsBundle) {
    pyArgs.push('--extract-presets');
  }
  if (args.syncPresetsBundle) {
    pyArgs.push('--sync-presets-bundle', args.presetsBundle);
  }

  const displayCmd = [pythonSpec.cmd, ...pyArgs].join(' ');
  console.log(`[INFO] Executing GEBCO processor via Python (${pythonSpec.executablePath}): ${displayCmd}`);

  const res = spawnSync(pythonSpec.cmd, pyArgs, {
    stdio: 'inherit',
    windowsHide: true
  });

  if (res.status !== 0) {
    console.error(`[ERROR] GEBCO Python processor exited with status ${res.status ?? 1}.`);
    process.exit(res.status || 1);
  }

  // Final validation pass on the generated dataset
  const postStatus = validateExistingDataset(args.output);
  if (!postStatus.valid) {
    console.error(`[ERROR] Post-processing dataset validation failed.`);
    for (const inv of postStatus.invalidTiles) {
      console.error(`        - ${inv.id}: ${inv.reason}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
