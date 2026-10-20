import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { BathymetryGridDataset, BathymetricLandmark } from '../utils/bathymetryGridBuilder';
import { getAccurateSeabedInfo } from '../utils/bathymetryData';

export interface BenthicProbeResult {
  coords: { latitude: number; longitude: number };
  depth: number;
  elevation: number;
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

export interface UnderwaterBathymetryProps {
  /** The bathymetric grid dataset containing elevations, bounds, and metadata */
  gridDataset: BathymetryGridDataset;
  /** Vertical relief exaggeration multiplier (typically 1.0 to 8.0) */
  verticalExaggeration?: number;
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
 * Scientific Elevation-Based Bathymetric Color Mapping:
 * - Deep ocean trenches (7,500m - 11,000m): Dark navy blue (#020817) to deep cobalt (#0f2b5c)
 * - Deep ocean floor (4,500m - 7,500m): Cobalt (#1e3a8a) to royal blue (#2563eb)
 * - Intermediate depths (2,500m - 4,500m): Rich blue (#0284c7) to cyan (#06b6d4)
 * - Elevated seabed and underwater ridges (1,200m - 2,500m): Turquoise (#0d9488) to emerald green (#16a34a)
 * - Shallow underwater plateaus (350m - 1,200m): Lime yellow (#84cc16, #eab308) to golden orange (#f59e0b)
 * - Highest underwater terrain & peaks (0m - 350m): Vivid orange (#ea580c) with crimson red accents (#dc2626)
 */
export function getGebcoVertexColor(depthMeters: number): THREE.Color {
  const color = new THREE.Color();
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
 * Standard hydrographic contour depth intervals in meters
 */
const CONTOUR_DEPTH_INTERVALS = [200, 1000, 2500, 4000, 6000, 8000];

/**
 * React Three Fiber component generating an interactive 3D bathymetry terrain
 * mesh from a provided elevation grid dataset with scientific GEBCO depth vertex coloring.
 */
export const UnderwaterBathymetry: React.FC<UnderwaterBathymetryProps> = ({
  gridDataset,
  verticalExaggeration = 2.5,
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
  const depthSpan = Math.max(1, maxDepth - minDepth);

  // 1. Initial Geometry Generation with Vertex Colors & Normal vectors
  const { geometry, unscaledYPositions, baseColors } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const totalVertices = gridWidth * gridHeight;

    const positions = new Float32Array(totalVertices * 3);
    const unscaledY = new Float32Array(totalVertices);
    const colors = new Float32Array(totalVertices * 3);
    const baseCols = new Float32Array(totalVertices * 3);

    const halfW = worldSize.width / 2;
    const halfD = worldSize.depth / 2;

    for (let iy = 0; iy < gridHeight; iy++) {
      const v = iy / (gridHeight - 1);
      const z = -halfD + v * worldSize.depth;

      for (let ix = 0; ix < gridWidth; ix++) {
        const u = ix / (gridWidth - 1);
        const x = -halfW + u * worldSize.width;

        const idx = iy * gridWidth + ix;
        const depthVal = elevations[idx];

        // Normalized elevation: 0 for deepest trench, 1 for highest peak
        const normElev = 1 - (depthVal - minDepth) / depthSpan;
        const baseElevationY = (normElev - 0.62) * 3.6;
        unscaledY[idx] = baseElevationY;

        const currentY = baseElevationY * verticalExaggeration;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = currentY;
        positions[idx * 3 + 2] = z;

        // Scientific GEBCO vertex coloring
        const vertexColor = getGebcoVertexColor(depthVal);
        colors[idx * 3] = vertexColor.r;
        colors[idx * 3 + 1] = vertexColor.g;
        colors[idx * 3 + 2] = vertexColor.b;

        baseCols[idx * 3] = vertexColor.r;
        baseCols[idx * 3 + 1] = vertexColor.g;
        baseCols[idx * 3 + 2] = vertexColor.b;
      }
    }

    // Index grid faces
    const indices: number[] = [];
    for (let iy = 0; iy < gridHeight - 1; iy++) {
      for (let ix = 0; ix < gridWidth - 1; ix++) {
        const a = iy * gridWidth + ix;
        const b = iy * gridWidth + (ix + 1);
        const c = (iy + 1) * gridWidth + (ix + 1);
        const d = (iy + 1) * gridWidth + ix;

        // Two triangles per grid quad
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Apply scientific cartographic hillshading (NW sun azimuth at 315°, altitude 45°)
    const lightDir = new THREE.Vector3(-0.48, 0.82, -0.32).normalize();
    const normalAttr = geo.attributes.normal as THREE.BufferAttribute;
    const vNorm = new THREE.Vector3();

    for (let i = 0; i < totalVertices; i++) {
      vNorm.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
      const dot = Math.max(0, vNorm.dot(lightDir));
      const slope = Math.max(0, Math.min(1, vNorm.y));
      const depthVal = elevations[i];

      // Depth-dependent ambient occlusion: Hadal trenches receive deep cavernous shadow;
      // shallow plateaus and elevated ridges receive open-water illumination
      const depthOcclusion = Math.max(0.42, 1.0 - Math.pow(Math.max(0, (depthVal - 2200) / 8800), 1.25) * 0.58);

      // Direct illumination revealing sharp mountain slopes and ridge crests:
      const hillshade = 0.44 + dot * 0.68;
      const slopeShade = 0.62 + slope * 0.38;
      const factor = Math.min(1.36, hillshade * slopeShade * depthOcclusion);

      colors[i * 3] = Math.min(1, baseCols[i * 3] * factor);
      colors[i * 3 + 1] = Math.min(1, baseCols[i * 3 + 1] * factor);
      colors[i * 3 + 2] = Math.min(1, baseCols[i * 3 + 2] * factor);
    }

    return { geometry: geo, unscaledYPositions: unscaledY, baseColors: baseCols };
  }, [gridWidth, gridHeight, elevations, minDepth, depthSpan, worldSize.width, worldSize.depth, verticalExaggeration]);

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

  // 2. Real-time Vertical Exaggeration Slider Updates
  useEffect(() => {
    if (!geometryRef.current) return;
    const posAttr = geometryRef.current.attributes.position as THREE.BufferAttribute;
    const colorAttr = geometryRef.current.attributes.color as THREE.BufferAttribute;
    if (!posAttr || !colorAttr) return;

    const totalVertices = gridWidth * gridHeight;
    for (let i = 0; i < totalVertices; i++) {
      const baseY = unscaledYPositions[i];
      posAttr.setY(i, baseY * verticalExaggeration);
    }

    posAttr.needsUpdate = true;
    geometryRef.current.computeVertexNormals();

    // Re-apply hillshading dynamically as vertical relief changes
    const normalAttr = geometryRef.current.attributes.normal as THREE.BufferAttribute;
    const lightDir = new THREE.Vector3(-0.48, 0.82, -0.32).normalize();
    const vNorm = new THREE.Vector3();

    for (let i = 0; i < totalVertices; i++) {
      vNorm.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
      const dot = Math.max(0, vNorm.dot(lightDir));
      const slope = Math.max(0, Math.min(1, vNorm.y));
      const depthVal = elevations[i];

      const depthOcclusion = Math.max(0.42, 1.0 - Math.pow(Math.max(0, (depthVal - 2200) / 8800), 1.25) * 0.58);
      const hillshade = 0.44 + dot * 0.68;
      const slopeShade = 0.62 + slope * 0.38;
      const factor = Math.min(1.36, hillshade * slopeShade * depthOcclusion);

      colorAttr.setXYZ(
        i,
        Math.min(1, baseColors[i * 3] * factor),
        Math.min(1, baseColors[i * 3 + 1] * factor),
        Math.min(1, baseColors[i * 3 + 2] * factor)
      );
    }
    colorAttr.needsUpdate = true;
  }, [verticalExaggeration, gridWidth, gridHeight, unscaledYPositions, baseColors, elevations]);

  // 3. Generate Isoline Depth Contour Line Segments
  const contourSegments = useMemo(() => {
    if (!showContours) return null;

    const linePoints: THREE.Vector3[] = [];
    const halfW = worldSize.width / 2;
    const halfD = worldSize.depth / 2;

    // Scan adjacent grid cells to find contour crossings
    for (const contourTarget of CONTOUR_DEPTH_INTERVALS) {
      if (contourTarget < minDepth || contourTarget > maxDepth) continue;

      for (let iy = 0; iy < gridHeight - 1; iy++) {
        for (let ix = 0; ix < gridWidth - 1; ix++) {
          const idx0 = iy * gridWidth + ix;
          const idx1 = iy * gridWidth + (ix + 1);
          const idx2 = (iy + 1) * gridWidth + ix;

          const d0 = elevations[idx0];
          const d1 = elevations[idx1];
          const d2 = elevations[idx2];

          // Check horizontal crossing
          if ((d0 <= contourTarget && d1 >= contourTarget) || (d0 >= contourTarget && d1 <= contourTarget)) {
            const t = Math.abs(d1 - d0) > 0.001 ? (contourTarget - d0) / (d1 - d0) : 0.5;
            const u = (ix + t) / (gridWidth - 1);
            const v = iy / (gridHeight - 1);
            const x = -halfW + u * worldSize.width;
            const z = -halfD + v * worldSize.depth;
            const normElev = 1 - (contourTarget - minDepth) / depthSpan;
            const y = (normElev - 0.62) * 3.6 * verticalExaggeration + 0.025; // slightly elevated above surface
            linePoints.push(new THREE.Vector3(x, y, z));
          }

          // Check vertical crossing
          if ((d0 <= contourTarget && d2 >= contourTarget) || (d0 >= contourTarget && d2 <= contourTarget)) {
            const t = Math.abs(d2 - d0) > 0.001 ? (contourTarget - d0) / (d2 - d0) : 0.5;
            const u = ix / (gridWidth - 1);
            const v = (iy + t) / (gridHeight - 1);
            const x = -halfW + u * worldSize.width;
            const z = -halfD + v * worldSize.depth;
            const normElev = 1 - (contourTarget - minDepth) / depthSpan;
            const y = (normElev - 0.62) * 3.6 * verticalExaggeration + 0.025;
            linePoints.push(new THREE.Vector3(x, y, z));
          }
        }
      }
    }

    if (linePoints.length < 2) return null;

    const contourGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    return contourGeo;
  }, [showContours, gridWidth, gridHeight, elevations, minDepth, maxDepth, depthSpan, worldSize.width, worldSize.depth, verticalExaggeration]);

  // 4. Calculate Landmark 3D Positions
  const landmarkPositions = useMemo(() => {
    if (!landmarks || landmarks.length === 0) return [];

    const halfW = worldSize.width / 2;
    const halfD = worldSize.depth / 2;
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;

    return landmarks.map((lm) => {
      const u = Math.min(1, Math.max(0, (lm.lon - bounds.minLon) / (lonSpan || 1)));
      const v = Math.min(1, Math.max(0, (bounds.maxLat - lm.lat) / (latSpan || 1)));

      const x = -halfW + u * worldSize.width;
      const z = -halfD + v * worldSize.depth;
      const normElev = 1 - (lm.depthMeters - minDepth) / depthSpan;
      const y = (normElev - 0.62) * 3.6 * verticalExaggeration + 0.15;

      return {
        landmark: lm,
        position: [x, y, z] as [number, number, number]
      };
    });
  }, [landmarks, bounds, worldSize.width, worldSize.depth, minDepth, depthSpan, verticalExaggeration]);

  // 5. Click Anywhere Spatial Picking & Raycast Depth Telemetry
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!e.point) return;

    const halfW = worldSize.width / 2;
    const halfD = worldSize.depth / 2;

    // Convert 3D world intersection back to normalized UV
    const u = Math.min(1, Math.max(0, (e.point.x + halfW) / worldSize.width));
    const v = Math.min(1, Math.max(0, (e.point.z + halfD) / worldSize.depth));

    // Calculate geographical coordinates
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;
    const latitude = Number((bounds.maxLat - v * latSpan).toFixed(4));
    const longitude = Number((bounds.minLon + u * lonSpan).toFixed(4));

    // Sample accurate depth from grid and scientific seabed info
    const gx = Math.min(gridWidth - 1, Math.max(0, Math.round(u * (gridWidth - 1))));
    const gy = Math.min(gridHeight - 1, Math.max(0, Math.round(v * (gridHeight - 1))));
    const gridDepth = elevations[gy * gridWidth + gx];

    const seabedInfo = getAccurateSeabedInfo(latitude, longitude);
    const depth = Math.round(gridDepth || seabedInfo.depth);

    const probeResult: BenthicProbeResult = {
      coords: { latitude, longitude },
      depth,
      elevation: -depth,
      oceanName,
      datasetName: 'GEBCO 2024 Global Bathymetric Grid',
      resolution: '15 arc-second gridded (~450m cell size)',
      attribution: 'GEBCO / NOAA NCEI / IHO / IOC UNESCO',
      measurementMethod: 'Multibeam echo-sounder acoustic bathymetry & satellite radar altimetry',
      morphologyLabel: seabedInfo.morphologyLabel,
      sedimentType: seabedInfo.sedimentType,
      benthicTemperature: seabedInfo.benthicTemperature,
      benthicPressure: seabedInfo.benthicPressure,
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
                  datasetName: 'GEBCO 2024 Global Bathymetric Grid',
                  resolution: '15 arc-second gridded (~450m)',
                  attribution: 'GEBCO / NOAA NCEI / IHO / IOC UNESCO',
                  measurementMethod: 'Multibeam echo-sounder acoustic soundings',
                  morphologyLabel: landmark.description,
                  sedimentType: seabed.sedimentType,
                  benthicTemperature: seabed.benthicTemperature,
                  benthicPressure: seabed.benthicPressure,
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
