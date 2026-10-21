
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";

import type {
  Coordinates,
  OceanObservation,
  OceanParameter,
  PresetLocation,
  ContinentFeature,
  OceanRegion,
  HistoricalStormPreset,
  OceanDataLayerId,
  OceanAnomalyRecord,
} from "./types/ocean";

import {
  fetchOceanData,
  PRESET_LOCATIONS,
} from "./utils/oceanData";

import {
  CONTINENTS,
} from "./utils/oceanRegions";

import { Header } from "./components/Header";
import { OceanGlobe } from "./components/OceanGlobe";
import { ControlPanel } from "./components/ControlPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { ResearchModal } from "./components/ResearchModal";
import { AboutModal } from "./components/AboutModal";
import { ContinentOceanModal } from "./components/ContinentOceanModal";
import { OceanTimeline } from "./components/OceanTimeline";
import { WaveTimeSeriesChart } from "./components/WaveTimeSeriesChart";
import { MarineOperationsModal } from "./components/MarineOperationsModal";
import { AnomalyDetectionModal } from "./components/AnomalyDetectionModal";
import { RegionComparisonModal } from "./components/RegionComparisonModal";
import { BathymetricTransectModal } from "./components/BathymetricTransectModal";
import { AskMarivexAssistant } from "./components/AskMarivexAssistant";
import { UnderwaterBathymetryViewer } from "./components/UnderwaterBathymetryViewer";

import type {
  MaritimeStation,
} from "./utils/operationsData";

import {
  Globe,
  MapPin,
  Activity,
  Sparkles,
  Navigation,
  ShieldAlert,
  AlertCircle,
  GitCompare,
  Mountain,
  Bot,
  SlidersHorizontal,
  PanelRight,
  Clock3,
  ChartNoAxesCombined,
  X,
  Layers,
  ChevronDown,
} from "lucide-react";

type DrawerType = "controls" | "telemetry" | null;

export default function App() {
  // =========================================
  // OCEAN DATA & VISUALIZATION STATE
  // =========================================

  const [selectedCoords, setSelectedCoords] =
    useState<Coordinates | null>({
      latitude: 15.5,
      longitude: 88.0,
    });

  const [depth, setDepth] = useState(80);
  const [hour, setHour] = useState(12);

  const [activeParam, setActiveParam] =
    useState<OceanParameter>("Wave Height");

  const [oceanData, setOceanData] =
    useState<OceanObservation | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  const [activeContinent, setActiveContinent] =
    useState<ContinentFeature | null>(null);

  const [selectedRegion, setSelectedRegion] =
    useState<OceanRegion | null>(null);

  // Start with the globe, not the underwater viewer.
  const [isUnderwater, setIsUnderwater] = useState(false);

  const [verticalExaggeration, setVerticalExaggeration] =
    useState(2.8);

  const [selectedStorm, setSelectedStorm] =
    useState<HistoricalStormPreset | null>(null);

  const [activeLayer, setActiveLayer] =
    useState<OceanDataLayerId>("waveHeight");

  const [showVectorOverlay, setShowVectorOverlay] =
    useState(true);

  const [showStreamlines, setShowStreamlines] =
    useState(true);

  const [isOperationsModalOpen, setIsOperationsModalOpen] =
    useState(false);

  const [operationsStation, setOperationsStation] =
    useState<MaritimeStation | null>(null);

  const [isAssistantOpen, setIsAssistantOpen] =
    useState(false);

  const [isAnomalyModalOpen, setIsAnomalyModalOpen] =
    useState(false);

  const [pinnedAnomaly, setPinnedAnomaly] =
    useState<OceanAnomalyRecord | null>(null);

  const [isComparisonModalOpen, setIsComparisonModalOpen] =
    useState(false);

  const [isTransectModalOpen, setIsTransectModalOpen] =
    useState(false);

  const [isPlayingAudio, setIsPlayingAudio] =
    useState(false);

  const [isReportModalOpen, setIsReportModalOpen] =
    useState(false);

  const [isAboutModalOpen, setIsAboutModalOpen] =
    useState(false);

  // =========================================
  // NEW MINIMAL DASHBOARD UI STATE
  // =========================================

  const [activeDrawer, setActiveDrawer] =
    useState<DrawerType>(null);

  const [showTools, setShowTools] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  function toggleDrawer(drawer: Exclude<DrawerType, null>) {
    setActiveDrawer((current) =>
      current === drawer ? null : drawer
    );
    setShowTools(false);
  }

  // =========================================
  // DATA LOADING
  // =========================================

  const loadData = useCallback(
    async (
      coords: Coordinates,
      targetDepth: number,
      targetHour: number,
      storm: HistoricalStormPreset | null
    ) => {
      setIsLoading(true);

      try {
        const data = await fetchOceanData(
          coords,
          targetDepth,
          targetHour
        );

        if (storm) {
          const stormPt =
            storm.dataSeries.find(
              (pt) => pt.hour === targetHour
            ) || storm.dataSeries[0];

          data.waveHeight = stormPt.waveHeight;
          data.wavePeriod = stormPt.wavePeriod;
          data.waveDirection = stormPt.waveDirection;
          data.windSpeed = stormPt.windSpeed;
          data.windDirection = stormPt.windDirection;

          data.dataSourceType = "HISTORICAL_REANALYSIS";
          data.source = `Historical Reanalysis: ${storm.name}`;
          data.timeSeries = storm.dataSeries;
          data.time = `${storm.peakDate.substring(0, 10)} ${String(
            targetHour
          ).padStart(2, "0")}:00 UTC`;
        }

        setOceanData(data);
      } catch (error) {
        console.error("Failed to load ocean data:", error);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedCoords) {
      loadData(
        selectedCoords,
        depth,
        hour,
        selectedStorm
      );
    }
  }, [
    selectedCoords,
    depth,
    hour,
    selectedStorm,
    loadData,
  ]);

  // =========================================
  // LOCATION & FEATURE HANDLERS
  // =========================================

  const handleSelectPreset = (preset: PresetLocation) => {
    setSelectedCoords(preset.coordinates);
    setDepth(preset.defaultDepth);
    setSelectedRegion(null);
    setPinnedAnomaly(null);
    setOperationsStation(null);
    setShowTools(false);
  };

  const handleSelectRegion = (region: OceanRegion) => {
    setSelectedRegion(region);
    setSelectedCoords(region.coordinates);
    setPinnedAnomaly(null);
    setOperationsStation(null);
  };

  const handleSelectContinent = (
    continent: ContinentFeature
  ) => {
    setActiveContinent(continent);
    setShowTools(false);
  };

  const handleSelectStorm = (
    storm: HistoricalStormPreset | null
  ) => {
    setSelectedStorm(storm);

    if (storm) {
      setSelectedCoords(storm.coordinates);
      setPinnedAnomaly(null);
      setOperationsStation(null);
    }
  };

  const handleSelectAnomaly = (
    anomaly: OceanAnomalyRecord
  ) => {
    setPinnedAnomaly(anomaly);
    setSelectedCoords(anomaly.coordinates);
    setOperationsStation(null);
  };

  const handleSelectOperationsStation = (
    station: MaritimeStation
  ) => {
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

  const locationLabel = selectedCoords
    ? `${Math.abs(selectedCoords.latitude).toFixed(2)}°${
        selectedCoords.latitude >= 0 ? "N" : "S"
      }, ${Math.abs(selectedCoords.longitude).toFixed(2)}°${
        selectedCoords.longitude >= 0 ? "E" : "W"
      }`
    : "Select an ocean location";

  const viewportTitle = pinnedAnomaly
    ? `Anomaly: ${pinnedAnomaly.regionName}`
    : operationsStation
    ? `Station: ${operationsStation.name}`
    : selectedRegion
    ? selectedRegion.name
    : oceanData?.oceanBasin || "Global Ocean Explorer";

  // =========================================
  // MAIN APPLICATION
  // =========================================

  return (
    <div className="min-h-screen bg-[#020813] text-[#f2fbff] flex flex-col selection:bg-cyan-500/30">

      {/* EXISTING HEADER */}
      <Header
        isPlayingAudio={isPlayingAudio}
        setIsPlayingAudio={setIsPlayingAudio}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenAboutModal={() => setIsAboutModalOpen(true)}
        onOpenOperationsModal={() => setIsOperationsModalOpen(true)}
        onOpenAnomalyModal={() => setIsAnomalyModalOpen(true)}
        onOpenComparisonModal={() => setIsComparisonModalOpen(true)}
        onOpenTransectModal={() => setIsTransectModalOpen(true)}
        onToggleAssistant={() =>
          setIsAssistantOpen(!isAssistantOpen)
        }
        isAssistantOpen={isAssistantOpen}
        isUnderwater={isUnderwater}
        onToggleUnderwater={() =>
          setIsUnderwater(!isUnderwater)
        }
      />

      <main className="flex-1 w-full max-w-[2000px] mx-auto px-3 sm:px-5 lg:px-6 py-3 flex flex-col gap-3">

        {/* ====================================
            COMPACT MAIN TOOLBAR
           ==================================== */}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/15 bg-[#061629]/90 px-3 py-2.5 backdrop-blur-xl">

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-cyan-300" />
            </div>

            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.17em] font-bold text-cyan-300">
                Ocean Explorer
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[250px]">
                {viewportTitle}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">

            <button
              type="button"
              onClick={() => toggleDrawer("controls")}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                activeDrawer === "controls"
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-300 hover:text-white hover:border-cyan-500/40"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Controls
            </button>

            <button
              type="button"
              onClick={() => toggleDrawer("telemetry")}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                activeDrawer === "telemetry"
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-300 hover:text-white hover:border-cyan-500/40"
              }`}
            >
              <PanelRight className="w-4 h-4" />
              Telemetry
            </button>

            <button
              type="button"
              onClick={() =>
                setShowTimeline((current) => !current)
              }
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                showTimeline
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-300 hover:text-white hover:border-cyan-500/40"
              }`}
            >
              <Clock3 className="w-4 h-4" />
              Timeline
            </button>

            <button
              type="button"
              onClick={() =>
                setShowAnalysis((current) => !current)
              }
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                showAnalysis
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-300 hover:text-white hover:border-cyan-500/40"
              }`}
            >
              <ChartNoAxesCombined className="w-4 h-4" />
              Analysis
            </button>

            <button
              type="button"
              onClick={() => {
                setIsUnderwater((current) => !current);
                setActiveDrawer(null);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-all"
            >
              {isUnderwater ? (
                <Globe className="w-4 h-4" />
              ) : (
                <Mountain className="w-4 h-4" />
              )}
              {isUnderwater ? "3D Globe" : "Ocean Floor"}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTools((current) => !current);
                  setActiveDrawer(null);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  showTools
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                    : "border-white/10 bg-white/5 text-slate-200 hover:border-cyan-500/40"
                }`}
              >
                <Layers className="w-4 h-4" />
                More Tools
                <ChevronDown className="w-3 h-3" />
              </button>

              {/* ADVANCED TOOLS DROPDOWN */}
              {showTools && (
                <div className="absolute right-0 top-full mt-3 z-[80] w-[min(90vw,360px)] max-h-[70vh] overflow-y-auto rounded-2xl border border-cyan-400/25 bg-[#061525] shadow-2xl shadow-black/70 p-3">

                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[11px] uppercase tracking-widest font-bold text-cyan-300">
                      Advanced Research Suite
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowTools(false)}
                      aria-label="Close tools"
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">

                    <button
                      type="button"
                      onClick={() => {
                        setIsOperationsModalOpen(true);
                        setShowTools(false);
                      }}
                      className="mv-tool-item"
                    >
                      <ShieldAlert className="w-4 h-4 text-cyan-300" />
                      Marine Operations
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAnomalyModalOpen(true);
                        setShowTools(false);
                      }}
                      className="mv-tool-item"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-300" />
                      Anomaly Detection
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsComparisonModalOpen(true);
                        setShowTools(false);
                      }}
                      className="mv-tool-item"
                    >
                      <GitCompare className="w-4 h-4 text-cyan-300" />
                      Compare Ocean Regions
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsTransectModalOpen(true);
                        setShowTools(false);
                      }}
                      className="mv-tool-item"
                    >
                      <Mountain className="w-4 h-4 text-violet-300" />
                      Seafloor Transects
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAssistantOpen(true);
                        setShowTools(false);
                      }}
                      className="mv-tool-item"
                    >
                      <Bot className="w-4 h-4 text-cyan-300" />
                      Ask MARIVEX AI
                    </button>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">
                      Explore Continents
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {CONTINENTS.map((continent) => (
                        <button
                          key={continent.id}
                          type="button"
                          onClick={() =>
                            handleSelectContinent(continent)
                          }
                          className="px-2.5 py-1.5 text-[11px] rounded-lg border border-cyan-500/20 bg-cyan-500/5 text-cyan-100 hover:bg-cyan-500/20 transition-colors"
                        >
                          {continent.name.split(" / ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">
                      Marine Hotspots
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_LOCATIONS.slice(0, 5).map(
                        (preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              handleSelectPreset(preset)
                            }
                            className="px-2.5 py-1.5 text-[11px] rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:border-cyan-400/40 hover:text-white transition-colors"
                          >
                            {preset.name.split(" (")[0]}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ====================================
            LARGE 3D OCEAN VIEWPORT
           ==================================== */}

        <div className="relative h-[75vh] min-h-[540px] max-h-[1000px] rounded-2xl border border-cyan-500/20 bg-[#030e1d] overflow-hidden shadow-2xl shadow-black/40">

          <div className="absolute inset-0">
            {isUnderwater ? (
              <UnderwaterBathymetryViewer
                initialRegionId={selectedRegion?.id}
                initialCoords={selectedCoords}
                selectedCoords={selectedCoords}
                oceanName={
                  selectedRegion?.name ||
                  oceanData?.oceanBasin ||
                  (selectedCoords
                    ? `Sector (${Math.abs(selectedCoords.latitude).toFixed(2)}°${selectedCoords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(selectedCoords.longitude).toFixed(2)}°${selectedCoords.longitude >= 0 ? 'E' : 'W'})`
                    : "Ocean Floor Basin")
                }
                onReturnToGlobe={() =>
                  setIsUnderwater(false)
                }
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
                onToggleVectorOverlay={() =>
                  setShowVectorOverlay(!showVectorOverlay)
                }
                showStreamlines={showStreamlines}
                onToggleStreamlines={() =>
                  setShowStreamlines(!showStreamlines)
                }
                pinnedAnomaly={pinnedAnomaly}
                operationsStation={operationsStation}
                onSetDepth={setDepth}
                onContinentClick={handleSelectContinent}
                selectedRegion={selectedRegion}
                onClearRegion={() =>
                  setSelectedRegion(null)
                }
                verticalExaggeration={verticalExaggeration}
                onVerticalExaggerationChange={
                  setVerticalExaggeration
                }
                isUnderwater={isUnderwater}
                onToggleUnderwater={setIsUnderwater}
              />
            )}
          </div>

          {/* FLOATING VIEWPORT LOCATION INDICATOR */}
          <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-10 pointer-events-none max-w-[70%] rounded-xl border border-cyan-400/15 bg-[#031321]/75 backdrop-blur-xl px-3 py-2 shadow-lg">

            <div className="flex items-center gap-2">
              <Navigation className="w-3.5 h-3.5 text-cyan-400 shrink-0" />

              <span className="font-mono text-[11px] text-cyan-100 truncate">
                {locationLabel}
              </span>
            </div>

            <div className="mt-1 text-[10px] text-slate-400 truncate">
              {viewportTitle} · {depth} m · Hour {hour}
            </div>
          </div>

          {/* ====================================
              FLOATING CONTROL DRAWER
             ==================================== */}

          {activeDrawer === "controls" && (
            <div className="absolute z-30 top-3 bottom-3 left-3 w-[min(350px,calc(100%-24px))] flex flex-col rounded-2xl border border-cyan-400/30 bg-[#031321]/95 backdrop-blur-2xl shadow-2xl overflow-hidden">

              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-cyan-300" />
                  <span className="text-sm font-bold text-white">
                    Ocean Controls
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveDrawer(null)}
                  aria-label="Close controls"
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2">
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
            </div>
          )}

          {/* ====================================
              FLOATING TELEMETRY DRAWER
             ==================================== */}

          {activeDrawer === "telemetry" && (
            <div className="absolute z-30 top-3 bottom-3 right-3 w-[min(370px,calc(100%-24px))] flex flex-col rounded-2xl border border-cyan-400/30 bg-[#031321]/95 backdrop-blur-2xl shadow-2xl overflow-hidden">

              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-300" />
                  <span className="text-sm font-bold text-white">
                    Live Telemetry
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveDrawer(null)}
                  aria-label="Close telemetry"
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                <TelemetryPanel
                  selectedCoords={selectedCoords}
                  depth={depth}
                  oceanData={oceanData}
                  isLoading={isLoading}
                  activeParam={activeParam}
                />
              </div>
            </div>
          )}

        </div>

        {/* ====================================
            OPTIONAL TIMELINE SECTION
           ==================================== */}

        {showTimeline && (
          <section className="rounded-2xl border border-cyan-500/20 bg-[#04172a]/90 p-3 sm:p-4">

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-cyan-300" />
                <h2 className="text-xs font-bold tracking-wider text-white uppercase">
                  Ocean Time Explorer
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowTimeline(false)}
                className="text-slate-400 hover:text-white"
                aria-label="Close timeline"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <OceanTimeline
              currentHour={hour}
              onHourChange={setHour}
              selectedStorm={selectedStorm}
              onSelectStorm={handleSelectStorm}
              timeSeries={oceanData?.timeSeries || []}
            />
          </section>
        )}

        {/* ====================================
            OPTIONAL SCIENTIFIC ANALYSIS
           ==================================== */}

        {showAnalysis && (
          <section className="rounded-2xl border border-cyan-500/20 bg-[#04172a]/90 p-3 sm:p-5">

            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <ChartNoAxesCombined className="w-4 h-4 text-cyan-300" />
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                    Ocean Data Analysis
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Wave dynamics and time-series inspection
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAnalysis(false)}
                className="text-slate-400 hover:text-white"
                aria-label="Close analysis"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {oceanData ? (
              <WaveTimeSeriesChart
                timeSeries={oceanData.timeSeries}
                currentHour={hour}
                onSelectHour={setHour}
                oceanName={
                  selectedRegion?.name ||
                  oceanData.oceanBasin
                }
              />
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm">
                Select an ocean location to inspect data.
              </div>
            )}
          </section>
        )}

      </main>

      {/* COMPACT FOOTER */}
      <footer className="px-4 py-3 border-t border-cyan-500/10 bg-[#020b17] text-center text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span className="font-bold tracking-widest text-cyan-300">
            MARIVEX
          </span>
          <span>·</span>
          <span>OceanVista3D</span>
          <span>·</span>
          <span>Interactive Ocean Data Visualization</span>
        </div>
      </footer>

      {/* ====================================
          EXISTING MODALS — PRESERVED
         ==================================== */}

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

      <MarineOperationsModal
        isOpen={isOperationsModalOpen}
        onClose={() => setIsOperationsModalOpen(false)}
        oceanData={oceanData}
        coords={selectedCoords}
        onSelectStation={handleSelectOperationsStation}
      />

      <AnomalyDetectionModal
        isOpen={isAnomalyModalOpen}
        onClose={() => setIsAnomalyModalOpen(false)}
        onPinAnomaly={handleSelectAnomaly}
      />

      <RegionComparisonModal
        isOpen={isComparisonModalOpen}
        onClose={() => setIsComparisonModalOpen(false)}
        initialRegionA={selectedRegion}
      />

      <BathymetricTransectModal
        isOpen={isTransectModalOpen}
        onClose={() => setIsTransectModalOpen(false)}
        onFlyToTransect={handleFlyToTransect}
      />

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
