/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Coordinates,
  OceanObservation,
  OceanParameter,
  PresetLocation,
  ContinentFeature,
  OceanRegion,
  HistoricalStormPreset,
  OceanDataLayerId,
  OceanAnomalyRecord
} from './types/ocean';
import { fetchOceanData, PRESET_LOCATIONS } from './utils/oceanData';
import { CONTINENTS, HISTORICAL_STORMS } from './utils/oceanRegions';
import { Header } from './components/Header';
import { OceanGlobe } from './components/OceanGlobe';
import { ControlPanel } from './components/ControlPanel';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ResearchModal } from './components/ResearchModal';
import { AboutModal } from './components/AboutModal';
import { ContinentOceanModal } from './components/ContinentOceanModal';
import { OceanTimeline } from './components/OceanTimeline';
import { WaveTimeSeriesChart } from './components/WaveTimeSeriesChart';
import { MarineOperationsModal } from './components/MarineOperationsModal';
import { AnomalyDetectionModal } from './components/AnomalyDetectionModal';
import { RegionComparisonModal } from './components/RegionComparisonModal';
import { BathymetricTransectModal } from './components/BathymetricTransectModal';
import { AskMarivexAssistant } from './components/AskMarivexAssistant';
import { UnderwaterBathymetryViewer } from './components/UnderwaterBathymetryViewer';
import { MaritimeStation } from './utils/operationsData';
import { 
  Globe, 
  MapPin, 
  Waves, 
  Activity, 
  Sparkles, 
  Navigation, 
  ShieldAlert, 
  AlertCircle, 
  GitCompare, 
  Mountain, 
  Bot,
  Layers
} from 'lucide-react';

export default function App() {
  // Default to Bay of Bengal / Indian Ocean region for instant high-interest exploration
  const [selectedCoords, setSelectedCoords] = useState<Coordinates | null>({
    latitude: 15.5,
    longitude: 88.0
  });
  const [depth, setDepth] = useState<number>(80);
  const [hour, setHour] = useState<number>(12);
  const [activeParam, setActiveParam] = useState<OceanParameter>('Wave Height');
  const [oceanData, setOceanData] = useState<OceanObservation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Feature 1: Continent & Surrounding Ocean Exploration
  const [activeContinent, setActiveContinent] = useState<ContinentFeature | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<OceanRegion | null>(null);

  // Feature 3: Explore Ocean Floor & Underwater Seabed 3D Bathymetry
  const [isUnderwater, setIsUnderwater] = useState<boolean>(false);
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(2.0);

  // Feature 4: Time Travel & Historical Storms
  const [selectedStorm, setSelectedStorm] = useState<HistoricalStormPreset | null>(null);

  // Feature 6: Advanced Ocean Data Layers (7 layers)
  const [activeLayer, setActiveLayer] = useState<OceanDataLayerId>('waveHeight');
  const [showVectorOverlay, setShowVectorOverlay] = useState<boolean>(true);
  const [showStreamlines, setShowStreamlines] = useState<boolean>(true);

  // Feature 7: Marine Operations Mode
  const [isOperationsModalOpen, setIsOperationsModalOpen] = useState<boolean>(false);
  const [operationsStation, setOperationsStation] = useState<MaritimeStation | null>(null);

  // Feature 8: AI-Powered "Ask MARIVEX" Assistant
  const [isAssistantOpen, setIsAssistantOpen] = useState<boolean>(false);

  // Feature 9: Ocean Anomaly Detection
  const [isAnomalyModalOpen, setIsAnomalyModalOpen] = useState<boolean>(false);
  const [pinnedAnomaly, setPinnedAnomaly] = useState<OceanAnomalyRecord | null>(null);

  // Feature 10: Region Comparison
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState<boolean>(false);

  // Feature 11: Bathymetric Transect Profiler
  const [isTransectModalOpen, setIsTransectModalOpen] = useState<boolean>(false);

  // Audio & Standard Modals
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  // Load ocean data whenever coordinates, depth, or hour changes
  const loadData = useCallback(async (coords: Coordinates, targetDepth: number, targetHour: number, storm: HistoricalStormPreset | null) => {
    setIsLoading(true);
    try {
      const data = await fetchOceanData(coords, targetDepth, targetHour);
      
      // If a historical storm is selected, overlay the storm's reanalysis wave & wind curve
      if (storm) {
        const stormPt = storm.dataSeries.find(pt => pt.hour === targetHour) || storm.dataSeries[0];
        data.waveHeight = stormPt.waveHeight;
        data.wavePeriod = stormPt.wavePeriod;
        data.waveDirection = stormPt.waveDirection;
        data.windSpeed = stormPt.windSpeed;
        data.windDirection = stormPt.windDirection;
        data.dataSourceType = 'HISTORICAL_REANALYSIS';
        data.source = `Historical Reanalysis: ${storm.name}`;
        data.timeSeries = storm.dataSeries;
        data.time = `${storm.peakDate.substring(0, 10)} ${String(targetHour).padStart(2, '0')}:00 UTC`;
      }
      
      setOceanData(data);
    } catch (err) {
      console.error('Failed to load ocean data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCoords) {
      loadData(selectedCoords, depth, hour, selectedStorm);
    }
  }, [selectedCoords, depth, hour, selectedStorm, loadData]);

  const handleSelectPreset = (preset: PresetLocation) => {
    setSelectedCoords(preset.coordinates);
    setDepth(preset.defaultDepth);
    setSelectedRegion(null);
    setPinnedAnomaly(null);
    setOperationsStation(null);
  };

  const handleSelectRegion = (region: OceanRegion) => {
    setSelectedRegion(region);
    setSelectedCoords(region.coordinates);
    setPinnedAnomaly(null);
    setOperationsStation(null);
  };

  const handleSelectContinent = (continent: ContinentFeature) => {
    setActiveContinent(continent);
  };

  const handleSelectStorm = (storm: HistoricalStormPreset | null) => {
    setSelectedStorm(storm);
    if (storm) {
      setSelectedCoords(storm.coordinates);
      setPinnedAnomaly(null);
      setOperationsStation(null);
    }
  };

  const handleSelectAnomaly = (anomaly: OceanAnomalyRecord) => {
    setPinnedAnomaly(anomaly);
    setSelectedCoords(anomaly.coordinates);
    setOperationsStation(null);
  };

  const handleSelectOperationsStation = (station: MaritimeStation) => {
    setOperationsStation(station);
    setSelectedCoords(station.coordinates);
    setPinnedAnomaly(null);
  };

  const handleFlyToTransect = (coords: Coordinates) => {
    setSelectedCoords(coords);
    setSelectedRegion(null);
    setPinnedAnomaly(null);
    setOperationsStation(null);
  };

  return (
    <div className="min-h-screen bg-[#020813] text-[#f2fbff] flex flex-col selection:bg-cyan-500/30">
      {/* Header following strict 3-zone contract with feature launchers */}
      <Header
        isPlayingAudio={isPlayingAudio}
        setIsPlayingAudio={setIsPlayingAudio}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenAboutModal={() => setIsAboutModalOpen(true)}
        onOpenOperationsModal={() => setIsOperationsModalOpen(true)}
        onOpenAnomalyModal={() => setIsAnomalyModalOpen(true)}
        onOpenComparisonModal={() => setIsComparisonModalOpen(true)}
        onOpenTransectModal={() => setIsTransectModalOpen(true)}
        onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
        isAssistantOpen={isAssistantOpen}
        isUnderwater={isUnderwater}
        onToggleUnderwater={() => setIsUnderwater(!isUnderwater)}
      />

      {/* Main Responsive 3-Column Dashboard Workspace */}
      <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-[1720px] w-full mx-auto flex flex-col gap-3 sm:gap-4">
        {/* Advanced Feature Launch Ribbon */}
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl border border-cyan-500/25 bg-[#031427]/90 backdrop-blur-md overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-cyan-300 font-bold uppercase whitespace-nowrap flex items-center gap-1 pl-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              ADVANCED SUITE:
            </span>

            {/* Explore Ocean Floor (Feature 3) */}
            <button
              type="button"
              onClick={() => setIsUnderwater(!isUnderwater)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isUnderwater
                  ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35 font-bold shadow-md shadow-emerald-950/40'
                  : 'border-cyan-400/40 bg-[#06203d] hover:bg-cyan-500/20 text-cyan-200'
              }`}
            >
              <Mountain className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isUnderwater ? 'Return to Globe' : 'Explore Ocean Floor (Feature 3)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOperationsModalOpen(true)}
              className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-[#06203d] hover:bg-cyan-500/20 text-xs font-medium text-cyan-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
              <span>Marine Operations (Feature 7)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAnomalyModalOpen(true)}
              className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-[#06203d] hover:bg-amber-500/20 text-xs font-medium text-amber-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Anomaly Detection (Feature 9)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsComparisonModalOpen(true)}
              className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-[#06203d] hover:bg-cyan-500/20 text-xs font-medium text-cyan-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
              <span>Compare Regions: Arabian vs Bengal (Feature 10)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTransectModalOpen(true)}
              className="px-2.5 py-1 rounded-lg border border-violet-500/30 bg-[#06203d] hover:bg-violet-500/20 text-xs font-medium text-violet-200 flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Mountain className="w-3.5 h-3.5 text-violet-400" />
              <span>Seafloor Transects (Feature 11)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAssistantOpen(true)}
            className="px-3 py-1 rounded-lg border border-cyan-400 bg-cyan-500/25 hover:bg-cyan-500/35 text-cyan-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-md shadow-cyan-950/40"
          >
            <Bot className="w-3.5 h-3.5 text-cyan-300" />
            <span>Ask MARIVEX AI</span>
          </button>
        </div>

        {/* Dual Quick Action Bar: Continents & Marine Hotspots */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2 sm:p-2.5 rounded-xl border border-cyan-500/20 bg-[#04162a]/80 backdrop-blur-md">
          {/* Feature 1: Explore Continents Jumper */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-mono text-cyan-300 font-bold uppercase whitespace-nowrap shrink-0 flex items-center gap-1 px-1">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              EXPLORE CONTINENT:
            </span>
            {CONTINENTS.map((cont) => (
              <button
                key={cont.id}
                type="button"
                onClick={() => handleSelectContinent(cont)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeContinent?.id === cont.id
                    ? 'border-cyan-400 bg-cyan-500/30 text-cyan-100 font-bold'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/40 hover:text-white'
                }`}
              >
                {cont.name.split(' / ')[0]}
              </button>
            ))}
          </div>

          {/* Quick Marine Hotspots */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:border-l sm:border-white/10 sm:pl-3">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold whitespace-nowrap shrink-0 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-cyan-400" />
              HOTSPOTS:
            </span>
            {PRESET_LOCATIONS.slice(0, 5).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#072442] text-cyan-200 border border-cyan-500/25 hover:border-cyan-400 hover:bg-cyan-500/20 whitespace-nowrap shrink-0 transition-colors"
              >
                {preset.name.split(' (')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(500px,1fr)_320px] gap-4 flex-1 items-stretch">
          {/* Left Column: Environmental Controls */}
          <div className="order-2 lg:order-1 flex flex-col gap-4">
            <ControlPanel
              selectedCoords={selectedCoords}
              depth={depth}
              setDepth={setDepth}
              hour={hour}
              setHour={setHour}
              activeParam={activeParam}
              setActiveParam={setActiveParam}
              oceanData={oceanData}
              isLoading={isLoading}
              onSelectPreset={handleSelectPreset}
            />
          </div>

          {/* Center Column: 3D Global Ocean & Subsurface Stage + Timeline & Wave Inspection */}
          <div className="order-1 lg:order-2 flex flex-col gap-3 min-w-0">
            {/* 3D Viewport */}
            <div className="flex flex-col rounded-2xl border border-cyan-500/20 bg-[#030e1d] overflow-hidden shadow-2xl min-h-[500px] lg:min-h-[580px] relative">
              <div className="flex-1 relative">
                {isUnderwater ? (
                  <UnderwaterBathymetryViewer
                    initialRegionId={selectedRegion?.id || 'mariana-trench'}
                    oceanName={selectedRegion?.name || oceanData?.oceanBasin || 'Ocean Floor Basin'}
                    onReturnToGlobe={() => setIsUnderwater(false)}
                  />
                ) : (
                  <OceanGlobe
                    selectedCoords={selectedCoords}
                    depth={depth}
                    oceanData={oceanData}
                    onSelectCoords={setSelectedCoords}
                    isLoading={isLoading}
                    activeParameter={activeParam}
                    activeLayer={activeLayer}
                    onSelectLayer={setActiveLayer}
                    showVectorOverlay={showVectorOverlay}
                    onToggleVectorOverlay={() => setShowVectorOverlay(!showVectorOverlay)}
                    showStreamlines={showStreamlines}
                    onToggleStreamlines={() => setShowStreamlines(!showStreamlines)}
                    pinnedAnomaly={pinnedAnomaly}
                    operationsStation={operationsStation}
                    onSetDepth={setDepth}
                    onContinentClick={handleSelectContinent}
                    selectedRegion={selectedRegion}
                    onClearRegion={() => setSelectedRegion(null)}
                    verticalExaggeration={verticalExaggeration}
                    onVerticalExaggerationChange={setVerticalExaggeration}
                    isUnderwater={isUnderwater}
                    onToggleUnderwater={setIsUnderwater}
                  />
                )}
              </div>

              {/* Viewport footer banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3 border-t border-cyan-500/15 bg-[#031122]/90 text-xs gap-1">
                <div>
                  <div className="text-[9px] font-mono tracking-widest text-cyan-400 font-semibold uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    <span>3D OCEANOGRAPHIC VIEWPORT</span>
                  </div>
                  <div className="font-bold text-white text-xs sm:text-sm">
                    {pinnedAnomaly ? `Anomaly Highlight: ${pinnedAnomaly.regionName} (${pinnedAnomaly.sigmaZScore}σ)` :
                     operationsStation ? `Operations Hub: ${operationsStation.name}` :
                     selectedRegion ? `Highlighted Region: ${selectedRegion.name}` :
                     'Global Ocean Field & Bathymetric Realm'}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-cyan-300/80">
                  <Navigation className="w-3 h-3 text-cyan-400" />
                  <span>
                    {selectedCoords
                      ? `${selectedCoords.latitude.toFixed(2)}°, ${selectedCoords.longitude.toFixed(2)}°`
                      : 'CLICK OCEAN TO PIN'}
                  </span>
                </div>
              </div>
            </div>

            {/* Feature 4: Time Travel Through Ocean Data (Timeline Scrubber) */}
            <OceanTimeline
              currentHour={hour}
              onHourChange={setHour}
              selectedStorm={selectedStorm}
              onSelectStorm={handleSelectStorm}
              timeSeries={oceanData?.timeSeries || []}
            />

            {/* Feature 5: Click Anywhere to Inspect Ocean Data & Wave Dynamics Chart */}
            {oceanData && (
              <div className="flex flex-col gap-2 p-3.5 sm:p-4 rounded-2xl border border-cyan-500/20 bg-[#04172a]/90 backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
                      FEATURE INSPECTOR: {oceanData.oceanBasin}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-400">COORDINATES:</span>
                    <strong className="text-cyan-200">
                      {selectedCoords ? `${selectedCoords.latitude.toFixed(2)}° N, ${selectedCoords.longitude.toFixed(2)}° E` : '--'}
                    </strong>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-400">DEPTH:</span>
                    <strong className="text-cyan-300">{oceanData.bathymetryDepth.toLocaleString()}m</strong>
                  </div>
                </div>

                {/* Wave height evolution time series graph */}
                <WaveTimeSeriesChart
                  timeSeries={oceanData.timeSeries}
                  currentHour={hour}
                  onSelectHour={setHour}
                  oceanName={selectedRegion?.name || oceanData.oceanBasin}
                />
              </div>
            )}
          </div>

          {/* Right Column: Live Telemetry & Ocean Conditions Dashboard (Feature 2) */}
          <div className="order-3 lg:order-3">
            <TelemetryPanel
              selectedCoords={selectedCoords}
              depth={depth}
              oceanData={oceanData}
              isLoading={isLoading}
              activeParam={activeParam}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-cyan-500/15 bg-[#020b17] text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-300 font-mono">MARIVEX</span>
          <span>·</span>
          <span>NOAA WaveWatch III (WW3 via ERDDAP)</span>
          <span>·</span>
          <span>Open-Meteo High-Resolution Marine</span>
          <span>·</span>
          <span>GEBCO 2024 Grid</span>
        </div>
        <div>
          Oceanographic research and interactive 3D marine telemetry visualizer
        </div>
      </footer>

      {/* Modals & Popups */}
      <ContinentOceanModal
        continent={activeContinent}
        onClose={() => setActiveContinent(null)}
        onSelectRegion={handleSelectRegion}
      />

      <ResearchModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        coords={selectedCoords}
        depth={depth}
        hour={hour}
        oceanData={oceanData}
      />

      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      {/* Feature 7: Marine Operations Mode Modal */}
      <MarineOperationsModal
        isOpen={isOperationsModalOpen}
        onClose={() => setIsOperationsModalOpen(false)}
        oceanData={oceanData}
        coords={selectedCoords}
        onSelectStation={handleSelectOperationsStation}
      />

      {/* Feature 9: Ocean Anomaly Detection Modal */}
      <AnomalyDetectionModal
        isOpen={isAnomalyModalOpen}
        onClose={() => setIsAnomalyModalOpen(false)}
        onPinAnomaly={handleSelectAnomaly}
      />

      {/* Feature 10: Region Comparison Modal */}
      <RegionComparisonModal
        isOpen={isComparisonModalOpen}
        onClose={() => setIsComparisonModalOpen(false)}
        initialRegionA={selectedRegion}
      />

      {/* Feature 11: Bathymetric Transect Profiler Modal */}
      <BathymetricTransectModal
        isOpen={isTransectModalOpen}
        onClose={() => setIsTransectModalOpen(false)}
        onFlyToTransect={handleFlyToTransect}
      />

      {/* Feature 8: AI-Powered "Ask MARIVEX" Assistant (Non-obstructive collapsible drawer) */}
      <AskMarivexAssistant
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        coords={selectedCoords}
        region={selectedRegion}
        oceanData={oceanData}
        depth={depth}
        hour={hour}
      />
    </div>
  );
}
