import { AccurateSeabedInfo } from '../utils/bathymetryData';

export type OceanParameter = 
  | 'Temperature' 
  | 'Salinity' 
  | 'Current Speed' 
  | 'Current Direction' 
  | 'Wave Height' 
  | 'Bathymetry';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface TimeSeriesPoint {
  time: string;
  hour: number;
  waveHeight: number; // meters
  wavePeriod: number; // seconds
  waveDirection: number; // degrees
  windSpeed: number; // km/h
  windDirection: number; // degrees
  currentVelocity: number; // km/h
  temperature: number; // °C
}

export interface OceanObservation {
  temperature: number | null; // °C
  salinity: number | null; // PSU
  currentSpeed: number | null; // km/h
  currentDirection: number | null; // degrees 0-360
  waveHeight: number | null; // meters (Thgt)
  wavePeriod: number | null; // seconds (Tper)
  waveDirection: number | null; // degrees (Tdir)
  windSpeed: number | null; // km/h
  windDirection: number | null; // degrees
  pressure: number | null; // dbar / atm
  density: number | null; // kg/m³
  dissolvedOxygen: number | null; // mg/L
  bathymetryDepth: number; // estimated seafloor depth in meters
  seabedInfo: AccurateSeabedInfo;
  actualLatitude: number | null;
  actualLongitude: number | null;
  time: string | null;
  oceanBasin: string;
  source: string;
  dataSourceType: 'LIVE_OBSERVATION' | 'MODEL_FORECAST' | 'HISTORICAL_REANALYSIS';
  modelAttribution: string;
  timeSeries: TimeSeriesPoint[];
}

export interface PelagicZone {
  name: string;
  altName: string;
  minDepth: number;
  maxDepth: number;
  description: string;
  lightLevel: string;
  color: string;
}

export interface OceanRegion {
  id: string;
  name: string;
  parentBasin: string;
  coordinates: Coordinates;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  areaSqKm: string;
  maxDepth: number;
  averageDepth: number;
  nearbyLandmarks: string[];
  overview: string;
}

export interface ContinentFeature {
  id: string;
  name: string;
  center: Coordinates;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  surroundingOceans: OceanRegion[];
}

export interface HistoricalStormPreset {
  id: string;
  name: string;
  oceanRegion: string;
  coordinates: Coordinates;
  peakDate: string;
  description: string;
  peakWaveHeight: number; // meters
  peakWindSpeed: number; // km/h
  dataSeries: TimeSeriesPoint[];
}

export interface PresetLocation {
  id: string;
  name: string;
  region: string;
  basin: string;
  coordinates: Coordinates;
  defaultDepth: number;
  maxDepth: number;
  highlights: string;
}

export type OceanDataLayerId = 
  | 'waveHeight' 
  | 'wavePeriod' 
  | 'waveDirection' 
  | 'sst' 
  | 'wind' 
  | 'currents' 
  | 'bathymetry';

export interface OceanLayerMeta {
  id: OceanDataLayerId;
  name: string;
  parameterName: string;
  unit: string;
  description: string;
  sourceAttribution: string;
  timestamp: string;
  colorScale: {
    min: number;
    max: number;
    stops: { value: number; label: string; color: string }[];
  };
}

export type MaritimeIndustry = 
  | 'offshore_wind' 
  | 'marine_transport' 
  | 'commercial_fishing' 
  | 'ocean_research' 
  | 'coastal_engineering';

export interface OperationsThresholds {
  maxWaveHeight: number; // meters
  maxWavePeriod: number; // seconds
  maxWindSpeed: number; // km/h
  maxCurrentSpeed: number; // km/h
}

export interface OperationsAlert {
  locationName: string;
  coordinates: Coordinates;
  industry: MaritimeIndustry;
  status: 'OPTIMAL' | 'ADVISORY' | 'WARNING' | 'CRITICAL';
  exceededParameters: {
    param: string;
    currentValue: number;
    threshold: number;
    unit: string;
  }[];
  rationale: string;
  operationalRecommendation: string;
  timestamp: string;
}

export interface OceanAnomalyRecord {
  id: string;
  regionName: string;
  basin: string;
  coordinates: Coordinates;
  parameter: 'Wave Height' | 'Sea Surface Temperature' | 'Ocean Current' | 'Wave Period';
  observedValue: number;
  baselineValue: number;
  unit: string;
  anomalyDelta: number;
  sigmaZScore: number;
  severity: 'Moderate' | 'Significant' | 'Extreme';
  timestamp: string;
  methodology: string;
  description: string;
}

export interface TransectPoint {
  distanceKm: number;
  depthM: number;
  featureName?: string;
  seabedType: 'shelf' | 'slope' | 'plain' | 'trench' | 'ridge' | 'seamount';
}

export interface BathymetricTransect {
  id: string;
  title: string;
  regionName: string;
  startCoords: Coordinates;
  endCoords: Coordinates;
  totalDistanceKm: number;
  maxDepthM: number;
  minDepthM: number;
  description: string;
  profile: TransectPoint[];
}

export interface MarivexChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sources?: string[];
  telemetryContext?: {
    location?: string;
    coordinates?: string;
    waveHeight?: string;
    wavePeriod?: string;
    temperature?: string;
    depth?: string;
  };
}
