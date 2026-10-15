import React, { useState } from 'react';
import { OceanDataLayerId } from '../types/ocean';
import { OCEAN_DATA_LAYERS, getLayerMeta } from '../utils/oceanLayersData';
import { 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  Waves, 
  Clock, 
  Compass, 
  Thermometer, 
  Wind, 
  Activity, 
  Mountain,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';

interface OceanDataLayerSelectorProps {
  activeLayer: OceanDataLayerId;
  onSelectLayer: (layer: OceanDataLayerId) => void;
  showVectorOverlay: boolean;
  onToggleVectorOverlay: () => void;
  showStreamlines: boolean;
  onToggleStreamlines: () => void;
  onDiveToSeabed?: () => void;
}

export const OceanDataLayerSelector: React.FC<OceanDataLayerSelectorProps> = ({
  activeLayer,
  onSelectLayer,
  showVectorOverlay,
  onToggleVectorOverlay,
  showStreamlines,
  onToggleStreamlines,
  onDiveToSeabed
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentMeta = getLayerMeta(activeLayer);

  const getLayerIcon = (id: OceanDataLayerId) => {
    switch (id) {
      case 'waveHeight':
        return <Waves className="w-4 h-4 text-cyan-400" />;
      case 'wavePeriod':
        return <Clock className="w-4 h-4 text-sky-400" />;
      case 'waveDirection':
        return <Compass className="w-4 h-4 text-emerald-400" />;
      case 'sst':
        return <Thermometer className="w-4 h-4 text-amber-400" />;
      case 'wind':
        return <Wind className="w-4 h-4 text-orange-400" />;
      case 'currents':
        return <Activity className="w-4 h-4 text-pink-400" />;
      case 'bathymetry':
        return <Mountain className="w-4 h-4 text-violet-400" />;
    }
  };

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 max-w-[340px] w-full pointer-events-auto">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-400/30 bg-[#04162a]/95 text-xs font-semibold text-white shadow-xl backdrop-blur-md hover:border-cyan-400 hover:bg-[#072442] transition-all"
      >
        <Layers className="w-4 h-4 text-cyan-300" />
        <span className="font-mono text-cyan-200">LAYERS:</span>
        <span className="font-bold text-white truncate max-w-[150px]">{currentMeta.name}</span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="w-full p-3.5 rounded-2xl border border-cyan-500/25 bg-[#031122]/95 backdrop-blur-xl shadow-2xl text-slate-100 flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-[10px] font-mono tracking-widest text-cyan-300 uppercase font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              GLOBAL DATA LAYERS (7)
            </span>
            <span className="text-[10px] font-mono text-slate-400">NOAA / GEBCO</span>
          </div>

          {/* 7 Layer Buttons */}
          <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1 no-scrollbar">
            {OCEAN_DATA_LAYERS.map((layer) => {
              const isSelected = activeLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => onSelectLayer(layer.id)}
                  className={`w-full text-left p-2 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-500/20 text-white font-bold shadow-md shadow-cyan-950/50'
                      : 'border-white/5 bg-[#051c36]/70 text-slate-300 hover:border-cyan-400/40 hover:bg-[#08294e]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0">{getLayerIcon(layer.id)}</div>
                    <div className="truncate">
                      <div className="truncate text-[12px]">{layer.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{layer.unit}</div>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="shrink-0 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-400 text-black font-bold">
                      ACTIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Independent Secondary Layer Toggles */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
              INDEPENDENT DISPLAY TOGGLES
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onToggleVectorOverlay}
                className={`p-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  showVectorOverlay
                    ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                    : 'border-white/10 bg-white/5 text-slate-400'
                }`}
              >
                {showVectorOverlay ? <Eye className="w-3 h-3 text-cyan-300" /> : <EyeOff className="w-3 h-3" />}
                <span>Vector Arrows</span>
              </button>

              <button
                type="button"
                onClick={onToggleStreamlines}
                className={`p-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  showStreamlines
                    ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                    : 'border-white/10 bg-white/5 text-slate-400'
                }`}
              >
                {showStreamlines ? <Eye className="w-3 h-3 text-cyan-300" /> : <EyeOff className="w-3 h-3" />}
                <span>Streamlines</span>
              </button>
            </div>

            {activeLayer === 'bathymetry' && onDiveToSeabed && (
              <button
                type="button"
                onClick={onDiveToSeabed}
                className="w-full mt-1 py-1.5 px-2.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 text-cyan-300 text-xs font-bold hover:bg-cyan-500/25 transition-colors flex items-center justify-center gap-1.5"
              >
                <Mountain className="w-3.5 h-3.5" />
                <span>Descend into 3D Subsea Terrain</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Active Layer Legend Card */}
      <div className="w-full p-2.5 rounded-xl border border-cyan-500/20 bg-[#020b17]/90 backdrop-blur-md shadow-xl text-slate-200 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-white flex items-center gap-1.5 truncate">
            {getLayerIcon(activeLayer)}
            <span className="truncate">{currentMeta.name}</span>
          </span>
          <span className="font-mono text-cyan-300 text-[10px] shrink-0 font-semibold">{currentMeta.unit}</span>
        </div>

        {/* Color Scale Bar */}
        <div className="flex items-center h-2.5 rounded-full overflow-hidden border border-white/20 w-full">
          {currentMeta.colorScale.stops.map((stop, idx) => (
            <div
              key={idx}
              className="flex-1 h-full"
              style={{ backgroundColor: stop.color }}
              title={stop.label}
            />
          ))}
        </div>

        {/* Legend Step Labels */}
        <div className="flex justify-between items-center text-[9px] font-mono text-slate-400">
          <span>{currentMeta.colorScale.stops[0].label.split(' ')[0]}</span>
          <span>{currentMeta.colorScale.stops[Math.floor(currentMeta.colorScale.stops.length / 2)].label.split(' ')[0]}</span>
          <span>{currentMeta.colorScale.stops[currentMeta.colorScale.stops.length - 1].label.split(' ')[0]}</span>
        </div>

        {/* Attribution and synoptic time */}
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 pt-1 border-t border-white/5">
          <span className="truncate max-w-[200px]" title={currentMeta.sourceAttribution}>
            {currentMeta.sourceAttribution.split(' & ')[0]}
          </span>
          <span className="text-cyan-400/90 font-semibold">{currentMeta.timestamp.split(' / ')[0]}</span>
        </div>
      </div>
    </div>
  );
};
