import React from 'react';
import { X, BookOpen, Layers, ShieldCheck } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#06172a] text-slate-100 shadow-2xl p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
          <BookOpen className="w-4 h-4" />
          <span>SCIENTIFIC FOUNDATIONS</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">
          Oceanic Models & Attribution
        </h2>

        <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-[#08223a] border border-cyan-500/20">
            <div className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Open-Meteo Marine Global Model</span>
            </div>
            <p className="text-slate-400">
              Provides real-time wave heights, swell direction, peak wave period, and surface ocean current velocity vectors derived from operational marine weather forecasting centers.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#08223a] border border-cyan-500/20">
            <div className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>NOAA World Ocean Atlas (WOA)</span>
            </div>
            <p className="text-slate-400">
              Supplies objectively analyzed climatological fields for in-situ temperature, practical salinity, and dissolved oxygen profiles across standardized vertical depth horizons.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#08223a] border border-cyan-500/20">
            <div className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>UNESCO EOS-80 Seawater State Formulation</span>
            </div>
            <p className="text-slate-400">
              Computes seawater density, hydrostatic pressure, and compressibility according to the International Equation of State of Seawater standard adopted by SCOR and IAPSO.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#08223a] border border-cyan-500/20">
            <div className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Analytical Thermocline Decay Profiles</span>
            </div>
            <p className="text-slate-400">
              Smooth continuous mathematical formulations model the transitional pycnocline layer between the sunlit epipelagic zone (0-200m) and the abyssal baseline (~2.0°C).
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 text-xs font-semibold hover:bg-cyan-500/30 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
