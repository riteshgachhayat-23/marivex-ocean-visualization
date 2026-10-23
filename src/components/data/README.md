# GEBCO_2026 Sub-Ice Global Bathymetry Integration

This directory is designated for the full global **GEBCO_2026 Sub-Ice** NetCDF dataset (`GEBCO_2026_sub_ice.nc`).

## 1. File Placement

Place your downloaded NetCDF file directly into this folder:

```text
/data/GEBCO_2026_sub_ice.nc
```

*(Alternatively, you can place it in the project root as `./GEBCO_2026_sub_ice.nc` or specify a custom path via `--input`).*

> **Note**: This file is excluded from Git tracking via `.gitignore` to prevent committing multi-gigabyte binary files to the repository.

---

## 2. Why Regional Tiling is Used

The global GEBCO 15-arc-second grid contains $86,400 \times 43,200$ points (~7.5 GB). Attempting to load this multi-gigabyte dataset into a web browser causes browser tab crashes, out-of-memory errors, and massive bandwidth consumption.

MARIVEX processes this global dataset into **lightweight, geographically accurate regional 3D terrain tiles**:
- Each tile covers a focused oceanic sector or $10^\circ \times 10^\circ$ basin.
- Grid vertices preserve exact latitude, longitude, and elevation values in meters relative to mean sea level.
- Each tile is ~15 KB to 30 KB, enabling sub-second 3D mesh generation, silky-smooth 60 FPS rendering, and instant client-side caching.

---

## 3. How to Run the Preprocessing Step

Once `GEBCO_2026_sub_ice.nc` is placed in `data/`, run:

### Option A: Using Node.js (Recommended)
```bash
npm run process:gebco
```
*(Or specify a custom location: `node scripts/process_gebco_2026.mjs --input /path/to/GEBCO_2026_sub_ice.nc`)*

### Option B: Using Python
If you have a Python scientific environment (`pip install netCDF4 numpy`):
```bash
python3 scripts/process_gebco_2026.py
```

---

## 4. Generated Artifacts

The processor creates:
- `public/data/bathymetry/tiles/<region_id>.json`: High-resolution regional bathymetry grids.
- `public/data/bathymetry/manifest.json`: Metadata index of all available tiles with bounding boxes and depth extremes.
- `src/data/realBathymetryPresets.json`: Embedded presets for offline-first instant loading.

---

## 5. Serving & Display in MARIVEX

- MARIVEX serves the regional tiles via the Express backend `/api/bathymetry` and static tile endpoints `/data/bathymetry/tiles/*.json`.
- When navigating between ocean sectors, the 3D seabed automatically re-meshes using the genuine GEBCO elevation values.
- Clicking anywhere on the seabed drops an acoustic sounding probe showing the exact depth in meters and physical benthic characteristics.
