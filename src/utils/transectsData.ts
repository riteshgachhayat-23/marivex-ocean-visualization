import { BathymetricTransect } from '../types/ocean';

export const BATHYMETRIC_TRANSECTS: BathymetricTransect[] = [
  {
    id: 'mariana-trench-transect',
    title: 'Mariana Trench: Challenger Deep Transect',
    regionName: 'Western Pacific Ocean',
    startCoords: { latitude: 12.0, longitude: 141.0 },
    endCoords: { latitude: 11.35, longitude: 143.5 },
    totalDistanceKm: 280,
    maxDepthM: 10994,
    minDepthM: 120,
    description: 'Convergent subduction plate boundary where the dense Pacific Plate dives steeply beneath the Mariana microplate, plunging into the deepest hadal chasm on Earth.',
    profile: [
      { distanceKm: 0, depthM: 140, featureName: 'Mariana Forearc Ridge', seabedType: 'shelf' },
      { distanceKm: 35, depthM: 1850, featureName: 'Inner Continental Slope', seabedType: 'slope' },
      { distanceKm: 70, depthM: 4200, featureName: 'Mid-Slope Terrace', seabedType: 'plain' },
      { distanceKm: 110, depthM: 6800, featureName: 'Hadal Subduction Notch', seabedType: 'slope' },
      { distanceKm: 140, depthM: 10994, featureName: 'Challenger Deep Axis (Hadal Plain)', seabedType: 'trench' },
      { distanceKm: 175, depthM: 7400, featureName: 'Outer Trench Slope Fault Scarps', seabedType: 'slope' },
      { distanceKm: 215, depthM: 5200, featureName: 'Outer Swell Bulge', seabedType: 'plain' },
      { distanceKm: 250, depthM: 3100, featureName: 'Pacific Seamount Chain', seabedType: 'seamount' },
      { distanceKm: 280, depthM: 5800, featureName: 'Abyssal Pacific Basin Floor', seabedType: 'plain' },
    ]
  },
  {
    id: 'mid-atlantic-ridge-transect',
    title: 'Mid-Atlantic Ridge: Axial Rift Valley Transect',
    regionName: 'Central Atlantic Ocean',
    startCoords: { latitude: 26.0, longitude: -47.0 },
    endCoords: { latitude: 26.0, longitude: -42.0 },
    totalDistanceKm: 495,
    maxDepthM: 4850,
    minDepthM: 1950,
    description: 'Divergent spreading plate boundary separating the North American and Eurasian plates, featuring a central axial graben, pillow basalt flows, and hydrothermal black smokers.',
    profile: [
      { distanceKm: 0, depthM: 4800, featureName: 'Western Atlantic Abyssal Plain', seabedType: 'plain' },
      { distanceKm: 90, depthM: 4100, featureName: 'Outer Flank Abyssal Hills', seabedType: 'plain' },
      { distanceKm: 170, depthM: 3200, featureName: 'Ridge Flank Terraces', seabedType: 'slope' },
      { distanceKm: 220, depthM: 2100, featureName: 'Western Rift Valley Shoulder', seabedType: 'ridge' },
      { distanceKm: 248, depthM: 3950, featureName: 'Central Axial Graben / Hydrothermal Smoker Zone', seabedType: 'trench' },
      { distanceKm: 275, depthM: 1950, featureName: 'Eastern Rift Crest Peak', seabedType: 'ridge' },
      { distanceKm: 340, depthM: 3150, featureName: 'Eastern Flank Steps', seabedType: 'slope' },
      { distanceKm: 420, depthM: 4300, featureName: 'Deep Flank Sediment Apron', seabedType: 'plain' },
      { distanceKm: 495, depthM: 4850, featureName: 'Cape Verde Abyssal Basin', seabedType: 'plain' },
    ]
  },
  {
    id: 'sunda-trench-transect',
    title: 'Sunda (Java) Trench Megathrust Transect',
    regionName: 'Northeastern Indian Ocean',
    startCoords: { latitude: -5.0, longitude: 101.0 },
    endCoords: { latitude: -12.0, longitude: 104.0 },
    totalDistanceKm: 820,
    maxDepthM: 7290,
    minDepthM: 50,
    description: 'Active Indian-Australian subduction under the Sunda Plate, responsible for massive ocean tsunamis and deep forearc accretionary prisms.',
    profile: [
      { distanceKm: 0, depthM: 50, featureName: 'Sumatran Continental Shelf', seabedType: 'shelf' },
      { distanceKm: 120, depthM: 1100, featureName: 'Forearc Basin Floor', seabedType: 'slope' },
      { distanceKm: 240, depthM: 260, featureName: 'Mentawai Non-Volcanic Outer Arc Ridge', seabedType: 'ridge' },
      { distanceKm: 360, depthM: 3800, featureName: 'Inner Trench Slumping Escarpment', seabedType: 'slope' },
      { distanceKm: 470, depthM: 7290, featureName: 'Sunda Trench Axis (Hadal Axis)', seabedType: 'trench' },
      { distanceKm: 560, depthM: 5200, featureName: 'Outer Trench Bulge', seabedType: 'slope' },
      { distanceKm: 700, depthM: 5650, featureName: 'Wharton Abyssal Plain', seabedType: 'plain' },
      { distanceKm: 820, depthM: 2900, featureName: 'Ninety East Ridge Extension', seabedType: 'seamount' },
    ]
  },
  {
    id: 'puerto-rico-trench-transect',
    title: 'Puerto Rico Trench & Milwaukee Deep',
    regionName: 'Caribbean / Atlantic Boundary',
    startCoords: { latitude: 18.5, longitude: -66.5 },
    endCoords: { latitude: 20.8, longitude: -66.5 },
    totalDistanceKm: 255,
    maxDepthM: 8376,
    minDepthM: 30,
    description: 'The deepest point in the Atlantic Ocean, marked by oblique subduction and an enormous subsea landslide headwall.',
    profile: [
      { distanceKm: 0, depthM: 30, featureName: 'San Juan Insular Shelf', seabedType: 'shelf' },
      { distanceKm: 30, depthM: 1400, featureName: 'Upper Insular Slope Escarpment', seabedType: 'slope' },
      { distanceKm: 70, depthM: 4600, featureName: 'Submerged Carbonate Platform Edge', seabedType: 'slope' },
      { distanceKm: 125, depthM: 8376, featureName: 'Milwaukee Deep (Trench Axis)', seabedType: 'trench' },
      { distanceKm: 175, depthM: 5800, featureName: 'North Wall Fault Blocks', seabedType: 'slope' },
      { distanceKm: 255, depthM: 5400, featureName: 'Nares Abyssal Plain', seabedType: 'plain' },
    ]
  }
];
