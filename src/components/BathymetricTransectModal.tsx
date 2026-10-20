import React, { useState } from 'react';
import { Coordinates } from '../types/ocean';
import { BATHYMETRIC_TRANSECTS } from '../utils/transectsData';
import { 
  Mountain, 
  X, 
  MapPin, 
  ArrowRight, 
  Layers, 
  Compass, 
  Activity, 
  Download,
  Navigation
} from 'lucide-react';

interface BathymetricTransectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFlyToTransect: (coords: Coordinates) => void;
}

export const BathymetricTransectModal: React.FC<BathymetricTransectModalProps> = ({
  isOpen,
  onClose,
  onFlyToTransect
}) => {
  const [selectedTransectId, setSelectedTransectId] = useState<string>('mariana-trench-transect');

  if (!isOpen) return null;

  const transect = BATHYMETRIC_TRANSECTS.find(t => t.id === selectedTransectId) || BATHYMETRIC_TRANSECTS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border border-cyan-500/30 bg-[#031122] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-[#041933]/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-violet-300">
              <Mountain className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-violet-400 font-bold uppercase block">
                GEOLOGICAL SUBSEA PROFILER (FEATURE 11)
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Bathymetric Transect & Seafloor Cross-Section
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transect Preset Bar */}
        <div className="p-4 bg-[#041527] border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-mono uppercase text-slate-400 font-bold mr-1 shrink-0">
            TRANSECT TRACK:
          </span>
          {BATHYMETRIC_TRANSECTS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTransectId(t.id)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                selectedTransectId === t.id
                  ? 'border-violet-400 bg-violet-500/30 text-white font-bold shadow-md shadow-violet-950/50'
                  : 'border-white/10 bg-[#051e38] text-slate-300 hover:border-violet-400/40'
              }`}
            >
              {t.title.split(':')[0]}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Transect Details Banner */}
          <div className="p-4 sm:p-5 rounded-2xl border border-violet-500/30 bg-[#051c36]/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-violet-300 uppercase font-bold tracking-wider">
                {transect.regionName}
              </span>
              <h3 className="text-lg font-bold text-white">{transect.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                {transect.description}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
              <div className="font-mono text-xs text-right bg-[#031122] p-2.5 rounded-xl border border-white/10">
                <span className="text-slate-400 block text-[10px]">TOTAL TRACK LENGTH</span>
                <strong className="text-cyan-300">{transect.totalDistanceKm} km</strong>
                <span className="text-slate-400 block text-[10px] mt-1">MAX TRANSECT DEPTH</span>
                <strong className="text-violet-300">{transect.maxDepthM.toLocaleString()} m</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  onFlyToTransect(transect.startCoords);
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl border border-violet-400 bg-violet-500/25 hover:bg-violet-500/35 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-violet-950/60"
              >
                <Navigation className="w-4 h-4 text-violet-300" />
                <span>Fly Globe to Transect</span>
              </button>
            </div>
          </div>

          {/* 2D Bathymetric Profile Cross-Section Visualizer */}
          <div className="p-5 rounded-2xl border border-cyan-500/20 bg-[#031122] space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-cyan-300 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                CROSS-SECTION ELEVATION PROFILE (SEA SURFACE TO ABYSS)
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                GEBCO 2024 Calibrated Bathymetry
              </span>
            </div>

            {/* Profile Canvas representation */}
            <div className="relative h-64 w-full bg-gradient-to-b from-[#02182b] via-[#041c38] to-[#020b17] rounded-xl border border-cyan-500/30 overflow-hidden p-3 flex flex-col justify-between">
              {/* Sea Surface 0m waterline */}
              <div className="w-full flex items-center justify-between border-b border-cyan-400/50 pb-1 text-[10px] font-mono text-cyan-300">
                <span>0m (Sea Level)</span>
                <span className="text-cyan-400/60">WATER SURFACE INTERFACE</span>
                <span>0m</span>
              </div>

              {/* Profile Depth Polyline Visualizer */}
              <div className="relative flex-1 w-full flex items-end">
                <svg className="w-full h-full" viewBox="0 0 1000 200" preserveAspectRatio="none">
                  {/* Water body gradient fill */}
                  <defs>
                    <linearGradient id="bathyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00b4d8" stopOpacity="0.25" />
                      <stop offset="50%" stopColor="#0077b6" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#10002b" stopOpacity="0.85" />
                    </linearGradient>
                  </defs>

                  {/* Dynamic SVG polygon based on profile points */}
                  {(() => {
                    const maxScaleDepth = Math.max(transect.maxDepthM * 1.08, 6000);
                    const pts = transect.profile.map((p) => {
                      const x = (p.distanceKm / transect.totalDistanceKm) * 1000;
                      const y = (p.depthM / maxScaleDepth) * 190 + 10;
                      return `${x},${y}`;
                    });
                    const pathD = `M 0,200 L 0,${pts[0].split(',')[1]} ${pts.map(p => `L ${p}`).join(' ')} L 1000,200 Z`;
                    const lineD = `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')}`;

                    return (
                      <>
                        <path d={pathD} fill="url(#bathyGradient)" />
                        <path d={lineD} fill="none" stroke="#00eaff" strokeWidth="2.5" />
                      </>
                    );
                  })()}
                </svg>
              </div>

              {/* Seafloor markers and labels */}
              <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-white/10">
                <span>Start: {transect.startCoords.latitude}°N, {transect.startCoords.longitude}°E (0 km)</span>
                <span className="text-violet-300 font-bold">Max Depth: -{transect.maxDepthM.toLocaleString()} m</span>
                <span>End: {transect.endCoords.latitude}°N, {transect.endCoords.longitude}°E ({transect.totalDistanceKm} km)</span>
              </div>
            </div>

            {/* Geological Station Markers Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-2">
              {transect.profile.map((pt, idx) => (
                <div key={idx} className="p-2.5 rounded-xl border border-white/10 bg-[#041a33] text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{pt.distanceKm} km</span>
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold uppercase text-[9px]">
                      {pt.seabedType}
                    </span>
                  </div>
                  <strong className="text-white text-[11px] block truncate" title={pt.featureName}>
                    {pt.featureName}
                  </strong>
                  <div className="text-cyan-300 font-bold text-xs">
                    -{pt.depthM.toLocaleString()} m
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
