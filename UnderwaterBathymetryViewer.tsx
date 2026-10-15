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
  X
} from 'lucide-react';
import { UnderwaterBathymetry, BenthicProbeResult } from './UnderwaterBathymetry';
import { generateBathymetryGrid, BathymetricLandmark } from '../utils/bathymetryGridBuilder';

interface UnderwaterBathymetryViewerProps {
  initialRegionId?: string;
  onReturnToGlobe?: () => void;
  oceanName?: string;
}

const REGION_PRESETS = [
  { id: 'mariana-trench', name: 'Mariana Trench (Challenger Deep)', depthRange: '10,994m' },
  { id: 'atlantic-ridge', name: 'Mid-Atlantic Ridge (Axial Rift)', depthRange: '3,670m' },
  { id: 'puerto-rico-trench', name: 'Puerto Rico Trench (Milwaukee Deep)', depthRange: '8,376m' },
  { id: 'arabian-sea', name: 'Arabian Sea (Carlsberg Ridge & Shelf)', depthRange: '4,652m' },
  { id: 'bay-of-bengal', name: 'Bay of Bengal (Swatch of No Ground)', depthRange: '4,694m' }
];

/**
 * Camera OrbitControls inside R3F Canvas
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
    controls.maxDistance = 28.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.03; // prevent camera clipping through floor
    controls.enablePan = true;
    controls.screenSpacePanning = true;
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
 * Camera and Atmosphere Rig inside R3F Canvas
 */
const UnderwaterAtmosphereRig: React.FC = () => {
  return (
    <>
      {/* Oceanic volumetric depth fog */}
      <fog attach="fog" args={['#020b18', 4, 32]} />

      {/* Atmospheric lighting */}
      <ambientLight color="#1e3a8a" intensity={0.85} />
      <directionalLight
        position={[6, 14, 8]}
        intensity={1.4}
        color="#38bdf8"
        castShadow
      />
      <directionalLight
        position={[-8, 6, -6]}
        intensity={0.4}
        color="#0284c7"
      />
      <pointLight position={[0, -2, 0]} intensity={0.6} color="#06b6d4" distance={15} />
    </>
  );
};

export const UnderwaterBathymetryViewer: React.FC<UnderwaterBathymetryViewerProps> = ({
  initialRegionId = 'mariana-trench',
  onReturnToGlobe,
  oceanName = 'Global Oceanic Basin'
}) => {
  const [selectedRegionId, setSelectedRegionId] = useState<string>(initialRegionId);
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(3.0);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [probedData, setProbedData] = useState<BenthicProbeResult | null>(null);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const controlsRef = useRef<ThreeOrbitControls | null>(null);

  // Generate grid dataset for selected region
  const gridDataset = useMemo(() => {
    return generateBathymetryGrid(selectedRegionId, undefined, 72, 72);
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

  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(0, 6.5, 11);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const handleTopDownView = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(0, 16, 0.01);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div className="relative w-full h-full bg-[#020b18] overflow-hidden select-none font-sans text-slate-100">
      {/* 3D React Three Fiber Canvas */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 6.5, 11], fov: 48, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color('#020b18'));
          }}
        >
          <UnderwaterCameraControls controlsRef={controlsRef} />
          <UnderwaterAtmosphereRig />
          <UnderwaterBathymetry
            gridDataset={gridDataset}
            verticalExaggeration={verticalExaggeration}
            showContours={showContours}
            showLandmarks={showLandmarks}
            showWireframe={showWireframe}
            worldSize={{ width: 14, depth: 14 }}
            oceanName={activeRegionObj.name}
            onProbeDepth={(result) => setProbedData(result)}
          />
        </Canvas>
      </div>

      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
        <div className="flex items-center gap-3 pointer-events-auto">
          {onReturnToGlobe && (
            <button
              type="button"
              onClick={onReturnToGlobe}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/85 backdrop-blur-md border border-slate-700/70 text-xs font-semibold text-sky-300 hover:text-white hover:bg-slate-800 transition-colors shadow-lg cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Globe</span>
            </button>
          )}

          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-800 text-xs text-slate-300">
            <span className="font-semibold text-sky-400">Bathymetry 3D Twin</span>
            <span className="mx-2 text-slate-600">·</span>
            <span>GEBCO 2024 Grid</span>
          </div>
        </div>

        {/* Region Selector Segmented Control */}
        <div className="hidden md:flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/70 pointer-events-auto shadow-lg">
          {REGION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setSelectedRegionId(preset.id);
                setProbedData(null);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                selectedRegionId === preset.id
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {preset.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Left Vertical Tools & Exaggeration Controls */}
      <div className="absolute top-20 left-4 z-20 flex flex-col gap-3 pointer-events-auto w-64">
        {/* Terrain Controls Box */}
        <div className="p-3.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/70 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              Terrain Parameters
            </span>
            <span className="font-mono text-sky-300 tabular-nums">
              {verticalExaggeration.toFixed(1)}x
            </span>
          </div>

          {/* Interactive Vertical Exaggeration Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Vertical Exaggeration</span>
              <span className="text-slate-500">1.0x - 8.0x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="8.0"
              step="0.2"
              value={verticalExaggeration}
              onChange={(e) => setVerticalExaggeration(parseFloat(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            />
          </div>

          {/* Toggles */}
          <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
            <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
              <span>Depth Contours (Isolines)</span>
              <input
                type="checkbox"
                checked={showContours}
                onChange={(e) => setShowContours(e.target.checked)}
                className="rounded accent-sky-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
              <span>Landmarks & Seamounts</span>
              <input
                type="checkbox"
                checked={showLandmarks}
                onChange={(e) => setShowLandmarks(e.target.checked)}
                className="rounded accent-sky-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
              <span>Sonar Wireframe Grid</span>
              <input
                type="checkbox"
                checked={showWireframe}
                onChange={(e) => setShowWireframe(e.target.checked)}
                className="rounded accent-sky-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Camera Navigation Strip */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/70 shadow-lg justify-between">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-sky-300 hover:text-white transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-sky-300 hover:text-white transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetCamera}
            title="Reset Perspective View"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-sky-300 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleTopDownView}
            title="Top-Down Bathymetric Nadir View"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium text-sky-300 hover:text-white transition-colors cursor-pointer"
          >
            <Compass className="w-3 h-3" />
            <span>Nadir</span>
          </button>
        </div>

        {/* Quick Hint */}
        <div className="p-2.5 rounded-lg bg-slate-900/60 backdrop-blur-sm border border-slate-800 text-[11px] text-slate-400">
          <span className="text-sky-400 font-medium">Click anywhere</span> on the 3D seabed mesh to inspect real-time acoustic depth soundings and benthic geology.
        </div>
      </div>

      {/* Right Click Anywhere Depth Telemetry Probe Card */}
      {probedData && (
        <div className="absolute top-20 right-4 z-20 w-80 p-4 rounded-xl bg-slate-900/90 backdrop-blur-md border border-sky-500/40 shadow-2xl space-y-3 pointer-events-auto animate-in fade-in duration-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] tracking-wider uppercase text-sky-400 font-bold">
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
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">Seafloor Depth</div>
              <div className="text-2xl font-black font-mono text-sky-300 tabular-nums">
                {probedData.depth.toLocaleString()} <span className="text-sm font-normal text-slate-400">m</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Elevation</div>
              <div className="text-sm font-mono text-slate-300 tabular-nums">
                {probedData.elevation.toLocaleString()} m
              </div>
            </div>
          </div>

          {/* Coordinates & Physical Parameters */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-slate-800/50">
              <div className="text-[10px] text-slate-400">Latitude</div>
              <div className="font-mono font-medium text-slate-200 tabular-nums">
                {probedData.coords.latitude >= 0 ? `${probedData.coords.latitude}° N` : `${Math.abs(probedData.coords.latitude)}° S`}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-800/50">
              <div className="text-[10px] text-slate-400">Longitude</div>
              <div className="font-mono font-medium text-slate-200 tabular-nums">
                {probedData.coords.longitude >= 0 ? `${probedData.coords.longitude}° E` : `${Math.abs(probedData.coords.longitude)}° W`}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-800/50">
              <div className="text-[10px] text-slate-400">Benthic Temp</div>
              <div className="font-mono font-medium text-slate-200 tabular-nums">
                {probedData.benthicTemperature.toFixed(1)} °C
              </div>
            </div>
            <div className="p-2 rounded bg-slate-800/50">
              <div className="text-[10px] text-slate-400">Hydrostatic Pressure</div>
              <div className="font-mono font-medium text-slate-200 tabular-nums">
                {probedData.benthicPressure.toLocaleString()} dbar
              </div>
            </div>
          </div>

          {/* Geology & Morphology */}
          <div className="text-xs space-y-1">
            <div className="text-[10px] text-slate-400">Geological Morphology</div>
            <div className="text-slate-200 font-medium leading-relaxed">
              {probedData.morphologyLabel}
            </div>
            <div className="text-[10px] text-slate-400 pt-1">Sediment Layer</div>
            <div className="text-slate-300 text-[11px]">
              {probedData.sedimentType}
            </div>
          </div>

          {/* Scientific Attribution */}
          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 space-y-0.5">
            <div className="flex justify-between">
              <span>Dataset:</span>
              <span className="text-slate-300">{probedData.datasetName}</span>
            </div>
            <div className="flex justify-between">
              <span>Resolution:</span>
              <span className="text-slate-300">{probedData.resolution}</span>
            </div>
            <div className="text-slate-400 pt-1 text-[9px] leading-tight">
              {probedData.attribution}
            </div>
          </div>
        </div>
      )}

      {/* Bottom GEBCO Hypsometric Color Legend */}
      {showLegend && (
        <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 z-20 max-w-sm p-3 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/70 shadow-xl pointer-events-auto space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
            <span>GEBCO Hypsometric Tinting Scale</span>
            <span className="text-[10px] text-slate-400">Depth (meters)</span>
          </div>

          {/* Gradient Bar */}
          <div className="h-3 w-full rounded-md overflow-hidden bg-gradient-to-r from-[#38bdf8] via-[#0284c7] via-25% via-[#1d4ed8] via-55% via-[#0f172a] via-85% to-[#3b0764]" />

          <div className="flex justify-between text-[10px] font-mono text-slate-400 tabular-nums">
            <span>0m (Shelf)</span>
            <span>-1,500m</span>
            <span>-4,000m</span>
            <span>-6,000m</span>
            <span>-11,000m (Hadal)</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnderwaterBathymetryViewer;
