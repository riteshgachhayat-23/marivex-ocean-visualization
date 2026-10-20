import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { 
  ArrowLeft, 
  Layers, 
  MapPin, 
  Maximize2, 
  RotateCcw, 
  Sliders, 
  Eye, 
  Info, 
  Compass, 
  Waves,
  ZoomIn,
  ZoomOut,
  X,
  Mountain,
  Sparkles
} from 'lucide-react';
import { UnderwaterBathymetry, BenthicProbeResult } from './UnderwaterBathymetry';
import { generateBathymetryGrid, BathymetricLandmark } from '../utils/bathymetryGridBuilder';

interface UnderwaterBathymetryViewerProps {
  initialRegionId?: string;
  onReturnToGlobe?: () => void;
  oceanName?: string;
}

const REGION_PRESETS = [
  { id: 'mariana-trench', name: 'Mariana Trench (Challenger Deep)', depthRange: '10,994m', tag: 'Hadal Subduction' },
  { id: 'atlantic-ridge', name: 'Mid-Atlantic Ridge (Axial Graben)', depthRange: '3,670m', tag: 'Spreading Ridge' },
  { id: 'puerto-rico-trench', name: 'Puerto Rico Trench (Milwaukee Deep)', depthRange: '8,376m', tag: 'Atlantic Chasm' },
  { id: 'arabian-sea', name: 'Arabian Sea (Carlsberg Ridge & Shelf)', depthRange: '4,652m', tag: 'Rift & Margin' },
  { id: 'bay-of-bengal', name: 'Bay of Bengal (Swatch of No Ground)', depthRange: '4,694m', tag: 'Canyon & Ridge' }
];

/**
 * Camera OrbitControls inside R3F Canvas with initial diagonal hero vantage point
 */
const UnderwaterCameraControls: React.FC<{
  controlsRef: React.MutableRefObject<ThreeOrbitControls | null>;
}> = ({ controlsRef }) => {
  const { camera, gl } = useThree();

  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.0;
    controls.maxDistance = 32.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent camera clipping through floor
    controls.enablePan = true;
    controls.screenSpacePanning = true;

    // Set diagonal vantage point looking across trenches and mountain ridges
    camera.position.set(-7.8, 7.5, 9.5);
    controls.target.set(0.6, -0.6, -0.2);
    controls.update();

    controlsRef.current = controls;

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, controlsRef]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
};

/**
 * Realistic Undulating Overhead Water Surface Ceiling
 */
const OverheadWaterSurface: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  const geoRef = useRef<THREE.PlaneGeometry>(null);

  useFrame((state) => {
    if (!visible) return;
    const t = state.clock.getElapsedTime();
    if (!geoRef.current) return;
    const pos = geoRef.current.attributes.position;
    if (!pos) return;

    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      const wave =
        Math.sin(u * 0.65 + t * 1.2) * 0.08 +
        Math.cos(v * 0.85 + t * 1.0) * 0.07 +
        Math.sin((u + v) * 1.2 + t * 1.5) * 0.035;
      pos.setZ(i, wave);
    }
    pos.needsUpdate = true;
    geoRef.current.computeVertexNormals();
  });

  if (!visible) return null;

  return (
    <mesh position={[0, 4.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry ref={geoRef} args={[28, 28, 40, 40]} />
      <meshStandardMaterial
        color="#0284c7"
        roughness={0.2}
        metalness={0.1}
        transparent={true}
        opacity={0.32}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

/**
 * Volumetric Sunlight Shafts (God Rays) Filtering Through Ocean Surface
 */
const VolumetricSunShafts: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(t * 0.12) * 0.025;
      groupRef.current.position.x = Math.sin(t * 0.18) * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={[1.5, 4.0, 0]}>
      {[-3.8, -1.4, 1.2, 3.6].map((xOffset, i) => (
        <mesh
          key={i}
          position={[xOffset, -2.4, (i % 2 === 0 ? -1 : 1) * 1.4]}
          rotation={[0.22, 0, -0.24 + (i - 1.5) * 0.04]}
        >
          <cylinderGeometry args={[0.35, 2.2, 6.5, 16, 1, true]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent={true}
            opacity={0.055}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Suspended Marine Snow Particles Drifting in Oceanic Currents
 */
const MarineSnowParticles: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 1400;

  const [positions] = useState(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = Math.random() * 7 - 3.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    return pos;
  });

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      let y = posAttr.getY(i) - 0.003;
      if (y < -3.6) y = 3.6;
      posAttr.setY(i, y);
      posAttr.setX(i, posAttr.getX(i) + Math.sin(t * 0.35 + i) * 0.001);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#a5f3fc"
        size={0.038}
        transparent={true}
        opacity={0.45}
        sizeAttenuation={true}
      />
    </points>
  );
};

/**
 * Camera and Atmosphere Rig inside R3F Canvas
 */
const UnderwaterAtmosphereRig: React.FC<{ showSurface?: boolean }> = ({ showSurface = true }) => {
  return (
    <>
      {/* Oceanic volumetric depth fog (deep abyssal blue) */}
      <fog attach="fog" args={['#020914', 5, 36]} />

      {/* Atmospheric lighting */}
      <ambientLight color="#0a2540" intensity={0.85} />
      
      {/* Directional Key Sun Light revealing mountain ridges, crests and casting shadows */}
      <directionalLight
        position={[-8, 16, 7]}
        intensity={1.65}
        color="#bae6fd"
        castShadow
      />
      {/* Secondary Fill Light illuminating lateral spurs and valleys */}
      <directionalLight
        position={[9, 8, -6]}
        intensity={0.45}
        color="#0284c7"
      />
      {/* Deep Hadal Trench Benthic Fill Light */}
      <pointLight position={[0, -3.2, 0]} intensity={0.4} color="#0369a1" distance={18} />

      {/* Realistic Overhead Water Surface, Sun Shafts, and Marine Snow */}
      <OverheadWaterSurface visible={showSurface} />
      <VolumetricSunShafts />
      <MarineSnowParticles />
    </>
  );
};

export const UnderwaterBathymetryViewer: React.FC<UnderwaterBathymetryViewerProps> = ({
  initialRegionId = 'mariana-trench',
  onReturnToGlobe,
  oceanName = 'Global Oceanic Basin'
}) => {
  const [selectedRegionId, setSelectedRegionId] = useState<string>(initialRegionId);
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(2.8);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showWaterCeiling, setShowWaterCeiling] = useState<boolean>(true);
  const [probedData, setProbedData] = useState<BenthicProbeResult | null>(null);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const controlsRef = useRef<ThreeOrbitControls | null>(null);

  // Generate high-resolution grid dataset for selected region (128x128 grid: 16,384 vertices)
  const gridDataset = useMemo(() => {
    return generateBathymetryGrid(selectedRegionId, undefined, 128, 128);
  }, [selectedRegionId]);

  const activeRegionObj = REGION_PRESETS.find((r) => r.id === selectedRegionId) || REGION_PRESETS[0];

  const handleZoomIn = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.multiplyScalar(0.85);
      controlsRef.current.update();
    }
  };

  const handleZoomOut = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.multiplyScalar(1.18);
      controlsRef.current.update();
    }
  };

  // Diagonal scenic perspective view (Requirement 10)
  const handleDiagonalView = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(-7.8, 7.5, 9.5);
      controlsRef.current.target.set(0.6, -0.6, -0.2);
      controlsRef.current.update();
    }
  };

  // Top-down bathymetric nadir map view
  const handleTopDownView = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(0, 16.5, 0.01);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  // Trench fault axis inspection view
  const handleTrenchView = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(-4.6, 3.2, 4.8);
      controlsRef.current.target.set(-2.4, -1.8, 0.2);
      controlsRef.current.update();
    }
  };

  // Mountain ridge crest profile view
  const handleRidgeView = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(5.8, 4.4, 6.2);
      controlsRef.current.target.set(1.8, 0.5, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div className="relative w-full h-full bg-[#020914] overflow-hidden select-none font-sans text-slate-100">
      {/* 3D React Three Fiber Canvas */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [-7.8, 7.5, 9.5], fov: 46, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color('#020914'));
          }}
        >
          <UnderwaterCameraControls controlsRef={controlsRef} />
          <UnderwaterAtmosphereRig showSurface={showWaterCeiling} />
          <UnderwaterBathymetry
            gridDataset={gridDataset}
            verticalExaggeration={verticalExaggeration}
            showContours={showContours}
            showLandmarks={showLandmarks}
            showWireframe={showWireframe}
            worldSize={{ width: 16, depth: 16 }}
            oceanName={activeRegionObj.name}
            onProbeDepth={(result) => setProbedData(result)}
          />
        </Canvas>
      </div>

      {/* Top Floating Control Bar */}
      <div className="absolute top-3.5 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {onReturnToGlobe && (
            <button
              type="button"
              onClick={onReturnToGlobe}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-cyan-500/40 text-xs font-semibold text-cyan-300 hover:text-white hover:bg-cyan-950/70 transition-all shadow-lg shadow-black/50 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400" />
              <span>3D Globe View</span>
            </button>
          )}

          <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/70 text-xs text-slate-300 shadow-lg flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-sky-300">MARIVEX 3D Bathymetry Twin</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400 font-mono text-[11px]">GEBCO 2024 Calibrated Grid (128×128)</span>
          </div>
        </div>

        {/* Region Selector Segmented Control */}
        <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/70 pointer-events-auto shadow-xl">
          {REGION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setSelectedRegionId(preset.id);
                setProbedData(null);
              }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedRegionId === preset.id
                  ? 'bg-cyan-600 text-white shadow-md font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span>{preset.name.split(' ')[0]}</span>
              <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                selectedRegionId === preset.id ? 'bg-cyan-700 text-cyan-100' : 'bg-slate-800 text-slate-400'
              }`}>
                {preset.depthRange}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Left Vertical Tools & Exaggeration Controls */}
      <div className="absolute top-16 left-4 z-20 flex flex-col gap-2.5 pointer-events-auto w-64">
        {/* Mobile Region Dropdown */}
        <div className="lg:hidden p-2 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/70 shadow-xl">
          <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Select Marine Basin</label>
          <select
            value={selectedRegionId}
            onChange={(e) => {
              setSelectedRegionId(e.target.value);
              setProbedData(null);
            }}
            className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg p-1.5 border border-slate-700"
          >
            {REGION_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.depthRange})
              </option>
            ))}
          </select>
        </div>

        {/* Terrain Parameters Box */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/70 shadow-2xl space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Topographic Relief
            </span>
            <span className="font-mono text-cyan-300 font-bold tabular-nums">
              {verticalExaggeration.toFixed(1)}x
            </span>
          </div>

          {/* Interactive Vertical Exaggeration Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Vertical Exaggeration</span>
              <span className="text-slate-500 font-mono">1.0x - 6.0x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="6.0"
              step="0.1"
              value={verticalExaggeration}
              onChange={(e) => setVerticalExaggeration(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            />
          </div>

          {/* Feature Toggles */}
          <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
            <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Depth Isolines (Contours)
              </span>
              <input
                type="checkbox"
                checked={showContours}
                onChange={(e) => setShowContours(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Seamounts & Landmarks
              </span>
              <input
                type="checkbox"
                checked={showLandmarks}
                onChange={(e) => setShowLandmarks(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                Sonar Wireframe Mesh
              </span>
              <input
                type="checkbox"
                checked={showWireframe}
                onChange={(e) => setShowWireframe(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
              <span className="flex items-center gap-1.5">
                <Waves className="w-3 h-3 text-cyan-400" />
                Water Surface Ceiling
              </span>
              <input
                type="checkbox"
                checked={showWaterCeiling}
                onChange={(e) => setShowWaterCeiling(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Camera Vantage Presets Strip */}
        <div className="p-2.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/70 shadow-xl space-y-2">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Camera Vantage</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom In"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom Out"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <button
              type="button"
              onClick={handleDiagonalView}
              className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-900/40 border border-slate-700/60 hover:border-cyan-500/40 text-slate-200 hover:text-cyan-200 transition-colors cursor-pointer text-left font-medium"
            >
              Diagonal Scenic
            </button>
            <button
              type="button"
              onClick={handleTopDownView}
              className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-900/40 border border-slate-700/60 hover:border-cyan-500/40 text-slate-200 hover:text-cyan-200 transition-colors cursor-pointer text-left font-medium"
            >
              Top-Down Nadir
            </button>
            <button
              type="button"
              onClick={handleTrenchView}
              className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-900/40 border border-slate-700/60 hover:border-cyan-500/40 text-slate-200 hover:text-cyan-200 transition-colors cursor-pointer text-left font-medium"
            >
              Trench Trough
            </button>
            <button
              type="button"
              onClick={handleRidgeView}
              className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-900/40 border border-slate-700/60 hover:border-cyan-500/40 text-slate-200 hover:text-cyan-200 transition-colors cursor-pointer text-left font-medium"
            >
              Mountain Ridge
            </button>
          </div>
        </div>

        {/* Quick Interaction Hint */}
        <div className="p-2.5 rounded-xl bg-slate-900/70 backdrop-blur-sm border border-slate-800/90 text-[11px] text-slate-400 flex items-start gap-2 shadow-lg">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-cyan-300">Click anywhere on the seabed</strong> to drop an acoustic telemetry sounding probe and inspect exact depth, morphology, and pressure.
          </span>
        </div>
      </div>

      {/* Right Click Anywhere Depth Telemetry Probe Card */}
      {probedData && (
        <div className="absolute top-16 right-4 z-20 w-84 p-4 rounded-xl bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 shadow-2xl space-y-3 pointer-events-auto animate-in fade-in duration-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] tracking-wider uppercase text-cyan-400 font-bold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                Benthic Sounding Probe
              </div>
              <h4 className="text-sm font-bold text-slate-100">
                {probedData.oceanName}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setProbedData(null)}
              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Depth Callout */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-cyan-500/20 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Seafloor Depth</div>
              <div className="text-2xl font-black font-mono text-cyan-300 tabular-nums">
                {probedData.depth.toLocaleString()} <span className="text-sm font-normal text-slate-400">m</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Bathymetric Relief</div>
              <div className="text-sm font-mono text-slate-300 tabular-nums">
                {probedData.elevation.toLocaleString()} m
              </div>
            </div>
          </div>

          {/* Coordinates & Physical Parameters */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-750">
              <div className="text-[10px] text-slate-400 uppercase">Latitude</div>
              <div className="font-mono font-bold text-slate-200 tabular-nums">
                {probedData.coords.latitude >= 0 ? `${probedData.coords.latitude}° N` : `${Math.abs(probedData.coords.latitude)}° S`}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-750">
              <div className="text-[10px] text-slate-400 uppercase">Longitude</div>
              <div className="font-mono font-bold text-slate-200 tabular-nums">
                {probedData.coords.longitude >= 0 ? `${probedData.coords.longitude}° E` : `${Math.abs(probedData.coords.longitude)}° W`}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-750">
              <div className="text-[10px] text-slate-400 uppercase">Benthic Temp</div>
              <div className="font-mono font-bold text-slate-200 tabular-nums">
                {probedData.benthicTemperature.toFixed(1)} °C
              </div>
            </div>
            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-750">
              <div className="text-[10px] text-slate-400 uppercase">Hydrostatic Pressure</div>
              <div className="font-mono font-bold text-slate-200 tabular-nums">
                {probedData.benthicPressure.toLocaleString()} dbar
              </div>
            </div>
          </div>

          {/* Geology & Morphology */}
          <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 space-y-1 text-xs">
            <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Geological Morphology</div>
            <div className="text-slate-100 font-semibold leading-relaxed">
              {probedData.morphologyLabel}
            </div>
            <div className="text-slate-400 text-[11px] pt-0.5">
              <span className="text-slate-500">Sediment: </span>{probedData.sedimentType}
            </div>
          </div>

          {/* Scientific Attribution */}
          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 space-y-0.5">
            <div className="flex justify-between">
              <span>Calibration Grid:</span>
              <span className="text-slate-300 font-medium">{probedData.datasetName}</span>
            </div>
            <div className="flex justify-between">
              <span>Grid Resolution:</span>
              <span className="text-slate-300 font-mono">{probedData.resolution}</span>
            </div>
            <div className="text-slate-500 pt-1 text-[9px] leading-tight">
              Multibeam acoustic bathymetry and radar altimetry. Benchmark standards GEBCO / NOAA / IOC.
            </div>
          </div>
        </div>
      )}

      {/* Bottom Continuous Bathymetric Color Gradient Legend (Requirement 4) */}
      {showLegend && (
        <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 z-20 max-w-md p-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/70 shadow-2xl pointer-events-auto space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-cyan-400 to-amber-400" />
              Bathymetric Depth Gradient
            </span>
            <span className="text-[10px] font-mono text-slate-400 uppercase">Scientific Elevation</span>
          </div>

          {/* Continuous Scientific Elevation Color Gradient Bar */}
          <div className="h-3.5 w-full rounded-md overflow-hidden bg-gradient-to-r from-[#dc2626] via-[#ea580c] via-15% via-[#eab308] via-30% via-[#16a34a] via-45% via-[#0d9488] via-60% via-[#0284c7] via-75% via-[#1e3a8a] via-90% to-[#020817] shadow-inner" />

          {/* Elevation Labels matching the colors */}
          <div className="flex justify-between text-[10px] font-mono text-slate-300 tabular-nums font-semibold">
            <span className="text-orange-400">&lt;350m</span>
            <span className="text-yellow-400">1,200m</span>
            <span className="text-emerald-400">2,500m</span>
            <span className="text-cyan-400">4,500m</span>
            <span className="text-blue-400">7,500m</span>
            <span className="text-indigo-300">&gt;10,000m</span>
          </div>

          <div className="flex justify-between text-[9px] text-slate-400 font-medium">
            <span>Peaks & Shelf</span>
            <span>Plateaus</span>
            <span>Ridges</span>
            <span>Deep Basin</span>
            <span>Abyssal Floor</span>
            <span>Hadal Trench</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnderwaterBathymetryViewer;
