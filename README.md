# MARIVEX — Smart Ocean & Marine Data Visualization

Interactive 3D oceanographic and benthic bathymetry visualization platform built with React 19, TypeScript, Vite, Three.js / React Three Fiber, and an Express geospatial backend.

---

## 1. Installation, Running & Testing

### Install Dependencies
```bash
npm install
```
*(Optional — only required if running the offline Python NetCDF-4 processor against `GEBCO_2026_sub_ice.nc`)*:
```bash
pip install netCDF4 numpy
```

### Run MARIVEX (Development Server)
Starts the full-stack Express API + Vite frontend server on `http://localhost:3000`:
```bash
npm run dev
```

### Run Automated Verification Tests & Type-Checking
```bash
# Run the 27-test geospatial & bathymetry verification suite
npm test

# Run TypeScript static type-checking
npm run typecheck

# Build production bundle
npm run build
```

---

## 2. Bathymetry Architecture & Unified Data Pipeline

MARIVEX uses a single, unified bathymetry pipeline across the 3D Earth Globe (`OceanGlobe.tsx`), the 3D Underwater Terrain Viewer (`UnderwaterBathymetryViewer.tsx` & `UnderwaterBathymetry.tsx`), the Telemetry Matrix (`TelemetryPanel.tsx` & `oceanData.ts`), and the AI Oceanographic Assistant (`AskMarivexAssistant.tsx` & `assistantEngine.ts`).

### End-to-End Execution Path
1. **Globe Raycasting & Selection (`OceanGlobe.tsx`)**:
   - Converts 3D raycast intersection points into Earth-local spherical coordinates (`latitude` in `[-90°, +90°]`, `longitude` in `[-180°, +180°]`).
2. **Coordinate Validation & Normalization (`validateCoordinates`, `normalizeLongitude`)**:
   - Validates finite numeric coordinates, enforces `lat ∈ [-90, 90]`, normalizes `lon ∈ [-180, 180]`, and handles the `±180°` international date line (antimeridian).
3. **Frontend Unified Pipeline (`fetchRealBathymetryGrid` in `src/utils/bathymetryGridBuilder.ts`)**:
   - **Step 1 — Local Tile Lookup (`gebcoGlobalTileLoader.ts`)**: Loads and validates `/api/bathymetry/manifest` (or `/data/bathymetry/manifest.json`). Uses `findCoveringTiles(manifest, lat, lon)` to check whether any local binary `Int16LE` pyramid tile (`L0–L4`) or regional JSON extract covers the requested coordinate, respecting exact source `sampleBounds`, `sampleSpacingLat`/`Lon`, `rowOrder`, and `colOrder`. When both a coarse overview tile (`L0–L2`) and a finer tile (`L3–L4`) cover the coordinate, emits a progressive coarse preview via `onPreviewDataset` before resolving the target resolution.
   - **Step 2 — Backend Bathymetry Service (`/api/bathymetry` in `server.ts` & `server/gebco-tile-manager.ts`)**: When the coordinate is outside client-cached tiles, queries `/api/bathymetry?lat=...&lon=...&span=...`:
     - **Provider 1 (`authoritative_local` / `preset_regional`)**: Checks verified local binary `Int16LE` pyramid tiles and the 10 bundled 60-arc-second regional JSON preset tiles covering the coordinate.
     - **Provider 2 (`authoritative_online` — Primary)**: Queries **NOAA CoastWatch / PMEL ERDDAP (`etopo180` 1-arc-minute global relief grid)** for real gridded seafloor/land elevations centered on the requested coordinates.
     - **Provider 3 (`authoritative_online` — Secondary)**: Queries **Columbia LDEO GMRT GridServer** if NOAA ERDDAP is unreachable.
     - **Provider 4 (`modelled` — Offline Fallback)**: If all authoritative sources are unreachable and `mode !== 'real'`, synthesizes a coordinate-specific terrain grid explicitly marked with `provenance: 'modelled'`, `isAuthoritative: false`, and `isModeledFallback: true`.
   - **Zero Silent Mariana Trench Fallbacks**: Uncovered coordinates **never** fall back to `mariana-trench` or `manifest.tiles[0]`.

---

## 3. Real Data vs. Modelled Data & Provenance Tiers

Every bathymetry response distinguishes between requested coordinates (`requestedCoordinates`) and the nearest source-grid cell (`sampledCoordinates`), and carries explicit provenance metadata:

| Provenance Tier | `provenance` | `isAuthoritative` | `isModeledFallback` | Description |
| :--- | :--- | :---: | :---: | :--- |
| **Local Global Pyramid** | `authoritative_local` | `true` | `false` | Generated locally from `GEBCO_2026_sub_ice.nc` (`L0–L4` `Int16LE` binary tiles). |
| **Local Regional Presets** | `preset_regional` | `true` | `false` | 10 bundled 60-arc-second regional JSON extracts in `public/data/bathymetry/tiles/*.json`. |
| **Live Online Providers** | `authoritative_online` | `true` | `false` | Real-time gridded soundings fetched from NOAA ERDDAP (`etopo180`) or GMRT GridServer. |
| **Modelled Fallback** | `modelled` | `false` | `true` | Procedural hypsometric synthesis used only when no local tile covers the coordinate and online providers are unreachable (`mode !== 'real'`). Clearly badged as non-survey modelled data. |
| **Unavailable (`503`)** | `unavailable` | `false` | `false` | Returned when `mode=real` is requested and no authoritative local or online source is available. |

---

## 4. Coordinate, Elevation & Depth Conventions

| Field | Unit | Sign & Missing-Data Convention |
| :--- | :--- | :--- |
| `latitude` | Degrees (`-90` to `+90`) | Positive = North (`N`), Negative = South (`S`) |
| `longitude` | Degrees (`-180` to `+180`) | Positive = East (`E`), Negative = West (`W`), `-180° ≡ +180°` at antimeridian |
| `grid.elevationsMeters` / `rawElevations` | Meters relative to Mean Sea Level (`MSL`) | **Negative (`< 0`) = Underwater seafloor**, **`0` = Sea level**, **Positive (`> 0`) = Land above sea level**, **`null` / `NaN` = Missing / No-Data (`-32768`)** |
| `elevations` / `depthMeters` | Meters below sea level (`>= 0`) | `-elevationMeters` for underwater points (`< 0`); `0` for land/sea-level (`>= 0`); `null` / `NaN` for missing samples. Positive land elevations are never converted into water depths or reconstructed from depth-only arrays. |
| Binary Tile Row Order | `Int16LE` (`.bin`) | Stored **South-to-North**, **West-to-East**; flipped to **North-to-South** when building the 3D terrain mesh |
| JSON Tile & API Grid Row Order | JSON (`.json`) / API | Ordered **North-to-South** (`row 0` = `sampleBounds.maxLat`), **West-to-East** (`col 0` = `sampleBounds.minLon`) |

---

## 5. Generating Global Tiles from `GEBCO_2026_sub_ice.nc`

### Where to Place the Source File
Place the original `GEBCO_2026_sub_ice.nc` (~7.47 GB, `86,400 × 43,200` `Int16` grid at 15-arc-second spacing) at:
- `data/GEBCO_2026_sub_ice.nc` (in the project root), **or**
- Pass its path explicitly via `--input /path/to/GEBCO_2026_sub_ice.nc`.

### Running the Tile Processor
Both the Node.js and Python processors use bounded windowed/chunked reads (`< 64 MB` RAM), derive tile `bounds` and `sampleBounds` directly from the NetCDF coordinate arrays (supporting ascending/descending latitude axes and `[-180, 180]` or `[0, 360)` longitudes), and verify every generated tile against the source dataset. If the input NetCDF file is missing, invalid, or fails a sample check, the processor exits with a nonzero status code (`1`) without overwriting `manifest.json`.

```bash
# Option A: Cross-platform Node.js processor (probes python/py -3/python3 or accepts --python <path> / PYTHON_EXECUTABLE)
node scripts/process_gebco_2026.mjs --input data/GEBCO_2026_sub_ice.nc --output public/data/bathymetry --resume

# Option B: Specify a custom Windows Python executable explicitly
node scripts/process_gebco_2026.mjs --input data/GEBCO_2026_sub_ice.nc --python "C:\Python312\python.exe" --resume

# Option C: Direct Python processor invocation
python scripts/process_gebco_2026.py --input data/GEBCO_2026_sub_ice.nc --output public/data/bathymetry --resume
```

### Expected Processing Time & Disk-Space Estimates
- **Source Dataset Size**: ~7.47 GB (`GEBCO_2026_sub_ice.nc`).
- **Generated Tile Output Size**: Estimated at ~2.1 GB to ~2.8 GB across the 471 binary `Int16LE` pyramid tiles (`L0`–`L4`), depending on selected pyramid levels.
- **Processing Time**: Estimated at ~3 to 12 minutes on a local SSD (estimates only; actual time depends on storage I/O throughput and CPU speed).

### Where Generated Tiles Are Stored & How to Confirm Global Coverage
- By default, tiles are written to `public/data/bathymetry/tiles/*.bin` with `public/data/bathymetry/manifest.json` and `public/data/bathymetry/processing_report.json` (or a custom directory configured via `GEBCO_TILES_DIR`).
- To confirm tile integrity and check whether coverage is `"global"` or `"regional_presets"`:
  ```bash
  node scripts/process_gebco_2026.mjs --validate
  ```
  Or query the running server at `GET http://localhost:3000/api/bathymetry/status`, which dynamically inspects the manifest and tile files present on disk.

---

## 6. Current Limitations

1. **Global 7.47 GB NetCDF Not Bundled in Repository**: The 7.47 GB `GEBCO_2026_sub_ice.nc` file and its multi-gigabyte `L0–L4` binary pyramid are not committed to Git. Out of the box, the repository includes **10 verified 60-arc-second regional JSON tiles** (`coverage: "regional_presets"`), while global coordinates outside those 10 regions are served live via **NOAA ERDDAP (`etopo180`) / GMRT** (or clearly labeled modelled fallback if offline).
2. **Full Local 15-Arc-Second Global Coverage Requires Local Processing**: Until `scripts/process_gebco_2026.mjs` (or `.py`) is executed locally against `GEBCO_2026_sub_ice.nc`, the application honestly reports `coverage: "regional_presets"` for local tiles and `authoritative_online` (60-arc-second ETOPO/GEBCO via NOAA ERDDAP) for global online lookups.
