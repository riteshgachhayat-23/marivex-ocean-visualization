import React, { useEffect, useState } from 'react';
import { Coordinates, OceanObservation, OceanParameter, PresetLocation } from '../types/ocean';
import { getPelagicZone, PELAGIC_ZONES, PRESET_LOCATIONS } from '../utils/oceanData';
import { generateOceanPdfReport, exportOceanCsv } from '../utils/pdfReport';
import { Play, Pause, FileText, Download, RotateCcw } from 'lucide-react';

interface ControlPanelProps {
  selectedCoords: Coordinates | null;
  depth: number;
  setDepth: React.Dispatch<React.SetStateAction<number>>;
  hour: number;
  setHour: React.Dispatch<React.SetStateAction<number>>;
  activeParam: OceanParameter;
  setActiveParam: (param: OceanParameter) => void;
  oceanData: OceanObservation | null;
  isLoading: boolean;
  onSelectPreset: (preset: PresetLocation) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedCoords,
  depth,
  setDepth,
  hour,
  setHour,
  activeParam,
  setActiveParam,
  oceanData,
  isLoading,
  onSelectPreset
}) => {
  const [isPlayingDiurnal, setIsPlayingDiurnal] = useState(false);
  const currentZone = getPelagicZone(depth);

  // Play/pause diurnal 24h simulation
  useEffect(() => {
    if (!isPlayingDiurnal) return;
    const interval = setInterval(() => {
      setHour((prev) => (prev + 1) % 24);
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlayingDiurnal, setHour]);

  const handleDownloadPdf = () => {
    if (!selectedCoords || !oceanData) return;
    generateOceanPdfReport(selectedCoords, depth, hour, oceanData);
  };

  const handleDownloadCsv = () => {
    if (!selectedCoords || !oceanData) return;
    exportOceanCsv(selectedCoords, depth, hour, oceanData);
  };

  return (
    <div className="flex flex-col gap-5 p-5 rounded-2xl border border-cyan-500/20 bg-[#061527]/90 backdrop-blur-xl text-slate-100 shadow-2xl">
      <div>
        <div className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-semibold mb-1">
          ENVIRONMENTAL CONTROLS
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white">
          Observation Horizon
        </h2>
      </div>

      {/* Preset Explorer */}
      <div>
        <label className="text-xs font-semibold text-slate-300 mb-2 block">
          Preset Marine Coordinates
        </label>
        <select
          aria-label="Preset Marine Coordinates"
          onChange={(e) => {
            const preset = PRESET_LOCATIONS.find((p) => p.id === e.target.value);
            if (preset) onSelectPreset(preset);
          }}
          defaultValue=""
          className="w-full text-xs bg-[#0b253d] border border-cyan-500/30 rounded-xl px-3 py-2.5 text-cyan-100 focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer"
        >
          <option value="" disabled>
            Select Preset Oceanic Feature...
          </option>
          {PRESET_LOCATIONS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.region})
            </option>
          ))}
        </select>
      </div>

      {/* Primary Variable Selector */}
      <div>
        <label className="text-xs font-semibold text-slate-300 mb-2 block">
          Telemetry Variable Focus
        </label>
        <select
          aria-label="Telemetry Variable Focus"
          value={activeParam}
          onChange={(e) => setActiveParam(e.target.value as OceanParameter)}
          className="w-full text-xs bg-[#0b253d] border border-cyan-500/30 rounded-xl px-3 py-2.5 text-cyan-100 focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer"
        >
          <option value="Temperature">Temperature (°C)</option>
          <option value="Salinity">Practical Salinity (PSU)</option>
          <option value="Current Speed">Current Velocity (km/h)</option>
          <option value="Current Direction">Current Heading Bearing (°)</option>
          <option value="Wave Height">Significant Wave Height (m)</option>
          <option value="Bathymetry">Bathymetric Seafloor Depth (m)</option>
        </select>
      </div>

      {/* Depth Slider */}
      <div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-slate-300">Observation Depth</span>
          <span className="font-mono text-cyan-300 font-bold tabular-nums">
            {depth} meters
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="6000"
          step="25"
          value={depth}
          onChange={(e) => setDepth(Number(e.target.value))}
          className="w-full"
        />

        {/* Pelagic Zone indicator chip */}
        <div className="mt-2.5 p-2 rounded-lg bg-[#041a31] border border-cyan-500/15 flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Pelagic Stratum:</span>
          <span className="font-semibold text-cyan-300">
            {currentZone.name} ({currentZone.altName})
          </span>
        </div>

        {/* Quick Zone Presets */}
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {PELAGIC_ZONES.slice(0, 3).map((z) => (
            <button
              key={z.name}
              type="button"
              onClick={() => setDepth(z.minDepth === 0 ? 50 : z.minDepth === 200 ? 500 : 2000)}
              className={`px-2 py-1.5 text-[10px] rounded-md border font-medium transition-colors text-center truncate ${
                depth >= z.minDepth && depth < z.maxDepth
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                  : 'border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>

        {oceanData && (
          <button
            type="button"
            onClick={() => setDepth(oceanData.bathymetryDepth)}
            className="w-full mt-2 py-1.5 px-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[11px] font-semibold flex items-center justify-between transition-colors"
          >
            <span>⚓ Touchdown at Seabed:</span>
            <span className="font-mono">{oceanData.bathymetryDepth.toLocaleString()} m</span>
          </button>
        )}
      </div>

      {/* Time Slider (24-Hour UTC Observation) */}
      <div>
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">Diurnal Time (UTC)</span>
            <button
              type="button"
              onClick={() => setIsPlayingDiurnal(!isPlayingDiurnal)}
              title={isPlayingDiurnal ? 'Pause Diurnal Cycle' : 'Simulate 24h Diurnal Cycle'}
              className="p-1 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
            >
              {isPlayingDiurnal ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
          </div>
          <span className="font-mono text-cyan-300 font-bold tabular-nums">
            {String(hour).padStart(2, '0')}:00 UTC
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="23"
          step="1"
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Control Readout Box */}
      <div className="p-3 rounded-xl border border-cyan-500/20 bg-[#041a30] text-[11px] space-y-2">
        <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
          <span className="text-slate-400">TARGET VARIABLE</span>
          <strong className="text-cyan-200 font-mono">{activeParam}</strong>
        </div>
        <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
          <span className="text-slate-400">DEPTH HORIZON</span>
          <strong className="text-cyan-200 font-mono">{depth} m</strong>
        </div>
        <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
          <span className="text-slate-400">OBSERVATION HOUR</span>
          <strong className="text-cyan-200 font-mono">{String(hour).padStart(2, '0')}:00 UTC</strong>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">BASIN SECTOR</span>
          <strong className="text-cyan-200 font-mono truncate max-w-[130px]">
            {oceanData?.oceanBasin || 'Global Oceanic Grid'}
          </strong>
        </div>
      </div>

      {/* Export Actions */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={!selectedCoords || isLoading}
          className="w-full py-3 px-4 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-200 font-bold text-xs flex items-center justify-center gap-2 hover:from-cyan-600/40 hover:to-blue-600/40 hover:border-cyan-400 transition-all shadow-lg shadow-cyan-950/50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileText className="w-4 h-4 text-cyan-300" />
          <span>Generate Research PDF</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={!selectedCoords || isLoading}
          className="w-full py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>Export Data CSV</span>
        </button>
      </div>
    </div>
  );
};
