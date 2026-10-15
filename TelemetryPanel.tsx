import React, { useState } from 'react';
import { Coordinates, OceanObservation, OceanParameter } from '../types/ocean';
import { getPelagicZone } from '../utils/oceanData';
import { Compass, Waves, Droplets, Thermometer, Gauge, Wind, Clock, Radio, Activity, Mountain } from 'lucide-react';

interface TelemetryPanelProps {
  selectedCoords: Coordinates | null;
  depth: number;
  oceanData: OceanObservation | null;
  isLoading: boolean;
  activeParam: OceanParameter;
}

function getCardinalDirection(deg: number | null | undefined): string {
  if (deg === null || deg === undefined) return '--';
  const val = Math.floor((deg / 22.5) + 0.5);
  const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return arr[val % 16];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  selectedCoords,
  depth,
  oceanData,
  isLoading,
  activeParam
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'stratum'>('live');
  const currentZone = getPelagicZone(depth);

  const getMetricDisplay = () => {
    if (isLoading) {
      return { value: '...', unit: '', assessment: 'Querying high-resolution ocean grid...' };
    }
    if (!oceanData) {
      return { value: '--', unit: '', assessment: 'Awaiting ocean coordinate selection' };
    }

    switch (activeParam) {
      case 'Temperature': {
        const val = oceanData.temperature;
        const fahrenheit = val !== null ? (val * 9/5 + 32).toFixed(1) : '--';
        let assessment = 'Temperate oceanic range';
        if (val !== null) {
          if (val > 25) assessment = 'Tropical / high surface insolation layer';
          else if (val > 15) assessment = 'Subtropical seasonal thermocline';
          else if (val > 5) assessment = 'Mesopelagic transitional layer';
          else assessment = 'Abyssal deep-water near-freezing baseline';
        }
        return {
          value: val !== null ? `${val.toFixed(2)}` : '--',
          unit: `°C (${fahrenheit}°F)`,
          assessment
        };
      }
      case 'Salinity': {
        const val = oceanData.salinity;
        let assessment = 'Standard seawater salinity';
        if (val !== null) {
          if (val > 37) assessment = 'High evaporation subtropical gyre / marginal sea';
          else if (val < 33) assessment = 'Low salinity polar meltwater or freshwater plume';
          else assessment = 'Stable deep ocean halocline equilibrium (34.7 PSU)';
        }
        return {
          value: val !== null ? `${val.toFixed(2)}` : '--',
          unit: 'PSU',
          assessment
        };
      }
      case 'Current Speed': {
        const val = oceanData.currentSpeed;
        const knots = val !== null ? (val * 0.539957).toFixed(2) : '--';
        let assessment = 'Moderate ocean drift';
        if (val !== null) {
          if (val > 4) assessment = 'Strong boundary jet (e.g. Gulf Stream / Kuroshio)';
          else if (val < 0.5) assessment = 'Sluggish abyssal thermohaline creep';
          else assessment = 'Standard wind-driven surface circulation';
        }
        return {
          value: val !== null ? `${val.toFixed(2)}` : '--',
          unit: `km/h (${knots} kts)`,
          assessment
        };
      }
      case 'Current Direction': {
        const val = oceanData.currentDirection;
        return {
          value: val !== null ? `${val}°` : '--',
          unit: 'True North Bearing',
          assessment: `Heading vector towards azimuth ${val ?? 0}° (${getCardinalDirection(val)})`
        };
      }
      case 'Wave Height': {
        const val = oceanData.waveHeight;
        return {
          value: val !== null ? `${val.toFixed(2)}` : '--',
          unit: 'meters (Thgt)',
          assessment: `${oceanData.wavePeriod ?? 7}s peak swell period`
        };
      }
      case 'Bathymetry': {
        const val = oceanData.bathymetryDepth;
        return {
          value: `${val.toLocaleString()}`,
          unit: 'meters (GEBCO Seafloor)',
          assessment: `Subsea ocean trench / abyssal floor plain`
        };
      }
      default:
        return { value: '--', unit: '', assessment: '' };
    }
  };

  const metric = getMetricDisplay();

  return (
    <div className="flex flex-col gap-3.5 p-4 sm:p-5 rounded-2xl border border-cyan-500/20 bg-[#061527]/90 backdrop-blur-xl text-slate-100 shadow-2xl">
      {/* Header & Tab Selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-semibold">
            TELEMETRY MATRIX
          </div>
          {/* Live Data Distinction Badge */}
          {oceanData && (
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1.5 ${
                oceanData.dataSourceType === 'LIVE_OBSERVATION'
                  ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                  : oceanData.dataSourceType === 'HISTORICAL_REANALYSIS'
                    ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                    : 'border-cyan-400/40 bg-cyan-500/20 text-cyan-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  oceanData.dataSourceType === 'LIVE_OBSERVATION'
                    ? 'bg-emerald-400'
                    : oceanData.dataSourceType === 'HISTORICAL_REANALYSIS'
                      ? 'bg-amber-400'
                      : 'bg-cyan-400'
                }`}
              />
              {oceanData.dataSourceType === 'LIVE_OBSERVATION'
                ? 'LIVE OBSERVATION'
                : oceanData.dataSourceType === 'HISTORICAL_REANALYSIS'
                  ? 'HISTORICAL REANALYSIS'
                  : 'MODEL FORECAST'}
            </span>
          )}
        </div>

        {/* View Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#041a30] border border-cyan-500/20 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className={`py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-center ${
              activeTab === 'live'
                ? 'bg-cyan-400 text-black font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Conditions</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stratum')}
            className={`py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-center ${
              activeTab === 'stratum'
                ? 'bg-cyan-400 text-black font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Mountain className="w-3.5 h-3.5" />
            <span>Stratum & Seabed</span>
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE OCEAN CONDITIONS DASHBOARD (FEATURE 2) */}
      {activeTab === 'live' && (
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-xl border border-cyan-500/25 bg-gradient-to-br from-[#072442] to-[#041527] flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-cyan-300 font-mono block">CURRENT LOCATION</span>
              <strong className="text-white text-sm font-bold">
                {oceanData?.oceanBasin || 'Global Oceanic Grid'}
              </strong>
            </div>
            {oceanData?.time && (
              <div className="text-right font-mono text-[11px] text-slate-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>{oceanData.time}</span>
              </div>
            )}
          </div>

          {/* Condition Parameters Grid */}
          <div className="space-y-2 text-xs">
            {/* Significant wave height */}
            <div className="p-2.5 rounded-xl border border-cyan-500/15 bg-[#041b32] flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-cyan-400" />
                  Significant Wave Height (Thgt)
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Wave height in metres</span>
              </div>
              <strong className="font-mono text-base text-cyan-200">
                {oceanData?.waveHeight !== null && oceanData?.waveHeight !== undefined
                  ? `${oceanData.waveHeight.toFixed(2)} m`
                  : '--'}
              </strong>
            </div>

            {/* Wave period */}
            <div className="p-2.5 rounded-xl border border-cyan-500/15 bg-[#041b32] flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Wave Period (Tper)
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Time between successive waves, in seconds</span>
              </div>
              <strong className="font-mono text-base text-cyan-200">
                {oceanData?.wavePeriod !== null && oceanData?.wavePeriod !== undefined
                  ? `${oceanData.wavePeriod.toFixed(1)} s`
                  : '--'}
              </strong>
            </div>

            {/* Wave direction */}
            <div className="p-2.5 rounded-xl border border-cyan-500/15 bg-[#041b32] flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  Wave Direction (Tdir)
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Direction waves are travelling from</span>
              </div>
              <div className="text-right">
                <strong className="font-mono text-sm text-cyan-200 block">
                  {oceanData?.waveDirection !== null && oceanData?.waveDirection !== undefined
                    ? `${oceanData.waveDirection}° ${getCardinalDirection(oceanData.waveDirection)}`
                    : '--'}
                </strong>
              </div>
            </div>

            {/* Wind speed */}
            <div className="p-2.5 rounded-xl border border-cyan-500/15 bg-[#041b32] flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-cyan-400" />
                  Wind Speed
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Wind conditions over the ocean</span>
              </div>
              <div className="text-right">
                <strong className="font-mono text-sm text-cyan-200 block">
                  {oceanData?.windSpeed !== null && oceanData?.windSpeed !== undefined
                    ? `${oceanData.windSpeed.toFixed(1)} km/h`
                    : '--'}
                </strong>
                {oceanData?.windSpeed !== null && oceanData?.windSpeed !== undefined && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {(oceanData.windSpeed * 0.539957).toFixed(1)} kts
                  </span>
                )}
              </div>
            </div>

            {/* Sea surface temperature */}
            <div className="p-2.5 rounded-xl border border-cyan-500/15 bg-[#041b32] flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
                  Sea Surface Temperature
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Temperature of the ocean surface</span>
              </div>
              <div className="text-right">
                <strong className="font-mono text-sm text-cyan-200 block">
                  {oceanData?.temperature !== null && oceanData?.temperature !== undefined
                    ? `${oceanData.temperature.toFixed(2)} °C`
                    : '--'}
                </strong>
                {oceanData?.temperature !== null && oceanData?.temperature !== undefined && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {(oceanData.temperature * 9/5 + 32).toFixed(1)} °F
                  </span>
                )}
              </div>
            </div>

            {/* Ocean currents */}
            <div className="p-2.5 rounded-xl border border-cyan-500/15 bg-[#041b32] flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  Ocean Currents
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Direction and speed of water movement</span>
              </div>
              <div className="text-right">
                <strong className="font-mono text-sm text-cyan-200 block">
                  {oceanData?.currentSpeed !== null && oceanData?.currentSpeed !== undefined
                    ? `${oceanData.currentSpeed.toFixed(2)} km/h`
                    : '--'}
                </strong>
                <span className="text-[10px] text-slate-400 font-mono">
                  heading {oceanData?.currentDirection ?? 0}° ({getCardinalDirection(oceanData?.currentDirection)})
                </span>
              </div>
            </div>

            {/* Water depth */}
            <div className="p-2.5 rounded-xl border border-cyan-500/15 bg-[#041b32] flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Mountain className="w-3.5 h-3.5 text-cyan-400" />
                  Water Depth (Seafloor)
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Retrieved from GEBCO 2024 bathymetry</span>
              </div>
              <strong className="font-mono text-base text-cyan-300">
                {oceanData?.bathymetryDepth !== undefined
                  ? `${oceanData.bathymetryDepth.toLocaleString()} m`
                  : '--'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSURFACE STRATUM & BENTHIC REALM */}
      {activeTab === 'stratum' && (
        <div className="flex flex-col gap-3">
          {/* Primary Focused Metric Card */}
          <div className="relative p-3.5 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-[#08233d] to-[#041627] overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-400 to-blue-600" />
            <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
              {activeParam} Focus
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-cyan-50 tabular-nums">
                {metric.value}
              </span>
              <span className="text-xs text-cyan-400 font-medium">
                {metric.unit}
              </span>
            </div>
            <div className="text-[11px] text-slate-300 mt-1.5 line-clamp-2">
              {metric.assessment}
            </div>
          </div>

          {/* Subsurface Stratum Parameters */}
          <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-[#041a30] text-xs space-y-2">
            <div className="text-[10px] font-mono tracking-wider text-cyan-400 uppercase font-semibold mb-2">
              DEPTH STRATIFICATION ({depth}m)
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
                Stratum Temperature
              </span>
              <strong className="font-mono text-cyan-100 tabular-nums">
                {oceanData?.temperature !== null && oceanData?.temperature !== undefined
                  ? `${oceanData.temperature.toFixed(2)} °C`
                  : '--'}
              </strong>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                Practical Salinity
              </span>
              <strong className="font-mono text-cyan-100 tabular-nums">
                {oceanData?.salinity !== null && oceanData?.salinity !== undefined
                  ? `${oceanData.salinity.toFixed(2)} PSU`
                  : '--'}
              </strong>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Hydrostatic Pressure
              </span>
              <strong className="font-mono text-cyan-100 tabular-nums">
                {oceanData?.pressure !== null && oceanData?.pressure !== undefined
                  ? `${oceanData.pressure.toFixed(1)} dbar`
                  : '--'}
              </strong>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Waves className="w-3.5 h-3.5 text-cyan-400" />
                Seawater Density
              </span>
              <strong className="font-mono text-cyan-100 tabular-nums">
                {oceanData?.density !== null && oceanData?.density !== undefined
                  ? `${oceanData.density.toFixed(2)} kg/m³`
                  : '--'}
              </strong>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Dissolved Oxygen</span>
              <strong className="font-mono text-cyan-100 tabular-nums">
                {oceanData?.dissolvedOxygen !== null && oceanData?.dissolvedOxygen !== undefined
                  ? `${oceanData.dissolvedOxygen.toFixed(2)} mg/L`
                  : '--'}
              </strong>
            </div>
          </div>

          {/* Accurate Benthic Seabed Card */}
          {oceanData?.seabedInfo && (
            <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-[#041a30] text-xs space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-cyan-400 uppercase font-semibold mb-1">
                <span>SEABED & BENTHIC REALM</span>
                <span className="text-cyan-200">
                  {Math.max(0, oceanData.bathymetryDepth - depth) <= 50 ? '● AT BENTHOS' : `${Math.max(0, oceanData.bathymetryDepth - depth).toLocaleString()}m ALT`}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">MORPHOLOGY</span>
                <strong className="font-mono text-cyan-200 truncate max-w-[150px]">
                  {oceanData.seabedInfo.morphologyLabel}
                </strong>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">SEDIMENT</span>
                <strong className="font-mono text-cyan-300 text-[11px] truncate max-w-[160px]">
                  {oceanData.seabedInfo.sedimentType}
                </strong>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">BOTTOM PRESSURE</span>
                <strong className="font-mono text-cyan-100">
                  {oceanData.seabedInfo.benthicPressure} dbar
                </strong>
              </div>

              <div className="pt-1">
                <span className="text-[10px] text-slate-400 block mb-1">TECTONIC FRAMEWORK:</span>
                <p className="text-[11px] text-slate-300 leading-tight">
                  {oceanData.seabedInfo.tectonicPlate}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected Geographic Location Card */}
      {selectedCoords ? (
        <div className="p-3 rounded-xl border border-cyan-500/20 bg-[#041a30] text-xs space-y-1.5">
          <div className="text-[10px] font-mono tracking-wider text-cyan-400 uppercase font-semibold mb-1">
            GEOGRAPHIC POSITION
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-slate-400">LAT / LON</span>
            <strong className="font-mono text-cyan-100">
              {selectedCoords.latitude >= 0 ? `${selectedCoords.latitude.toFixed(4)}° N` : `${Math.abs(selectedCoords.latitude).toFixed(4)}° S`},{' '}
              {selectedCoords.longitude >= 0 ? `${selectedCoords.longitude.toFixed(4)}° E` : `${Math.abs(selectedCoords.longitude).toFixed(4)}° W`}
            </strong>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-slate-400">STRATUM ZONE</span>
            <strong className="font-mono text-cyan-300">
              {currentZone.name} ({depth}m)
            </strong>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-dashed border-cyan-500/30 bg-[#041a30]/50 text-center text-xs text-slate-400">
          Click anywhere on the 3D Ocean Globe to inspect live telemetry.
        </div>
      )}

      {/* Data Source & Verification Footer */}
      <div className="text-[11px] text-slate-400 p-3 rounded-xl bg-[#031322] border border-cyan-500/10">
        <div className="text-[10px] font-mono text-cyan-400 font-semibold mb-1 flex items-center gap-1.5">
          <Radio className="w-3 h-3 text-cyan-400" />
          <span>DATA INTEGRATION & ATTRIBUTION</span>
        </div>
        <p className="leading-relaxed text-[10px]">
          Waves & Currents: <span className="text-slate-200">NOAA WaveWatch III (WW3 via ERDDAP) & Open-Meteo High-Res</span>
        </p>
        <p className="leading-relaxed text-[10px]">
          Bathymetry: <span className="text-slate-200">GEBCO 2024 Global Subsea Grid</span>
        </p>
        <p className="leading-relaxed text-[10px]">
          Physics: <span className="text-slate-200">UNESCO EOS-80 & NOAA World Ocean Atlas</span>
        </p>
      </div>
    </div>
  );
};
