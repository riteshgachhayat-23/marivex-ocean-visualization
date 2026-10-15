import { Coordinates, MaritimeIndustry, OceanObservation, OperationsAlert, OperationsThresholds } from '../types/ocean';

export interface IndustryConfig {
  id: MaritimeIndustry;
  name: string;
  categoryDescription: string;
  defaultThresholds: OperationsThresholds;
  standardsRef: string;
  recommendedOperations: string;
}

export const INDUSTRY_CONFIGS: IndustryConfig[] = [
  {
    id: 'offshore_wind',
    name: 'Offshore Wind Energy',
    categoryDescription: 'Turbine foundation installation, jack-up barge positioning, blade maintenance, and Crew Transfer Vessel (CTV) transfers.',
    defaultThresholds: {
      maxWaveHeight: 1.8, // CTV safe boarding limit
      maxWavePeriod: 12.0, // High swell surge risk
      maxWindSpeed: 42.0, // Crane lift max limit (approx 12 m/s)
      maxCurrentSpeed: 2.2 // Diving / ROV position holding limit
    },
    standardsRef: 'DNV-ST-N001 Marine Operations & G+ Offshore Wind Safety',
    recommendedOperations: 'CTV boarding restricted at Hs > 1.8m. Crane lifting halt at winds > 45 km/h.'
  },
  {
    id: 'marine_transport',
    name: 'Marine Transportation & Shipping',
    categoryDescription: 'Container vessel navigation, bulk carrier routing, tanker passage, and pilot boarding in sea lanes.',
    defaultThresholds: {
      maxWaveHeight: 4.5, // Significant slamming / parametric roll
      maxWavePeriod: 15.0, // Parametric roll resonance risk
      maxWindSpeed: 62.0, // Gale force 8+
      maxCurrentSpeed: 4.0 // Strong cross-current in chokepoints
    },
    standardsRef: 'IMO SOLAS Navigation Safety & WMO Marine Weather Warning Standard',
    recommendedOperations: 'Reduce speed or alter course to avoid parametric roll resonance in following seas.'
  },
  {
    id: 'commercial_fishing',
    name: 'Commercial Fishing Operations',
    categoryDescription: 'Trawling, longlining, pot hauling, and small fishing vessel stability in open pelagic waters.',
    defaultThresholds: {
      maxWaveHeight: 2.5, // Small craft advisory
      maxWavePeriod: 11.0, // Snap rolling risk
      maxWindSpeed: 40.0, // Deck work safety threshold
      maxCurrentSpeed: 3.0 // Gear drift and entrapment
    },
    standardsRef: 'FAO Code of Conduct for Responsible Fisheries & Maritime Safety Authority',
    recommendedOperations: 'Secure deck machinery; cease shooting nets when wave heights exceed 2.5m.'
  },
  {
    id: 'ocean_research',
    name: 'Oceanographic Research & Survey',
    categoryDescription: 'CTD rosette deployment, benthic coring, Autonomous Underwater Vehicle (AUV) and ROV launch & recovery.',
    defaultThresholds: {
      maxWaveHeight: 2.0, // A-frame launch limit
      maxWavePeriod: 13.0, // Wire tension heave amplification
      maxWindSpeed: 35.0, // Dynamic positioning station keeping
      maxCurrentSpeed: 2.0 // Umbilical cable drag limit
    },
    standardsRef: 'UNOLS Safety Standards for Oceanographic Research Ships',
    recommendedOperations: 'Suspend deep CTD wire casts if heave wave height exceeds 2.0m to prevent cable snapping.'
  },
  {
    id: 'coastal_engineering',
    name: 'Coastal Engineering & Dredging',
    categoryDescription: 'Breakwater construction, trailing suction hopper dredging, pipeline laying, and marine piling.',
    defaultThresholds: {
      maxWaveHeight: 1.5, // Spud leg bending stress limit
      maxWavePeriod: 10.0, // Long-period surging inside surf zone
      maxWindSpeed: 36.0, // Floating plant moorings
      maxCurrentSpeed: 1.8 // Dredge positioning accuracy
    },
    standardsRef: 'CIRIA Rock Manual & PIANC Guidelines for Marine Works',
    recommendedOperations: 'Retract spud legs and moor pontoon barges if waves exceed 1.5m.'
  }
];

export interface MaritimeStation {
  id: string;
  name: string;
  region: string;
  coordinates: Coordinates;
  primaryIndustry: MaritimeIndustry;
  typicalOperations: string;
}

export const MARITIME_OPERATIONS_STATIONS: MaritimeStation[] = [
  {
    id: 'dogger-bank',
    name: 'Dogger Bank Offshore Wind Zone',
    region: 'North Sea',
    coordinates: { latitude: 54.8, longitude: 2.2 },
    primaryIndustry: 'offshore_wind',
    typicalOperations: 'Monopile installation and CTV crew maintenance runs'
  },
  {
    id: 'malacca-strait',
    name: 'Malacca Strait Chokepoint',
    region: 'Southeast Asia',
    coordinates: { latitude: 2.5, longitude: 101.5 },
    primaryIndustry: 'marine_transport',
    typicalOperations: 'Ultra Large Crude Carrier (VLCC) lane transit'
  },
  {
    id: 'bay-of-bengal-krishna',
    name: 'Krishna-Godavari Deepwater Field',
    region: 'Bay of Bengal',
    coordinates: { latitude: 16.2, longitude: 82.8 },
    primaryIndustry: 'ocean_research',
    typicalOperations: 'Deepwater subsea infrastructure inspection & coring'
  },
  {
    id: 'grand-banks',
    name: 'Grand Banks Pelagic Fishery',
    region: 'Northwest Atlantic',
    coordinates: { latitude: 45.2, longitude: -50.5 },
    primaryIndustry: 'commercial_fishing',
    typicalOperations: 'Trawling in cold fog and high swell zone'
  },
  {
    id: 'dubai-harbor',
    name: 'Palm Jumeirah Coastal Works',
    region: 'Persian Gulf',
    coordinates: { latitude: 25.15, longitude: 55.1 },
    primaryIndustry: 'coastal_engineering',
    typicalOperations: 'Cutter suction dredging and revetment placement'
  },
  {
    id: 'cape-of-good-hope',
    name: 'Cape Agulhas Transit Lane',
    region: 'South Africa',
    coordinates: { latitude: -34.8, longitude: 20.0 },
    primaryIndustry: 'marine_transport',
    typicalOperations: 'Heavy swell routing in boundary current retroflection'
  }
];

export function evaluateOperationsThresholds(
  data: OceanObservation | null,
  thresholds: OperationsThresholds,
  industry: MaritimeIndustry,
  locationName: string = 'Current Observation Point',
  coords: Coordinates = { latitude: 0, longitude: 0 }
): OperationsAlert {
  const indConfig = INDUSTRY_CONFIGS.find(i => i.id === industry) || INDUSTRY_CONFIGS[0];
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  if (!data) {
    return {
      locationName,
      coordinates: coords,
      industry,
      status: 'ADVISORY',
      exceededParameters: [],
      rationale: 'No telemetry currently loaded for point. Ensure an ocean coordinate is selected on the globe.',
      operationalRecommendation: 'Load ocean telemetry to evaluate operational windows.',
      timestamp: now
    };
  }

  const waveHeight = data.waveHeight ?? 1.2;
  const wavePeriod = data.wavePeriod ?? 8.0;
  const windSpeed = data.windSpeed ?? 20.0;
  const currentSpeed = data.currentSpeed ?? 1.0;

  const exceeded: { param: string; currentValue: number; threshold: number; unit: string }[] = [];

  if (waveHeight > thresholds.maxWaveHeight) {
    exceeded.push({
      param: 'Significant Wave Height',
      currentValue: waveHeight,
      threshold: thresholds.maxWaveHeight,
      unit: 'm'
    });
  }
  if (wavePeriod > thresholds.maxWavePeriod) {
    exceeded.push({
      param: 'Wave Period (Surge Risk)',
      currentValue: wavePeriod,
      threshold: thresholds.maxWavePeriod,
      unit: 's'
    });
  }
  if (windSpeed > thresholds.maxWindSpeed) {
    exceeded.push({
      param: 'Surface Wind Speed',
      currentValue: windSpeed,
      threshold: thresholds.maxWindSpeed,
      unit: 'km/h'
    });
  }
  if (currentSpeed > thresholds.maxCurrentSpeed) {
    exceeded.push({
      param: 'Current Velocity',
      currentValue: currentSpeed,
      threshold: thresholds.maxCurrentSpeed,
      unit: 'km/h'
    });
  }

  let status: 'OPTIMAL' | 'ADVISORY' | 'WARNING' | 'CRITICAL' = 'OPTIMAL';
  let rationale = `All observed environmental metrics are within safe design margins for ${indConfig.name}.`;
  let operationalRecommendation = 'Environmental window is open for scheduled offshore operations.';

  if (exceeded.length >= 2 || (waveHeight > thresholds.maxWaveHeight * 1.4)) {
    status = 'CRITICAL';
    rationale = `Critical operational limits breached: ${exceeded.map(e => `${e.param} (${e.currentValue}${e.unit} vs limit ${e.threshold}${e.unit})`).join(', ')}. Multiple safety margins violated simultaneously.`;
    operationalRecommendation = `HOLD OPERATIONS IMMEDIATELY: Suspend ${indConfig.categoryDescription}. Evacuate personnel to sheltered deck or heave-to until conditions abate below operational thresholds.`;
  } else if (exceeded.length === 1) {
    status = 'WARNING';
    rationale = `Operational threshold exceeded for ${exceeded[0].param}: currently ${exceeded[0].currentValue}${exceeded[0].unit} (Limit: ${exceeded[0].threshold}${exceeded[0].unit}).`;
    operationalRecommendation = `EXERCISE HEIGHTENED VIGILANCE: Implement secondary weather standby. ${indConfig.recommendedOperations}`;
  } else if (waveHeight > thresholds.maxWaveHeight * 0.85 || windSpeed > thresholds.maxWindSpeed * 0.85) {
    status = 'ADVISORY';
    rationale = `Conditions are approaching threshold boundaries (within 15% of critical limits).`;
    operationalRecommendation = 'Monitor incoming NOAA WW3 wave spectral updates closely for deteriorating swell.';
  }

  return {
    locationName,
    coordinates: coords,
    industry,
    status,
    exceededParameters: exceeded,
    rationale,
    operationalRecommendation,
    timestamp: now
  };
}
