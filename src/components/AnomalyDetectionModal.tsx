import React, { useState } from 'react';
import { Coordinates, OceanAnomalyRecord } from '../types/ocean';
import { filterAnomalies, VERIFIED_OCEAN_ANOMALIES } from '../utils/anomalyDetection';
import { 
  AlertCircle, 
  X, 
  Sliders, 
  MapPin, 
  Clock, 
  ShieldAlert, 
  Activity, 
  Waves, 
  Thermometer, 
  Compass, 
  ChevronRight,
  Info
} from 'lucide-react';

interface AnomalyDetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPinAnomaly: (anomaly: OceanAnomalyRecord) => void;
}

export const AnomalyDetectionModal: React.FC<AnomalyDetectionModalProps> = ({
  isOpen,
  onClose,
  onPinAnomaly
}) => {
  const [selectedParam, setSelectedParam] = useState<'All' | 'Wave Height' | 'Sea Surface Temperature' | 'Ocean Current'>('All');
  const [sigmaThreshold, setSigmaThreshold] = useState<number>(2.0);
  const [activeAnomaly, setActiveAnomaly] = useState<OceanAnomalyRecord | null>(VERIFIED_OCEAN_ANOMALIES[0]);

  if (!isOpen) return null;

  const anomalies = filterAnomalies({
    parameter: selectedParam,
    sigmaThreshold,
    regionFilter: 'All'
  });

  const getParamIcon = (param: string) => {
    switch (param) {
      case 'Wave Height': return <Waves className="w-4 h-4 text-cyan-400" />;
      case 'Sea Surface Temperature': return <Thermometer className="w-4 h-4 text-amber-400" />;
      case 'Ocean Current': return <Compass className="w-4 h-4 text-pink-400" />;
      default: return <Activity className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'Extreme':
        return 'border-red-500/40 bg-red-500/20 text-red-300';
      case 'Significant':
        return 'border-amber-500/40 bg-amber-500/20 text-amber-300';
      default:
        return 'border-cyan-500/40 bg-cyan-500/20 text-cyan-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-cyan-500/30 bg-[#031122] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-[#041933]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-amber-400 font-bold uppercase block">
                CLIMATOLOGICAL DEVIATION MATRIX
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Ocean Anomaly Detection Module
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

        {/* Filters and Controls */}
        <div className="p-5 border-b border-white/5 bg-[#04162a]/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Parameter Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-xs font-mono text-slate-400 uppercase font-semibold mr-1">PARAMETER:</span>
            {(['All', 'Wave Height', 'Sea Surface Temperature', 'Ocean Current'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedParam(p)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedParam === p
                    ? 'border-cyan-400 bg-cyan-500/30 text-white font-bold shadow-md shadow-cyan-950/50'
                    : 'border-white/10 bg-[#051e38] text-slate-300 hover:border-cyan-400/40'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Sigma Threshold Slider */}
          <div className="flex items-center gap-3 bg-[#031122] p-2 rounded-xl border border-white/10">
            <div className="text-xs font-mono text-slate-300 whitespace-nowrap">
              Threshold Z-Score: <strong className="text-amber-300">{sigmaThreshold.toFixed(1)}σ</strong>
            </div>
            <input
              type="range"
              min="1.5"
              max="3.5"
              step="0.1"
              value={sigmaThreshold}
              onChange={(e) => setSigmaThreshold(parseFloat(e.target.value))}
              className="w-28"
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* Left: Anomaly Records Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-cyan-300 uppercase">
                DETECTED CLIMATOLOGICAL ANOMALIES ({anomalies.length})
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Baseline: NOAA WW3 & OISST v2.1 (1991–2020)
              </span>
            </div>

            {anomalies.length === 0 ? (
              <div className="p-8 rounded-2xl border border-white/10 bg-[#041a33]/40 text-center text-slate-400 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm font-medium">No statistical anomalies exceed {sigmaThreshold.toFixed(1)}σ in this category.</p>
                <p className="text-xs text-slate-500">Lower the threshold slider to view moderate climatological departures.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {anomalies.map((anom) => {
                  const isSelected = activeAnomaly?.id === anom.id;
                  return (
                    <div
                      key={anom.id}
                      onClick={() => setActiveAnomaly(anom)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500/15 shadow-lg shadow-cyan-950/50'
                          : 'border-white/10 bg-[#051c36]/70 hover:border-cyan-400/30 hover:bg-[#072442]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getParamIcon(anom.parameter)}
                          <span className="font-bold text-white text-sm">{anom.regionName}</span>
                          <span className="text-[11px] text-slate-400 font-mono">({anom.basin})</span>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold uppercase ${getSeverityBadge(anom.severity)}`}>
                          {anom.sigmaZScore.toFixed(2)}σ · {anom.severity}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-[#031122]/60 p-2 rounded-xl">
                        <div>
                          <span className="text-[10px] text-slate-400 block">OBSERVED</span>
                          <strong className="text-cyan-200">{anom.observedValue} {anom.unit}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">30-YR BASELINE</span>
                          <strong className="text-slate-300">{anom.baselineValue} {anom.unit}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">DEVIATION</span>
                          <strong className="text-amber-300">+{anom.anomalyDelta.toFixed(2)} ({((anom.anomalyDelta / anom.baselineValue) * 100).toFixed(0)}%)</strong>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <div className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          <span>{anom.timestamp}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPinAnomaly(anom);
                            onClose();
                          }}
                          className="text-cyan-400 hover:text-cyan-200 font-semibold font-mono flex items-center gap-1"
                        >
                          <span>PIN ON GLOBE</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Detailed Anomaly Inspector & Methodology */}
          {activeAnomaly && (
            <div className="p-4 sm:p-5 rounded-2xl border border-cyan-500/25 bg-[#041a33]/90 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-semibold">
                  STATISTICAL DOSSIER
                </div>
                <h3 className="text-base font-bold text-white">
                  {activeAnomaly.regionName}
                </h3>

                <div className="p-3 rounded-xl bg-[#031122] border border-cyan-500/20 font-mono text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Parameter:</span>
                    <strong className="text-cyan-200">{activeAnomaly.parameter}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Coordinates:</span>
                    <strong className="text-white">
                      {activeAnomaly.coordinates.latitude.toFixed(2)}°N, {activeAnomaly.coordinates.longitude.toFixed(2)}°E
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Standard Deviation:</span>
                    <strong className="text-amber-300">+{activeAnomaly.sigmaZScore.toFixed(2)}σ (Z-Score)</strong>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-slate-300 block">Scientific Analysis:</span>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    {activeAnomaly.description}
                  </p>
                </div>

                <div className="space-y-1 text-xs pt-2 border-t border-white/5">
                  <span className="font-semibold text-cyan-300 block flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    Detection Methodology:
                  </span>
                  <p className="text-slate-400 text-[10px] font-mono leading-relaxed">
                    {activeAnomaly.methodology}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    onPinAnomaly(activeAnomaly);
                    onClose();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border border-cyan-400 bg-cyan-500/25 hover:bg-cyan-500/35 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50"
                >
                  <MapPin className="w-4 h-4 text-cyan-300" />
                  <span>Fly Globe Camera to Anomaly</span>
                </button>

                <div className="text-[10px] text-slate-400 text-center font-mono">
                  *Statistical anomalies indicate departure from historical norms, not confirmed natural disasters.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
