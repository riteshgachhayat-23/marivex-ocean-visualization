#!/usr/bin/env python3
"""
GEBCO_2026 Sub-Ice NetCDF Bathymetry Processor for MARIVEX

Processes the complete global GEBCO_2026 sub-ice bathymetry dataset (GEBCO_2026_sub_ice.nc)
into lightweight regional 3D terrain tiles with authentic elevations in meters.

Prerequisites (if running via Python):
    pip install netCDF4 numpy

Usage:
    python3 scripts/process_gebco_2026.py
    python3 scripts/process_gebco_2026.py --input /path/to/GEBCO_2026_sub_ice.nc
"""

import os
import sys
import json
import argparse
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PATHS = [
    ROOT_DIR / "data" / "GEBCO_2026_sub_ice.nc",
    ROOT_DIR / "GEBCO_2026_sub_ice.nc",
    ROOT_DIR / "data" / "gebco_2026_sub_ice.nc",
    ROOT_DIR / "gebco_2026_sub_ice.nc"
]

TARGET_REGIONS = [
    {
        "id": "mariana-trench",
        "name": "Mariana Trench (Challenger Deep)",
        "latMin": 10.75, "latMax": 11.95,
        "lonMin": 141.60, "lonMax": 142.80,
        "stride": 1,
        "landmarks": [
            {
                "id": "challenger-deep",
                "name": "Challenger Deep (Hadal Axis)",
                "type": "trench",
                "lat": 11.35, "lon": 142.18,
                "depthMeters": 10898,
                "description": "Deepest point on Earth (10,898m). Subduction axis of the Pacific Plate under the Mariana Microplate."
            },
            {
                "id": "sirena-deep",
                "name": "Sirena Deep Subduction Axis",
                "type": "trench",
                "lat": 11.85, "lon": 142.50,
                "depthMeters": 9820,
                "description": "Ultra-deep hadal fault basin along the southwestern curve of the Mariana subduction arc."
            },
            {
                "id": "mariana-ridge-crest",
                "name": "Mariana Microplate Forearc Ridge",
                "type": "ridge",
                "lat": 11.75, "lon": 141.70,
                "depthMeters": 1513,
                "description": "Submarine forearc volcanic ridge rising over 9,300 meters above the adjacent trench floor."
            }
        ]
    },
    {
        "id": "atlantic-ridge",
        "name": "Mid-Atlantic Ridge (Axial Graben)",
        "latMin": 25.40, "latMax": 26.60,
        "lonMin": -45.60, "lonMax": -44.40,
        "stride": 1,
        "landmarks": [
            {
                "id": "tag-mound",
                "name": "TAG Hydrothermal Complex",
                "type": "vent",
                "lat": 26.14, "lon": -44.82,
                "depthMeters": 3670,
                "description": "Active high-temperature polymetallic sulfide hydrothermal field venting black smoker fluids at 360°C."
            },
            {
                "id": "axial-valley",
                "name": "Central Axial Rift Valley",
                "type": "ridge",
                "lat": 26.00, "lon": -45.00,
                "depthMeters": 4320,
                "description": "Spreading graben dividing the North American and Eurasian/African lithospheric plates."
            },
            {
                "id": "western-crest",
                "name": "West Flank Rift Crest Peak",
                "type": "ridge",
                "lat": 25.85, "lon": -45.45,
                "depthMeters": 1606,
                "description": "High volcanic crest peak flanking the western margin of the central rift chasm."
            }
        ]
    },
    {
        "id": "puerto-rico-trench",
        "name": "Puerto Rico Trench (Milwaukee Deep)",
        "latMin": 19.24, "latMax": 20.44,
        "lonMin": -67.10, "lonMax": -65.90,
        "stride": 1,
        "landmarks": [
            {
                "id": "milwaukee-deep",
                "name": "Milwaukee Deep (Atlantic Chasm)",
                "type": "trench",
                "lat": 19.84, "lon": -66.50,
                "depthMeters": 8497,
                "description": "Deepest location in the Atlantic Ocean. Subduction boundary between the Caribbean and North American plates."
            },
            {
                "id": "brownson-fault",
                "name": "Brownson Deep Tectonic Escarpment",
                "type": "slope",
                "lat": 19.60, "lon": -66.10,
                "depthMeters": 7850,
                "description": "Nearly vertical subduction fault wall of fractured oceanic lithosphere dropping toward the trench axis."
            }
        ]
    },
    {
        "id": "arabian-sea",
        "name": "Arabian Sea (Carlsberg Ridge & Basin)",
        "latMin": 2.90, "latMax": 4.10,
        "lonMin": 63.40, "lonMax": 64.60,
        "stride": 1,
        "landmarks": [
            {
                "id": "carlsberg-rift",
                "name": "Carlsberg Spreading Axial Rift",
                "type": "ridge",
                "lat": 3.50, "lon": 64.00,
                "depthMeters": 4603,
                "description": "Slow-spreading divergent mid-ocean ridge boundary separating the African and Indo-Australian plates."
            },
            {
                "id": "carlsberg-crest",
                "name": "Carlsberg Ridge Peak Massif",
                "type": "ridge",
                "lat": 3.75, "lon": 64.40,
                "depthMeters": 1198,
                "description": "Tectonic volcanic summit rising steeply above the surrounding abyssal plains of the Arabian Basin."
            }
        ]
    },
    {
        "id": "bay-of-bengal",
        "name": "Bay of Bengal (Swatch of No Ground Canyon)",
        "latMin": 20.60, "latMax": 21.80,
        "lonMin": 88.60, "lonMax": 89.80,
        "stride": 1,
        "landmarks": [
            {
                "id": "swatch-canyon-axis",
                "name": "Swatch of No Ground Deep Axis",
                "type": "slope",
                "lat": 21.20, "lon": 89.20,
                "depthMeters": 1118,
                "description": "Submarine canyon deeply incising the Bengal continental shelf margin and funneling sediments to the Bengal Fan."
            },
            {
                "id": "ganges-shelf-break",
                "name": "Ganges Delta Continental Shelf",
                "type": "shelf",
                "lat": 21.75, "lon": 89.70,
                "depthMeters": 10,
                "description": "Shallow epicontinental sediment platform directly influenced by the discharge of the Ganges-Brahmaputra river system."
            }
        ]
    },
    {
        "id": "gulf-of-mexico",
        "name": "Gulf of Mexico (Sigsbee Deep)",
        "latMin": 24.40, "latMax": 25.60,
        "lonMin": -90.60, "lonMax": -89.40,
        "stride": 1,
        "landmarks": [
            {
                "id": "sigsbee-deep",
                "name": "Sigsbee Deep Abyssal Plain",
                "type": "basin",
                "lat": 25.00, "lon": -90.00,
                "depthMeters": 4008,
                "description": "Deepest basin in the Gulf of Mexico, underlain by massive Jurassic salt canopies."
            }
        ]
    },
    {
        "id": "mediterranean-sea",
        "name": "Mediterranean Sea (Ionian Basin)",
        "latMin": 36.00, "latMax": 37.20,
        "lonMin": 21.00, "lonMax": 22.20,
        "stride": 1,
        "landmarks": [
            {
                "id": "calypso-deep",
                "name": "Hellenic Trench Arc (Calypso Deep)",
                "type": "trench",
                "lat": 36.50, "lon": 21.60,
                "depthMeters": 5119,
                "description": "Deepest tectonic subduction trough in the Mediterranean Sea south of the Peloponnese."
            }
        ]
    },
    {
        "id": "sargasso-sea",
        "name": "Sargasso Sea (North Atlantic Plain)",
        "latMin": 27.40, "latMax": 28.60,
        "lonMin": -66.60, "lonMax": -65.40,
        "stride": 1,
        "landmarks": [
            {
                "id": "sargasso-abyssal",
                "name": "Sargasso Central Abyssal Floor",
                "type": "basin",
                "lat": 28.00, "lon": -66.00,
                "depthMeters": 5653,
                "description": "Stable, oligotrophic abyssal floor draped in pelagic calcareous foraminiferal sediment."
            }
        ]
    },
    {
        "id": "coral-sea",
        "name": "Coral Sea (Great Barrier Reef Margin)",
        "latMin": -18.60, "latMax": -17.40,
        "lonMin": 147.00, "lonMax": 148.20,
        "stride": 1,
        "landmarks": [
            {
                "id": "barrier-margin",
                "name": "Queensland Continental Slope Break",
                "type": "shelf",
                "lat": -18.00, "lon": 147.60,
                "depthMeters": 1635,
                "description": "Abrupt bathymetric escarpment dropping from shallow coral bioherms into the Queensland Basin."
            }
        ]
    },
    {
        "id": "philippine-sea",
        "name": "Philippine Sea (Philippine Trench)",
        "latMin": 10.00, "latMax": 11.20,
        "lonMin": 126.00, "lonMax": 127.20,
        "stride": 1,
        "landmarks": [
            {
                "id": "emden-deep",
                "name": "Philippine Trench (Emden Deep)",
                "type": "trench",
                "lat": 10.50, "lon": 126.60,
                "depthMeters": 9820,
                "description": "Narrow, ultra-deep hadal subduction chasm formed by the Philippine Sea Plate colliding with the Eurasian Plate."
            }
        ]
    }
]

def find_file(explicit_path=None):
    if explicit_path:
        p = Path(explicit_path).resolve()
        if p.exists() and p.is_file():
            return p
    for candidate in DEFAULT_PATHS:
        if candidate.exists() and candidate.is_file() and candidate.stat().st_size > 1024:
            return candidate
    return None

def main():
    parser = argparse.ArgumentParser(description="GEBCO_2026 NetCDF Slicer for MARIVEX")
    parser.add_argument("--input", help="Path to GEBCO_2026_sub_ice.nc", default=None)
    args = parser.parse_args()

    nc_file = find_file(args.input)
    tiles_dir = ROOT_DIR / "public" / "data" / "bathymetry" / "tiles"
    manifest_path = ROOT_DIR / "public" / "data" / "bathymetry" / "manifest.json"
    presets_path = ROOT_DIR / "src" / "data" / "realBathymetryPresets.json"

    tiles_dir.mkdir(parents=True, exist_ok=True)

    if not nc_file:
        print("=" * 64)
        print("  MARIVEX — GEBCO_2026 Sub-Ice NetCDF Bathymetry Processor")
        print("=" * 64)
        print("\n[INFO] Complete NetCDF file not found in default paths:")
        for p in DEFAULT_PATHS:
            print(f"  - {p.relative_to(ROOT_DIR)}")
        print("\n>>> WHERE TO PLACE YOUR DOWNLOADED DATASET:")
        print("  Place your GEBCO_2026 sub-ice NetCDF file at:")
        print(f"    📁 {ROOT_DIR / 'data' / 'GEBCO_2026_sub_ice.nc'}")
        print("    (or pass --input /path/to/GEBCO_2026_sub_ice.nc)\n")
        print("Once the file is placed, rerun:")
        print("  npm run process:gebco")
        print("  OR")
        print("  python3 scripts/process_gebco_2026.py\n")
        return

    print(f"[OK] Found GEBCO_2026 dataset: {nc_file}")
    file_size_gb = nc_file.stat().st_size / (1024 ** 3)
    print(f"File size: {file_size_gb:.2f} GB")

    try:
        import netCDF4 as nc
        import numpy as np
    except ImportError:
        print("\n[!] Python netCDF4/numpy not found. Please install:")
        print("      pip install netCDF4 numpy")
        print("    Or run the Node.js processor instead:")
        print("      npm run process:gebco\n")
        sys.exit(1)

    print("Opening NetCDF dataset (reading lazily without loading full file into memory)...")
    ds = nc.Dataset(str(nc_file), mode='r')

    lat_var = ds.variables['lat']
    lon_var = ds.variables['lon']
    elev_var = ds.variables['elevation'] if 'elevation' in ds.variables else ds.variables['z']

    lats = np.array(lat_var[:])
    lons = np.array(lon_var[:])

    print(f"Dataset dimensions: {len(lons)} lon × {len(lats)} lat points (15 arc-second resolution)")

    manifest = {
        "dataset": "GEBCO_2026 Sub-Ice Global Bathymetric Grid",
        "version": "2026",
        "sourceFile": nc_file.name,
        "verticalDatum": "Mean Sea Level (metres)",
        "gridIntervalArcSec": 15,
        "processedAt": "latest",
        "tiles": []
    }

    presets_update = {}

    for region in TARGET_REGIONS:
        print(f"  Extracting {region['name']}...")
        stride = region['stride']

        lat_mask = (lats >= region['latMin']) & (lats <= region['latMax'])
        lon_mask = (lons >= region['lonMin']) & (lons <= region['lonMax'])

        lat_indices = np.where(lat_mask)[0]
        lon_indices = np.where(lon_mask)[0]

        if len(lat_indices) == 0 or len(lon_indices) == 0:
            print(f"    [WARN] No matching coordinates for region {region['id']}")
            continue

        lat_start, lat_end = lat_indices[0], lat_indices[-1] + 1
        lon_start, lon_end = lon_indices[0], lon_indices[-1] + 1

        sub_elev = elev_var[lat_start:lat_end:stride, lon_start:lon_end:stride]
        sub_lats = lats[lat_start:lat_end:stride]
        sub_lons = lons[lon_start:lon_end:stride]

        # Reverse latitude to North-to-South (top-down) for 3D Three.js terrain layout
        if len(sub_lats) > 1 and sub_lats[0] < sub_lats[-1]:
            sub_elev = np.flipud(sub_elev)
            sub_lats = sub_lats[::-1]

        grid_h, grid_w = sub_elev.shape
        # Negative elevations are below sea level, convert to positive depth in meters
        depth_grid = np.where(sub_elev <= 0, -sub_elev, 0).astype(float)
        elev_list = depth_grid.flatten().tolist()

        min_depth = float(np.min(depth_grid))
        max_depth = float(np.max(depth_grid))

        tile_data = {
            "id": region["id"],
            "name": region["name"],
            "source": "GEBCO_2026 Sub-Ice Global Bathymetric Grid (15 arc-sec)",
            "resolutionArcSec": 15 * stride,
            "bounds": {
                "minLat": float(np.min(sub_lats)),
                "maxLat": float(np.max(sub_lats)),
                "minLon": float(np.min(sub_lons)),
                "maxLon": float(np.max(sub_lons))
            },
            "gridWidth": grid_w,
            "gridHeight": grid_h,
            "minDepth": min_depth,
            "maxDepth": max_depth,
            "landmarks": region["landmarks"],
            "elevations": elev_list
        }

        tile_file = f"{region['id']}.json"
        with open(tiles_dir / tile_file, "w", encoding="utf-8") as f:
            json.dump(tile_data, f)

        presets_update[region["id"]] = tile_data

        manifest["tiles"].append({
            "id": region["id"],
            "name": region["name"],
            "file": f"tiles/{tile_file}",
            "bounds": tile_data["bounds"],
            "gridWidth": grid_w,
            "gridHeight": grid_h,
            "minDepth": min_depth,
            "maxDepth": max_depth,
            "landmarksCount": len(region["landmarks"])
        })

        print(f"    -> Extracted {grid_w}×{grid_h} grid ({len(elev_list)} points), depths: {min_depth:.0f}m to {max_depth:.0f}m")

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    with open(presets_path, "w", encoding="utf-8") as f:
        json.dump(presets_update, f, indent=2)

    ds.close()
    print("\n[SUCCESS] GEBCO_2026 regional bathymetry processing complete!")
    print(f"  Tiles written to: {tiles_dir.relative_to(ROOT_DIR)}")
    print(f"  Manifest written to: {manifest_path.relative_to(ROOT_DIR)}")
    print(f"  Presets updated in: {presets_path.relative_to(ROOT_DIR)}\n")

if __name__ == "__main__":
    main()
