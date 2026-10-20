import { ContinentFeature, HistoricalStormPreset, OceanRegion, TimeSeriesPoint } from '../types/ocean';

export const OCEAN_REGIONS: OceanRegion[] = [
  // SOUTH ASIA / INDIAN OCEAN SECTOR
  {
    id: 'arabian-sea',
    name: 'Arabian Sea',
    parentBasin: 'Indian Ocean',
    coordinates: { latitude: 18.0, longitude: 64.0 },
    bounds: { minLat: 8.0, maxLat: 25.5, minLon: 55.0, maxLon: 77.0 },
    areaSqKm: '3,862,000 km²',
    maxDepth: 4652,
    averageDepth: 2734,
    nearbyLandmarks: ['Carlsberg Ridge', 'Indus Submarine Canyon', 'Lakshadweep Archipelago', 'Gulf of Oman'],
    overview: 'Northwestern section of the Indian Ocean bounded by India, Pakistan, Iran, and the Arabian Peninsula. Famous for intense summer monsoon upwelling and an expansive subsurface Oxygen Minimum Zone.'
  },
  {
    id: 'bay-of-bengal',
    name: 'Bay of Bengal',
    parentBasin: 'Indian Ocean',
    coordinates: { latitude: 15.5, longitude: 88.0 },
    bounds: { minLat: 5.0, maxLat: 22.5, minLon: 80.0, maxLon: 95.0 },
    areaSqKm: '2,600,000 km²',
    maxDepth: 4694,
    averageDepth: 2600,
    nearbyLandmarks: ['Swatch of No Ground Submarine Canyon', 'Ninety East Ridge', 'Andaman-Nicobar Trench Arc', 'Ganges-Brahmaputra Fan'],
    overview: 'The largest water region called a bay in the world. Receives massive freshwater outflow from the Ganges, Brahmaputra, and Irrawaddy rivers, resulting in a low-salinity surface layer and frequent tropical cyclones.'
  },
  {
    id: 'central-indian-ocean',
    name: 'Central Indian Ocean Basin',
    parentBasin: 'Indian Ocean',
    coordinates: { latitude: -5.0, longitude: 75.0 },
    bounds: { minLat: -20.0, maxLat: 5.0, minLon: 60.0, maxLon: 90.0 },
    areaSqKm: '5,100,000 km²',
    maxDepth: 5400,
    averageDepth: 3890,
    nearbyLandmarks: ['Chagos-Laccadive Ridge', 'Central Indian Ridge', 'Diego Garcia Atoll'],
    overview: 'Open equatorial basin known for the Indian Ocean Dipole (IOD) atmospheric-oceanic coupled mode and widespread manganese nodule deposits across the abyssal plains.'
  },
  {
    id: 'andaman-sea',
    name: 'Andaman Sea',
    parentBasin: 'Indian Ocean / Southeast Asia',
    coordinates: { latitude: 10.5, longitude: 95.5 },
    bounds: { minLat: 5.0, maxLat: 16.0, minLon: 92.0, maxLon: 99.0 },
    areaSqKm: '797,700 km²',
    maxDepth: 4180,
    averageDepth: 1096,
    nearbyLandmarks: ['Barren Island Volcanic Arc', 'Sewell Seamount', 'Strait of Malacca approach'],
    overview: 'Semi-enclosed marginal sea bounded by Myanmar, Thailand, and the Andaman & Nicobar islands. Features active back-arc seafloor spreading and intense internal solitary waves.'
  },

  // NORTH AMERICA / ADJACENT OCEANS
  {
    id: 'gulf-of-mexico',
    name: 'Gulf of Mexico',
    parentBasin: 'North Atlantic Ocean',
    coordinates: { latitude: 25.0, longitude: -90.0 },
    bounds: { minLat: 18.0, maxLat: 30.5, minLon: -98.0, maxLon: -81.0 },
    areaSqKm: '1,550,000 km²',
    maxDepth: 4384,
    averageDepth: 1615,
    nearbyLandmarks: ['Sigsbee Deep (4,384m)', 'Loop Current', 'Mississippi River Delta Canyon', 'Campeche Bank'],
    overview: 'Oceanic basin connected to the Atlantic via Florida Straits. Dominated by the warm Loop Current that sheds energetic anticyclonic eddies and fuels powerful Atlantic hurricanes.'
  },
  {
    id: 'sargasso-sea',
    name: 'Sargasso Sea (North Atlantic Gyre)',
    parentBasin: 'North Atlantic Ocean',
    coordinates: { latitude: 28.0, longitude: -66.0 },
    bounds: { minLat: 20.0, maxLat: 35.0, minLon: -75.0, maxLon: -45.0 },
    areaSqKm: '3,500,000 km²',
    maxDepth: 5500,
    averageDepth: 4500,
    nearbyLandmarks: ['Bermuda Pedestal', 'Hatteras Abyssal Plain', 'New England Seamount Chain'],
    overview: 'The only sea on Earth bounded strictly by ocean currents (Gulf Stream, North Atlantic Current, Canary Current, North Equatorial Current). Known for floating Sargassum seaweed.'
  },
  {
    id: 'california-current',
    name: 'California Current System',
    parentBasin: 'North Pacific Ocean',
    coordinates: { latitude: 33.0, longitude: -121.5 },
    bounds: { minLat: 23.0, maxLat: 48.0, minLon: -128.0, maxLon: -116.0 },
    areaSqKm: '2,100,000 km²',
    maxDepth: 4200,
    averageDepth: 3100,
    nearbyLandmarks: ['Monterey Submarine Canyon', 'Channel Islands', 'Davidson Seamount'],
    overview: 'Eastern boundary current carrying cold subarctic water southward along the western coast of North America, creating famous coastal fog and high biological productivity.'
  },

  // EUROPE / ARCTIC / MEDITERRANEAN
  {
    id: 'mediterranean-sea',
    name: 'Mediterranean Sea',
    parentBasin: 'Atlantic Mediterranean Gateway',
    coordinates: { latitude: 35.5, longitude: 18.0 },
    bounds: { minLat: 30.0, maxLat: 45.0, minLon: -5.0, maxLon: 36.0 },
    areaSqKm: '2,500,000 km²',
    maxDepth: 5267,
    averageDepth: 1500,
    nearbyLandmarks: ['Calypso Deep (5,267m)', 'Strait of Gibraltar', 'Messina Whirlpool', 'Hellenic Trench'],
    overview: 'Intercontinental marginal sea with high evaporation, generating dense, warm, high-salinity Mediterranean Outflow Water that cascades into the North Atlantic.'
  },
  {
    id: 'north-sea',
    name: 'North Sea',
    parentBasin: 'Northeast Atlantic Shelf',
    coordinates: { latitude: 56.0, longitude: 3.5 },
    bounds: { minLat: 51.0, maxLat: 61.0, minLon: -4.0, maxLon: 9.0 },
    areaSqKm: '570,000 km²',
    maxDepth: 700,
    averageDepth: 95,
    nearbyLandmarks: ['Dogger Bank', 'Norwegian Trench (Skagerrak)', 'Devil\'s Hole'],
    overview: 'Shallow epeiric sea on the European continental shelf with strong semidiurnal tides, massive offshore wind corridors, and intense winter gales.'
  },

  // EAST & SOUTHEAST ASIA / WESTERN PACIFIC
  {
    id: 'philippine-sea',
    name: 'Philippine Sea & Mariana Basin',
    parentBasin: 'North Pacific Ocean',
    coordinates: { latitude: 18.0, longitude: 133.0 },
    bounds: { minLat: 5.0, maxLat: 34.0, minLon: 122.0, maxLon: 144.0 },
    areaSqKm: '5,695,000 km²',
    maxDepth: 10994,
    averageDepth: 4100,
    nearbyLandmarks: ['Mariana Trench (Challenger Deep)', 'Philippine Trench', 'Kyushu-Palau Ridge'],
    overview: 'Western Pacific marginal basin home to the deepest point on Earth and the birthplace of intense Western Pacific super typhoons.'
  },
  {
    id: 'south-china-sea',
    name: 'South China Sea',
    parentBasin: 'Western Pacific / Southeast Asia',
    coordinates: { latitude: 13.0, longitude: 114.0 },
    bounds: { minLat: 2.0, maxLat: 22.0, minLon: 104.0, maxLon: 120.0 },
    areaSqKm: '3,500,000 km²',
    maxDepth: 5016,
    averageDepth: 1212,
    nearbyLandmarks: ['Spratly Islands Atolls', 'Sunda Shelf', 'Manila Trench Subduction Arc'],
    overview: 'Strategically vital marginal sea with shallow continental shelves in the southwest transitioning into an abyssal basin and the seismic Manila Trench in the east.'
  },

  // AUSTRALIA / OCEANIA
  {
    id: 'coral-sea',
    name: 'Coral Sea (Great Barrier Reef)',
    parentBasin: 'South Pacific Ocean',
    coordinates: { latitude: -18.0, longitude: 153.0 },
    bounds: { minLat: -26.0, maxLat: -10.0, minLon: 142.0, maxLon: 165.0 },
    areaSqKm: '4,791,000 km²',
    maxDepth: 9140,
    averageDepth: 2394,
    nearbyLandmarks: ['Great Barrier Reef', 'Queensland Trough', 'Coral Sea Basin Plains'],
    overview: 'Vibrant oligotrophic tropical sea home to the world\'s largest living coral reef structure, bordered by deep underwater troughs and the East Australian Current.'
  },
  {
    id: 'tasman-sea',
    name: 'Tasman Sea',
    parentBasin: 'South Pacific Ocean',
    coordinates: { latitude: -37.0, longitude: 160.0 },
    bounds: { minLat: -46.0, maxLat: -30.0, minLon: 147.0, maxLon: 174.0 },
    areaSqKm: '2,300,000 km²',
    maxDepth: 5943,
    averageDepth: 3500,
    nearbyLandmarks: ['Lord Howe Rise', 'Tasmantid Seamount Chain', 'Bass Strait threshold'],
    overview: 'Expansive stormy body of water between Australia and New Zealand, swept by Roaring Forties westerly winds and powerful boundary currents.'
  }
];

export const CONTINENTS: ContinentFeature[] = [
  {
    id: 'india',
    name: 'India / South Asian Subcontinent',
    center: { latitude: 20.5937, longitude: 78.9629 },
    bounds: { minLat: 6.5, maxLat: 35.5, minLon: 68.0, maxLon: 97.0 },
    surroundingOceans: [
      OCEAN_REGIONS.find(r => r.id === 'arabian-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'bay-of-bengal')!,
      OCEAN_REGIONS.find(r => r.id === 'central-indian-ocean')!,
      OCEAN_REGIONS.find(r => r.id === 'andaman-sea')!
    ]
  },
  {
    id: 'north-america',
    name: 'North America',
    center: { latitude: 39.8283, longitude: -98.5795 },
    bounds: { minLat: 15.0, maxLat: 72.0, minLon: -168.0, maxLon: -52.0 },
    surroundingOceans: [
      OCEAN_REGIONS.find(r => r.id === 'gulf-of-mexico')!,
      OCEAN_REGIONS.find(r => r.id === 'sargasso-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'california-current')!
    ]
  },
  {
    id: 'europe',
    name: 'Europe',
    center: { latitude: 50.8503, longitude: 14.3518 },
    bounds: { minLat: 36.0, maxLat: 71.0, minLon: -10.0, maxLon: 40.0 },
    surroundingOceans: [
      OCEAN_REGIONS.find(r => r.id === 'mediterranean-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'north-sea')!
    ]
  },
  {
    id: 'asia-east',
    name: 'East & Southeast Asia',
    center: { latitude: 28.0, longitude: 110.0 },
    bounds: { minLat: -10.0, maxLat: 45.0, minLon: 98.0, maxLon: 145.0 },
    surroundingOceans: [
      OCEAN_REGIONS.find(r => r.id === 'philippine-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'south-china-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'andaman-sea')!
    ]
  },
  {
    id: 'australia',
    name: 'Australia & Oceania',
    center: { latitude: -25.2744, longitude: 133.7751 },
    bounds: { minLat: -44.0, maxLat: -10.0, minLon: 112.0, maxLon: 154.0 },
    surroundingOceans: [
      OCEAN_REGIONS.find(r => r.id === 'coral-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'tasman-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'central-indian-ocean')!
    ]
  },
  {
    id: 'south-america',
    name: 'South America',
    center: { latitude: -14.235, longitude: -51.9253 },
    bounds: { minLat: -56.0, maxLat: 13.0, minLon: -82.0, maxLon: -34.0 },
    surroundingOceans: [
      OCEAN_REGIONS.find(r => r.id === 'california-current') || OCEAN_REGIONS[0],
      OCEAN_REGIONS.find(r => r.id === 'gulf-of-mexico') || OCEAN_REGIONS[1]
    ]
  },
  {
    id: 'africa',
    name: 'Africa',
    center: { latitude: 1.6508, longitude: 17.6875 },
    bounds: { minLat: -35.0, maxLat: 37.0, minLon: -18.0, maxLon: 52.0 },
    surroundingOceans: [
      OCEAN_REGIONS.find(r => r.id === 'arabian-sea')!,
      OCEAN_REGIONS.find(r => r.id === 'central-indian-ocean')!,
      OCEAN_REGIONS.find(r => r.id === 'mediterranean-sea')!
    ]
  }
];

export const HISTORICAL_STORMS: HistoricalStormPreset[] = [
  {
    id: 'amphan-2020',
    name: 'Super Cyclone Amphan (May 2020)',
    oceanRegion: 'Bay of Bengal',
    coordinates: { latitude: 15.5, longitude: 87.5 },
    peakDate: '2020-05-18T12:00:00Z',
    description: 'Catastrophic Category 5 equivalent super cyclone in the Bay of Bengal. Intense central pressure of 906 hPa generated extreme significant wave heights exceeding 11.5 meters.',
    peakWaveHeight: 11.8,
    peakWindSpeed: 215,
    dataSeries: generateStormCurve(11.8, 14.5, 215, 29.8)
  },
  {
    id: 'sandy-2012',
    name: 'Hurricane Sandy (October 2012)',
    oceanRegion: 'Western North Atlantic',
    coordinates: { latitude: 35.0, longitude: -73.5 },
    peakDate: '2012-10-29T18:00:00Z',
    description: 'Immense hybrid storm spanning over 1,500 km across the western Atlantic. Swells radiated from Cape Hatteras reaching 9.8 meters with widespread coastal inundation.',
    peakWaveHeight: 9.8,
    peakWindSpeed: 165,
    dataSeries: generateStormCurve(9.8, 13.8, 165, 22.4)
  },
  {
    id: 'gonu-2007',
    name: 'Cyclone Gonu (June 2007)',
    oceanRegion: 'Arabian Sea',
    coordinates: { latitude: 19.5, longitude: 62.0 },
    peakDate: '2007-06-04T12:00:00Z',
    description: 'Strongest tropical cyclone on record in the Arabian Sea. Exceptional thermodynamic energy fueled wave heights above 10 meters heading towards the Gulf of Oman.',
    peakWaveHeight: 10.5,
    peakWindSpeed: 195,
    dataSeries: generateStormCurve(10.5, 14.0, 195, 30.5)
  },
  {
    id: 'haiyan-2013',
    name: 'Super Typhoon Haiyan (Nov 2013)',
    oceanRegion: 'Philippine Sea',
    coordinates: { latitude: 10.6, longitude: 128.5 },
    peakDate: '2013-11-07T18:00:00Z',
    description: 'One of the most intense tropical cyclones ever recorded globally with 1-minute sustained winds of 315 km/h and massive open-ocean significant wave heights of 14.2 meters.',
    peakWaveHeight: 14.2,
    peakWindSpeed: 260,
    dataSeries: generateStormCurve(14.2, 16.2, 260, 29.2)
  }
];

function generateStormCurve(peakWave: number, peakPeriod: number, peakWind: number, sst: number): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const totalHours = 48;
  const peakHour = 24;

  for (let h = 0; h <= totalHours; h += 2) {
    const distFromPeak = Math.abs(h - peakHour);
    const bellFactor = Math.exp(-Math.pow(distFromPeak / 9.0, 2));

    const baselineWave = 1.6;
    const waveHeight = Number((baselineWave + (peakWave - baselineWave) * bellFactor).toFixed(2));
    const wavePeriod = Number((6.5 + (peakPeriod - 6.5) * bellFactor).toFixed(1));
    const windSpeed = Number((28 + (peakWind - 28) * bellFactor).toFixed(1));
    const waveDir = Math.round((140 + 80 * Math.sin(h * 0.15)) % 360);
    const windDir = Math.round((waveDir + 15) % 360);
    const currentVel = Number((1.2 + 3.8 * bellFactor).toFixed(2));

    points.push({
      time: `T+${String(h).padStart(2, '0')}h`,
      hour: h,
      waveHeight,
      wavePeriod,
      waveDirection: waveDir,
      windSpeed,
      windDirection: windDir,
      currentVelocity: currentVel,
      temperature: Number((sst - bellFactor * 1.8).toFixed(2)) // Upwelling SST cooling under storm
    });
  }

  return points;
}

/**
 * Detects if a clicked coordinate lies on or near a recognized continent
 */
export function detectContinent(lat: number, lon: number): ContinentFeature | null {
  for (const continent of CONTINENTS) {
    const { minLat, maxLat, minLon, maxLon } = continent.bounds;
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      return continent;
    }
  }
  return null;
}

/**
 * Find ocean region by coordinate proximity
 */
export function findNearestOceanRegion(lat: number, lon: number): OceanRegion | null {
  let closest: OceanRegion | null = null;
  let minDist = Infinity;

  for (const region of OCEAN_REGIONS) {
    const dLat = Math.abs(region.coordinates.latitude - lat);
    let dLon = Math.abs(region.coordinates.longitude - lon);
    if (dLon > 180) dLon = 360 - dLon;
    const dist = Math.hypot(dLat, dLon);

    if (dist < minDist) {
      minDist = dist;
      closest = region;
    }
  }

  return closest;
}
