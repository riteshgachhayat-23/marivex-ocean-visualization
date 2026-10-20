import React from 'react';
import { ContinentFeature, OceanRegion } from '../types/ocean';
import { Compass, Waves, ArrowRight, X, Anchor } from 'lucide-react';

interface ContinentOceanModalProps {
  continent: ContinentFeature | null;
  onClose: () => void;
  onSelectRegion: (region: OceanRegion) => void;
}

export const ContinentOceanModal: React.FC<ContinentOceanModalProps> = ({
  continent,
  onClose,
  onSelectRegion
}) => {
  if (!continent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-cyan-500/35 bg-[#041427] text-slate-100 shadow-2xl p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
          <Compass className="w-4 h-4 text-cyan-300" />
          <span>CONTINENTAL EXPLORATION</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {continent.name}
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed mb-5">
          Select a surrounding oceanic basin to inspect its real-time wave dynamics, NOAA WW3 parameters, bathymetric trenches, and subsurface strata.
        </p>

        <div className="space-y-3.5">
          {continent.surroundingOceans.map((region) => (
            <div
              key={region.id}
              className="p-4 rounded-xl border border-cyan-500/25 bg-[#071f37]/70 hover:bg-[#082645] hover:border-cyan-400/50 transition-all group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-200 transition-colors flex items-center gap-2">
                    <Waves className="w-4 h-4 text-cyan-400" />
                    <span>{region.name}</span>
                  </h3>
                  <div className="text-[11px] text-cyan-400 font-mono mt-0.5">
                    {region.parentBasin} · {region.areaSqKm}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSelectRegion(region);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-cyan-400 text-black hover:bg-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 shadow-md shadow-cyan-500/20"
                >
                  <span>Explore Region</span>
                  <ArrowRight className="w-3.5 h-3.5 text-black" />
                </button>
              </div>

              <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-3">
                {region.overview}
              </p>

              {/* Geographic boundaries & landmarks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-white/5">
                <div>
                  <span className="text-slate-400 block text-[10px] font-mono">BOUNDARIES:</span>
                  <span className="text-slate-200 font-mono">
                    Lat: {region.bounds.minLat}° to {region.bounds.maxLat}° · Lon: {region.bounds.minLon}° to {region.bounds.maxLon}°
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] font-mono">MAX SEABED DEPTH:</span>
                  <span className="text-cyan-300 font-mono font-semibold">
                    {region.maxDepth.toLocaleString()} meters
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Anchor className="w-3 h-3 text-cyan-400" />
                  Key Landmarks:
                </span>
                {region.nearbyLandmarks.slice(0, 3).map((landmark, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-200 border border-cyan-400/20"
                  >
                    {landmark}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
