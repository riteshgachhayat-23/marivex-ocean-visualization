import React, { useState } from 'react';
import { Coordinates, MaritimeIndustry, OceanObservation, OperationsThresholds } from '../types/ocean';
import { 
  INDUSTRY_CONFIGS, 
  MARITIME_OPERATIONS_STATIONS, 
  evaluateOperationsThresholds, 
  MaritimeStation 
} from '../utils/operationsData';
import { 
  ShieldAlert, 
  X, 
  Anchor, 
  Sliders, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Wind, 
  Waves, 
  Clock, 
  Compass, 
  FileText,
  Building,
  Ship,
  Fish,
  Microscope,
  Construction
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface MarineOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  oceanData: OceanObservation | null;
  coords: Coordinates | null;
  onSelectStation: (station: MaritimeStation) => void;
}

export const MarineOperationsModal: React.FC<MarineOperationsModalProps> = ({
  isOpen,
  onClose,
  oceanData,
  coords,
  onSelectStation
}) => {
  const [selectedIndustry, setSelectedIndustry] = useState<MaritimeIndustry>('offshore_wind');
  const currentIndustry = INDUSTRY_CONFIGS.find(i => i.id === selectedIndustry) || INDUSTRY_CONFIGS[0];

  const [thresholds, setThresholds] = useState<OperationsThresholds>(currentIndustry.defaultThresholds);

  // Update thresholds when industry preset changes
  const handleIndustryChange = (ind: MaritimeIndustry) => {
    setSelectedIndustry(ind);
    const cfg = INDUSTRY_CONFIGS.find(i => i.id === ind);
    if (cfg) {
      setThresholds(cfg.defaultThresholds);
    }
  };

  const alertResult = evaluateOperationsThresholds(
    oceanData,
    thresholds,
    selectedIndustry,
    oceanData?.oceanBasin || 'Current Pinned Station',
    coords || { latitude: 0, longitude: 0 }
  );

  const handleExportOperationalReport = () => {
    const doc = new jsPDF();
    doc.setFillColor(3, 17, 34);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setTextColor(0, 234, 255);
    doc.setFontSize(18);
    doc.text('MARIVEX MARINE OPERATIONS REPORT', 14, 22);

    doc.setTextColor(200, 220, 240);
    doc.setFontSize(10);
    doc.text(`Sector: ${currentIndustry.name} | Generated: ${new Date().toUTCString()}`, 14, 30);
    doc.text(`Location: ${oceanData?.oceanBasin || 'Active Globe Station'} (${coords ? `${coords.latitude.toFixed(2)}N, ${coords.longitude.toFixed(2)}E` : 'Global'})`, 14, 36);

    doc.setDrawColor(0, 200, 255);
    doc.line(14, 40, 196, 40);

    // Status Banner
    doc.setFontSize(14);
    if (alertResult.status === 'CRITICAL' || alertResult.status === 'WARNING') {
      doc.setTextColor(255, 90, 90);
    } else {
      doc.setTextColor(100, 255, 180);
    }
    doc.text(`OPERATIONAL STATUS: ${alertResult.status}`, 14, 50);

    doc.setFontSize(10);
    doc.setTextColor(240, 240, 240);
    doc.text(`Observed Wave Height: ${oceanData?.waveHeight ?? '--'} m (Threshold: ${thresholds.maxWaveHeight} m)`, 14, 62);
    doc.text(`Observed Wave Period: ${oceanData?.wavePeriod ?? '--'} s (Threshold: ${thresholds.maxWavePeriod} s)`, 14, 68);
    doc.text(`Observed Wind Speed: ${oceanData?.windSpeed ?? '--'} km/h (Threshold: ${thresholds.maxWindSpeed} km/h)`, 14, 74);
    doc.text(`Observed Current Velocity: ${oceanData?.currentSpeed ?? '--'} km/h (Threshold: ${thresholds.maxCurrentSpeed} km/h)`, 14, 80);

    doc.setTextColor(255, 200, 100);
    doc.text('ENGINEERING ASSESSMENT & RATIONALE:', 14, 94);
    doc.setTextColor(220, 230, 240);
    const splitRationale = doc.splitTextToSize(alertResult.rationale, 180);
    doc.text(splitRationale, 14, 102);

    doc.setTextColor(100, 200, 255);
    doc.text('OPERATIONAL RECOMMENDATION:', 14, 125);
    doc.setTextColor(240, 240, 240);
    const splitRec = doc.splitTextToSize(alertResult.operationalRecommendation, 180);
    doc.text(splitRec, 14, 133);

    // Standards and Disclaimer
    doc.setFontSize(8);
    doc.setTextColor(150, 170, 190);
    doc.text(`Reference Standard: ${currentIndustry.standardsRef}`, 14, 160);
    doc.text('DISCLAIMER: MARIVEX provides computational environmental threshold visualizations based on NOAA WW3 and Open-Meteo models.', 14, 170);
    doc.text('This report does not constitute a certified marine warranty survey, navigational clearance, or legal voyage authorization.', 14, 175);

    doc.save(`MARIVEX_Operations_${selectedIndustry}_${Date.now()}.pdf`);
  };

  if (!isOpen) return null;

  const getIndustryIcon = (id: MaritimeIndustry) => {
    switch (id) {
      case 'offshore_wind': return <Wind className="w-4 h-4 text-cyan-400" />;
      case 'marine_transport': return <Ship className="w-4 h-4 text-blue-400" />;
      case 'commercial_fishing': return <Fish className="w-4 h-4 text-emerald-400" />;
      case 'ocean_research': return <Microscope className="w-4 h-4 text-purple-400" />;
      case 'coastal_engineering': return <Construction className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-cyan-500/30 bg-[#031122] text-slate-100 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-[#041933]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase block">
                MARITIME DECISION SUPPORT
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Marine Operations Mode
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Industry Preset Selector */}
          <div>
            <label className="text-xs font-mono uppercase text-slate-400 font-bold block mb-2">
              Select Maritime Sector
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {INDUSTRY_CONFIGS.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => handleIndustryChange(ind.id)}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all text-center ${
                    selectedIndustry === ind.id
                      ? 'border-cyan-400 bg-cyan-500/25 text-white font-bold shadow-lg shadow-cyan-950/60'
                      : 'border-white/10 bg-[#051c36] text-slate-300 hover:border-cyan-400/40 hover:bg-[#072442]'
                  }`}
                >
                  {getIndustryIcon(ind.id)}
                  <span className="text-[11px] leading-tight">{ind.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {currentIndustry.categoryDescription}
            </p>
          </div>

          {/* Quick Select Global Maritime Stations */}
          <div>
            <label className="text-xs font-mono uppercase text-slate-400 font-bold block mb-2">
              Inspect Operational Maritime Hubs
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MARITIME_OPERATIONS_STATIONS.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => {
                    onSelectStation(station);
                  }}
                  className="p-2.5 rounded-xl border border-cyan-500/20 bg-[#051c36]/80 hover:bg-[#082a50] hover:border-cyan-400 text-left transition-all group"
                >
                  <div className="text-xs font-bold text-cyan-200 group-hover:text-cyan-100 truncate">
                    {station.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {station.region} ({station.coordinates.latitude.toFixed(1)}°, {station.coordinates.longitude.toFixed(1)}°)
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Status Card & Evaluation */}
          <div className={`p-4 sm:p-5 rounded-2xl border ${
            alertResult.status === 'CRITICAL'
              ? 'border-red-500/50 bg-red-950/30'
              : alertResult.status === 'WARNING'
                ? 'border-amber-500/50 bg-amber-950/30'
                : alertResult.status === 'ADVISORY'
                  ? 'border-cyan-500/50 bg-cyan-950/30'
                  : 'border-emerald-500/50 bg-emerald-950/30'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                {alertResult.status === 'OPTIMAL' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : (
                  <AlertTriangle className={`w-6 h-6 ${alertResult.status === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`} />
                )}
                <div>
                  <div className="text-[10px] font-mono tracking-widest uppercase font-semibold text-slate-400">
                    REAL-TIME EVALUATION
                  </div>
                  <div className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>{alertResult.locationName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono uppercase font-bold ${
                      alertResult.status === 'CRITICAL' ? 'bg-red-500 text-white' :
                      alertResult.status === 'WARNING' ? 'bg-amber-500 text-black' :
                      alertResult.status === 'ADVISORY' ? 'bg-cyan-500 text-black' : 'bg-emerald-500 text-black'
                    }`}>
                      {alertResult.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="font-mono text-xs text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>{oceanData?.time || 'Current UTC'}</span>
              </div>
            </div>

            {/* Rationale and Recommendations */}
            <div className="mt-3 space-y-2 text-xs">
              <div className="text-slate-200">
                <strong className="text-white block font-semibold mb-0.5">Rationale:</strong>
                <p className="text-slate-300 leading-relaxed">{alertResult.rationale}</p>
              </div>
              <div className="text-slate-200 pt-2 border-t border-white/5">
                <strong className="text-cyan-300 block font-semibold mb-0.5">Operational Guidance:</strong>
                <p className="text-cyan-100 leading-relaxed font-mono text-[11px]">{alertResult.operationalRecommendation}</p>
              </div>
            </div>
          </div>

          {/* Configurable Threshold Sliders */}
          <div className="p-4 sm:p-5 rounded-2xl border border-cyan-500/20 bg-[#041a33]/70 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-cyan-300 uppercase flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                Configure Parameter Thresholds
              </span>
              <button
                type="button"
                onClick={() => setThresholds(currentIndustry.defaultThresholds)}
                className="text-[11px] text-slate-400 hover:text-cyan-300 underline font-mono"
              >
                Reset to {currentIndustry.name} Defaults
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Max Wave Height */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-300">Max Significant Wave Height (Thgt):</span>
                  <strong className="text-cyan-300">{thresholds.maxWaveHeight.toFixed(1)} m</strong>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="8.0"
                  step="0.1"
                  value={thresholds.maxWaveHeight}
                  onChange={(e) => setThresholds({ ...thresholds, maxWaveHeight: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <span className="text-[10px] text-slate-400 block">Observed: {oceanData?.waveHeight ?? '--'} m</span>
              </div>

              {/* Max Wave Period */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-300">Max Wave Period Surge Limit (Tper):</span>
                  <strong className="text-cyan-300">{thresholds.maxWavePeriod.toFixed(1)} s</strong>
                </div>
                <input
                  type="range"
                  min="6.0"
                  max="20.0"
                  step="0.5"
                  value={thresholds.maxWavePeriod}
                  onChange={(e) => setThresholds({ ...thresholds, maxWavePeriod: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <span className="text-[10px] text-slate-400 block">Observed: {oceanData?.wavePeriod ?? '--'} s</span>
              </div>

              {/* Max Wind Speed */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-300">Max Wind Speed Limit:</span>
                  <strong className="text-cyan-300">{thresholds.maxWindSpeed.toFixed(0)} km/h</strong>
                </div>
                <input
                  type="range"
                  min="15"
                  max="100"
                  step="1"
                  value={thresholds.maxWindSpeed}
                  onChange={(e) => setThresholds({ ...thresholds, maxWindSpeed: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <span className="text-[10px] text-slate-400 block">Observed: {oceanData?.windSpeed ?? '--'} km/h</span>
              </div>

              {/* Max Current Velocity */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-300">Max Current Velocity Limit:</span>
                  <strong className="text-cyan-300">{thresholds.maxCurrentSpeed.toFixed(1)} km/h</strong>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="6.0"
                  step="0.1"
                  value={thresholds.maxCurrentSpeed}
                  onChange={(e) => setThresholds({ ...thresholds, maxCurrentSpeed: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <span className="text-[10px] text-slate-400 block">Observed: {oceanData?.currentSpeed ?? '--'} km/h</span>
              </div>
            </div>
          </div>

          {/* Official Disclaimer Banner */}
          <div className="p-3.5 rounded-xl border border-white/10 bg-white/5 text-[11px] text-slate-400 space-y-1">
            <strong className="text-slate-300 font-semibold block">Regulatory & Operational Notice:</strong>
            <p>
              MARIVEX threshold alerts and visualizations are computational decision-support tools built upon NOAA WaveWatch III model assimilation and GEBCO bathymetry. This platform does not certify vessel seaworthiness, legal marine safety compliance, or official port captaincy clearances. Professional mariners must consult official WMO/IMO maritime safety broadcasts.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-cyan-500/20 bg-[#041933]/80">
          <div className="text-xs text-slate-400 font-mono">
            Standard: {currentIndustry.standardsRef}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportOperationalReport}
              className="px-4 py-2 rounded-xl border border-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-bold transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Operations Report (PDF)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
