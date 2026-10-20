import React, { useState } from 'react';
import { TimeSeriesPoint } from '../types/ocean';
import { Activity, Wind, Waves } from 'lucide-react';

interface WaveTimeSeriesChartProps {
  timeSeries: TimeSeriesPoint[];
  currentHour: number;
  onSelectHour: (hour: number) => void;
  oceanName: string;
}

export const WaveTimeSeriesChart: React.FC<WaveTimeSeriesChartProps> = ({
  timeSeries,
  currentHour,
  onSelectHour,
  oceanName
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!timeSeries || timeSeries.length === 0) return null;

  const width = 640;
  const height = 180;
  const padding = { top: 20, right: 25, bottom: 28, left: 38 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxWave = Math.max(4.0, ...timeSeries.map((d) => d.waveHeight)) * 1.15;
  const minWave = 0;

  // Generate SVG path for wave height line
  const points = timeSeries.map((d, i) => {
    const x = padding.left + (i / (timeSeries.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - ((d.waveHeight - minWave) / (maxWave - minWave)) * plotHeight;
    return { x, y, data: d, index: i };
  });

  const pathD = points.reduce((acc, curr, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }, '');

  // Area under line
  const areaD = `${pathD} L ${padding.left + plotWidth} ${padding.top + plotHeight} L ${padding.left} ${padding.top + plotHeight} Z`;

  const activeIdx = hoveredIdx !== null ? hoveredIdx : timeSeries.findIndex((p) => p.hour === currentHour);
  const activePt = activeIdx >= 0 && activeIdx < points.length ? points[activeIdx] : points[0];

  return (
    <div className="p-4 rounded-2xl border border-cyan-500/20 bg-[#04172a]/90 backdrop-blur-xl text-slate-100 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-semibold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span>NOAA WW3 SWELL & WAVE DYNAMICS PROFILE</span>
          </div>
          <h3 className="text-sm font-bold text-white mt-0.5">
            Wave Height Evolution · {oceanName}
          </h3>
        </div>

        {activePt && (
          <div className="flex items-center gap-3 text-xs font-mono bg-[#06213b] px-3 py-1.5 rounded-xl border border-cyan-500/25">
            <span className="text-slate-300">{activePt.data.time}</span>
            <span className="text-cyan-300 font-bold flex items-center gap-1">
              <Waves className="w-3.5 h-3.5 text-cyan-400" />
              {activePt.data.waveHeight}m
            </span>
            <span className="text-slate-300 flex items-center gap-1">
              <Wind className="w-3.5 h-3.5 text-slate-400" />
              {activePt.data.windSpeed} km/h
            </span>
          </div>
        )}
      </div>

      {/* SVG Line Chart */}
      <div className="w-full overflow-x-auto select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto cursor-crosshair"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00eaff" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#00eaff" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines & labels */}
          {[0, maxWave * 0.33, maxWave * 0.66, maxWave].map((val, idx) => {
            const y = padding.top + plotHeight - ((val - minWave) / (maxWave - minWave)) * plotHeight;
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(0, 234, 255, 0.08)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="rgba(180, 210, 230, 0.6)"
                  fontFamily="monospace"
                >
                  {val.toFixed(1)}m
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaD} fill="url(#waveGradient)" />

          {/* Primary wave height curve */}
          <path d={pathD} fill="none" stroke="#00eaff" strokeWidth="2.2" strokeLinecap="round" />

          {/* Hover / Current indicator line */}
          {activePt && (
            <g>
              <line
                x1={activePt.x}
                y1={padding.top}
                x2={activePt.x}
                y2={padding.top + plotHeight}
                stroke="#63ffba"
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />
              <circle cx={activePt.x} cy={activePt.y} r="4.5" fill="#63ffba" stroke="#031122" strokeWidth="2" />
            </g>
          )}

          {/* Interactive touch/hover invisible strips */}
          {points.map((pt, idx) => {
            const stripWidth = plotWidth / points.length;
            return (
              <rect
                key={idx}
                x={pt.x - stripWidth / 2}
                y={padding.top}
                width={stripWidth}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(idx)}
                onClick={() => onSelectHour(pt.data.hour)}
                className="cursor-pointer"
              />
            );
          })}

          {/* X Axis Time Labels */}
          {points.filter((_, idx) => idx % Math.ceil(points.length / 6) === 0).map((pt, idx) => (
            <text
              key={idx}
              x={pt.x}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(180, 210, 230, 0.6)"
              fontFamily="monospace"
            >
              {pt.data.time}
            </text>
          ))}
        </svg>
      </div>

      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 font-mono">
        <span>Click any timestamp to fly time horizon</span>
        <span>NOAA WaveWatch III · ERDDAP Thgt/Tper Grid</span>
      </div>
    </div>
  );
};
