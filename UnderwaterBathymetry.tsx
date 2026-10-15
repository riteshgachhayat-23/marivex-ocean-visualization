import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
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
 * Official GEBCO Depth-Based Hypsometric Color Palette:
 * - Shelf Turquoise: #38bdf8 (0m - 200m)
 * - Continental Slope Marine Blue: #0284c7 (200m - 1,500m)
 * - Bathyal Deep Cobalt: #1d4ed8 (1,500m - 4,000m)
 * - Abyssal Plain Midnight Navy: #0f172a (4,000m - 6,000m)
 * - Hadal Trench Deep Violet: #3b0764 (> 6,000m down to 11,000m)
 */
export function getGebcoVertexColor(depthMeters: number): THREE.Color {
  const color = new THREE.Color();
  const d = Math.max(0, depthMeters);

  if (d <= 200) {
    // Continental Shelf (0 - 200m): Shallow turquoise to vibrant cyan
    const t = d / 200;
    color.setRGB(
      0.35 + (0.22 - 0.35) * t,
      0.88 + (0.74 - 0.88) * t,
      0.98 + (0.97 - 0.98) * t
    );
  } else if (d <= 1500) {
    // Continental Slope & Shelf Break (200 - 1500m): Cyan to Marine Blue
    const t = (d - 200) / (1500 - 200);
    color.setRGB(
      0.22 + (0.01 - 0.22) * t,
      0.74 + (0.52 - 0.74) * t,
      0.97 + (0.78 - 0.97) * t
    );
  } else if (d <= 4000) {
    // Bathyal Ocean Floor (1500 - 4000m): Marine Blue to Royal Deep Cobalt
    const t = (d - 1500) / (4000 - 1500);
    color.setRGB(
      0.01 + (0.11 - 0.01) * t,
      0.52 + (0.31 - 0.52) * t,
      0.78 + (0.85 - 0.78) * t
    );
  } else if (d <= 6000) {
    // Abyssal Plain (4000 - 6000m): Royal Cobalt to Midnight Navy
    const t = (d - 4000) / (6000 - 4000);
    color.setRGB(
      0.11 + (0.06 - 0.11) * t,
      0.31 + (0.09 - 0.31) * t,
      0.85 + (0.16 - 0.85) * t
    );
  } else {
    // Hadal Trench (6000 - 11000m): Midnight Navy to Trench Ultra-Violet
    const t = Math.min(1, (d - 6000) / (11000 - 6000));
    color.setRGB(
      0.06 + (0.23 - 0.06) * t,
      0.09 + (0.03 - 0.09) * t,
      0.16 + (0.39 - 0.16) * t
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
  const { geometry, unscaledYPositions } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const totalVertices = gridWidth * gridHeight;

    const positions = new Float32Array(totalVertices * 3);
    const unscaledY = new Float32Array(totalVertices);
    const colors = new Float32Array(totalVertices * 3);

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

        // Normalized Y offset: deeper = lower Y
        // Scaled to a base world elevation range (-2.4 to 0)
        const normDepth = (depthVal - minDepth) / depthSpan;
        const baseElevationY = -normDepth * 2.2;
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

    return { geometry: geo, unscaledYPositions: unscaledY };
  }, [gridWidth, gridHeight, elevations, minDepth, depthSpan, worldSize.width, worldSize.depth]);

  // 2. Real-time Vertical Exaggeration Slider Updates
  useEffect(() => {
    if (!geometryRef.current) return;
    const posAttr = geometryRef.current.attributes.position as THREE.BufferAttribute;
    if (!posAttr) return;

    const totalVertices = gridWidth * gridHeight;
    for (let i = 0; i < totalVertices; i++) {
      const baseY = unscaledYPositions[i];
      posAttr.setY(i, baseY * verticalExaggeration);
    }

    posAttr.needsUpdate = true;
    geometryRef.current.computeVertexNormals();
  }, [verticalExaggeration, gridWidth, gridHeight, unscaledYPositions]);

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
            const normD = (contourTarget - minDepth) / depthSpan;
            const y = -normD * 2.2 * verticalExaggeration + 0.025; // slightly elevated above surface
            linePoints.push(new THREE.Vector3(x, y, z));
          }

          // Check vertical crossing
          if ((d0 <= contourTarget && d2 >= contourTarget) || (d0 >= contourTarget && d2 <= contourTarget)) {
            const t = Math.abs(d2 - d0) > 0.001 ? (contourTarget - d0) / (d2 - d0) : 0.5;
            const u = ix / (gridWidth - 1);
            const v = (iy + t) / (gridHeight - 1);
            const x = -halfW + u * worldSize.width;
            const z = -halfD + v * worldSize.depth;
            const normD = (contourTarget - minDepth) / depthSpan;
            const y = -normD * 2.2 * verticalExaggeration + 0.025;
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
      const normD = (lm.depthMeters - minDepth) / depthSpan;
      const y = -normD * 2.2 * verticalExaggeration + 0.15;

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
          roughness={0.82}
          metalness={0.06}
          wireframe={showWireframe}
          side={THREE.DoubleSide}
        />
      </mesh>

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
