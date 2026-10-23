import { findPresetCoveringCoordinates, normalizeLongitude } from './bathymetryGridBuilder';

export type SeabedMorphologyType = 
  | 'trench' 
  | 'shelf' 
  | 'slope' 
  | 'ridge' 
  | 'abyssal_plain';

export interface AccurateSeabedInfo {
  depth: number; // positive underwater depth in meters (0 for land)
  elevationMeters?: number; // signed elevation in meters (negative = underwater, positive = land)
  isLand?: boolean;
  source?: string;
  provenance?: string;
  morphology: SeabedMorphologyType;
  morphologyLabel: string;
  sedimentType: string;
  benthicTemperature: number; // °C
  benthicPressure: number; // dbar
  tectonicPlate: string;
  features: string[];
}

interface KnownBathymetricFeature {
  name: string;
  lat: number;
  lon: number;
  radiusDeg: number;
  depth: number;
  morphology: SeabedMorphologyType;
  label: string;
  sediment: string;
  plate: string;
  features: string[];
}

const KNOWN_FEATURES: KnownBathymetricFeature[] = [
  // TRENCHES (Hadal zone)
  {
    name: 'Mariana Trench (Challenger Deep)',
    lat: 11.3493,
    lon: 142.1996,
    radiusDeg: 3.5,
    depth: 10994,
    morphology: 'trench',
    label: 'Hadal Subduction Trench (Challenger Deep)',
    sediment: 'Siliceous diatomaceous ooze & serpentine basalt fracture',
    plate: 'Pacific Plate subducting under Mariana Microplate',
    features: ['Challenger Deep', 'Sirena Deep', 'Xenophyophore benthic colonies']
  },
  {
    name: 'Puerto Rico Trench (Milwaukee Deep)',
    lat: 19.84,
    lon: -66.5,
    radiusDeg: 3.0,
    depth: 8376,
    morphology: 'trench',
    label: 'Atlantic Subduction Trench Fault',
    sediment: 'Pelagic clay & carbonate turbidite layers',
    plate: 'North American Plate & Caribbean Plate boundary',
    features: ['Milwaukee Deep', 'Brownson Deep', 'Subduction escarpment']
  },
  {
    name: 'Java (Sunda) Trench',
    lat: -10.3,
    lon: 109.9,
    radiusDeg: 4.0,
    depth: 7450,
    morphology: 'trench',
    label: 'Sunda Arc Subduction Trench',
    sediment: 'Volcaniclastic silt & hemipelagic mud',
    plate: 'Indo-Australian Plate subducting under Sunda Plate',
    features: ['Active megathrust zone', 'Accretionary prism']
  },
  {
    name: 'Kuril-Kamchatka Trench',
    lat: 44.5,
    lon: 150.0,
    radiusDeg: 4.5,
    depth: 10542,
    morphology: 'trench',
    label: 'Northwest Pacific Hadal Trench',
    sediment: 'Diatomaceous ooze & volcanic ash beds',
    plate: 'Pacific Plate subducting under Okhotsk Plate',
    features: ['Ultra-abyssal canyon', 'High benthic endemism']
  },
  {
    name: 'Philippine Trench',
    lat: 10.5,
    lon: 126.8,
    radiusDeg: 3.5,
    depth: 10540,
    morphology: 'trench',
    label: 'Western Pacific Subduction Fault',
    sediment: 'Fine terrigenous clay & pelagic mud',
    plate: 'Philippine Sea Plate & Eurasian Plate boundary',
    features: ['Emden Deep', 'Galathea Depth']
  },
  {
    name: 'Tonga Trench (Horizon Deep)',
    lat: -23.25,
    lon: -174.75,
    radiusDeg: 3.8,
    depth: 10882,
    morphology: 'trench',
    label: 'Southwest Pacific Hadal Subduction Trench',
    sediment: 'Pelagic red clay & volcanic shards',
    plate: 'Pacific Plate subducting under Tonga Plate',
    features: ['Horizon Deep', 'Rapid subduction rate (24 cm/yr)']
  },
  {
    name: 'Kermadec Trench',
    lat: -31.5,
    lon: -177.5,
    radiusDeg: 3.5,
    depth: 10047,
    morphology: 'trench',
    label: 'Kermadec-Tonga Subduction Arc',
    sediment: 'Hemipelagic mud & pumice fragments',
    plate: 'Pacific Plate under Australian Plate',
    features: ['Scholl Deep', 'Abyssal hydrothermal vents']
  },
  {
    name: 'South Sandwich Trench',
    lat: -55.4,
    lon: -26.2,
    radiusDeg: 3.5,
    depth: 8264,
    morphology: 'trench',
    label: 'Southern Ocean Hadal Subduction Zone',
    sediment: 'Glaciomarine diatomaceous ooze',
    plate: 'South American Plate under South Sandwich Plate',
    features: ['Meteor Deep', 'Antarctic bottom water inflow']
  },
  {
    name: 'Peru-Chile (Atacama) Trench',
    lat: -23.5,
    lon: -71.3,
    radiusDeg: 3.5,
    depth: 8065,
    morphology: 'trench',
    label: 'Eastern Pacific Active Continental Margin',
    sediment: 'Turbidites & organic-rich diatomaceous mud',
    plate: 'Nazca Plate subducting under South American Plate',
    features: ['Richards Deep', 'Intense upwelling sediment']
  },

  // MID-OCEAN RIDGES (Divergent boundaries)
  {
    name: 'Mid-Atlantic Ridge (Trans-Atlantic)',
    lat: 36.2,
    lon: -33.8,
    radiusDeg: 4.5,
    depth: 2280,
    morphology: 'ridge',
    label: 'Mid-Atlantic Rift Valley & Hydrothermal Field',
    sediment: 'Pillow basalt, hydrothermal sulfide chimneys & foraminiferal ooze',
    plate: 'North American Plate & Eurasian / African Plate boundary',
    features: ['TAG Hydrothermal Mound', 'Rainbow Vent Field', 'Central Rift Graben']
  },
  {
    name: 'East Pacific Rise',
    lat: 9.8,
    lon: -104.3,
    radiusDeg: 4.0,
    depth: 2540,
    morphology: 'ridge',
    label: 'Fast-Spreading Mid-Ocean Ridge',
    sediment: 'Fresh pillow basalt & polymetallic sulfides',
    plate: 'Pacific Plate & Cocos / Nazca Plate boundary',
    features: ['Black Smoker Chimneys', 'Rift axial summit trough', 'Tubeworm colonies']
  },
  {
    name: 'Southwest Indian Ridge',
    lat: -34.5,
    lon: 54.0,
    radiusDeg: 4.5,
    depth: 2850,
    morphology: 'ridge',
    label: 'Ultra-Slow Spreading Oceanic Ridge',
    sediment: 'Peridotite mantles & carbonate sands',
    plate: 'African Plate & Antarctic Plate boundary',
    features: ['Dragon Horn hydrothermal field', 'Transform fault offsets']
  },

  // SHALLOW CONTINENTAL SHELVES & REEF PLATFORMS (<200m)
  {
    name: 'Great Barrier Reef Marine Platform',
    lat: -18.2871,
    lon: 147.6992,
    radiusDeg: 3.5,
    depth: 42,
    morphology: 'shelf',
    label: 'Coral Reef Carbonate Platform',
    sediment: 'Biogenic coral aragonite & Halimeda carbonate sand',
    plate: 'Australian Continental Shelf',
    features: ['Barrier coral ribbon reefs', 'Inter-reef bioherms', 'Lagoonal sand flats']
  },
  {
    name: 'Persian / Arabian Gulf Basin',
    lat: 26.5,
    lon: 52.0,
    radiusDeg: 3.8,
    depth: 54,
    morphology: 'shelf',
    label: 'Shallow Epicontinental Evaporitic Shelf',
    sediment: 'Oolitic carbonate sand & evaporite muds',
    plate: 'Arabian Plate',
    features: ['Hypersaline seabed brine pools', 'Subsea oil & gas aquifers']
  },
  {
    name: 'North Sea (Dogger Bank)',
    lat: 55.0,
    lon: 3.0,
    radiusDeg: 3.5,
    depth: 45,
    morphology: 'shelf',
    label: 'Post-Glacial Epicontinental Shelf',
    sediment: 'Glaciomarine sand dunes & gravel banks',
    plate: 'Eurasian Continental Shelf',
    features: ['Dogger Bank sand ridge', 'Submerged paleo-landscape']
  },
  {
    name: 'Baltic Sea Central Basin',
    lat: 57.0,
    lon: 19.5,
    radiusDeg: 3.0,
    depth: 72,
    morphology: 'shelf',
    label: 'Brackish Enclosed Shelf Basin',
    sediment: 'Post-glacial anoxic sapropelic mud',
    plate: 'Baltic Craton',
    features: ['Gotland Deep (249m)', 'Subsurface anoxic dead zones']
  },
  {
    name: 'Yellow Sea Shelf',
    lat: 35.0,
    lon: 124.0,
    radiusDeg: 3.5,
    depth: 48,
    morphology: 'shelf',
    label: 'Epicontinental Muddy Shelf',
    sediment: 'Yellow River (Huanghe) deltaic silt & mud',
    plate: 'Eurasian Plate',
    features: ['Tidal sand ridges', 'High sediment discharge wedge']
  },

  // CONTINENTAL MARGINS & SLOPES
  {
    name: 'Gulf Stream Continental Margin',
    lat: 35.0,
    lon: -74.5,
    radiusDeg: 3.5,
    depth: 3200,
    morphology: 'slope',
    label: 'Northwest Atlantic Continental Slope & Rise',
    sediment: 'Terrigenous hemipelagic mud & quartz turbidite sands',
    plate: 'North American Plate margin',
    features: ['Cape Hatteras submarine canyon', 'Blake Ridge methane hydrates']
  },
  {
    name: 'Kuroshio / Nankai Trough Margin',
    lat: 32.0,
    lon: 135.5,
    radiusDeg: 3.5,
    depth: 4200,
    morphology: 'slope',
    label: 'Nankai Accretionary Prism & Forearc Basin',
    sediment: 'Turbiditic sand & volcanic ash layers',
    plate: 'Philippine Sea & Eurasian Plate',
    features: ['Submarine slope canyons', 'Cold seep methane biomes']
  },
  {
    name: 'Sargasso Sea Abyssal Plain',
    lat: 28.0,
    lon: -66.0,
    radiusDeg: 5.0,
    depth: 5400,
    morphology: 'abyssal_plain',
    label: 'North Atlantic Abyssal Plain',
    sediment: 'Pelagic red clay & calcareous foraminiferal ooze',
    plate: 'North American Plate abyssal floor',
    features: ['Smooth benthic silt floor', 'Manganese micro-nodules']
  },
  {
    name: 'Drake Passage / Scotia Sea Margin',
    lat: -58.0,
    lon: -64.0,
    radiusDeg: 4.5,
    depth: 4250,
    morphology: 'slope',
    label: 'Antarctic Circumpolar Gateway',
    sediment: 'Diatomaceous ooze & iceberg-rafted debris (IRD)',
    plate: 'Scotia Plate & Antarctic Plate',
    features: ['Deep Antarctic bottom water channels', 'Subsea fracture ridges']
  },
  {
    name: 'Arabian Sea Abyssal Basin',
    lat: 15.5527,
    lon: 63.7872,
    radiusDeg: 4.0,
    depth: 3820,
    morphology: 'abyssal_plain',
    label: 'Indus Fan Abyssal Plain',
    sediment: 'Organic-rich Indus submarine fan turbidites',
    plate: 'Indian Plate',
    features: ['Indus Submarine Canyon distal lobes', 'Intense sub-surface OMZ layer']
  },
  {
    name: 'Arctic Fram Strait / Molloy Deep',
    lat: 79.1,
    lon: 2.8,
    radiusDeg: 3.5,
    depth: 5550,
    morphology: 'trench',
    label: 'Arctic Molloy Deep Pull-Apart Basin',
    sediment: 'Glaciomarine clay & dropstone erratics',
    plate: 'Eurasian & North American Plate boundary',
    features: ['Molloy Deep (deepest in Arctic: 5,550m)', 'Fram Strait circulation gate']
  }
];

/**
 * Calculates bathymetric seabed depth, geological morphology,
 * sediment composition, and benthic environmental properties.
 * Uses authoritative signed elevation from the unified bathymetry pipeline when provided
 * or when covered by a local regional tile, and never converts positive land elevations
 * into artificial water depths.
 */
export function getAccurateSeabed(
  lat: number,
  lon: number,
  options?: {
    measuredElevationMeters?: number | null;
    source?: string;
    provenance?: string;
  }
): AccurateSeabedInfo {
  const normLon = normalizeLongitude(lon);
  const absLat = Math.abs(lat);

  // 0. If no explicit measuredElevationMeters was passed, check if a local regional preset tile covers (lat, lon)
  let measuredElevation = options?.measuredElevationMeters;
  let resolvedSource = options?.source;
  let resolvedProvenance = options?.provenance;

  if (measuredElevation === undefined || measuredElevation === null) {
    const presetTile = findPresetCoveringCoordinates(lat, normLon);
    if (presetTile && presetTile.rawElevations && presetTile.bounds) {
      const b = presetTile.bounds;
      const v = Math.min(1, Math.max(0, (b.maxLat - lat) / Math.max(1e-6, b.maxLat - b.minLat)));
      const u = Math.min(1, Math.max(0, (normLon - b.minLon) / Math.max(1e-6, b.maxLon - b.minLon)));
      const r = Math.min(presetTile.gridHeight - 1, Math.max(0, Math.round(v * (presetTile.gridHeight - 1))));
      const c = Math.min(presetTile.gridWidth - 1, Math.max(0, Math.round(u * (presetTile.gridWidth - 1))));
      const val = presetTile.rawElevations[r * presetTile.gridWidth + c];
      if (val !== undefined && Number.isFinite(val)) {
        measuredElevation = val;
        resolvedSource = presetTile.source;
        resolvedProvenance = presetTile.provenance || 'preset_regional';
      }
    }
  }

  // If we have a positive land elevation from an authoritative grid, never convert it into water depth
  if (measuredElevation !== undefined && measuredElevation !== null && Number.isFinite(measuredElevation) && measuredElevation > 0) {
    return {
      depth: 0,
      elevationMeters: Math.round(measuredElevation),
      isLand: true,
      source: resolvedSource || 'Authoritative Topographic-Bathymetric Grid',
      provenance: resolvedProvenance || 'authoritative_online',
      morphology: 'shelf',
      morphologyLabel: `Continental Landmass (+${Math.round(measuredElevation)}m ASL)`,
      sedimentType: 'Subaerial continental crust & coastal regolith',
      benthicTemperature: 15.0,
      benthicPressure: 1.0,
      tectonicPlate: lat >= 0 ? 'Northern Continental Lithosphere' : 'Southern Continental Lithosphere',
      features: ['Above Mean Sea Level (Land)', 'Subaerial topography']
    };
  }

  const authoritativeDepth =
    measuredElevation !== undefined && measuredElevation !== null && Number.isFinite(measuredElevation)
      ? Math.max(0, Math.round(-measuredElevation))
      : null;

  // 1. Check known landmark features for geological context (using authoritative depth when available)
  for (const feature of KNOWN_FEATURES) {
    const dLat = Math.abs(feature.lat - lat);
    let dLon = Math.abs(feature.lon - normLon);
    if (dLon > 180) dLon = 360 - dLon;
    const dist = Math.hypot(dLat, dLon);

    if (dist <= feature.radiusDeg) {
      const factor = dist / feature.radiusDeg;
      const variation = (Math.sin(lat * 3.5) * Math.cos(normLon * 3.5)) * 120;
      const fallbackDepth = Math.max(15, Math.round(feature.depth - factor * 400 + variation));
      const depth = authoritativeDepth !== null ? authoritativeDepth : fallbackDepth;

      const benthicPressure = Number((1.013 + depth * 0.1008).toFixed(1));
      const benthicTemp = Number((depth > 4000 ? 1.6 + Math.sin(lat) * 0.4 : depth < 200 ? 18.5 : 2.5).toFixed(2));

      return {
        depth,
        elevationMeters: -depth,
        isLand: false,
        source: resolvedSource || 'Regional Bathymetric Feature Model',
        provenance: resolvedProvenance || (authoritativeDepth !== null ? 'preset_regional' : 'modelled'),
        morphology: feature.morphology,
        morphologyLabel: feature.label,
        sedimentType: feature.sediment,
        benthicTemperature: benthicTemp,
        benthicPressure,
        tectonicPlate: feature.plate,
        features: feature.features
      };
    }
  }

  // 2. If authoritative depth was measured outside named landmarks, classify morphology from true depth
  if (authoritativeDepth !== null) {
    const morphology: SeabedMorphologyType =
      authoritativeDepth > 6000
        ? 'trench'
        : authoritativeDepth < 200
          ? 'shelf'
          : authoritativeDepth < 2200
            ? 'slope'
            : authoritativeDepth < 3400
              ? 'ridge'
              : 'abyssal_plain';
    const morphologyLabel =
      morphology === 'trench'
        ? 'Hadal Subduction Trench'
        : morphology === 'shelf'
          ? 'Continental Shelf Platform'
          : morphology === 'slope'
            ? 'Continental Slope & Margin'
            : morphology === 'ridge'
              ? 'Bathyal Ridge / Seamount Province'
              : 'Oceanic Abyssal Plain';
    const benthicPressure = Number((1.013 + authoritativeDepth * 0.1008).toFixed(1));
    const benthicTemp = Number((authoritativeDepth > 4000 ? 1.7 : authoritativeDepth < 200 ? 16.5 : 2.8).toFixed(2));

    return {
      depth: authoritativeDepth,
      elevationMeters: -authoritativeDepth,
      isLand: false,
      source: resolvedSource || 'Authoritative Bathymetric Grid',
      provenance: resolvedProvenance || 'authoritative_online',
      morphology,
      morphologyLabel,
      sedimentType:
        authoritativeDepth < 200
          ? 'Neritic terrigenous sand & carbonate shelf sediment'
          : absLat > 50
            ? 'Glaciomarine & diatomaceous siliceous ooze'
            : 'Pelagic clay & calcareous foraminiferal ooze',
      benthicTemperature: benthicTemp,
      benthicPressure,
      tectonicPlate: lat >= 0 ? 'North Oceanic Lithospheric Plate' : 'South Oceanic Lithospheric Plate',
      features: [morphologyLabel, 'Gridded bathymetric sounding']
    };
  }

  // 3. Marginal Sea General Basins (Modelled fallback when called synchronously without authoritative grid)
  // Mediterranean Sea
  if (lat >= 30 && lat <= 45 && normLon >= -5 && normLon <= 36) {
    const medDepth = 2400 + Math.round(Math.sin(lat * 2) * Math.cos(normLon * 2) * 650);
    return {
      depth: medDepth,
      elevationMeters: -medDepth,
      isLand: false,
      source: 'Modelled Regional Hypsometry (Non-Survey Fallback)',
      provenance: 'modelled',
      morphology: 'slope',
      morphologyLabel: 'Mediterranean Deep Basin & Escarpment',
      sedimentType: 'Sapropelic biogenic mud & calcareous ooze',
      benthicTemperature: 13.5,
      benthicPressure: Number((1.013 + medDepth * 0.1008).toFixed(1)),
      tectonicPlate: 'African-Eurasian convergent zone',
      features: ['Calypso Deep (5,267m)', 'Hellenic Trench Arc', 'Submarine canyon systems']
    };
  }

  // Red Sea
  if (lat >= 12 && lat <= 30 && normLon >= 34 && normLon <= 44) {
    const redSeaDepth = 1250 + Math.round(Math.cos(lat) * 450);
    return {
      depth: redSeaDepth,
      elevationMeters: -redSeaDepth,
      isLand: false,
      source: 'Modelled Regional Hypsometry (Non-Survey Fallback)',
      provenance: 'modelled',
      morphology: 'ridge',
      morphologyLabel: 'Red Sea Axial Rift & Brine Deep',
      sedimentType: 'Hydrothermal metalliferous sediment & carbonate mud',
      benthicTemperature: 21.5,
      benthicPressure: Number((1.013 + redSeaDepth * 0.1008).toFixed(1)),
      tectonicPlate: 'Arabian & Nubian Plate divergent rift',
      features: ['Atlantis II Deep', 'Hydrothermal metal-rich brines']
    };
  }

  // Caribbean Sea
  if (lat >= 10 && lat <= 26 && normLon >= -88 && normLon <= -60) {
    const caribDepth = 3600 + Math.round(Math.sin(lat) * 500);
    return {
      depth: caribDepth,
      elevationMeters: -caribDepth,
      isLand: false,
      source: 'Modelled Regional Hypsometry (Non-Survey Fallback)',
      provenance: 'modelled',
      morphology: 'abyssal_plain',
      morphologyLabel: 'Caribbean Abyssal Basin & Trench Margin',
      sedimentType: 'Pteropod & foraminiferal calcareous ooze',
      benthicTemperature: 4.1,
      benthicPressure: Number((1.013 + caribDepth * 0.1008).toFixed(1)),
      tectonicPlate: 'Caribbean Plate',
      features: ['Cayman Trough', 'Aves Ridge', 'Colombia Basin']
    };
  }

  // Mid-Atlantic Ridge general zone
  if (normLon >= -45 && normLon <= -20 && absLat < 60) {
    const ridgeDepth = 2600 + Math.round(Math.sin(lat * 5) * 450);
    return {
      depth: ridgeDepth,
      elevationMeters: -ridgeDepth,
      isLand: false,
      source: 'Modelled Regional Hypsometry (Non-Survey Fallback)',
      provenance: 'modelled',
      morphology: 'ridge',
      morphologyLabel: 'Mid-Ocean Ridge Axial Crest & Rift Valley',
      sedimentType: 'Volcanic basalt, hydrothermal sulfides & foraminiferal sand',
      benthicTemperature: 2.2,
      benthicPressure: Number((1.013 + ridgeDepth * 0.1008).toFixed(1)),
      tectonicPlate: 'Divergent oceanic spreading boundary',
      features: ['Central axial rift', 'Hydrothermal black smokers', 'Fracture zones']
    };
  }

  // Global Default Abyssal Plains (Modelled fallback)
  const baseAbyssalDepth = 4300 + Math.round((Math.sin(lat * 0.25) * Math.cos(normLon * 0.25)) * 600);
  const benthicPressure = Number((1.013 + baseAbyssalDepth * 0.1008).toFixed(1));
  const benthicTemp = Number((absLat > 60 ? -0.4 : 1.9).toFixed(2));

  return {
    depth: baseAbyssalDepth,
    elevationMeters: -baseAbyssalDepth,
    isLand: false,
    source: 'Modelled Regional Hypsometry (Non-Survey Fallback)',
    provenance: 'modelled',
    morphology: 'abyssal_plain',
    morphologyLabel: 'Vast Oceanic Abyssal Plain (Modelled Estimate)',
    sedimentType: absLat > 50 ? 'Diatomaceous siliceous ooze' : 'Pelagic red clay & foraminiferal sediment',
    benthicTemperature: benthicTemp,
    benthicPressure,
    tectonicPlate: lat >= 0 ? 'North Oceanic Lithospheric Plate' : 'South Oceanic Lithospheric Plate',
    features: ['Abyssal hills', 'Pelagic drape', 'Manganese nodules']
  };
}

export const getAccurateSeabedInfo = getAccurateSeabed;

