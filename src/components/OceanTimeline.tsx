import React, { useEffect, useState } from 'react';
import { HistoricalStormPreset, TimeSeriesPoint } from '../types/ocean';
import { HISTORICAL_STORMS } from '../utils/oceanRegions';
import { Play, Pause, RotateCcw, Clock, Zap, ChevronLeft, ChevronRight } from 'lucide-react';

interface OceanTimelineProps {
  currentHour: number;
  onHourChange: (hour: number) => void;
  selectedStorm: HistoricalStormPreset | null;
  onSelectStorm: (storm: HistoricalStormPreset | null) => void;
  timeSeries: TimeSeriesPoint[];
}

export const OceanTimeline: React.FC<OceanTimelineProps> = ({
  currentHour,
  onHourChange,
  selectedStorm,
  onSelectStorm,
  timeSeries
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      onHourChange((currentHour + 1) % 24);
    }, 1100);
    return () => clearInterval(interval);
  }, [isPlaying, currentHour, onHourChange]);

  const currentPoint = timeSeries.find((pt) => pt.hour === currentHour) || timeSeries[0];

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl border border-cyan-500/20 bg-[#05162a]/90 backdrop-blur-xl text-slate-100 shadow-xl flex flex-col gap-3">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase">
            TEMPORAL TIME TRAVEL & STORM EVOLUTION
          </span>
          {selectedStorm && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 font-mono font-semibold flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              HISTORICAL REANALYSIS
            </span>
          )}
        </div>

        {/* Historical Storm Mode Selector */}
        <div className="flex items-center gap-2">
          <select
            aria-label="Select Historical Storm"
            value={selectedStorm?.id || 'live'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'live') {
                onSelectStorm(null);
              } else {
                const storm = HISTORICAL_STORMS.find((s) => s.id === val);
                if (storm) onSelectStorm(storm);
              }
            }}
            className="text-xs bg-[#0b253d] border border-cyan-500/30 rounded-lg px-2.5 py-1 text-cyan-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="live">● Real-Time Global Marine Observation</option>
            {HISTORICAL_STORMS.map((storm) => (
              <option key={storm.id} value={storm.id}>
                ⚡ {storm.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Storm description callout if active */}
      {selectedStorm && (
        <div className="text-[11px] text-amber-100/90 p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 leading-relaxed">
          <strong>{selectedStorm.name}:</strong> {selectedStorm.description} Peak wave height:{' '}
          <span className="font-bold text-amber-300 font-mono">{selectedStorm.peakWaveHeight}m</span> · Peak winds:{' '}
          <span className="font-bold text-amber-300 font-mono">{selectedStorm.peakWindSpeed} km/h</span>.
        </div>
      )}

      {/* Timeline Controls & Scrubber */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onHourChange((currentHour - 1 + 24) % 24)}
          title="Previous Hour"
          className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-cyan-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? 'Pause Animation' : 'Play Marine Wave Evolution'}
          className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors ${
            isPlaying
              ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200'
              : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <button
          type="button"
          onClick={() => onHourChange((currentHour + 1) % 24)}
          title="Next Hour"
          className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-cyan-300 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Scrubber Track */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>00:00 UTC</span>
            <span className="text-cyan-300 font-bold">
              {String(currentHour).padStart(2, '0')}:00 UTC
            </span>
            <span>23:00 UTC</span>
          </div>
          <input
            type="range"
            min="0"
            max="23"
            step="1"
            value={currentHour}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="w-full cursor-pointer accent-cyan-400"
          />
        </div>

        {/* Current Condition Micro-Card */}
        {currentPoint && (
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#041a30] border border-cyan-500/20 text-xs font-mono">
            <div>
              <span className="text-[9px] text-slate-400 block">WAVE (Hs)</span>
              <strong className="text-cyan-300 font-bold">{currentPoint.waveHeight}m</strong>
            </div>
            <div>
              <span className="text-[9px] text-slate-400 block">PERIOD (Tper)</span>
              <strong className="text-slate-200">{currentPoint.wavePeriod}s</strong>
            </div>
            <div>
              <span className="text-[9px] text-slate-400 block">WIND SPEED</span>
              <strong className="text-cyan-300">{currentPoint.windSpeed} km/h</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
