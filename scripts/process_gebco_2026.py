#!/usr/bin/env python3
"""
MARIVEX — Offline GEBCO 2026 Sub-Ice Bathymetry Tile Pyramid Processor
========================================================================
Processes a GEBCO NetCDF source grid (such as GEBCO_2026_sub_ice.nc,
86,400 x 43,200 Int16 grid at 15-arc-second resolution, or a compatible
monotonic 2D lat/lon NetCDF grid) into a multi-resolution binary Int16
little-endian tile pyramid (L0–L4) and signed regional JSON extracts for
MARIVEX's unified bathymetry loader.

Key guarantees:
1. Derives every tile's geographic bounds (`bounds`) and exact sample-center
   coordinates (`sampleBounds`, `sampleSpacingLat`, `sampleSpacingLon`) directly
   from the NetCDF coordinate arrays (`lat`/`latitude`, `lon`/`longitude`).
2. Correctly handles both ascending (South-to-North) and descending
   (North-to-South) latitude axes, as well as `[-180, 180]` and `[0, 360)`
   longitude conventions. Rejects unsupported source layouts or dimensions.
3. Preserves signed elevations in meters relative to Mean Sea Level (MSL):
   negative (< 0) underwater, positive (> 0) land, 0 sea level, and -32768
   (null in JSON) for missing/no-data samples.
4. Enforces strict source-to-tile sample verification against on-disk binary
   tiles and validates tile byte sizes, bounds, coverage, and manifest
   references before atomically writing `manifest.json`. Never overwrites an
   existing valid `manifest.json` if any tile or validation check fails.

Usage:
  python3 scripts/process_gebco_2026.py --input data/GEBCO_2026_sub_ice.nc --output public/data/bathymetry --resume
"""

import os
import sys
import json
import math
import time
import array
import struct
import argparse
from datetime import datetime, timezone

INT16_NODATA = -32768

DEFAULT_PYRAMID_LEVELS = [
    {"level": 0, "name": "L0_global_overview", "stride": 240, "rows": 1,  "cols": 1},
    {"level": 1, "name": "L1_coarse",          "stride": 60,  "rows": 2,  "cols": 4},
    {"level": 2, "name": "L2_medium",          "stride": 16,  "rows": 6,  "cols": 12},
    {"level": 3, "name": "L3_regional",        "stride": 4,   "rows": 10, "cols": 20},
    {"level": 4, "name": "L4_high",            "stride": 1,   "rows": 36, "cols": 72},
]


# ---------------------------------------------------------------------------
# Pure-Python Classic NetCDF-3 (CDF\x01 / CDF\x02) Reader Fallback
# Used when `netCDF4` is not installed and the input is a classic NetCDF-3 file.
# ---------------------------------------------------------------------------
class NetCDF3Variable:
    def __init__(self, fp, name, dims, shape, nc_type, vsize, begin, attrs):
        self._fp = fp
        self.name = name
        self.dimensions = tuple(dims)
        self.shape = tuple(shape)
        self.ndim = len(shape)
        self._nc_type = nc_type
        self._vsize = vsize
        self._begin = begin
        self._attrs = attrs
        for k, v in attrs.items():
            setattr(self, k, v)

        # Map NetCDF-3 type code to struct format and byte width
        type_map = {
            1: ('b', 1),  # NC_BYTE
            2: ('c', 1),  # NC_CHAR
            3: ('h', 2),  # NC_SHORT (int16)
            4: ('i', 4),  # NC_INT (int32)
            5: ('f', 4),  # NC_FLOAT (float32)
            6: ('d', 8),  # NC_DOUBLE (float64)
        }
        if nc_type not in type_map:
            raise ValueError(f"Unsupported NetCDF-3 variable type code {nc_type} on '{name}'")
        self._fmt_char, self._itemsize = type_map[nc_type]

    def read_1d(self):
        if self.ndim != 1:
            raise ValueError(f"Expected 1D variable for '{self.name}', got {self.ndim}D")
        count = self.shape[0]
        self._fp.seek(self._begin)
        raw = self._fp.read(count * self._itemsize)
        if len(raw) != count * self._itemsize:
            raise IOError(f"Truncated NetCDF-3 data while reading 1D variable '{self.name}'")
        return list(struct.unpack(f">{count}{self._fmt_char}", raw))

    def read_point(self, r, c):
        if self.ndim != 2:
            raise ValueError(f"Expected 2D variable for '{self.name}', got {self.ndim}D")
        rows, cols = self.shape
        if not (0 <= r < rows and 0 <= c < cols):
            raise IndexError(f"Index ({r}, {c}) out of bounds for shape {self.shape}")
        offset = self._begin + (r * cols + c) * self._itemsize
        self._fp.seek(offset)
        raw = self._fp.read(self._itemsize)
        if len(raw) != self._itemsize:
            raise IOError(f"Truncated NetCDF-3 data at ({r}, {c}) in '{self.name}'")
        return struct.unpack(f">{self._fmt_char}", raw)[0]

    def read_row_slice(self, r, col_indices):
        """Reads a single row `r` and extracts `col_indices`."""
        rows, cols = self.shape
        if not (0 <= r < rows):
            raise IndexError(f"Row {r} out of bounds for shape {self.shape}")
        min_c = min(col_indices)
        max_c = max(col_indices)
        span_c = max_c - min_c + 1
        offset = self._begin + (r * cols + min_c) * self._itemsize
        self._fp.seek(offset)
        raw = self._fp.read(span_c * self._itemsize)
        if len(raw) != span_c * self._itemsize:
            raise IOError(f"Truncated NetCDF-3 row {r} in '{self.name}'")
        unpacked = struct.unpack(f">{span_c}{self._fmt_char}", raw)
        return [unpacked[c - min_c] for c in col_indices]


class NetCDF3Dataset:
    """Minimal spec-compliant reader for classic NetCDF-3 (CDF\\x01 and CDF\\x02)."""
    def __init__(self, path):
        self._fp = open(path, 'rb')
        magic = self._fp.read(4)
        if magic not in (b'CDF\x01', b'CDF\x02'):
            self._fp.close()
            raise ValueError(f"Not a classic NetCDF-3 file (magic={magic!r})")
        self._is_64bit = (magic == b'CDF\x02')
        self.dimensions = {}
        self.variables = {}
        self._parse_header()

    def _read_u32(self):
        b = self._fp.read(4)
        if len(b) < 4:
            raise EOFError("Unexpected EOF reading uint32 in NetCDF-3 header")
        return struct.unpack(">I", b)[0]

    def _read_u64(self):
        b = self._fp.read(8)
        if len(b) < 8:
            raise EOFError("Unexpected EOF reading uint64 in NetCDF-3 header")
        return struct.unpack(">Q", b)[0]

    def _read_string(self):
        length = self._read_u32()
        padded = (length + 3) & ~3
        raw = self._fp.read(padded)
        if len(raw) < padded:
            raise EOFError("Unexpected EOF reading string in NetCDF-3 header")
        return raw[:length].decode('utf-8', errors='replace')

    def _read_attr_list(self):
        tag = self._read_u32()
        nelems = self._read_u32()
        if tag == 0 and nelems == 0:
            return {}
        if tag != 12:
            raise ValueError(f"Invalid NetCDF-3 attribute list tag {tag}")
        attrs = {}
        for _ in range(nelems):
            name = self._read_string()
            nc_type = self._read_u32()
            nvals = self._read_u32()
            if nc_type == 2:  # NC_CHAR
                padded = (nvals + 3) & ~3
                raw = self._fp.read(padded)
                attrs[name] = raw[:nvals].decode('utf-8', errors='replace')
            else:
                type_map = {1: ('b', 1), 3: ('h', 2), 4: ('i', 4), 5: ('f', 4), 6: ('d', 8)}
                if nc_type not in type_map:
                    raise ValueError(f"Unsupported attr type {nc_type}")
                fmt_char, itemsize = type_map[nc_type]
                byte_len = nvals * itemsize
                padded = (byte_len + 3) & ~3
                raw = self._fp.read(padded)
                vals = struct.unpack(f">{nvals}{fmt_char}", raw[:byte_len])
                attrs[name] = vals[0] if nvals == 1 else list(vals)
        return attrs

    def _parse_header(self):
        _numrecs = self._read_u32()
        # Dimension list
        dim_tag = self._read_u32()
        dim_count = self._read_u32()
        dim_list = []
        if not (dim_tag == 0 and dim_count == 0):
            if dim_tag != 10:
                raise ValueError(f"Invalid NetCDF-3 dimension tag {dim_tag}")
            for _ in range(dim_count):
                dname = self._read_string()
                dlen = self._read_u32()
                self.dimensions[dname] = dlen
                dim_list.append((dname, dlen))

        # Global attributes
        self.attrs = self._read_attr_list()

        # Variable list
        var_tag = self._read_u32()
        var_count = self._read_u32()
        if not (var_tag == 0 and var_count == 0):
            if var_tag != 11:
                raise ValueError(f"Invalid NetCDF-3 variable tag {var_tag}")
            for _ in range(var_count):
                vname = self._read_string()
                ndims = self._read_u32()
                dim_ids = [self._read_u32() for _ in range(ndims)]
                vdims = [dim_list[i][0] for i in dim_ids]
                vshape = [dim_list[i][1] for i in dim_ids]
                vattrs = self._read_attr_list()
                nc_type = self._read_u32()
                vsize = self._read_u32()
                begin = self._read_u64() if self._is_64bit else self._read_u32()
                self.variables[vname] = NetCDF3Variable(
                    self._fp, vname, vdims, vshape, nc_type, vsize, begin, vattrs
                )

    def close(self):
        if self._fp and not self._fp.closed:
            self._fp.close()


# ---------------------------------------------------------------------------
# Unified Dataset Wrapper (supports netCDF4.Dataset OR NetCDF3Dataset)
# ---------------------------------------------------------------------------
def open_source_dataset(input_path):
    with open(input_path, 'rb') as fp:
        magic = fp.read(8)

    is_nc3 = magic[:4] in (b'CDF\x01', b'CDF\x02')
    is_hdf5 = (magic == b'\x89HDF\r\n\x1a\n')

    try:
        import netCDF4  # type: ignore
        ds = netCDF4.Dataset(input_path, 'r')
        return ds, 'netCDF4'
    except ImportError:
        if is_nc3:
            return NetCDF3Dataset(input_path), 'netcdf3_stdlib'
        elif is_hdf5:
            print(
                f"[ERROR] Input file '{input_path}' is a NetCDF-4/HDF5 dataset, "
                f"but the Python 'netCDF4' package is not installed for '{sys.executable}'.\n"
                f"        Install required packages with: \"{sys.executable}\" -m pip install netCDF4 numpy",
                file=sys.stderr,
            )
            sys.exit(1)
        else:
            print(
                f"[ERROR] Unsupported or unrecognized NetCDF file header ({magic[:4]!r}) in '{input_path}'.",
                file=sys.stderr,
            )
            sys.exit(1)
    except Exception as exc:
        if is_nc3:
            try:
                return NetCDF3Dataset(input_path), 'netcdf3_stdlib'
            except Exception as inner_exc:
                print(f"[ERROR] Failed to open NetCDF-3 file '{input_path}': {inner_exc}", file=sys.stderr)
                sys.exit(1)
        print(f"[ERROR] Failed to open NetCDF dataset '{input_path}': {exc}", file=sys.stderr)
        sys.exit(1)


def read_1d_coords(var, backend):
    if backend == 'netcdf3_stdlib':
        return [float(x) for x in var.read_1d()]
    arr = var[:]
    return [float(x) for x in arr]


def sanitize_elevation_value(val, fill_value):
    """Converts a single raw elevation value into signed int16 (or INT16_NODATA)."""
    if val is None:
        return INT16_NODATA
    try:
        fval = float(val)
    except (TypeError, ValueError):
        return INT16_NODATA
    if not math.isfinite(fval):
        return INT16_NODATA
    if fill_value is not None:
        try:
            if abs(fval - float(fill_value)) < 1e-4:
                return INT16_NODATA
        except (TypeError, ValueError):
            pass
    ival = int(round(fval))
    if ival == INT16_NODATA:
        return INT16_NODATA
    if ival < -32767:
        return -32767
    if ival > 32767:
        return 32767
    return ival


def read_point_from_var(elev_var, backend, r, c, fill_value):
    if backend == 'netcdf3_stdlib':
        raw_val = elev_var.read_point(r, c)
        return sanitize_elevation_value(raw_val, fill_value)
    val = elev_var[r, c]
    if hasattr(val, 'mask') and bool(val.mask):
        return INT16_NODATA
    return sanitize_elevation_value(val, fill_value)


def read_tile_from_var(elev_var, backend, src_rows, src_cols, fill_value):
    """
    Reads a 2D grid of shape (len(src_rows), len(src_cols)) where `src_rows`
    are ordered South-to-North and `src_cols` are ordered West-to-East.
    Returns a flat list of int16 values of length `len(src_rows) * len(src_cols)`,
    along with (min_elev, max_elev, min_depth, max_depth, missing_count).
    """
    out_values = []
    min_elev = None
    max_elev = None
    min_depth = None
    max_depth = None
    missing_count = 0

    # Check if we can use fast numpy slicing when backend == 'netCDF4'
    use_numpy = False
    if backend == 'netCDF4':
        try:
            import numpy as np  # type: ignore
            use_numpy = True
        except ImportError:
            use_numpy = False

    if use_numpy and len(src_rows) > 0 and len(src_cols) > 0:
        import numpy as np  # type: ignore
        # Check if src_rows and src_cols are contiguous strided ranges
        r_first, r_last = src_rows[0], src_rows[-1]
        c_first, c_last = src_cols[0], src_cols[-1]
        r_step = (src_rows[1] - src_rows[0]) if len(src_rows) > 1 else 1
        c_step = (src_cols[1] - src_cols[0]) if len(src_cols) > 1 else 1

        is_simple_col_stride = all(
            src_cols[i] == c_first + i * c_step for i in range(len(src_cols))
        ) and c_step != 0
        is_simple_row_stride = all(
            src_rows[i] == r_first + i * r_step for i in range(len(src_rows))
        ) and r_step != 0

        if is_simple_row_stride and is_simple_col_stride:
            r_min, r_max = min(r_first, r_last), max(r_first, r_last)
            c_min, c_max = min(c_first, c_last), max(c_first, c_last)
            raw_slice = elev_var[
                r_min : r_max + 1 : abs(r_step),
                c_min : c_max + 1 : abs(c_step)
            ]
            if r_step < 0:
                raw_slice = raw_slice[::-1, :]
            if c_step < 0:
                raw_slice = raw_slice[:, ::-1]
            if np.ma.isMaskedArray(raw_slice):
                arr_f = np.ma.filled(raw_slice.astype(np.float64), float(INT16_NODATA))
            else:
                arr_f = np.asarray(raw_slice, dtype=np.float64)
            if fill_value is not None:
                arr_f = np.where(np.isnan(arr_f) | (np.abs(arr_f - float(fill_value)) < 1e-4), float(INT16_NODATA), arr_f)
            else:
                arr_f = np.where(np.isnan(arr_f), float(INT16_NODATA), arr_f)
            arr_i16 = np.clip(np.rint(arr_f), -32768, 32767).astype('<i2')
            flat_list = arr_i16.flatten().tolist()
            for iv in flat_list:
                if iv == INT16_NODATA:
                    missing_count += 1
                else:
                    if min_elev is None or iv < min_elev:
                        min_elev = iv
                    if max_elev is None or iv > max_elev:
                        max_elev = iv
                    d = max(0, -iv)
                    if min_depth is None or d < min_depth:
                        min_depth = d
                    if max_depth is None or d > max_depth:
                        max_depth = d
            return (
                flat_list,
                min_elev if min_elev is not None else 0,
                max_elev if max_elev is not None else 0,
                min_depth if min_depth is not None else 0,
                max_depth if max_depth is not None else 0,
                missing_count,
            )

    # Row-by-row extraction (handles descending rows, [0, 360) wrapped columns, and stdlib NetCDF-3)
    for r in src_rows:
        if backend == 'netcdf3_stdlib':
            row_raw = elev_var.read_row_slice(r, src_cols)
        else:
            full_row = elev_var[r, :]
            row_raw = [full_row[c] for c in src_cols]
        for val in row_raw:
            if hasattr(val, 'mask') and bool(val.mask):
                iv = INT16_NODATA
            else:
                iv = sanitize_elevation_value(val, fill_value)
            out_values.append(iv)
            if iv == INT16_NODATA:
                missing_count += 1
            else:
                if min_elev is None or iv < min_elev:
                    min_elev = iv
                if max_elev is None or iv > max_elev:
                    max_elev = iv
                d = max(0, -iv)
                if min_depth is None or d < min_depth:
                    min_depth = d
                if max_depth is None or d > max_depth:
                    max_depth = d

    return (
        out_values,
        min_elev if min_elev is not None else 0,
        max_elev if max_elev is not None else 0,
        min_depth if min_depth is not None else 0,
        max_depth if max_depth is not None else 0,
        missing_count,
    )


# ---------------------------------------------------------------------------
# Coordinate Axis Analysis & Validation
# ---------------------------------------------------------------------------
def analyze_and_validate_axes(lat_coords, lon_coords, elev_shape):
    """
    Validates source grid dimensions and coordinate arrays.
    Returns a dictionary containing canonical South-to-North latitude coordinates,
    canonical West-to-East longitude coordinates in [-180, 180], index mappings
    back to the source NetCDF array, and cell spacing.
    Raises ValueError on any unsupported or invalid layout.
    """
    if len(elev_shape) != 2:
        raise ValueError(f"Elevation variable must be 2D (lat, lon), got {len(elev_shape)}D shape {elev_shape}")

    total_rows, total_cols = elev_shape
    if len(lat_coords) != total_rows:
        raise ValueError(
            f"Latitude coordinate length ({len(lat_coords)}) does not match elevation row count ({total_rows})"
        )
    if len(lon_coords) != total_cols:
        raise ValueError(
            f"Longitude coordinate length ({len(lon_coords)}) does not match elevation column count ({total_cols})"
        )
    if total_rows < 4 or total_cols < 4:
        raise ValueError(
            f"Unsupported source grid dimensions ({total_rows}x{total_cols}): minimum supported grid is 4x4"
        )

    # Validate finite values and latitude range [-90, 90]
    for idx, lat in enumerate(lat_coords):
        if not math.isfinite(lat) or lat < -90.0 - 1e-4 or lat > 90.0 + 1e-4:
            raise ValueError(f"Invalid latitude value {lat} at index {idx} (must be finite in [-90, 90])")

    for idx, lon in enumerate(lon_coords):
        if not math.isfinite(lon) or lon < -180.0 - 1e-4 or lon > 360.0 + 1e-4:
            raise ValueError(f"Invalid longitude value {lon} at index {idx} (must be finite in [-180, 360])")

    # Check latitude monotonicity and uniform spacing
    lat_diffs = [lat_coords[i + 1] - lat_coords[i] for i in range(total_rows - 1)]
    if all(d > 0 for d in lat_diffs):
        lat_ascending = True
        lat_sn = list(lat_coords)
        sn_to_src_row = list(range(total_rows))
    elif all(d < 0 for d in lat_diffs):
        lat_ascending = False
        lat_sn = list(reversed(lat_coords))
        sn_to_src_row = list(range(total_rows - 1, -1, -1))
    else:
        raise ValueError("Unsupported latitude coordinate axis: latitude values must be strictly monotonic")

    dlat = (lat_sn[-1] - lat_sn[0]) / float(total_rows - 1)
    if dlat <= 0:
        raise ValueError(f"Invalid latitude spacing dlat={dlat}")
    for i in range(total_rows - 1):
        step = lat_sn[i + 1] - lat_sn[i]
        if abs(step - dlat) > max(1e-3, abs(dlat) * 0.05):
            raise ValueError(
                f"Unsupported non-uniform latitude spacing at index {i}: step={step}, expected={dlat}"
            )

    # Check longitude convention and monotonicity
    lon_diffs = [lon_coords[j + 1] - lon_coords[j] for j in range(total_cols - 1)]
    lon_strictly_asc = all(d > 0 for d in lon_diffs)
    lon_strictly_desc = all(d < 0 for d in lon_diffs)

    if not (lon_strictly_asc or lon_strictly_desc):
        raise ValueError("Unsupported longitude coordinate axis: longitude values must be strictly monotonic")

    has_0_360 = any(lon > 180.0 + 1e-4 for lon in lon_coords)
    if has_0_360:
        if any(lon < -1e-4 for lon in lon_coords) or not lon_strictly_asc:
            raise ValueError(
                "Unsupported longitude layout: [0, 360) longitude axis must be non-negative and strictly ascending"
            )
        lon_convention = "0_to_360"
        # Convert [0, 360) to canonical West-to-East [-180, 180]
        # Values >= 180.0 map to lon - 360.0 ([-180, 0)), values < 180.0 remain [0, 180)
        west_half = [(lon - 360.0, j) for j, lon in enumerate(lon_coords) if lon >= 180.0 - 1e-7]
        east_half = [(lon, j) for j, lon in enumerate(lon_coords) if lon < 180.0 - 1e-7]
        combined = west_half + east_half
        lon_we = [item[0] for item in combined]
        we_to_src_col = [item[1] for item in combined]
    else:
        lon_convention = "-180_to_180"
        if lon_strictly_asc:
            lon_we = list(lon_coords)
            we_to_src_col = list(range(total_cols))
        else:
            lon_we = list(reversed(lon_coords))
            we_to_src_col = list(range(total_cols - 1, -1, -1))

    dlon = (lon_we[-1] - lon_we[0]) / float(total_cols - 1)
    if dlon <= 0:
        raise ValueError(f"Invalid longitude spacing dlon={dlon}")
    for j in range(total_cols - 1):
        step = lon_we[j + 1] - lon_we[j]
        if abs(step - dlon) > max(1e-3, abs(dlon) * 0.05):
            raise ValueError(
                f"Unsupported non-uniform longitude spacing at index {j}: step={step}, expected={dlon}"
            )

    # Detect cell-center vs node registration
    # In cell-center registration, outer cell edges extend by +/- 0.5 * dlat / dlon beyond first/last sample centers
    south_edge = max(-90.0, lat_sn[0] - 0.5 * dlat)
    north_edge = min(90.0, lat_sn[-1] + 0.5 * dlat)
    west_edge = max(-180.0, lon_we[0] - 0.5 * dlon)
    east_edge = min(180.0, lon_we[-1] + 0.5 * dlon)

    is_global_extent = (
        abs(south_edge - (-90.0)) <= max(1.0, dlat)
        and abs(north_edge - 90.0) <= max(1.0, dlat)
        and abs(west_edge - (-180.0)) <= max(1.0, dlon)
        and abs(east_edge - 180.0) <= max(1.0, dlon)
    )

    return {
        "total_rows": total_rows,
        "total_cols": total_cols,
        "lat_ascending": lat_ascending,
        "lon_ascending": lon_strictly_asc,
        "lon_convention": lon_convention,
        "lat_sn": lat_sn,
        "lon_we": lon_we,
        "sn_to_src_row": sn_to_src_row,
        "we_to_src_col": we_to_src_col,
        "dlat": dlat,
        "dlon": dlon,
        "global_bounds": {
            "minLat": round(south_edge, 6),
            "maxLat": round(north_edge, 6),
            "minLon": round(west_edge, 6),
            "maxLon": round(east_edge, 6),
        },
        "is_global_extent": is_global_extent,
    }


def _resolve_level_stride(lvl_stride, row_span, col_span, scale_factor, finest_raw_stride):
    """
    Determines the effective integer stride for a pyramid level given the sector
    row_span and col_span. Preserves native GEBCO strides on full-size grids, and
    scales coarse levels proportionally on smaller synthetic test grids so coarse
    levels remain genuinely strided (stride > 1) whenever supported by row_span/col_span.
    """
    if scale_factor == 1:
        return lvl_stride

    if scale_factor > 1:
        scaled = lvl_stride // scale_factor
        if scaled >= 1 and row_span % scaled == 0 and col_span % scaled == 0:
            if (row_span // scaled) >= 2 and (col_span // scaled) >= 2:
                return scaled

    if lvl_stride > finest_raw_stride and finest_raw_stride > 0:
        rel_ratio = max(2, lvl_stride // finest_raw_stride)
        candidates = []
        for cand in (rel_ratio, 4, 3, 2):
            if cand > 1 and cand not in candidates:
                candidates.append(cand)
        for cand in candidates:
            if row_span % cand == 0 and col_span % cand == 0:
                if (row_span // cand) >= 2 and (col_span // cand) >= 2:
                    return cand

    if scale_factor == 0 and row_span % lvl_stride == 0 and col_span % lvl_stride == 0:
        if (row_span // lvl_stride) >= 2 and (col_span // lvl_stride) >= 2:
            return lvl_stride

    return 1 if scale_factor > 0 else lvl_stride


def select_and_validate_pyramid_levels(axis_info, requested_levels_str=None):
    """
    Selects and validates pyramid levels for the given source grid dimensions.
    Raises ValueError if the source dimensions cannot support the requested levels.
    """
    total_rows = axis_info["total_rows"]
    total_cols = axis_info["total_cols"]

    scale_factor = (
        43200 // total_rows
        if (
            43200 % total_rows == 0
            and 86400 % total_cols == 0
            and (43200 // total_rows) == (86400 // total_cols)
        )
        else 0
    )

    if requested_levels_str:
        wanted = {int(x.strip()) for x in requested_levels_str.split(",") if x.strip()}
        raw_levels = [lvl for lvl in DEFAULT_PYRAMID_LEVELS if lvl["level"] in wanted]
        if not raw_levels:
            raise ValueError(f"No valid pyramid levels matched --levels='{requested_levels_str}'")
        finest_raw_stride = min(l["stride"] for l in raw_levels)
        levels = []
        for lvl in raw_levels:
            if total_rows % lvl["rows"] != 0 or total_cols % lvl["cols"] != 0:
                raise ValueError(
                    f"Source dimensions ({total_rows}x{total_cols}) are not divisible by "
                    f"level L{lvl['level']} tile grid ({lvl['rows']}x{lvl['cols']})"
                )
            row_span = total_rows // lvl["rows"]
            col_span = total_cols // lvl["cols"]
            eff_stride = _resolve_level_stride(
                lvl["stride"], row_span, col_span, scale_factor, finest_raw_stride
            )
            levels.append({**lvl, "stride": eff_stride})
    elif total_rows == 43200 and total_cols == 86400:
        levels = list(DEFAULT_PYRAMID_LEVELS)
    else:
        # For smaller synthetic or downsampled grids, select compatible levels or require divisibility
        divisible_levels = [
            lvl
            for lvl in DEFAULT_PYRAMID_LEVELS
            if total_rows % lvl["rows"] == 0 and total_cols % lvl["cols"] == 0
        ]
        finest_raw_stride = min((l["stride"] for l in divisible_levels), default=1)
        compatible = []
        for lvl in divisible_levels:
            row_span = total_rows // lvl["rows"]
            col_span = total_cols // lvl["cols"]
            eff_stride = _resolve_level_stride(
                lvl["stride"], row_span, col_span, scale_factor, finest_raw_stride
            )
            row_offset = eff_stride // 2
            col_offset = eff_stride // 2
            grid_h = len(range(row_offset, row_span, eff_stride))
            grid_w = len(range(col_offset, col_span, eff_stride))
            if grid_h >= 2 and grid_w >= 2 and row_span % eff_stride == 0 and col_span % eff_stride == 0:
                compatible.append({
                    **lvl,
                    "stride": eff_stride,
                })
        if not compatible:
            raise ValueError(
                f"Unsupported source grid dimensions ({total_rows}x{total_cols}): "
                f"not evenly divisible into valid >=2x2 pyramid tiles."
            )
        levels = compatible

    # Validate every selected level strictly
    for lvl in levels:
        rows = lvl["rows"]
        cols = lvl["cols"]
        stride = lvl["stride"]
        if total_rows % rows != 0 or total_cols % cols != 0:
            raise ValueError(
                f"Source dimensions ({total_rows}x{total_cols}) are not divisible by "
                f"level L{lvl['level']} tile grid ({rows}x{cols})"
            )
        row_span = total_rows // rows
        col_span = total_cols // cols
        if row_span % stride != 0 or col_span % stride != 0:
            raise ValueError(
                f"Level L{lvl['level']} sector span ({row_span}x{col_span}) is not evenly divisible "
                f"by stride {stride}"
            )
        row_offset = stride // 2
        col_offset = stride // 2
        grid_h = len(range(row_offset, row_span, stride))
        grid_w = len(range(col_offset, col_span, stride))
        if grid_h < 2 or grid_w < 2:
            raise ValueError(
                f"Level L{lvl['level']} produces invalid tile dimensions ({grid_w}x{grid_h} < 2x2) "
                f"for source grid ({total_rows}x{total_cols}) with stride {stride}"
            )

    return levels


def verify_binary_tile_against_source(
    tile_path, grid_w, grid_h, sampled_sn_rows, sampled_we_cols, axis_info, elev_var, backend, fill_value, tile_id
):
    """
    Reads the binary Int16LE tile back from disk and compares corner and midpoint
    samples against the authoritative source NetCDF array.
    Raises ValueError immediately if any sample does not match.
    """
    if not os.path.exists(tile_path):
        raise ValueError(f"Tile file missing on disk: {tile_path}")

    expected_bytes = grid_w * grid_h * 2
    actual_bytes = os.path.getsize(tile_path)
    if actual_bytes != expected_bytes:
        raise ValueError(
            f"Tile '{tile_id}' byte size mismatch: expected {expected_bytes} bytes "
            f"({grid_w}x{grid_h} Int16LE), got {actual_bytes} bytes"
        )

    sn_to_src_row = axis_info["sn_to_src_row"]
    we_to_src_col = axis_info["we_to_src_col"]

    check_coords = [
        (0, 0),
        (grid_h // 2, grid_w // 2),
        (grid_h - 1, grid_w - 1),
        (0, grid_w - 1),
        (grid_h - 1, 0),
    ]

    checks_report = []
    with open(tile_path, 'rb') as fp:
        raw_bytes = fp.read()

    for tr, tc in check_coords:
        byte_offset = (tr * grid_w + tc) * 2
        tile_val = struct.unpack_from("<h", raw_bytes, byte_offset)[0]

        sn_row = sampled_sn_rows[tr]
        we_col = sampled_we_cols[tc]
        src_r = sn_to_src_row[sn_row]
        src_c = we_to_src_col[we_col]

        src_val = read_point_from_var(elev_var, backend, src_r, src_c, fill_value)
        if tile_val != src_val:
            raise ValueError(
                f"Source-to-tile sample comparison FAILED on tile '{tile_id}' at tile index ({tr}, {tc}) "
                f"[source index ({src_r}, {src_c}), lat={axis_info['lat_sn'][sn_row]:.6f}, "
                f"lon={axis_info['lon_we'][we_col]:.6f}]: source={src_val}, tile={tile_val}"
            )

        checks_report.append({
            "tileId": tile_id,
            "tileRow": tr,
            "tileCol": tc,
            "sourceRow": src_r,
            "sourceCol": src_c,
            "latitude": round(float(axis_info["lat_sn"][sn_row]), 6),
            "longitude": round(float(axis_info["lon_we"][we_col]), 6),
            "sourceElevation": src_val,
            "tileElevation": tile_val,
            "matches": True,
        })

    return checks_report


EXPECTED_LEVEL_SPECS = {lvl["level"]: lvl for lvl in DEFAULT_PYRAMID_LEVELS}


def extract_regional_presets_from_source(
    output_dir, tiles_dir, axis_info, elev_var, backend, fill_value, sync_presets_bundle_path=None
):
    """
    Regenerates regional JSON preset files in `tiles_dir` whose geographic bounds
    lie within the source NetCDF coverage using authoritative signed `rawElevations`
    and underwater `elevations` directly from the source NetCDF, and optionally
    synchronizes `realBathymetryPresets.json` when `sync_presets_bundle_path` is
    explicitly provided.
    Never reconstructs positive land elevation from a depth-only array.
    """
    regenerated = []
    if not os.path.isdir(tiles_dir):
        return regenerated

    candidate_bundle = sync_presets_bundle_path

    bundle_data = None
    if candidate_bundle and os.path.exists(candidate_bundle):
        try:
            with open(candidate_bundle, "r", encoding="utf-8") as bfp:
                loaded_bundle = json.load(bfp)
            if isinstance(loaded_bundle, dict):
                bundle_data = loaded_bundle
                # Seed any preset from realBathymetryPresets.json that is not yet in tiles_dir
                for pid, prec in bundle_data.items():
                    if not isinstance(prec, dict):
                        continue
                    tile_json_path = os.path.join(tiles_dir, f"{pid}.json")
                    if not os.path.exists(tile_json_path):
                        with open(tile_json_path, "w", encoding="utf-8") as sfp:
                            json.dump(prec, sfp)
        except Exception:
            bundle_data = None

    lat_sn = axis_info["lat_sn"]
    lon_we = axis_info["lon_we"]
    sn_to_src_row = axis_info["sn_to_src_row"]
    we_to_src_col = axis_info["we_to_src_col"]
    dlat = axis_info["dlat"]
    dlon = axis_info["dlon"]
    g_bounds = axis_info["global_bounds"]

    updated_presets_by_id = {}

    for fname in sorted(os.listdir(tiles_dir)):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(tiles_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as fp:
                preset = json.load(fp)
        except Exception:
            continue

        b = preset.get("bounds")
        if not isinstance(b, dict):
            continue
        p_min_lat = float(b.get("minLat", 0))
        p_max_lat = float(b.get("maxLat", 0))
        p_min_lon = float(b.get("minLon", 0))
        p_max_lon = float(b.get("maxLon", 0))

        # Check if covered by source grid
        if (
            p_min_lat < g_bounds["minLat"] - 1e-4
            or p_max_lat > g_bounds["maxLat"] + 1e-4
            or p_min_lon < g_bounds["minLon"] - 1e-4
            or p_max_lon > g_bounds["maxLon"] + 1e-4
        ):
            continue

        # Find source canonical indices falling within [p_min_lat, p_max_lat] and [p_min_lon, p_max_lon]
        sn_rows = [i for i, lat in enumerate(lat_sn) if p_min_lat - 0.5 * dlat <= lat <= p_max_lat + 0.5 * dlat]
        we_cols = [j for j, lon in enumerate(lon_we) if p_min_lon - 0.5 * dlon <= lon <= p_max_lon + 0.5 * dlon]
        if len(sn_rows) < 2 or len(we_cols) < 2:
            continue

        # JSON regional tiles are stored North-to-South, West-to-East
        ns_sn_rows = list(reversed(sn_rows))
        src_rows = [sn_to_src_row[i] for i in ns_sn_rows]
        src_cols = [we_to_src_col[j] for j in we_cols]

        flat_vals, min_e, max_e, min_d, max_d, missing_cnt = read_tile_from_source_rows(
            elev_var, backend, src_rows, src_cols, fill_value
        )

        raw_elevations = [None if v == INT16_NODATA else int(v) for v in flat_vals]
        depths = [None if v == INT16_NODATA else max(0, -int(v)) for v in flat_vals]

        preset_id = preset.get("id", fname[:-5])
        preset["id"] = preset_id
        preset["gridWidth"] = len(we_cols)
        preset["gridHeight"] = len(ns_sn_rows)
        preset["rowOrder"] = "north-to-south"
        preset["colOrder"] = "west-to-east"
        preset["hasSignedElevations"] = True
        preset["sampleBounds"] = {
            "minLat": round(float(lat_sn[sn_rows[0]]), 6),
            "maxLat": round(float(lat_sn[sn_rows[-1]]), 6),
            "minLon": round(float(lon_we[we_cols[0]]), 6),
            "maxLon": round(float(lon_we[we_cols[-1]]), 6),
        }
        preset["sampleSpacingLat"] = round(float(dlat), 6)
        preset["sampleSpacingLon"] = round(float(dlon), 6)
        preset["rawElevations"] = raw_elevations
        preset["elevations"] = depths
        preset["minElevation"] = int(min_e)
        preset["maxElevation"] = int(max_e)
        preset["minDepth"] = int(min_d)
        preset["maxDepth"] = int(max_d)
        preset["missingSampleCount"] = int(missing_cnt)

        tmp_preset = fpath + ".tmp"
        with open(tmp_preset, "w", encoding="utf-8") as out_fp:
            json.dump(preset, out_fp)
        os.replace(tmp_preset, fpath)
        regenerated.append(preset_id)
        updated_presets_by_id[preset_id] = preset

    # Synchronize realBathymetryPresets.json ONLY when explicitly requested via sync_presets_bundle_path
    if candidate_bundle and updated_presets_by_id:
        try:
            target_bundle = bundle_data if isinstance(bundle_data, dict) else {}
            for pid, pdata in updated_presets_by_id.items():
                target_bundle[pid] = pdata
            os.makedirs(os.path.dirname(os.path.abspath(candidate_bundle)), exist_ok=True)
            tmp_bundle = candidate_bundle + ".tmp"
            with open(tmp_bundle, "w", encoding="utf-8") as bfp:
                json.dump(target_bundle, bfp)
            os.replace(tmp_bundle, candidate_bundle)
        except Exception as sync_err:
            print(f"[WARN] Could not synchronize presets bundle at {candidate_bundle}: {sync_err}", file=sys.stderr)

    return regenerated


def read_tile_from_source_rows(elev_var, backend, src_rows, src_cols, fill_value):
    return read_tile_from_var(elev_var, backend, src_rows, src_cols, fill_value)


def validate_manifest_and_tiles(output_dir, manifest_data, expected_levels=None):
    """
    Validates tile existence, exact byte sizes, coordinate bounds, sampleBounds,
    duplicate IDs, per-level row/column sector completeness (including all
    36 x 72 = 2,592 tiles when L4 is selected), per-tile expected sector bounds,
    sample coordinate alignment, sector adjacency, unintended overlaps,
    longitude wraparound across the antimeridian, manifest-to-disk file matching,
    and resolution/coverage honesty before manifest.json is committed.
    Raises ValueError on any validation failure.
    """
    tiles = manifest_data.get("tiles")
    if not isinstance(tiles, list) or len(tiles) == 0:
        raise ValueError("Manifest validation failed: 'tiles' array is empty or missing")

    if manifest_data.get("totalTiles") is not None and int(manifest_data["totalTiles"]) != len(tiles):
        raise ValueError(
            f"Manifest validation failed: totalTiles ({manifest_data['totalTiles']}) != len(tiles) ({len(tiles)})"
        )

    seen_ids = set()
    seen_files = set()
    binary_tiles = []
    tiles_by_level = {}

    for t in tiles:
        tid = t.get("id", "<unknown>")
        if not tid or tid == "<unknown>":
            raise ValueError("Manifest contains a tile with missing or empty 'id'")
        if tid in seen_ids:
            raise ValueError(f"Duplicate tile ID '{tid}' in manifest")
        seen_ids.add(tid)

        rel_file = t.get("file")
        if not rel_file:
            raise ValueError(f"Tile '{tid}' is missing a 'file' reference")
        if rel_file in seen_files:
            raise ValueError(f"Duplicate tile file reference '{rel_file}' in manifest")
        seen_files.add(rel_file)

        full_path = os.path.join(output_dir, rel_file)
        if not os.path.exists(full_path):
            raise ValueError(f"Tile '{tid}' referenced file does not exist on disk: {full_path}")

        gw = int(t.get("gridWidth", 0))
        gh = int(t.get("gridHeight", 0))
        if gw < 2 or gh < 2:
            raise ValueError(f"Tile '{tid}' has invalid grid dimensions ({gw}x{gh})")

        fmt = t.get("format", "int16le")
        is_binary = (fmt == "int16le" or rel_file.endswith(".bin"))
        if is_binary:
            expected_size = gw * gh * 2
            actual_size = os.path.getsize(full_path)
            if actual_size != expected_size:
                raise ValueError(
                    f"Tile '{tid}' size mismatch on disk: expected {expected_size} bytes, got {actual_size} bytes"
                )
            binary_tiles.append(t)
            lvl_idx = t.get("level")
            if lvl_idx is None:
                raise ValueError(f"Binary tile '{tid}' is missing required 'level' metadata")
            lvl_idx = int(lvl_idx)
            tiles_by_level.setdefault(lvl_idx, []).append(t)

        b = t.get("bounds")
        if not isinstance(b, dict):
            raise ValueError(f"Tile '{tid}' is missing 'bounds'")
        min_lat, max_lat = float(b["minLat"]), float(b["maxLat"])
        min_lon, max_lon = float(b["minLon"]), float(b["maxLon"])
        if not (-90.0 - 1e-4 <= min_lat < max_lat <= 90.0 + 1e-4):
            raise ValueError(f"Tile '{tid}' has invalid latitude bounds [{min_lat}, {max_lat}]")
        if not (-180.0 - 1e-4 <= min_lon < max_lon <= 180.0 + 1e-4):
            raise ValueError(f"Tile '{tid}' has invalid longitude bounds [{min_lon}, {max_lon}]")

        sb = t.get("sampleBounds")
        if isinstance(sb, dict):
            s_min_lat, s_max_lat = float(sb["minLat"]), float(sb["maxLat"])
            s_min_lon, s_max_lon = float(sb["minLon"]), float(sb["maxLon"])
            if not (min_lat - 1e-4 <= s_min_lat <= s_max_lat <= max_lat + 1e-4):
                raise ValueError(
                    f"Tile '{tid}' sampleBounds latitude [{s_min_lat}, {s_max_lat}] "
                    f"outside tile bounds [{min_lat}, {max_lat}]"
                )
            if not (min_lon - 1e-4 <= s_min_lon <= s_max_lon <= max_lon + 1e-4):
                raise ValueError(
                    f"Tile '{tid}' sampleBounds longitude [{s_min_lon}, {s_max_lon}] "
                    f"outside tile bounds [{min_lon}, {max_lon}]"
                )

    # Verify per-level completeness, sector bounds, sample coordinates, adjacency, overlaps, and wraparound
    if binary_tiles:
        sorted_levels = sorted(tiles_by_level.keys())
        declared_levels = manifest_data.get("availableLevels")
        if declared_levels is not None and sorted(int(x) for x in declared_levels) != sorted_levels:
            raise ValueError(
                f"Manifest availableLevels ({declared_levels}) does not match actual tile levels ({sorted_levels})"
            )

        if expected_levels is not None:
            wanted_level_ids = sorted(int(lvl["level"] if isinstance(lvl, dict) else lvl) for lvl in expected_levels)
            if sorted_levels != wanted_level_ids:
                raise ValueError(
                    f"Generated levels ({sorted_levels}) do not match requested levels ({wanted_level_ids})"
                )

        # Determine overall outer geographic domain across binary tiles ([-90..90, -180..180] when coverage=='global')
        is_global_claim = (manifest_data.get("coverage") == "global")
        domain_min_lat = -90.0 if is_global_claim else min(float(t["bounds"]["minLat"]) for t in binary_tiles)
        domain_max_lat = 90.0 if is_global_claim else max(float(t["bounds"]["maxLat"]) for t in binary_tiles)
        domain_min_lon = -180.0 if is_global_claim else min(float(t["bounds"]["minLon"]) for t in binary_tiles)
        domain_max_lon = 180.0 if is_global_claim else max(float(t["bounds"]["maxLon"]) for t in binary_tiles)
        domain_lat_span = domain_max_lat - domain_min_lat
        domain_lon_span = domain_max_lon - domain_min_lon

        for lvl_idx in sorted_levels:
            if lvl_idx not in EXPECTED_LEVEL_SPECS:
                raise ValueError(f"Unsupported pyramid level L{lvl_idx} in manifest")
            spec = EXPECTED_LEVEL_SPECS[lvl_idx]
            exp_rows = spec["rows"]
            exp_cols = spec["cols"]
            exp_count = exp_rows * exp_cols
            lvl_tiles = tiles_by_level[lvl_idx]

            # 1. Check for missing sectors FIRST so missing sectors report a clear sector error
            sector_map = {}
            ref_gw = int(lvl_tiles[0]["gridWidth"])
            ref_gh = int(lvl_tiles[0]["gridHeight"])
            ref_res = float(lvl_tiles[0].get("resolutionArcSec", 0))
            ref_stride = int(lvl_tiles[0].get("stride", 1))

            exp_sector_lat_span = domain_lat_span / float(exp_rows)
            exp_sector_lon_span = domain_lon_span / float(exp_cols)
            exp_sample_dlat = exp_sector_lat_span / float(ref_gh)
            exp_sample_dlon = exp_sector_lon_span / float(ref_gw)
            native_dlat = exp_sample_dlat / float(max(1, ref_stride))
            native_dlon = exp_sample_dlon / float(max(1, ref_stride))
            row_offset = ref_stride // 2
            col_offset = ref_stride // 2

            for lt in lvl_tiles:
                lt_id = lt["id"]
                if int(lt["gridWidth"]) != ref_gw or int(lt["gridHeight"]) != ref_gh:
                    raise ValueError(
                        f"Inconsistent tile dimensions in level L{lvl_idx}: tile '{lt_id}' is "
                        f"{lt['gridWidth']}x{lt['gridHeight']}, expected {ref_gw}x{ref_gh}"
                    )
                if abs(float(lt.get("resolutionArcSec", 0)) - ref_res) > 1e-3:
                    raise ValueError(
                        f"Inconsistent resolutionArcSec in level L{lvl_idx} on tile '{lt_id}'"
                    )

                declared_r = lt.get("tileRow") if lt.get("tileRow") is not None else lt.get("row")
                declared_c = lt.get("tileCol") if lt.get("tileCol") is not None else lt.get("col")
                parsed_r = None
                parsed_c = None
                prefix = f"L{lvl_idx}_r"
                if lt_id.startswith(prefix) and "_c" in lt_id:
                    try:
                        rc_part = lt_id[len(prefix):]
                        r_str, c_str = rc_part.split("_c", 1)
                        parsed_r = int(r_str)
                        parsed_c = int(c_str)
                    except ValueError:
                        parsed_r = None
                        parsed_c = None

                if declared_r is not None and parsed_r is not None and int(declared_r) != parsed_r:
                    raise ValueError(
                        f"Tile '{lt_id}' declared tileRow ({declared_r}) does not match ID row ({parsed_r})"
                    )
                if declared_c is not None and parsed_c is not None and int(declared_c) != parsed_c:
                    raise ValueError(
                        f"Tile '{lt_id}' declared tileCol ({declared_c}) does not match ID col ({parsed_c})"
                    )

                r_idx = int(declared_r) if declared_r is not None else parsed_r
                c_idx = int(declared_c) if declared_c is not None else parsed_c

                if r_idx is None or c_idx is None or not (0 <= r_idx < exp_rows and 0 <= c_idx < exp_cols):
                    raise ValueError(
                        f"Tile '{lt_id}' in level L{lvl_idx} has invalid or out-of-range sector indices "
                        f"(expected r in 0..{exp_rows - 1}, c in 0..{exp_cols - 1})"
                    )

                rc_tuple = (r_idx, c_idx)
                if rc_tuple in sector_map:
                    raise ValueError(f"Duplicate sector (r={r_idx}, c={c_idx}) in level L{lvl_idx}")
                sector_map[rc_tuple] = lt

                # 2. Verify tile geographic bounds match its declared (tileRow, tileCol) sector
                tb = lt["bounds"]
                t_min_lat, t_max_lat = float(tb["minLat"]), float(tb["maxLat"])
                t_min_lon, t_max_lon = float(tb["minLon"]), float(tb["maxLon"])

                exp_min_lat = domain_min_lat + r_idx * exp_sector_lat_span
                exp_max_lat = domain_min_lat + (r_idx + 1) * exp_sector_lat_span
                exp_min_lon = domain_min_lon + c_idx * exp_sector_lon_span
                exp_max_lon = domain_min_lon + (c_idx + 1) * exp_sector_lon_span

                bound_tol = 1e-3
                if (
                    abs(t_min_lat - exp_min_lat) > bound_tol
                    or abs(t_max_lat - exp_max_lat) > bound_tol
                    or abs(t_min_lon - exp_min_lon) > bound_tol
                    or abs(t_max_lon - exp_max_lon) > bound_tol
                ):
                    raise ValueError(
                        f"Tile '{lt_id}' at sector (r={r_idx}, c={c_idx}) in level L{lvl_idx} has bounds "
                        f"[{t_min_lat}, {t_max_lat}] x [{t_min_lon}, {t_max_lon}] which do not match "
                        f"expected sector bounds [{exp_min_lat:.6f}, {exp_max_lat:.6f}] x "
                        f"[{exp_min_lon:.6f}, {exp_max_lon:.6f}]"
                    )

                # 3. Independently validate sampleBounds and sampleSpacing against sector geometry
                sb = lt.get("sampleBounds")
                if isinstance(sb, dict):
                    s_min_lat, s_max_lat = float(sb["minLat"]), float(sb["maxLat"])
                    s_min_lon, s_max_lon = float(sb["minLon"]), float(sb["maxLon"])

                    exp_s_min_lat = exp_min_lat + (row_offset + 0.5) * native_dlat
                    exp_s_max_lat = exp_min_lat + ((ref_gh - 1) * ref_stride + row_offset + 0.5) * native_dlat
                    exp_s_min_lon = exp_min_lon + (col_offset + 0.5) * native_dlon
                    exp_s_max_lon = exp_min_lon + ((ref_gw - 1) * ref_stride + col_offset + 0.5) * native_dlon

                    if (
                        abs(s_min_lat - exp_s_min_lat) > 1e-2
                        or abs(s_max_lat - exp_s_max_lat) > 1e-2
                        or abs(s_min_lon - exp_s_min_lon) > 1e-2
                        or abs(s_max_lon - exp_s_max_lon) > 1e-2
                    ):
                        raise ValueError(
                            f"Tile '{lt_id}' sampleBounds [{s_min_lat}, {s_max_lat}] x [{s_min_lon}, {s_max_lon}] "
                            f"do not match expected sample-center coordinates "
                            f"[{exp_s_min_lat:.6f}, {exp_s_max_lat:.6f}] x [{exp_s_min_lon:.6f}, {exp_s_max_lon:.6f}]"
                        )

                    if lt.get("sampleSpacingLat") is not None:
                        if abs(float(lt["sampleSpacingLat"]) - exp_sample_dlat) > 1e-3:
                            raise ValueError(
                                f"Tile '{lt_id}' sampleSpacingLat ({lt['sampleSpacingLat']}) does not match "
                                f"expected spacing ({exp_sample_dlat:.6f})"
                            )
                    if lt.get("sampleSpacingLon") is not None:
                        if abs(float(lt["sampleSpacingLon"]) - exp_sample_dlon) > 1e-3:
                            raise ValueError(
                                f"Tile '{lt_id}' sampleSpacingLon ({lt['sampleSpacingLon']}) does not match "
                                f"expected spacing ({exp_sample_dlon:.6f})"
                            )

            # 4. Check for any missing sectors in the level
            missing_sectors = [
                f"L{lvl_idx}_r{r}_c{c}"
                for r in range(exp_rows)
                for c in range(exp_cols)
                if (r, c) not in sector_map
            ]
            if missing_sectors or len(lvl_tiles) != exp_count:
                raise ValueError(
                    f"Level L{lvl_idx} is incomplete: expected {exp_rows}x{exp_cols}={exp_count} tiles, "
                    f"got {len(lvl_tiles)}, missing {len(missing_sectors)} sectors "
                    f"(e.g. {', '.join(missing_sectors[:5])})"
                )

            # 5. Check pairwise unintended interior overlaps within the level
            for i in range(len(lvl_tiles)):
                b1 = lvl_tiles[i]["bounds"]
                for j in range(i + 1, len(lvl_tiles)):
                    b2 = lvl_tiles[j]["bounds"]
                    overlap_lat = min(float(b1["maxLat"]), float(b2["maxLat"])) - max(float(b1["minLat"]), float(b2["minLat"]))
                    overlap_lon = min(float(b1["maxLon"]), float(b2["maxLon"])) - max(float(b1["minLon"]), float(b2["minLon"]))
                    if overlap_lat > 1e-4 and overlap_lon > 1e-4:
                        raise ValueError(
                            f"Unintended geographic overlap in level L{lvl_idx} between tiles "
                            f"'{lvl_tiles[i]['id']}' and '{lvl_tiles[j]['id']}' "
                            f"(overlap={overlap_lat:.6f}° lat x {overlap_lon:.6f}° lon)"
                        )

            # 6. Check north-south adjacency and cross-tile sample continuity for every column
            for c in range(exp_cols):
                southmost = sector_map[(0, c)]
                northmost = sector_map[(exp_rows - 1, c)]
                if is_global_claim:
                    if abs(float(southmost["bounds"]["minLat"]) - (-90.0)) > 1e-3:
                        raise ValueError(
                            f"Level L{lvl_idx} column {c} southern boundary ({southmost['bounds']['minLat']}) != -90.0°"
                        )
                    if abs(float(northmost["bounds"]["maxLat"]) - 90.0) > 1e-3:
                        raise ValueError(
                            f"Level L{lvl_idx} column {c} northern boundary ({northmost['bounds']['maxLat']}) != +90.0°"
                        )
                for r in range(exp_rows - 1):
                    t_south = sector_map[(r, c)]
                    t_north = sector_map[(r + 1, c)]
                    edge_diff = abs(float(t_south["bounds"]["maxLat"]) - float(t_north["bounds"]["minLat"]))
                    if edge_diff > 1e-4:
                        raise ValueError(
                            f"Latitude adjacency mismatch in level L{lvl_idx} between '{t_south['id']}' "
                            f"(maxLat={t_south['bounds']['maxLat']}) and '{t_north['id']}' "
                            f"(minLat={t_north['bounds']['minLat']})"
                        )
                    sb_s = t_south.get("sampleBounds")
                    sb_n = t_north.get("sampleBounds")
                    if isinstance(sb_s, dict) and isinstance(sb_n, dict):
                        step_lat = float(sb_n["minLat"]) - float(sb_s["maxLat"])
                        if abs(step_lat - exp_sample_dlat) > 1e-2:
                            raise ValueError(
                                f"Cross-sector sample latitude step mismatch between '{t_south['id']}' and "
                                f"'{t_north['id']}': got {step_lat:.6f}°, expected {exp_sample_dlat:.6f}°"
                            )

            # 7. Check west-east adjacency and antimeridian longitude wraparound for every row
            for r in range(exp_rows):
                westmost = sector_map[(r, 0)]
                eastmost = sector_map[(r, exp_cols - 1)]
                w_min_lon = float(westmost["bounds"]["minLon"])
                e_max_lon = float(eastmost["bounds"]["maxLon"])

                if is_global_claim:
                    if abs(w_min_lon - (-180.0)) > 1e-3 or abs(e_max_lon - 180.0) > 1e-3:
                        raise ValueError(
                            f"Level L{lvl_idx} row {r} fails antimeridian wraparound bounds: "
                            f"west minLon={w_min_lon}, east maxLon={e_max_lon} (expected -180.0 to +180.0)"
                        )
                    if abs((e_max_lon - w_min_lon) - 360.0) > 1e-3:
                        raise ValueError(
                            f"Level L{lvl_idx} row {r} longitude span ({e_max_lon - w_min_lon}) != 360.0°"
                        )
                    sb_w = westmost.get("sampleBounds")
                    sb_e = eastmost.get("sampleBounds")
                    if isinstance(sb_w, dict) and isinstance(sb_e, dict):
                        wrap_step_lon = (float(sb_w["minLon"]) + 360.0) - float(sb_e["maxLon"])
                        if abs(wrap_step_lon - exp_sample_dlon) > 1e-2:
                            raise ValueError(
                                f"Antimeridian longitude wraparound sample step mismatch on row {r} of L{lvl_idx}: "
                                f"got {wrap_step_lon:.6f}°, expected {exp_sample_dlon:.6f}°"
                            )

                for c in range(exp_cols - 1):
                    t_west = sector_map[(r, c)]
                    t_east = sector_map[(r, c + 1)]
                    edge_diff = abs(float(t_west["bounds"]["maxLon"]) - float(t_east["bounds"]["minLon"]))
                    if edge_diff > 1e-4:
                        raise ValueError(
                            f"Longitude adjacency mismatch in level L{lvl_idx} between '{t_west['id']}' "
                            f"(maxLon={t_west['bounds']['maxLon']}) and '{t_east['id']}' "
                            f"(minLon={t_east['bounds']['minLon']})"
                        )
                    sb_w = t_west.get("sampleBounds")
                    sb_e = t_east.get("sampleBounds")
                    if isinstance(sb_w, dict) and isinstance(sb_e, dict):
                        step_lon = float(sb_e["minLon"]) - float(sb_w["maxLon"])
                        if abs(step_lon - exp_sample_dlon) > 1e-2:
                            raise ValueError(
                                f"Cross-sector sample longitude step mismatch between '{t_west['id']}' and "
                                f"'{t_east['id']}': got {step_lon:.6f}°, expected {exp_sample_dlon:.6f}°"
                            )

        # Verify that manifest entries match the .bin files generated for these levels on disk
        tiles_dir_path = os.path.join(output_dir, "tiles")
        if os.path.isdir(tiles_dir_path):
            expected_bin_files = {os.path.basename(t["file"]) for t in binary_tiles}
            for fname in os.listdir(tiles_dir_path):
                if not fname.endswith(".bin"):
                    continue
                for lvl_idx in sorted_levels:
                    if fname.startswith(f"L{lvl_idx}_") and fname not in expected_bin_files:
                        raise ValueError(
                            f"Unreferenced binary tile file '{fname}' found on disk for level L{lvl_idx} "
                            f"that is not recorded in manifest.json"
                        )

        # Verify resolution honesty
        finest_res = min(float(t.get("resolutionArcSec", 0)) for t in binary_tiles)
        declared_finest = manifest_data.get("finestResolutionArcSec")
        if declared_finest is not None and abs(float(declared_finest) - finest_res) > 1e-3:
            raise ValueError(
                f"Manifest finestResolutionArcSec ({declared_finest}) does not match actual finest tile resolution ({finest_res})"
            )

        if manifest_data.get("hasL4HighResolution") is True:
            if 4 not in tiles_by_level or len(tiles_by_level[4]) != 2592:
                raise ValueError(
                    "Manifest claims hasL4HighResolution=True, but complete L4 grid (36x72 = 2,592 tiles) is not present"
                )

    if manifest_data.get("coverage") == "global":
        if not binary_tiles:
            raise ValueError("Manifest claims coverage='global' but contains 0 binary pyramid tiles")
        min_lat_all = min(float(t["bounds"]["minLat"]) for t in binary_tiles)
        max_lat_all = max(float(t["bounds"]["maxLat"]) for t in binary_tiles)
        min_lon_all = min(float(t["bounds"]["minLon"]) for t in binary_tiles)
        max_lon_all = max(float(t["bounds"]["maxLon"]) for t in binary_tiles)
        if min_lat_all > -89.0 or max_lat_all < 89.0 or min_lon_all > -179.0 or max_lon_all < 179.0:
            raise ValueError(
                f"Manifest claims coverage='global' but tiles only span "
                f"lat=[{min_lat_all}, {max_lat_all}], lon=[{min_lon_all}, {max_lon_all}]"
            )


def main():
    parser = argparse.ArgumentParser(description="Process GEBCO_2026_sub_ice.nc into binary Int16LE tiles.")
    parser.add_argument("--input", default="data/GEBCO_2026_sub_ice.nc", help="Path to GEBCO_2026_sub_ice.nc")
    parser.add_argument("--output", default="public/data/bathymetry", help="Output directory for tiles and manifest")
    parser.add_argument("--resume", action="store_true", help="Skip already generated tiles that pass source verification")
    parser.add_argument("--levels", default=None, help="Comma-separated pyramid levels to generate (e.g. '0,1,2')")
    parser.add_argument("--extract-presets", action="store_true", help="Also regenerate regional JSON presets covered by source")
    parser.add_argument("--sync-presets-bundle", default=None, help="Optional path to realBathymetryPresets.json to synchronize")
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    output_dir = os.path.abspath(args.output)
    tiles_dir = os.path.join(output_dir, "tiles")

    if not os.path.exists(input_path):
        print(f"[ERROR] Input NetCDF file not found at: {input_path}", file=sys.stderr)
        print("        Place GEBCO_2026_sub_ice.nc at the --input path and re-run.", file=sys.stderr)
        sys.exit(1)

    ds, backend = open_source_dataset(input_path)

    try:
        elev_var = None
        for candidate in ("elevation", "z", "Band1", "depth"):
            if candidate in ds.variables:
                elev_var = ds.variables[candidate]
                break

        if elev_var is None:
            raise ValueError(
                f"Could not find 'elevation' variable in {input_path}. "
                f"Available variables: {list(ds.variables.keys())}"
            )

        lat_var = ds.variables.get("lat") or ds.variables.get("latitude")
        lon_var = ds.variables.get("lon") or ds.variables.get("longitude")

        if lat_var is None or lon_var is None:
            raise ValueError(
                "Unsupported NetCDF layout: explicit 1D 'lat'/'latitude' and 'lon'/'longitude' "
                f"coordinate variables are required (found: {list(ds.variables.keys())})"
            )

        if getattr(lat_var, "ndim", len(lat_var.shape)) != 1 or getattr(lon_var, "ndim", len(lon_var.shape)) != 1:
            raise ValueError("Unsupported NetCDF layout: 'lat' and 'lon' coordinate variables must be 1D arrays")

        # Verify variable dimension ordering matches (lat, lon)
        elev_dims = getattr(elev_var, "dimensions", ())
        lat_dims = getattr(lat_var, "dimensions", ())
        lon_dims = getattr(lon_var, "dimensions", ())
        if len(elev_dims) == 2 and len(lat_dims) == 1 and len(lon_dims) == 1:
            if elev_dims[0] != lat_dims[0] or elev_dims[1] != lon_dims[0]:
                raise ValueError(
                    f"Unsupported dimension order on elevation variable: expected ({lat_dims[0]}, {lon_dims[0]}), "
                    f"got {elev_dims}"
                )

        lat_coords = read_1d_coords(lat_var, backend)
        lon_coords = read_1d_coords(lon_var, backend)

        axis_info = analyze_and_validate_axes(lat_coords, lon_coords, elev_var.shape)
        pyramid_levels = select_and_validate_pyramid_levels(axis_info, args.levels)

        fill_value = getattr(elev_var, "_FillValue", getattr(elev_var, "missing_value", None))

        total_rows = axis_info["total_rows"]
        total_cols = axis_info["total_cols"]
        lat_sn = axis_info["lat_sn"]
        lon_we = axis_info["lon_we"]
        sn_to_src_row = axis_info["sn_to_src_row"]
        we_to_src_col = axis_info["we_to_src_col"]
        dlat = axis_info["dlat"]
        dlon = axis_info["dlon"]
        base_arc_sec = round(dlat * 3600.0, 4)

        os.makedirs(tiles_dir, exist_ok=True)

        print(f"[INFO] Opened {input_path} ({backend})")
        print(f"[INFO] Grid shape: {total_rows} rows (lat) x {total_cols} cols (lon), spacing={base_arc_sec}\"")
        print(
            f"[INFO] Coordinate orientation: Lat={'South-to-North (ascending)' if axis_info['lat_ascending'] else 'North-to-South (descending)'}, "
            f"Lon convention={axis_info['lon_convention']}"
        )

        manifest_tiles = []
        level_summary = {}
        validation_checks = []
        start_time = time.time()

        for lvl in pyramid_levels:
            level_idx = lvl["level"]
            stride = lvl["stride"]
            rows = lvl["rows"]
            cols = lvl["cols"]
            row_span = total_rows // rows
            col_span = total_cols // cols
            row_offset = stride // 2
            col_offset = stride // 2
            res_arc_sec = round(base_arc_sec * stride, 4)

            print(
                f"[INFO] Processing Level {level_idx} ({lvl['name']}): {rows}x{cols} tiles at {res_arc_sec}\" "
                f"resolution (stride={stride}, center_offset=({row_offset},{col_offset}))..."
            )

            lvl_tile_count = 0
            lvl_grid_w = 0
            lvl_grid_h = 0

            for r in range(rows):
                sn_row_start = r * row_span
                sn_row_end = (r + 1) * row_span
                # Position coarse-resolution samples at the center of each strided block within the sector
                sampled_sn_rows = list(range(sn_row_start + row_offset, sn_row_end, stride))
                grid_h = len(sampled_sn_rows)
                lvl_grid_h = grid_h

                # Derive exact geographic sector bounds and actual selected sample-center bounds from source coordinate array
                tile_min_lat = max(-90.0, float(lat_sn[sn_row_start] - 0.5 * dlat))
                tile_max_lat = min(90.0, float(lat_sn[sn_row_end - 1] + 0.5 * dlat))
                sample_min_lat = float(lat_sn[sampled_sn_rows[0]])
                sample_max_lat = float(lat_sn[sampled_sn_rows[-1]])
                sample_spacing_lat = (
                    (sample_max_lat - sample_min_lat) / float(grid_h - 1)
                    if grid_h > 1
                    else float(dlat * stride)
                )

                for c in range(cols):
                    we_col_start = c * col_span
                    we_col_end = (c + 1) * col_span
                    sampled_we_cols = list(range(we_col_start + col_offset, we_col_end, stride))
                    grid_w = len(sampled_we_cols)
                    lvl_grid_w = grid_w

                    tile_min_lon = max(-180.0, float(lon_we[we_col_start] - 0.5 * dlon))
                    tile_max_lon = min(180.0, float(lon_we[we_col_end - 1] + 0.5 * dlon))
                    sample_min_lon = float(lon_we[sampled_we_cols[0]])
                    sample_max_lon = float(lon_we[sampled_we_cols[-1]])
                    sample_spacing_lon = (
                        (sample_max_lon - sample_min_lon) / float(grid_w - 1)
                        if grid_w > 1
                        else float(dlon * stride)
                    )

                    actual_res_arc_sec = round(max(sample_spacing_lat, sample_spacing_lon) * 3600.0, 4)
                    res_arc_sec = actual_res_arc_sec

                    tile_id = f"L{level_idx}_r{r}_c{c}"
                    tile_rel_path = f"tiles/{tile_id}.bin"
                    tile_full_path = os.path.join(output_dir, tile_rel_path)
                    expected_bytes = grid_w * grid_h * 2

                    src_rows_for_tile = [sn_to_src_row[i] for i in sampled_sn_rows]
                    src_cols_for_tile = [we_to_src_col[j] for j in sampled_we_cols]

                    need_generate = True
                    if args.resume and os.path.exists(tile_full_path) and os.path.getsize(tile_full_path) == expected_bytes:
                        # Even on --resume, verify the existing tile against source NetCDF!
                        checks = verify_binary_tile_against_source(
                            tile_full_path,
                            grid_w,
                            grid_h,
                            sampled_sn_rows,
                            sampled_we_cols,
                            axis_info,
                            elev_var,
                            backend,
                            fill_value,
                            tile_id,
                        )
                        validation_checks.extend(checks[:1])
                        with open(tile_full_path, "rb") as tfp:
                            raw_b = tfp.read()
                        vals = struct.unpack(f"<{grid_w * grid_h}h", raw_b)
                        valid_vals = [v for v in vals if v != INT16_NODATA]
                        missing_cnt = (grid_w * grid_h) - len(valid_vals)
                        min_elev = min(valid_vals) if valid_vals else 0
                        max_elev = max(valid_vals) if valid_vals else 0
                        min_depth = min((max(0, -v) for v in valid_vals), default=0)
                        max_depth = max((max(0, -v) for v in valid_vals), default=0)
                        need_generate = False

                    if need_generate:
                        flat_vals, min_elev, max_elev, min_depth, max_depth, missing_cnt = read_tile_from_var(
                            elev_var, backend, src_rows_for_tile, src_cols_for_tile, fill_value
                        )

                        if len(flat_vals) != grid_w * grid_h:
                            raise ValueError(
                                f"Internal tile sample count mismatch on {tile_id}: "
                                f"expected {grid_w * grid_h}, got {len(flat_vals)}"
                            )

                        # Write little-endian int16 to temporary file, verify against source NetCDF, then atomically replace
                        tmp_tile_path = tile_full_path + ".tmp"
                        packed_bytes = struct.pack(f"<{len(flat_vals)}h", *flat_vals)
                        with open(tmp_tile_path, "wb") as tfp:
                            tfp.write(packed_bytes)

                        try:
                            # Mandatory post-write verification against source NetCDF before committing tile file
                            checks = verify_binary_tile_against_source(
                                tmp_tile_path,
                                grid_w,
                                grid_h,
                                sampled_sn_rows,
                                sampled_we_cols,
                                axis_info,
                                elev_var,
                                backend,
                                fill_value,
                                tile_id,
                            )
                        except Exception:
                            if os.path.exists(tmp_tile_path):
                                os.remove(tmp_tile_path)
                            raise

                        os.replace(tmp_tile_path, tile_full_path)
                        validation_checks.extend(checks[:1])

                    lvl_tile_count += 1
                    manifest_tiles.append({
                        "id": tile_id,
                        "name": f"GEBCO 2026 L{level_idx} Sector ({tile_min_lat:.2f}° to {tile_max_lat:.2f}°, {tile_min_lon:.2f}° to {tile_max_lon:.2f}°)",
                        "file": tile_rel_path,
                        "format": "int16le",
                        "level": level_idx,
                        "tileRow": r,
                        "tileCol": c,
                        "stride": stride,
                        "sampleOffsetRow": row_offset,
                        "sampleOffsetCol": col_offset,
                        "nativeResolutionArcSec": base_arc_sec,
                        "resolutionArcSec": actual_res_arc_sec,
                        "provenance": "authoritative_local",
                        "hasSignedElevations": True,
                        "rowOrder": "south-to-north",
                        "colOrder": "west-to-east",
                        "sourceRowStart": int(src_rows_for_tile[0]),
                        "sourceRowEnd": int(src_rows_for_tile[-1]),
                        "sourceColStart": int(src_cols_for_tile[0]),
                        "sourceColEnd": int(src_cols_for_tile[-1]),
                        "bounds": {
                            "minLat": round(tile_min_lat, 6),
                            "maxLat": round(tile_max_lat, 6),
                            "minLon": round(tile_min_lon, 6),
                            "maxLon": round(tile_max_lon, 6),
                        },
                        "sampleBounds": {
                            "minLat": round(sample_min_lat, 6),
                            "maxLat": round(sample_max_lat, 6),
                            "minLon": round(sample_min_lon, 6),
                            "maxLon": round(sample_max_lon, 6),
                        },
                        "sampleSpacingLat": round(sample_spacing_lat, 6),
                        "sampleSpacingLon": round(sample_spacing_lon, 6),
                        "gridWidth": grid_w,
                        "gridHeight": grid_h,
                        "minElevation": int(min_elev),
                        "maxElevation": int(max_elev),
                        "minDepth": int(min_depth),
                        "maxDepth": int(max_depth),
                        "missingSampleCount": int(missing_cnt),
                    })

            level_summary[str(level_idx)] = {
                "level": level_idx,
                "name": lvl["name"],
                "rows": rows,
                "cols": cols,
                "expectedTiles": rows * cols,
                "verifiedTiles": lvl_tile_count,
                "stride": stride,
                "sampleOffsetRow": row_offset,
                "sampleOffsetCol": col_offset,
                "resolutionArcSec": res_arc_sec,
                "tileGridWidth": lvl_grid_w,
                "tileGridHeight": lvl_grid_h,
                "complete": (lvl_tile_count == rows * cols),
            }

        # Only regenerate signed regional JSON presets when explicitly requested via --extract-presets or --sync-presets-bundle
        regenerated_presets = []
        if args.extract_presets or args.sync_presets_bundle:
            regenerated_presets = extract_regional_presets_from_source(
                output_dir,
                tiles_dir,
                axis_info,
                elev_var,
                backend,
                fill_value,
                sync_presets_bundle_path=args.sync_presets_bundle,
            )

        generated_level_ids = sorted(lvl["level"] for lvl in pyramid_levels)
        finest_res_arc_sec = min(float(t["resolutionArcSec"]) for t in manifest_tiles)
        has_l4_high_res = (4 in generated_level_ids and sum(1 for t in manifest_tiles if t["level"] == 4) == 2592)

        coverage_type = "global" if axis_info["is_global_extent"] else "regional_subset"
        coverage_tier = (
            "global_full_l4"
            if (axis_info["is_global_extent"] and has_l4_high_res)
            else "global_coarse_overview"
            if axis_info["is_global_extent"]
            else "regional_subset"
        )

        manifest_data = {
            "dataset": "GEBCO 2026 Sub-Ice Topographic & Bathymetric Grid",
            "version": "2026.1",
            "sourceFile": os.path.basename(input_path),
            "license": "GEBCO / IHO-IOC Open Data License",
            "verticalDatum": "Mean Sea Level (metres)",
            "nativeResolutionArcSec": base_arc_sec,
            "finestResolutionArcSec": finest_res_arc_sec,
            "gridIntervalArcSec": finest_res_arc_sec,
            "coverage": coverage_type,
            "coverageTier": coverage_tier,
            "hasL4HighResolution": has_l4_high_res,
            "availableLevels": generated_level_ids,
            "levelSummary": level_summary,
            "totalTiles": len(manifest_tiles),
            "processedAt": datetime.now(timezone.utc).isoformat(),
            "tiles": manifest_tiles,
        }

        # Validate complete manifest & all referenced tile files BEFORE touching manifest.json
        validate_manifest_and_tiles(output_dir, manifest_data, expected_levels=pyramid_levels)

        manifest_path = os.path.join(output_dir, "manifest.json")
        tmp_manifest_path = manifest_path + ".tmp"
        with open(tmp_manifest_path, "w", encoding="utf-8") as mfp:
            json.dump(manifest_data, mfp, indent=2)
        os.replace(tmp_manifest_path, manifest_path)

        elapsed = round(time.time() - start_time, 2)
        report_path = os.path.join(output_dir, "processing_report.json")
        with open(report_path, "w", encoding="utf-8") as rfp:
            json.dump(
                {
                    "status": "completed",
                    "sourceFile": input_path,
                    "backend": backend,
                    "sourceDimensions": {"rows": total_rows, "cols": total_cols},
                    "latOrientation": "south-to-north" if axis_info["lat_ascending"] else "north-to-south",
                    "lonConvention": axis_info["lon_convention"],
                    "availableLevels": generated_level_ids,
                    "finestResolutionArcSec": finest_res_arc_sec,
                    "hasL4HighResolution": has_l4_high_res,
                    "coverageTier": coverage_tier,
                    "totalTilesGenerated": len(manifest_tiles),
                    "regeneratedRegionalPresets": regenerated_presets,
                    "elapsedSeconds": elapsed,
                    "sampleValidationChecks": validation_checks[:25],
                },
                rfp,
                indent=2,
            )

        print(f"[SUCCESS] Generated and verified {len(manifest_tiles)} binary tiles in {elapsed}s -> {manifest_path}")
    except Exception as err:
        print(f"[ERROR] Bathymetry processing failed: {err}", file=sys.stderr)
        sys.exit(1)
    finally:
        try:
            ds.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()

