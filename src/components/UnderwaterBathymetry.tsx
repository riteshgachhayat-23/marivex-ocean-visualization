import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { BathymetryGridDataset, BathymetricLandmark } from '../utils/bathymetryGridBuilder';
import { getAccurateSeabedInfo } from '../utils/bathymetryData';

export interface BenthicProbeResult {
  coords: { latitude: number; longitude: number };
  depth: number;
  elevation: number;
  isLand?: boolean;
  isAuthoritative?: boolean;
  isModeledFallback?: boolean;
  provenance?: string;
  oceanName: string;
  datasetName: string;
  resolution: string;
  attribution: string;
  measurementMethod: string;
  morphologyLabel: string;
  sedimentType: string;
  benthicTemperature: number;
  benthicPressure: number;
  point3D: [number, number, number];
}

export type BathymetryTerrainMode = 'signed_topography' | 'underwater_only';

export interface UnderwaterBathymetryProps {
  /** The bathymetric grid dataset containing elevations, bounds, and metadata */
  gridDataset: BathymetryGridDataset;
  /** Vertical relief exaggeration multiplier (typically 1.0 to 8.0) */
  verticalExaggeration?: number;
  /**
   * Vertical relief rendering mode:
   * - 'signed_topography' (default): Renders complete signed elevation surface where
   *   negative elevation (< 0 m) is underwater below sea level, 0 m is at sea level,
   *   and positive elevation (> 0 m) rises above sea level as subaerial land relief.
   * - 'underwater_only': Renders underwater depth only, clamping positive land elevation
   *   to sea level (0 m).
   */
  terrainMode?: BathymetryTerrainMode;
  /** Toggle depth isoline contour line overlay */
  showContours?: boolean;
  /** Toggle seamount, trench, and vent 3D landmark callouts */
  showLandmarks?: boolean;
  /** Toggle wireframe mesh overlay */
  showWireframe?: boolean;
  /** Optional width/depth dimensions in 3D world units */
  worldSize?: { width: number; depth: number };
  /** Callback fired when user clicks anywhere on the seabed terrain */
  onProbeDepth?: (probe: BenthicProbeResult) => void;
  /** Active selected ocean basin name */
  oceanName?: string;
}

/**
 * Scientific Elevation-Based Bathymetric Color Mapping (underwater depth >= 0 m):
 * - Deep ocean trenches (7,500m - 11,000m): Dark navy blue (#020817) to deep cobalt (#0f2b5c)
 * - Deep ocean floor (4,500m - 7,500m): Cobalt (#1e3a8a) to royal blue (#2563eb)
 * - Intermediate depths (2,500m - 4,500m): Rich blue (#0284c7) to cyan (#06b6d4)
 * - Elevated seabed and underwater ridges (1,200m - 2,500m): Turquoise (#0d9488) to emerald green (#16a34a)
 * - Shallow underwater plateaus (350m - 1,200m): Lime yellow (#84cc16, #eab308) to golden orange (#f59e0b)
 * - Highest underwater terrain & peaks (0m - 350m): Vivid orange (#ea580c) with crimson red accents (#dc2626)
 */
export function getGebcoVertexColor(depthMeters: number): THREE.Color {
  const color = new THREE.Color();
  if (!Number.isFinite(depthMeters)) {
    color.setRGB(0.12, 0.16, 0.23);
    return color;
  }
  const d = Math.max(0, depthMeters);

  if (d <= 350) {
    // Highest underwater terrain (0m - 350m): Crimson red accents to vivid orange
    const t = d / 350;
    color.setRGB(
      0.86 + (0.92 - 0.86) * t,
      0.15 + (0.35 - 0.15) * t,
      0.15 + (0.05 - 0.15) * t
    );
  } else if (d <= 1200) {
    // Shallow underwater plateaus (350m - 1,200m): Orange to golden yellow
    const t = (d - 350) / (1200 - 350);
    color.setRGB(
      0.92 + (0.92 - 0.92) * t,
      0.35 + (0.72 - 0.35) * t,
      0.05 + (0.04 - 0.05) * t
    );
  } else if (d <= 2500) {
    // Elevated seabed & ridges (1,200m - 2,500m): Golden yellow to emerald green & turquoise
    const t = (d - 1200) / (2500 - 1200);
    if (t < 0.48) {
      const subT = t / 0.48;
      // Golden yellow to emerald green
      color.setRGB(
        0.92 + (0.09 - 0.92) * subT,
        0.72 + (0.64 - 0.72) * subT,
        0.04 + (0.29 - 0.04) * subT
      );
    } else {
      const subT = (t - 0.48) / 0.52;
      // Emerald green to bright turquoise
      color.setRGB(
        0.09 + (0.05 - 0.09) * subT,
        0.64 + (0.72 - 0.64) * subT,
        0.29 + (0.83 - 0.29) * subT
      );
    }
  } else if (d <= 4500) {
    // Intermediate depths (2,500m - 4,500m): Turquoise to rich marine blue
    const t = (d - 2500) / (4500 - 2500);
    color.setRGB(
      0.05 + (0.01 - 0.05) * t,
      0.72 + (0.52 - 0.72) * t,
      0.83 + (0.78 - 0.83) * t
    );
  } else if (d <= 7500) {
    // Deep ocean floor (4,500m - 7,500m): Royal blue to deep cobalt
    const t = (d - 4500) / (7500 - 4500);
    color.setRGB(
      0.01 + (0.06 - 0.01) * t,
      0.52 + (0.17 - 0.52) * t,
      0.78 + (0.36 - 0.78) * t
    );
  } else {
    // Deep ocean trenches (7,500m - 11,000m): Deep cobalt to dark navy
    const t = Math.min(1, (d - 7500) / (11000 - 7500));
    color.setRGB(
      0.06 + (0.01 - 0.06) * t,
      0.17 + (0.03 - 0.17) * t,
      0.36 + (0.09 - 0.36) * t
    );
  }

  return color;
}

/**
 * Signed Topographic & Bathymetric Color Mapping:
 * - For signedElevationMeters <= 0 (sea level and underwater): preserves the scientific GEBCO underwater palette.
 * - For signedElevationMeters > 0 in 'signed_topography' mode: applies hypsometric terrestrial coloring
 *   (coastal plains 0..250m -> sage/forest green, uplands 250..1500m -> warm ochre/tan, alpine > 1500m -> stone/snow).
 */
export function getSignedTopographicVertexColor(
  signedElevationMeters: number,
  terrainMode: BathymetryTerrainMode = 'signed_topography'
): THREE.Color {
  if (!Number.isFinite(signedElevationMeters)) {
    return new THREE.Color(0.12, 0.16, 0.23);
  }
  if (terrainMode === 'underwater_only' || signedElevationMeters <= 0) {
    return getGebcoVertexColor(Math.max(0, -signedElevationMeters));
  }

  const color = new THREE.Color();
  const h = signedElevationMeters;
  if (h <= 250) {
    // Coastal lowlands & islands (0m - 250m): Coastal sage to lush olive green
    const t = h / 250;
    color.setRGB(
      0.24 + (0.38 - 0.24) * t,
      0.58 + (0.68 - 0.58) * t,
      0.22 + (0.18 - 0.22) * t
    );
  } else if (h <= 1500) {
    // Uplands & coastal ranges (250m - 1,500m): Olive green to warm ochre/terracotta
    const t = (h - 250) / (1500 - 250);
    color.setRGB(
      0.38 + (0.76 - 0.38) * t,
      0.68 + (0.54 - 0.68) * t,
      0.18 + (0.24 - 0.18) * t
    );
  } else {
    // High mountain peaks (> 1,500m): Warm stone to alpine snow
    const t = Math.min(1, (h - 1500) / 3000);
    color.setRGB(
      0.76 + (0.94 - 0.76) * t,
      0.54 + (0.95 - 0.54) * t,
      0.24 + (0.96 - 0.24) * t
    );
  }
  return color;
}

/**
 * Documented Vertical-Coordinate Convention for 3D Bathymetric & Topographic Terrain:
 * - Input signed elevation `e` is measured in meters relative to Mean Sea Level (MSL = 0 m):
 *   - `e < 0`: underwater depth below sea level (`depth = -e`)
 *   - `e = 0`: Mean Sea Level (`0 m`)
 *   - `e > 0`: subaerial land elevation above sea level
 * - In `'signed_topography'` mode (default):
 *   - Uses the actual signed elevation range `[minElev, maxElev]` across valid samples, where
 *     `minElev = min(0, minValidSignedElev)` and `maxElev = max(0, maxValidSignedElev)`.
 *   - Normalizes signed elevation linearly across `elevSpan = max(1, maxElev - minElev)`:
 *     `normSigned = (e - minElev) / elevSpan` in `[0, 1]`.
 *   - Maps `normSigned` to unscaled world Y via `baseElevationY = (normSigned - 0.62) * 3.6`,
 *     and scales by `verticalExaggeration`.
 *   - Consequently, positive land (`e > 0`) strictly renders above sea level (`e = 0`),
 *     and negative ocean depths (`e < 0`) strictly render below sea level (`e = 0`).
 * - In `'underwater_only'` mode:
 *   - Clamps positive land elevations to `0 m` (`e_clamped = Math.min(0, e)`), projecting
 *     only underwater depth `d = Math.max(0, -e)` across `[minDepth, maxDepth]`.
 */
export interface BuiltBathymetryGeometry {
  geometry: THREE.BufferGeometry;
  unscaledYPositions: Float32Array;
  baseColors: Float32Array;
  validSampleMask: Uint8Array;
  effectiveSignedElevations: Float32Array;
  validVertexCount: number;
  missingVertexCount: number;
  validTriangleCount: number;
  skippedTriangleCount: number;
  seaLevelUnscaledY: number;
  seaLevelWorldY: number;
  minEffectiveElevation: number;
  maxEffectiveElevation: number;
  sampleBounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  sampleSpacingLat: number;
  sampleSpacingLon: number;
  getVertexGeographicCoordinates: (
    row: number,
    col: number
  ) => { latitude: number; longitude: number; x: number; z: number };
}

export function buildBathymetryTerrainGeometry(
  gridDataset: BathymetryGridDataset,
  options: {
    verticalExaggeration?: number;
    worldSize?: { width: number; depth: number };
    terrainMode?: BathymetryTerrainMode;
  } = {}
): BuiltBathymetryGeometry {
  const verticalExaggeration = Number.isFinite(options.verticalExaggeration)
    ? options.verticalExaggeration!
    : 2.5;
  const worldSize = options.worldSize || { width: 14, depth: 14 };
  const terrainMode: BathymetryTerrainMode = options.terrainMode || 'signed_topography';

  const gridWidth = Math.max(2, Math.floor(gridDataset.gridWidth || 2));
  const gridHeight = Math.max(2, Math.floor(gridDataset.gridHeight || 2));
  const totalVertices = gridWidth * gridHeight;

  const effectiveSampleBounds = gridDataset.sampleBounds || gridDataset.bounds;
  const sampleSpacingLat =
    gridDataset.sampleSpacingLat && gridDataset.sampleSpacingLat > 0
      ? gridDataset.sampleSpacingLat
      : gridHeight > 1
        ? (effectiveSampleBounds.maxLat - effectiveSampleBounds.minLat) / (gridHeight - 1)
        : 0;
  const crossesAntimeridian = effectiveSampleBounds.minLon > effectiveSampleBounds.maxLon;
  const totalSampleLonSpan = crossesAntimeridian
    ? (180 - effectiveSampleBounds.minLon) + (effectiveSampleBounds.maxLon + 180)
    : Math.max(0, effectiveSampleBounds.maxLon - effectiveSampleBounds.minLon);
  const sampleSpacingLon =
    gridDataset.sampleSpacingLon && gridDataset.sampleSpacingLon > 0
      ? gridDataset.sampleSpacingLon
      : gridWidth > 1
        ? totalSampleLonSpan / (gridWidth - 1)
        : 0;

  const rawElevArr = gridDataset.rawElevations;
  const depthArr = gridDataset.elevations;

  const validSampleMask = new Uint8Array(totalVertices);
  const effectiveSignedElevations = new Float32Array(totalVertices);

  let validVertexCount = 0;
  let missingVertexCount = 0;
  let minValidSigned = Infinity;
  let maxValidSigned = -Infinity;
  let minValidDepth = Infinity;
  let maxValidDepth = -Infinity;

  // Pass 1: Validate every sample and build the valid-data mask
  for (let i = 0; i < totalVertices; i++) {
    let signedVal = NaN;

    if (rawElevArr && i < rawElevArr.length) {
      const candidate = rawElevArr[i];
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate !== -32768) {
        signedVal = Object.is(candidate, -0) ? 0 : candidate;
      }
    } else if (depthArr && i < depthArr.length) {
      const dCandidate = depthArr[i];
      if (typeof dCandidate === 'number' && Number.isFinite(dCandidate) && dCandidate !== -32768 && dCandidate >= 0) {
        signedVal = dCandidate === 0 ? 0 : -Math.abs(dCandidate);
      }
    }

    if (!Number.isFinite(signedVal)) {
      validSampleMask[i] = 0;
      effectiveSignedElevations[i] = 0;
      missingVertexCount++;
      continue;
    }

    const modeSigned = terrainMode === 'underwater_only' ? Math.min(0, signedVal) : signedVal;
    const depthVal = Math.max(0, -modeSigned);

    validSampleMask[i] = 1;
    effectiveSignedElevations[i] = modeSigned;
    validVertexCount++;

    if (modeSigned < minValidSigned) minValidSigned = modeSigned;
    if (modeSigned > maxValidSigned) maxValidSigned = modeSigned;
    if (depthVal < minValidDepth) minValidDepth = depthVal;
    if (depthVal > maxValidDepth) maxValidDepth = depthVal;
  }

  // Establish vertical elevation bounds that preserve sea level (0m) and positive land (> 0m)
  let minElevBound: number;
  let maxElevBound: number;

  if (validVertexCount === 0) {
    minElevBound = -1000;
    maxElevBound = 0;
  } else if (terrainMode === 'underwater_only') {
    const minD = Number.isFinite(gridDataset.minDepth) ? gridDataset.minDepth : minValidDepth;
    const maxD = Number.isFinite(gridDataset.maxDepth) ? gridDataset.maxDepth : maxValidDepth;
    minElevBound = -Math.max(maxD, maxValidDepth);
    maxElevBound = -Math.min(minD, minValidDepth);
  } else {
    // Signed topography: include actual minimum and maximum signed elevations (and 0m sea level reference if mixed)
    minElevBound = minValidSigned;
    maxElevBound = maxValidSigned;
    if (minElevBound < 0 && maxElevBound < 0 && Number.isFinite(gridDataset.minDepth) && Number.isFinite(gridDataset.maxDepth)) {
      minElevBound = Math.min(minValidSigned, -gridDataset.maxDepth);
      maxElevBound = Math.max(maxValidSigned, -gridDataset.minDepth);
    }
  }

  const elevSpan = Math.max(1, maxElevBound - minElevBound);
  const seaLevelNorm = (0 - minElevBound) / elevSpan;
  const seaLevelUnscaledY = (seaLevelNorm - 0.62) * 3.6;
  const seaLevelWorldY = seaLevelUnscaledY * verticalExaggeration;

  const positions = new Float32Array(totalVertices * 3);
  const unscaledY = new Float32Array(totalVertices);
  const colors = new Float32Array(totalVertices * 3);
  const baseCols = new Float32Array(totalVertices * 3);

  const halfW = worldSize.width / 2;
  const halfD = worldSize.depth / 2;

  // Pass 2: Compute finite vertex positions and colors (guarding against NaN / Infinity)
  for (let iy = 0; iy < gridHeight; iy++) {
    const v = gridHeight > 1 ? iy / (gridHeight - 1) : 0;
    const z = -halfD + v * worldSize.depth;

    for (let ix = 0; ix < gridWidth; ix++) {
      const u = gridWidth > 1 ? ix / (gridWidth - 1) : 0;
      const x = -halfW + u * worldSize.width;
      const idx = iy * gridWidth + ix;

      if (validSampleMask[idx] === 0) {
        // Missing sample: store finite neutral coordinates and colors; faces using this vertex are skipped below
        unscaledY[idx] = 0;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = z;

        baseCols[idx * 3] = 0.12;
        baseCols[idx * 3 + 1] = 0.16;
        baseCols[idx * 3 + 2] = 0.23;

        colors[idx * 3] = 0.12;
        colors[idx * 3 + 1] = 0.16;
        colors[idx * 3 + 2] = 0.23;
        continue;
      }

      const signedElev = effectiveSignedElevations[idx];
      const normElev = (signedElev - minElevBound) / elevSpan;
      const baseElevationY = (normElev - 0.62) * 3.6;
      const safeBaseY = Number.isFinite(baseElevationY) ? baseElevationY : 0;
      unscaledY[idx] = safeBaseY;

      const currentY = safeBaseY * verticalExaggeration;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = Number.isFinite(currentY) ? currentY : 0;
      positions[idx * 3 + 2] = z;

      const vertexColor = getSignedTopographicVertexColor(signedElev, terrainMode);
      baseCols[idx * 3] = vertexColor.r;
      baseCols[idx * 3 + 1] = vertexColor.g;
      baseCols[idx * 3 + 2] = vertexColor.b;

      colors[idx * 3] = vertexColor.r;
      colors[idx * 3 + 1] = vertexColor.g;
      colors[idx * 3 + 2] = vertexColor.b;
    }
  }

  // Pass 3: Build index buffer, skipping any triangle that references a missing sample
  const indices: number[] = [];
  let validTriangleCount = 0;
  let skippedTriangleCount = 0;

  for (let iy = 0; iy < gridHeight - 1; iy++) {
    for (let ix = 0; ix < gridWidth - 1; ix++) {
      const a = iy * gridWidth + ix;
      const b = iy * gridWidth + (ix + 1);
      const c = (iy + 1) * gridWidth + (ix + 1);
      const d = (iy + 1) * gridWidth + ix;

      // Triangle 1: (a, d, b)
      if (validSampleMask[a] === 1 && validSampleMask[d] === 1 && validSampleMask[b] === 1) {
        indices.push(a, d, b);
        validTriangleCount++;
      } else {
        skippedTriangleCount++;
      }

      // Triangle 2: (b, d, c)
      if (validSampleMask[b] === 1 && validSampleMask[d] === 1 && validSampleMask[c] === 1) {
        indices.push(b, d, c);
        validTriangleCount++;
      } else {
        skippedTriangleCount++;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // Pass 4: Sanitize normals (isolated or missing-sample vertices have zero normal after computeVertexNormals)
  // and apply scientific cartographic hillshading
  let normalAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (!normalAttr) {
    const fallbackNormals = new Float32Array(totalVertices * 3);
    for (let i = 0; i < totalVertices; i++) {
      fallbackNormals[i * 3 + 1] = 1;
    }
    normalAttr = new THREE.BufferAttribute(fallbackNormals, 3);
    geo.setAttribute('normal', normalAttr);
  }

  const lightDir = new THREE.Vector3(-0.48, 0.82, -0.32).normalize();
  const vNorm = new THREE.Vector3();

  for (let i = 0; i < totalVertices; i++) {
    const nx = normalAttr.getX(i);
    const ny = normalAttr.getY(i);
    const nz = normalAttr.getZ(i);
    const lenSq = nx * nx + ny * ny + nz * nz;

    if (validSampleMask[i] === 0 || !Number.isFinite(lenSq) || lenSq < 1e-12) {
      normalAttr.setXYZ(i, 0, 1, 0);
      vNorm.set(0, 1, 0);
    } else {
      const invLen = 1 / Math.sqrt(lenSq);
      const snx = nx * invLen;
      const sny = ny * invLen;
      const snz = nz * invLen;
      normalAttr.setXYZ(i, snx, sny, snz);
      vNorm.set(snx, sny, snz);
    }

    if (validSampleMask[i] === 0) {
      continue;
    }

    const dot = Math.max(0, vNorm.dot(lightDir));
    const slope = Math.max(0, Math.min(1, vNorm.y));
    const signedElev = effectiveSignedElevations[i];
    const depthVal = Math.max(0, -signedElev);

    // Depth-dependent ambient occlusion for underwater trenches; full illumination for coastal/subaerial relief
    const depthOcclusion =
      signedElev > 0
        ? 1.05
        : Math.max(0.42, 1.0 - Math.pow(Math.max(0, (depthVal - 2200) / 8800), 1.25) * 0.58);

    const hillshade = 0.44 + dot * 0.68;
    const slopeShade = 0.62 + slope * 0.38;
    const factor = Math.min(1.36, hillshade * slopeShade * depthOcclusion);

    colors[i * 3] = Math.min(1, Math.max(0, baseCols[i * 3] * factor));
    colors[i * 3 + 1] = Math.min(1, Math.max(0, baseCols[i * 3 + 1] * factor));
    colors[i * 3 + 2] = Math.min(1, Math.max(0, baseCols[i * 3 + 2] * factor));
  }

  normalAttr.needsUpdate = true;
  (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

  const getVertexGeographicCoordinates = (row: number, col: number) => {
    const clampedRow = Math.min(gridHeight - 1, Math.max(0, Math.round(row)));
    const clampedCol = Math.min(gridWidth - 1, Math.max(0, Math.round(col)));
    const u = gridWidth > 1 ? clampedCol / (gridWidth - 1) : 0;
    const v = gridHeight > 1 ? clampedRow / (gridHeight - 1) : 0;
    const x = -halfW + u * worldSize.width;
    const z = -halfD + v * worldSize.depth;
    const latitude = Number((effectiveSampleBounds.maxLat - clampedRow * sampleSpacingLat).toFixed(6));
    let rawLon = effectiveSampleBounds.minLon + clampedCol * sampleSpacingLon;
    if (rawLon > 180) rawLon -= 360;
    if (rawLon < -180) rawLon += 360;
    const longitude = Number(rawLon.toFixed(6));
    return { latitude, longitude, x, z };
  };

  return {
    geometry: geo,
    unscaledYPositions: unscaledY,
    baseColors: baseCols,
    validSampleMask,
    effectiveSignedElevations,
    validVertexCount,
    missingVertexCount,
    validTriangleCount,
    skippedTriangleCount,
    seaLevelUnscaledY,
    seaLevelWorldY,
    minEffectiveElevation: minElevBound,
    maxEffectiveElevation: maxElevBound,
    sampleBounds: effectiveSampleBounds,
    sampleSpacingLat,
    sampleSpacingLon,
    getVertexGeographicCoordinates
  };
}

/**
 * Standard hydrographic contour depth intervals in meters
 */
const CONTOUR_DEPTH_INTERVALS = [200, 1000, 2500, 4000, 6000, 8000];

/**
 * React Three Fiber component generating an interactive 3D bathymetry & topography terrain
 * mesh from a provided elevation grid dataset with scientific GEBCO depth and land coloring.
 */
export const UnderwaterBathymetry: React.FC<UnderwaterBathymetryProps> = ({
  gridDataset,
  verticalExaggeration = 2.5,
  terrainMode = 'signed_topography',
  showContours = true,
  showLandmarks = true,
  showWireframe = false,
  worldSize = { width: 14, depth: 14 },
  onProbeDepth,
  oceanName = 'Ocean Floor Basin'
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const [hoveredLandmark, setHoveredLandmark] = useState<BathymetricLandmark | null>(null);

  const { gridWidth, gridHeight, elevations, minDepth, maxDepth, bounds, landmarks } = gridDataset;
  const effectiveBounds = gridDataset.sampleBounds || bounds;

  // 1. Initial Geometry Generation with Valid-Data Mask, Signed Elevation, Vertex Colors & Normals
  const {
    geometry,
    unscaledYPositions,
    baseColors,
    validSampleMask,
    effectiveSignedElevations,
    minEffectiveElevation,
    maxEffectiveElevation
  } = useMemo(
    () =>
      buildBathymetryTerrainGeometry(gridDataset, {
        verticalExaggeration,
        worldSize,
        terrainMode
      }),
    [gridDataset, worldSize.width, worldSize.depth, verticalExaggeration, terrainMode]
  );

  const effectiveElevSpan = Math.max(1, maxEffectiveElevation - minEffectiveElevation);

  // Procedural Micro-Relief Bump Map for authentic benthic sediment & basaltic roughness
  const seabedBumpMap = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;

        // Multi-frequency harmonic noise for benthic sediment dunes & basalt roughness
        const duneWave = Math.sin(u * 24 + Math.cos(v * 18) * 1.6) * Math.cos(v * 24);
        const ripples = Math.sin((u * 1.8 + v) * 88) * 0.4;
        const basaltRough = (Math.sin(u * 180) * Math.cos(v * 180)) * 0.22;
        const microNoise = (Math.sin(u * 360 + v * 140)) * 0.12;

        const combined = (duneWave * 0.45 + ripples + basaltRough + microNoise + 1) * 0.5;
        const val = Math.min(255, Math.max(0, Math.floor(combined * 255)));

        const idx = (y * size + x) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 6);
    return texture;
  }, []);

  // Procedural Animated Caustics Texture
  const causticsRef = useRef<THREE.Mesh>(null);
  const causticsTex = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Voronoi-like caustic network
    const points: [number, number][] = [];
    for (let i = 0; i < 28; i++) {
      points.push([Math.random() * size, Math.random() * size]);
    }

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let d1 = Infinity;
        let d2 = Infinity;
        for (const [px, py] of points) {
          const d = Math.hypot(x - px, y - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) {
            d2 = d;
          }
        }
        const edge = Math.abs(d2 - d1);
        const causticIntensity = Math.min(255, Math.max(0, Math.floor(Math.exp(-edge * 0.12) * 255)));
        const idx = (y * size + x) * 4;
        data[idx] = causticIntensity;
        data[idx + 1] = Math.floor(causticIntensity * 0.95);
        data[idx + 2] = causticIntensity;
        data[idx + 3] = Math.floor(causticIntensity * 0.45);
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }, []);

  // Animate caustics drift across the seabed
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (causticsTex) {
      causticsTex.offset.x = time * 0.025;
      causticsTex.offset.y = Math.sin(time * 0.018) * 0.02;
    }
    if (causticsRef.current) {
      (causticsRef.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(time * 1.6) * 0.04;
    }
  });

  // 2. Real-time Vertical Exaggeration Slider Updates (preserving validSampleMask & finite normals)
  useEffect(() => {
    if (!geometryRef.current) return;
    const posAttr = geometryRef.current.attributes.position as THREE.BufferAttribute;
    const colorAttr = geometryRef.current.attributes.color as THREE.BufferAttribute;
    if (!posAttr || !colorAttr) return;

    const totalVertices = gridWidth * gridHeight;
    for (let i = 0; i < totalVertices; i++) {
      if (validSampleMask[i] === 0) {
        posAttr.setY(i, 0);
        continue;
      }
      const baseY = unscaledYPositions[i];
      const nextY = baseY * verticalExaggeration;
      posAttr.setY(i, Number.isFinite(nextY) ? nextY : 0);
    }

    posAttr.needsUpdate = true;
    geometryRef.current.computeVertexNormals();

    // Re-apply hillshading dynamically and sanitize normals on excluded/isolated vertices
    const normalAttr = geometryRef.current.attributes.normal as THREE.BufferAttribute;
    const lightDir = new THREE.Vector3(-0.48, 0.82, -0.32).normalize();
    const vNorm = new THREE.Vector3();

    for (let i = 0; i < totalVertices; i++) {
      const nx = normalAttr.getX(i);
      const ny = normalAttr.getY(i);
      const nz = normalAttr.getZ(i);
      const lenSq = nx * nx + ny * ny + nz * nz;

      if (validSampleMask[i] === 0 || !Number.isFinite(lenSq) || lenSq < 1e-12) {
        normalAttr.setXYZ(i, 0, 1, 0);
        continue;
      }

      const invLen = 1 / Math.sqrt(lenSq);
      vNorm.set(nx * invLen, ny * invLen, nz * invLen);
      normalAttr.setXYZ(i, vNorm.x, vNorm.y, vNorm.z);

      const dot = Math.max(0, vNorm.dot(lightDir));
      const slope = Math.max(0, Math.min(1, vNorm.y));
      const signedElev = effectiveSignedElevations[i];
      const depthVal = Math.max(0, -signedElev);

      const depthOcclusion =
        signedElev > 0
          ? 1.05
          : Math.max(0.42, 1.0 - Math.pow(Math.max(0, (depthVal - 2200) / 8800), 1.25) * 0.58);
      const hillshade = 0.44 + dot * 0.68;
      const slopeShade = 0.62 + slope * 0.38;
      const factor = Math.min(1.36, hillshade * slopeShade * depthOcclusion);

      colorAttr.setXYZ(
        i,
        Math.min(1, Math.max(0, baseColors[i * 3] * factor)),
        Math.min(1, Math.max(0, baseColors[i * 3 + 1] * factor)),
        Math.min(1, Math.max(0, baseColors[i * 3 + 2] * factor))
      );
    }
    normalAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }, [verticalExaggeration, gridWidth, gridHeight, unscaledYPositions, baseColors, validSampleMask, effectiveSignedElevations]);

  // 3. Generate Isoline Depth Contour Line Segments (skipping any segment with missing samples)
  const contourSegments = useMemo(() => {
    if (!showContours) return null;

    const linePoints: THREE.Vector3[] = [];
    const halfW = worldSize.width / 2;
    const halfD = worldSize.depth / 2;

    // Scan adjacent grid cells to find contour crossings
    for (const contourTarget of CONTOUR_DEPTH_INTERVALS) {
      if (contourTarget < minDepth || contourTarget > maxDepth) continue;
      const targetSignedElev = -contourTarget;
      const normElev = (targetSignedElev - minEffectiveElevation) / effectiveElevSpan;
      const contourY = (normElev - 0.62) * 3.6 * verticalExaggeration + 0.025;
      if (!Number.isFinite(contourY)) continue;

      for (let iy = 0; iy < gridHeight - 1; iy++) {
        for (let ix = 0; ix < gridWidth - 1; ix++) {
          const idx0 = iy * gridWidth + ix;
          const idx1 = iy * gridWidth + (ix + 1);
          const idx2 = (iy + 1) * gridWidth + ix;

          if (validSampleMask[idx0] === 0) continue;
          const d0 = Math.max(0, -effectiveSignedElevations[idx0]);

          // Check horizontal crossing
          if (validSampleMask[idx1] === 1) {
            const d1 = Math.max(0, -effectiveSignedElevations[idx1]);
            if ((d0 <= contourTarget && d1 >= contourTarget) || (d0 >= contourTarget && d1 <= contourTarget)) {
              const t = Math.abs(d1 - d0) > 0.001 ? (contourTarget - d0) / (d1 - d0) : 0.5;
              const u = (ix + t) / (gridWidth - 1);
              const v = iy / (gridHeight - 1);
              const x = -halfW + u * worldSize.width;
              const z = -halfD + v * worldSize.depth;
              linePoints.push(new THREE.Vector3(x, contourY, z));
            }
          }

          // Check vertical crossing
          if (validSampleMask[idx2] === 1) {
            const d2 = Math.max(0, -effectiveSignedElevations[idx2]);
            if ((d0 <= contourTarget && d2 >= contourTarget) || (d0 >= contourTarget && d2 <= contourTarget)) {
              const t = Math.abs(d2 - d0) > 0.001 ? (contourTarget - d0) / (d2 - d0) : 0.5;
              const u = ix / (gridWidth - 1);
              const v = (iy + t) / (gridHeight - 1);
              const x = -halfW + u * worldSize.width;
              const z = -halfD + v * worldSize.depth;
              linePoints.push(new THREE.Vector3(x, contourY, z));
            }
          }
        }
      }
    }

    if (linePoints.length < 2) return null;

    const contourGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    return contourGeo;
  }, [
    showContours,
    gridWidth,
    gridHeight,
    validSampleMask,
    effectiveSignedElevations,
    minDepth,
    maxDepth,
    minEffectiveElevation,
    effectiveElevSpan,
    worldSize.width,
    worldSize.depth,
    verticalExaggeration
  ]);

  // 4. Calculate Landmark 3D Positions
  const landmarkPositions = useMemo(() => {
    if (!landmarks || landmarks.length === 0) return [];

    const halfW = worldSize.width / 2;
    const halfD = worldSize.depth / 2;
    const latSpan = effectiveBounds.maxLat - effectiveBounds.minLat;
    const lonSpan = effectiveBounds.maxLon - effectiveBounds.minLon;

    return landmarks.map((lm) => {
      const u = Math.min(1, Math.max(0, (lm.lon - effectiveBounds.minLon) / (lonSpan || 1)));
      const v = Math.min(1, Math.max(0, (effectiveBounds.maxLat - lm.lat) / (latSpan || 1)));

      const x = -halfW + u * worldSize.width;
      const z = -halfD + v * worldSize.depth;
      const signedLmElev = -Math.max(0, lm.depthMeters || 0);
      const normElev = (signedLmElev - minEffectiveElevation) / effectiveElevSpan;
      const y = (normElev - 0.62) * 3.6 * verticalExaggeration + 0.15;

      return {
        landmark: lm,
        position: [x, Number.isFinite(y) ? y : 0, z] as [number, number, number]
      };
    });
  }, [landmarks, effectiveBounds, worldSize.width, worldSize.depth, minEffectiveElevation, effectiveElevSpan, verticalExaggeration]);

  // 5. Click Anywhere Spatial Picking & Raycast Depth Telemetry
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!e.point) return;

    const halfW = worldSize.width / 2;
    const halfD = worldSize.depth / 2;

    // Convert 3D world intersection back to normalized UV
    const u = Math.min(1, Math.max(0, (e.point.x + halfW) / worldSize.width));
    const v = Math.min(1, Math.max(0, (e.point.z + halfD) / worldSize.depth));

    // Calculate geographical coordinates aligned with actual mesh sampleBounds
    const latSpan = effectiveBounds.maxLat - effectiveBounds.minLat;
    const lonSpan = effectiveBounds.maxLon - effectiveBounds.minLon;
    const latitude = Number((effectiveBounds.maxLat - v * latSpan).toFixed(4));
    const longitude = Number((effectiveBounds.minLon + u * lonSpan).toFixed(4));

    // Sample accurate depth from grid and scientific seabed info
    const gx = Math.min(gridWidth - 1, Math.max(0, Math.round(u * (gridWidth - 1))));
    const gy = Math.min(gridHeight - 1, Math.max(0, Math.round(v * (gridHeight - 1))));
    const sampleIdx = gy * gridWidth + gx;
    const gridDepth = elevations[sampleIdx];
    const gridRawElev = gridDataset.rawElevations ? gridDataset.rawElevations[sampleIdx] : undefined;

    const hasValidGridSample = typeof gridDepth === 'number' && !isNaN(gridDepth);
    const seabedInfo = getAccurateSeabedInfo(latitude, longitude);

    let depth = 0;
    let elevation = 0;
    let isLand = false;

    if (hasValidGridSample) {
      if (gridRawElev !== undefined && !isNaN(gridRawElev)) {
        elevation = Math.round(gridRawElev);
        // Signed convention: positive elevation is land above sea level; underwater depth is max(0, -elevation)
        isLand = elevation > 0;
        depth = isLand ? 0 : Math.round(-elevation);
      } else {
        depth = Math.round(gridDepth);
        elevation = -depth;
        isLand = false;
      }
    } else {
      // Clearly identified fallback result
      depth = Math.round(seabedInfo.depth);
      elevation = -depth;
      isLand = false;
    }

    const isDirectSounding = hasValidGridSample && (gridDataset.isAuthoritative ?? true);

    const probeResult: BenthicProbeResult = {
      coords: { latitude, longitude },
      depth,
      elevation,
      isLand,
      isAuthoritative: isDirectSounding,
      isModeledFallback: !hasValidGridSample,
      oceanName,
      datasetName: hasValidGridSample ? (gridDataset.source || 'GEBCO Bathymetric Grid') : 'Ocean Model Fallback',
      resolution: hasValidGridSample ? `${gridDataset.resolutionArcSec || 60} arc-second grid (${gridWidth}×${gridHeight})` : 'Modeled Estimation',
      attribution: hasValidGridSample ? 'GEBCO / NOAA NCEI / IHO / IOC UNESCO' : 'Statistical Ocean Model',
      measurementMethod: hasValidGridSample 
        ? `${gridDataset.source} (${isLand ? 'Terrestrial Topography' : 'Direct Sounding Elevation'})` 
        : 'Modeled estimate (Grid sample unavailable)',
      morphologyLabel: isLand ? 'Terrestrial Landmass / Island' : seabedInfo.morphologyLabel,
      sedimentType: isLand ? 'Continental Bedrock / Soil' : seabedInfo.sedimentType,
      benthicTemperature: isLand ? 20.0 : seabedInfo.benthicTemperature,
      benthicPressure: isLand ? 1.013 : Number((1.013 + depth * 0.1008).toFixed(1)),
      point3D: [e.point.x, e.point.y, e.point.z]
    };

    onProbeDepth?.(probeResult);
  };

  return (
    <group name="UnderwaterBathymetrySystem">
      {/* Primary Bathymetric Terrain Mesh with Depth Vertex Coloring */}
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        receiveShadow
        castShadow
      >
        <primitive ref={geometryRef} object={geometry} attach="geometry" />
        <meshStandardMaterial
          vertexColors={true}
          roughness={0.76}
          metalness={0.08}
          bumpMap={seabedBumpMap || undefined}
          bumpScale={0.065}
          wireframe={showWireframe}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Animated Sunlight Caustics Wave Projection on Seafloor */}
      {causticsTex && (
        <mesh
          ref={causticsRef}
          position={[0, -0.65, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[worldSize.width * 1.05, worldSize.depth * 1.05]} />
          <meshBasicMaterial
            map={causticsTex}
            transparent={true}
            opacity={0.18}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Depth Isoline Contour Line Segments */}
      {showContours && contourSegments && (
        <lineSegments>
          <primitive object={contourSegments} attach="geometry" />
          <lineBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.38}
            linewidth={1}
          />
        </lineSegments>
      )}

      {/* Seamount & Trench Geological Landmark Callouts */}
      {showLandmarks &&
        landmarkPositions.map(({ landmark, position }) => {
          const isTrench = landmark.type === 'trench';
          const isVent = landmark.type === 'vent';
          const markerColor = isTrench ? '#c084fc' : isVent ? '#f97316' : '#38bdf8';

          return (
            <group
              key={landmark.id}
              position={position}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredLandmark(landmark);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredLandmark(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                const seabed = getAccurateSeabedInfo(landmark.lat, landmark.lon);
                onProbeDepth?.({
                  coords: { latitude: landmark.lat, longitude: landmark.lon },
                  depth: landmark.depthMeters,
                  elevation: -landmark.depthMeters,
                  oceanName,
                  datasetName: gridDataset.source || 'GEBCO / NOAA NCEI 1-Arc-Minute Bathymetric Grid',
                  resolution: `${gridDataset.resolutionArcSec || 60} arc-second grid`,
                  attribution: 'GEBCO / NOAA NCEI / IHO / IOC UNESCO',
                  measurementMethod: 'Real GEBCO & NOAA ETOPO Bathymetric Soundings',
                  morphologyLabel: landmark.description,
                  sedimentType: seabed.sedimentType,
                  benthicTemperature: seabed.benthicTemperature,
                  benthicPressure: Number((1.013 + landmark.depthMeters * 0.1008).toFixed(1)),
                  point3D: position
                });
              }}
            >
              {/* Landmark Beacon Pin */}
              <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.04, 0.02, 0.9, 8]} />
                <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={0.6} />
              </mesh>

              {/* Landmark Glowing Beacon Sphere */}
              <mesh position={[0, 0.95, 0]}>
                <sphereGeometry args={[0.14, 16, 16]} />
                <meshStandardMaterial
                  color={markerColor}
                  emissive={markerColor}
                  emissiveIntensity={1.2}
                />
              </mesh>

              {/* Landmark Base Radar Ring */}
              <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.18, 0.32, 24]} />
                <meshBasicMaterial
                  color={markerColor}
                  transparent
                  opacity={0.5}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          );
        })}
    </group>
  );
};

export default UnderwaterBathymetry;
