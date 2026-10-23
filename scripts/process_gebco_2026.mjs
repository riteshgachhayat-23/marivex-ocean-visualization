#!/usr/bin/env node
/**
 * GEBCO_2026 Sub-Ice Bathymetry Processor for MARIVEX
 * 
 * Slices the multi-gigabyte global GEBCO_2026 NetCDF dataset (GEBCO_2026_sub_ice.nc)
 * into lightweight, geographically accurate regional 3D terrain tiles.
 * 
 * Usage:
 *   npm run process:gebco
 *   node scripts/process_gebco_2026.mjs [--input /path/to/GEBCO_2026_sub_ice.nc]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Default target search paths for the user's downloaded NetCDF file
const CANDIDATE_PATHS = [
  path.join(rootDir, 'data', 'GEBCO_2026_sub_ice.nc'),
  path.join(rootDir, 'GEBCO_2026_sub_ice.nc'),
  path.join(rootDir, 'data', 'gebco_2026_sub_ice.nc'),
  path.join(rootDir, 'gebco_2026_sub_ice.nc')
];

// Check command line arguments for custom input path
const args = process.argv.slice(2);
const inputArgIdx = args.indexOf('--input');
if (inputArgIdx >= 0 && args[inputArgIdx + 1]) {
  CANDIDATE_PATHS.unshift(path.resolve(process.cwd(), args[inputArgIdx + 1]));
}

// Target regional sectors to extract from the global dataset
const TARGET_REGIONS = [
  {
    id: 'mariana-trench',
    name: 'Mariana Trench (Challenger Deep)',
    latMin: 10.75, latMax: 11.95,
    lonMin: 141.60, lonMax: 142.80,
    stride: 1,
    landmarks: [
      {
        id: 'challenger-deep',
        name: 'Challenger Deep (Hadal Axis)',
        type: 'trench',
        lat: 11.35, lon: 142.18,
        depthMeters: 10898,
        description: 'Deepest point on Earth (10,898m). Subduction axis of the Pacific Plate under the Mariana Microplate.'
      },
      {
        id: 'sirena-deep',
        name: 'Sirena Deep Subduction Axis',
        type: 'trench',
        lat: 11.85, lon: 142.50,
        depthMeters: 9820,
        description: 'Ultra-deep hadal fault basin along the southwestern curve of the Mariana subduction arc.'
      },
      {
        id: 'mariana-ridge-crest',
        name: 'Mariana Microplate Forearc Ridge',
        type: 'ridge',
        lat: 11.75, lon: 141.70,
        depthMeters: 1513,
        description: 'Submarine forearc volcanic ridge rising over 9,300 meters above the adjacent trench floor.'
      }
    ]
  },
  {
    id: 'atlantic-ridge',
    name: 'Mid-Atlantic Ridge (Axial Graben)',
    latMin: 25.40, latMax: 26.60,
    lonMin: -45.60, lonMax: -44.40,
    stride: 1,
    landmarks: [
      {
        id: 'tag-mound',
        name: 'TAG Hydrothermal Complex',
        type: 'vent',
        lat: 26.14, lon: -44.82,
        depthMeters: 3670,
        description: 'Active high-temperature polymetallic sulfide hydrothermal field venting black smoker fluids at 360°C.'
      },
      {
        id: 'axial-valley',
        name: 'Central Axial Rift Valley',
        type: 'ridge',
        lat: 26.00, lon: -45.00,
        depthMeters: 4320,
        description: 'Spreading graben dividing the North American and Eurasian/African lithospheric plates.'
      },
      {
        id: 'western-crest',
        name: 'West Flank Rift Crest Peak',
        type: 'ridge',
        lat: 25.85, lon: -45.45,
        depthMeters: 1606,
        description: 'High volcanic crest peak flanking the western margin of the central rift chasm.'
      }
    ]
  },
  {
    id: 'puerto-rico-trench',
    name: 'Puerto Rico Trench (Milwaukee Deep)',
    latMin: 19.24, latMax: 20.44,
    lonMin: -67.10, lonMax: -65.90,
    stride: 1,
    landmarks: [
      {
        id: 'milwaukee-deep',
        name: 'Milwaukee Deep (Atlantic Chasm)',
        type: 'trench',
        lat: 19.84, lon: -66.50,
        depthMeters: 8497,
        description: 'Deepest location in the Atlantic Ocean. Subduction boundary between the Caribbean and North American plates.'
      },
      {
        id: 'brownson-fault',
        name: 'Brownson Deep Tectonic Escarpment',
        type: 'slope',
        lat: 19.60, lon: -66.10,
        depthMeters: 7850,
        description: 'Nearly vertical subduction fault wall of fractured oceanic lithosphere dropping toward the trench axis.'
      }
    ]
  },
  {
    id: 'arabian-sea',
    name: 'Arabian Sea (Carlsberg Ridge & Basin)',
    latMin: 2.90, latMax: 4.10,
    lonMin: 63.40, lonMax: 64.60,
    stride: 1,
    landmarks: [
      {
        id: 'carlsberg-rift',
        name: 'Carlsberg Spreading Axial Rift',
        type: 'ridge',
        lat: 3.50, lon: 64.00,
        depthMeters: 4603,
        description: 'Slow-spreading divergent mid-ocean ridge boundary separating the African and Indo-Australian plates.'
      },
      {
        id: 'carlsberg-crest',
        name: 'Carlsberg Ridge Peak Massif',
        type: 'ridge',
        lat: 3.75, lon: 64.40,
        depthMeters: 1198,
        description: 'Tectonic volcanic summit rising steeply above the surrounding abyssal plains of the Arabian Basin.'
      }
    ]
  },
  {
    id: 'bay-of-bengal',
    name: 'Bay of Bengal (Swatch of No Ground Canyon)',
    latMin: 20.60, latMax: 21.80,
    lonMin: 88.60, lonMax: 89.80,
    stride: 1,
    landmarks: [
      {
        id: 'swatch-canyon-axis',
        name: 'Swatch of No Ground Deep Axis',
        type: 'slope',
        lat: 21.20, lon: 89.20,
        depthMeters: 1118,
        description: 'Submarine canyon deeply incising the Bengal continental shelf margin and funneling sediments to the Bengal Fan.'
      },
      {
        id: 'ganges-shelf-break',
        name: 'Ganges Delta Continental Shelf',
        type: 'shelf',
        lat: 21.75, lon: 89.70,
        depthMeters: 10,
        description: 'Shallow epicontinental sediment platform directly influenced by the discharge of the Ganges-Brahmaputra river system.'
      }
    ]
  },
  {
    id: 'gulf-of-mexico',
    name: 'Gulf of Mexico (Sigsbee Deep)',
    latMin: 24.40, latMax: 25.60,
    lonMin: -90.60, lonMax: -89.40,
    stride: 1,
    landmarks: [
      {
        id: 'sigsbee-deep',
        name: 'Sigsbee Deep Abyssal Plain',
        type: 'basin',
        lat: 25.00, lon: -90.00,
        depthMeters: 4008,
        description: 'Deepest basin in the Gulf of Mexico, underlain by massive Jurassic salt canopies.'
      }
    ]
  },
  {
    id: 'mediterranean-sea',
    name: 'Mediterranean Sea (Ionian Basin)',
    latMin: 36.00, latMax: 37.20,
    lonMin: 21.00, lonMax: 22.20,
    stride: 1,
    landmarks: [
      {
        id: 'calypso-deep',
        name: 'Hellenic Trench Arc (Calypso Deep)',
        type: 'trench',
        lat: 36.50, lon: 21.60,
        depthMeters: 5119,
        description: 'Deepest tectonic subduction trough in the Mediterranean Sea south of the Peloponnese.'
      }
    ]
  },
  {
    id: 'sargasso-sea',
    name: 'Sargasso Sea (North Atlantic Plain)',
    latMin: 27.40, latMax: 28.60,
    lonMin: -66.60, lonMax: -65.40,
    stride: 1,
    landmarks: [
      {
        id: 'sargasso-abyssal',
        name: 'Sargasso Central Abyssal Floor',
        type: 'basin',
        lat: 28.00, lon: -66.00,
        depthMeters: 5653,
        description: 'Stable, oligotrophic abyssal floor draped in pelagic calcareous foraminiferal sediment.'
      }
    ]
  },
  {
    id: 'coral-sea',
    name: 'Coral Sea (Great Barrier Reef Margin)',
    latMin: -18.60, latMax: -17.40,
    lonMin: 147.00, lonMax: 148.20,
    stride: 1,
    landmarks: [
      {
        id: 'barrier-margin',
        name: 'Queensland Continental Slope Break',
        type: 'shelf',
        lat: -18.00, lon: 147.60,
        depthMeters: 1635,
        description: 'Abrupt bathymetric escarpment dropping from shallow coral bioherms into the Queensland Basin.'
      }
    ]
  },
  {
    id: 'philippine-sea',
    name: 'Philippine Sea (Philippine Trench)',
    latMin: 10.00, latMax: 11.20,
    lonMin: 126.00, lonMax: 127.20,
    stride: 1,
    landmarks: [
      {
        id: 'emden-deep',
        name: 'Philippine Trench (Emden Deep)',
        type: 'trench',
        lat: 10.50, lon: 126.60,
        depthMeters: 9820,
        description: 'Narrow, ultra-deep hadal subduction chasm formed by the Philippine Sea Plate colliding with the Eurasian Plate.'
      }
    ]
  }
];

function printBanner() {
  console.log('================================================================');
  console.log('  MARIVEX — GEBCO_2026 Sub-Ice NetCDF Bathymetry Processor');
  console.log('================================================================');
}

function findInputFile() {
  for (const candidate of CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && stat.size > 1024) {
        return { path: candidate, sizeBytes: stat.size };
      }
    }
  }
  return null;
}

async function main() {
  printBanner();

  const found = findInputFile();
  const tilesDir = path.join(rootDir, 'public', 'data', 'bathymetry', 'tiles');
  const manifestPath = path.join(rootDir, 'public', 'data', 'bathymetry', 'manifest.json');
  const presetsPath = path.join(rootDir, 'src', 'data', 'realBathymetryPresets.json');

  fs.mkdirSync(tilesDir, { recursive: true });

  if (!found) {
    console.log('\n[INFO] Complete global NetCDF file not detected in default paths:');
    for (const p of CANDIDATE_PATHS) {
      console.log(`  - ${path.relative(rootDir, p)}`);
    }

    console.log('\n>>> WHERE TO PLACE YOUR DOWNLOADED DATASET:');
    console.log('  Place your complete GEBCO_2026 sub-ice NetCDF file at:');
    console.log(`    📁 ${path.join(rootDir, 'data', 'GEBCO_2026_sub_ice.nc')}`);
    console.log('    (or pass --input /absolute/path/to/GEBCO_2026_sub_ice.nc)');

    // Verify existing pre-extracted tiles
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log(`\n[STATUS] Active bathymetry tiles are installed and ready:`);
      console.log(`  Dataset: ${manifest.dataset}`);
      console.log(`  Available Tiles: ${manifest.tiles.length} sectors`);
      for (const t of manifest.tiles.slice(0, 5)) {
        console.log(`    • ${t.name}: ${t.minDepth}m to ${t.maxDepth}m (${t.gridWidth}×${t.gridHeight})`);
      }
      if (manifest.tiles.length > 5) {
        console.log(`    ... and ${manifest.tiles.length - 5} more sectors.`);
      }
    }

    console.log('\nOnce your file is placed at data/GEBCO_2026_sub_ice.nc, rerun:');
    console.log('  npm run process:gebco\n');
    return;
  }

  console.log(`\n[OK] Found GEBCO_2026 dataset: ${found.path}`);
  console.log(`  File size: ${(found.sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log('  Beginning regional tile extraction...\n');

  try {
    // Dynamic import of jsfive for HDF5 / NetCDF-4 reading
    const jsfive = await import('jsfive');
    const buffer = fs.readFileSync(found.path);
    const h5 = new jsfive.File(buffer.buffer, found.path);

    const latDataset = h5.get('lat');
    const lonDataset = h5.get('lon');
    const elevationDataset = h5.get('elevation') || h5.get('z');

    if (!elevationDataset) {
      throw new Error('Could not locate "elevation" or "z" dataset variable in NetCDF file.');
    }

    const lats = latDataset.value;
    const lons = lonDataset.value;

    console.log(`  Global Grid Extents: ${lons.length} lon × ${lats.length} lat points`);

    const manifest = {
      dataset: 'GEBCO_2026 Sub-Ice Global Bathymetric Grid',
      version: '2026',
      sourceFile: path.basename(found.path),
      verticalDatum: 'Mean Sea Level (metres)',
      gridIntervalArcSec: 15,
      processedAt: new Date().toISOString(),
      tiles: []
    };

    const presetsUpdate = {};

    for (const region of TARGET_REGIONS) {
      console.log(`  Processing ${region.name}...`);
      // Find index bounds
      const latIdxMin = Math.max(0, lats.findIndex(l => l >= region.latMin));
      const latIdxMax = Math.min(lats.length - 1, lats.findIndex(l => l >= region.latMax));
      const lonIdxMin = Math.max(0, lons.findIndex(l => l >= region.lonMin));
      const lonIdxMax = Math.min(lons.length - 1, lons.findIndex(l => l >= region.lonMax));

      const subLats = [];
      for (let i = latIdxMax; i >= latIdxMin; i -= region.stride) subLats.push(lats[i]);
      const subLons = [];
      for (let j = lonIdxMin; j <= lonIdxMax; j += region.stride) subLons.push(lons[j]);

      const gridW = subLons.length;
      const gridH = subLats.length;
      const elevations = [];

      let minD = Infinity;
      let maxD = -Infinity;

      for (let iy = 0; iy < gridH; iy++) {
        const rowIdx = latIdxMax - iy * region.stride;
        for (let ix = 0; ix < gridW; ix++) {
          const colIdx = lonIdxMin + ix * region.stride;
          // In NetCDF 2D: [lat, lon]
          const rawAlt = elevationDataset.get([rowIdx, colIdx]) ?? 0;
          const depth = rawAlt <= 0 ? -rawAlt : 0;
          elevations.push(depth);
          if (depth < minD) minD = depth;
          if (depth > maxD) maxD = depth;
        }
      }

      const tileData = {
        id: region.id,
        name: region.name,
        source: 'GEBCO_2026 Sub-Ice Global Bathymetric Grid (15 arc-sec)',
        resolutionArcSec: 15 * region.stride,
        bounds: {
          minLat: region.latMin,
          maxLat: region.latMax,
          minLon: region.lonMin,
          maxLon: region.lonMax
        },
        gridWidth: gridW,
        gridHeight: gridH,
        minDepth: minD,
        maxDepth: maxD,
        landmarks: region.landmarks,
        elevations
      };

      const tileFile = `${region.id}.json`;
      fs.writeFileSync(path.join(tilesDir, tileFile), JSON.stringify(tileData));
      presetsUpdate[region.id] = tileData;

      manifest.tiles.push({
        id: region.id,
        name: region.name,
        file: `tiles/${tileFile}`,
        bounds: tileData.bounds,
        gridWidth: gridW,
        gridHeight: gridH,
        minDepth: minD,
        maxDepth: maxD,
        landmarksCount: region.landmarks.length
      });

      console.log(`    -> Done: ${gridW}×${gridH} grid, depths ${minD}m to ${maxD}m`);
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(presetsPath, JSON.stringify(presetsUpdate, null, 2));

    console.log(`\n[SUCCESS] Successfully extracted all regional GEBCO_2026 bathymetric tiles!`);
    console.log(`  Manifest saved to: ${path.relative(rootDir, manifestPath)}`);
    console.log(`  Presets updated at: ${path.relative(rootDir, presetsPath)}`);
    console.log(`  Tiles generated in: ${path.relative(rootDir, tilesDir)}\n`);

  } catch (err) {
    console.error(`\n[ERROR] Processing failed: ${err.message}`);
    console.log('You can also use Python to process the file:');
    console.log('  python3 scripts/process_gebco_2026.py\n');
  }
}

main();
