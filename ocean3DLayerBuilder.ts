import * as THREE from 'three';
import { OceanAnomalyRecord, OceanDataLayerId } from '../types/ocean';
import { MaritimeStation } from './operationsData';

// Helper to safely clear a Three.js group
export function clearGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const obj = group.children[0];
    group.remove(obj);
    if ((obj as any).geometry) (obj as any).geometry.dispose();
    if ((obj as any).material) {
      if (Array.isArray((obj as any).material)) {
        (obj as any).material.forEach((m: any) => m.dispose());
      } else {
        (obj as any).material.dispose();
      }
    }
    if ((obj as any).material?.map) (obj as any).material.map.dispose();
  }
}

// Major global ocean currents streamline curves
const GLOBAL_CURRENTS = [
  // Gulf Stream & North Atlantic Drift
  [
    { lat: 25, lon: -80 }, { lat: 32, lon: -76 }, { lat: 38, lon: -68 },
    { lat: 42, lon: -50 }, { lat: 48, lon: -35 }, { lat: 55, lon: -20 },
    { lat: 62, lon: 0 }
  ],
  // Kuroshio Current
  [
    { lat: 18, lon: 124 }, { lat: 26, lon: 126 }, { lat: 34, lon: 138 },
    { lat: 38, lon: 148 }, { lat: 42, lon: 165 }, { lat: 44, lon: 180 }
  ],
  // Antarctic Circumpolar Current (South Atlantic -> Indian -> Pacific)
  [
    { lat: -56, lon: -70 }, { lat: -54, lon: -30 }, { lat: -52, lon: 10 },
    { lat: -52, lon: 50 }, { lat: -54, lon: 90 }, { lat: -55, lon: 130 },
    { lat: -56, lon: 170 }, { lat: -58, lon: -140 }, { lat: -56, lon: -100 },
    { lat: -56, lon: -70 }
  ],
  // Agulhas Current & Retroflection
  [
    { lat: -22, lon: 36 }, { lat: -28, lon: 33 }, { lat: -34, lon: 26 },
    { lat: -39, lon: 20 }, { lat: -38, lon: 28 }, { lat: -42, lon: 40 }
  ],
  // Humboldt / Peru Current
  [
    { lat: -45, lon: -75 }, { lat: -35, lon: -73 }, { lat: -25, lon: -72 },
    { lat: -15, lon: -77 }, { lat: -5, lon: -82 }, { lat: 0, lon: -90 }
  ],
  // Somali Current & Arabian Sea Whirl
  [
    { lat: -2, lon: 43 }, { lat: 5, lon: 49 }, { lat: 11, lon: 52 },
    { lat: 16, lon: 58 }, { lat: 18, lon: 65 }
  ],
  // California Current
  [
    { lat: 48, lon: -128 }, { lat: 40, lon: -126 }, { lat: 32, lon: -120 },
    { lat: 24, lon: -115 }, { lat: 18, lon: -110 }
  ]
];

// Swell direction and wind vector sampling grid across global basins
const GLOBAL_VECTOR_POINTS = [
  // North Atlantic
  { lat: 45, lon: -35, waveDir: 250, waveHs: 4.8, windDir: 260, windSpeed: 48, period: 12 },
  { lat: 32, lon: -40, waveDir: 230, waveHs: 2.4, windDir: 240, windSpeed: 28, period: 9 },
  // South Atlantic
  { lat: -30, lon: -20, waveDir: 210, waveHs: 3.2, windDir: 220, windSpeed: 34, period: 11 },
  // Southern Ocean / Drake Passage
  { lat: -56, lon: -65, waveDir: 270, waveHs: 7.2, windDir: 280, windSpeed: 68, period: 15 },
  { lat: -52, lon: 40, waveDir: 260, waveHs: 6.5, windDir: 270, windSpeed: 62, period: 14 },
  { lat: -54, lon: 120, waveDir: 265, waveHs: 6.8, windDir: 275, windSpeed: 65, period: 15 },
  // Arabian Sea
  { lat: 15, lon: 64, waveDir: 240, waveHs: 2.6, windDir: 235, windSpeed: 28, period: 8 },
  // Bay of Bengal
  { lat: 15, lon: 88, waveDir: 210, waveHs: 2.8, windDir: 205, windSpeed: 26, period: 9 },
  // Equatorial Indian Ocean
  { lat: -5, lon: 80, waveDir: 180, waveHs: 2.1, windDir: 175, windSpeed: 22, period: 10 },
  // North Pacific
  { lat: 42, lon: 170, waveDir: 260, waveHs: 5.2, windDir: 270, windSpeed: 52, period: 13 },
  { lat: 25, lon: -155, waveDir: 70, waveHs: 2.2, windDir: 75, windSpeed: 25, period: 8 },
  // South Pacific
  { lat: -35, lon: -120, waveDir: 225, waveHs: 3.8, windDir: 230, windSpeed: 38, period: 12 },
  // Coral Sea / Australia
  { lat: -18, lon: 152, waveDir: 110, waveHs: 1.8, windDir: 115, windSpeed: 20, period: 8 },
  // Mediterranean Sea
  { lat: 36, lon: 18, waveDir: 300, waveHs: 1.4, windDir: 310, windSpeed: 18, period: 6 },
  // Norwegian / Arctic Sea
  { lat: 68, lon: 5, waveDir: 240, waveHs: 3.9, windDir: 250, windSpeed: 42, period: 10 }
];

export function build3DOceanLayer(
  group: THREE.Group,
  layerId: OceanDataLayerId,
  showVectors: boolean,
  showStreamlines: boolean,
  latLonToPoint: (lat: number, lon: number, r?: number) => THREE.Vector3
) {
  clearGroup(group);

  const radius = 1.012; // Skimming just above Earth sphere radius 1.00

  // 1. DYNAMIC TEXTURE GENERATION FOR HEATMAP / CONTOURS
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 1024, 512);

    if (layerId === 'waveHeight') {
      // Significant wave height heatmap
      // Equatorial doldrums (calm blue), mid-latitudes (moderate cyan), Southern Ocean & North Pacific (high swell amber/violet)
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, 'rgba(0, 119, 182, 0.45)'); // Arctic
      grad.addColorStop(0.18, 'rgba(239, 71, 111, 0.55)'); // North Pacific/Atlantic storm track
      grad.addColorStop(0.35, 'rgba(0, 180, 216, 0.35)'); // Mid-latitudes
      grad.addColorStop(0.50, 'rgba(6, 214, 160, 0.28)'); // Equator
      grad.addColorStop(0.65, 'rgba(255, 209, 102, 0.45)'); // South mid-latitudes
      grad.addColorStop(0.82, 'rgba(157, 78, 221, 0.65)'); // Roaring Forties / Southern Ocean peak waves
      grad.addColorStop(1.0, 'rgba(0, 76, 130, 0.45)'); // Antarctica
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // Local swell hot spots (Bay of Bengal, Arabian Sea, Grand Banks)
      drawRadialSwell(ctx, 760, 210, 80, 'rgba(255, 120, 50, 0.6)'); // Bay of Bengal swell surge
      drawRadialSwell(ctx, 690, 215, 75, 'rgba(255, 180, 40, 0.55)'); // Arabian Sea
      drawRadialSwell(ctx, 390, 120, 95, 'rgba(239, 71, 111, 0.65)'); // Grand Banks winter bomb
    } else if (layerId === 'wavePeriod') {
      // Wave period contours (seconds)
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, 'rgba(0, 119, 182, 0.4)'); // 7s
      grad.addColorStop(0.2, 'rgba(82, 183, 136, 0.45)'); // 10s
      grad.addColorStop(0.5, 'rgba(72, 202, 228, 0.35)'); // 8s
      grad.addColorStop(0.8, 'rgba(217, 4, 41, 0.6)'); // 16s Southern Ocean groundswell
      grad.addColorStop(1.0, 'rgba(247, 127, 0, 0.5)'); // 14s
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // Iso-period concentric rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      for (let y = 60; y < 512; y += 45) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1024, y);
        ctx.stroke();
      }
    } else if (layerId === 'sst') {
      // Sea Surface Temperature gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, 'rgba(58, 134, 255, 0.7)'); // -1°C Polar
      grad.addColorStop(0.15, 'rgba(0, 180, 216, 0.5)'); // 8°C Subpolar
      grad.addColorStop(0.35, 'rgba(56, 176, 0, 0.4)'); // 16°C Temperate
      grad.addColorStop(0.50, 'rgba(230, 57, 70, 0.65)'); // 29°C Tropical Warm Pool
      grad.addColorStop(0.70, 'rgba(255, 183, 3, 0.45)'); // 20°C Subtropical
      grad.addColorStop(0.85, 'rgba(0, 180, 216, 0.55)'); // 5°C Subantarctic
      grad.addColorStop(1.0, 'rgba(58, 134, 255, 0.7)'); // -1.8°C Ice
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // Tropical Indo-Pacific Warm Pool expansion
      drawRadialSwell(ctx, 740, 250, 140, 'rgba(255, 0, 84, 0.55)');
    } else if (layerId === 'bathymetry') {
      // Hypsometric tinting for ocean floor depth
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, 'rgba(2, 62, 138, 0.5)');
      grad.addColorStop(0.5, 'rgba(3, 4, 94, 0.65)');
      grad.addColorStop(1.0, 'rgba(16, 0, 43, 0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // Highlight famous deep ocean trenches
      drawRadialSwell(ctx, 915, 220, 35, 'rgba(114, 9, 183, 0.9)'); // Mariana Trench
      drawRadialSwell(ctx, 800, 280, 30, 'rgba(114, 9, 183, 0.85)'); // Java Trench
      drawRadialSwell(ctx, 320, 200, 25, 'rgba(114, 9, 183, 0.85)'); // Puerto Rico Trench
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const layerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 96, 96),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: layerId === 'waveDirection' || layerId === 'currents' ? 0.15 : 0.52,
        depthWrite: false
      })
    );
    group.add(layerMesh);
  }

  // 2. 3D VECTOR ARROWS FOR WAVE DIRECTION OR WIND SPEED
  if (showVectors && (layerId === 'waveDirection' || layerId === 'wind' || layerId === 'waveHeight')) {
    const vectorGroup = new THREE.Group();
    group.add(vectorGroup);

    GLOBAL_VECTOR_POINTS.forEach((pt) => {
      const pos = latLonToPoint(pt.lat, pt.lon, radius + 0.015);
      const angleDeg = layerId === 'wind' ? pt.windDir : pt.waveDir;
      const angleRad = (angleDeg * Math.PI) / 180;

      // Color based on layer
      let arrowColor = 0x00eaff;
      if (layerId === 'wind') {
        arrowColor = pt.windSpeed > 50 ? 0xff4d6d : pt.windSpeed > 30 ? 0xffb703 : 0x06d6a0;
      } else if (layerId === 'waveHeight') {
        arrowColor = pt.waveHs > 5.0 ? 0xef476f : pt.waveHs > 3.0 ? 0xffd166 : 0x00b4d8;
      }

      // Small 3D Direction Arrow Cone
      const arrowCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.016, 0.05, 8),
        new THREE.MeshBasicMaterial({ color: arrowColor })
      );

      arrowCone.position.copy(pos);
      // Orient normal to globe surface and rotate by azimuth heading
      const normal = pos.clone().normalize();
      arrowCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const headingQuat = new THREE.Quaternion().setFromAxisAngle(normal, angleRad);
      arrowCone.quaternion.multiply(headingQuat);

      vectorGroup.add(arrowCone);

      // Base disc pulse
      const disc = new THREE.Mesh(
        new THREE.RingGeometry(0.008, 0.018, 12),
        new THREE.MeshBasicMaterial({ color: arrowColor, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      disc.position.copy(pos);
      disc.lookAt(0, 0, 0);
      vectorGroup.add(disc);
    });
  }

  // 3. ANIMATED 3D GLOWING OCEAN CURRENT STREAMLINES
  if (showStreamlines && (layerId === 'currents' || layerId === 'waveHeight')) {
    const streamlinesGroup = new THREE.Group();
    group.add(streamlinesGroup);

    GLOBAL_CURRENTS.forEach((curvePoints, idx) => {
      const pts3D = curvePoints.map((c) => latLonToPoint(c.lat, c.lon, radius + 0.008));
      const curve = new THREE.CatmullRomCurve3(pts3D);
      const finePoints = curve.getPoints(60);

      const geom = new THREE.BufferGeometry().setFromPoints(finePoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: idx === 0 ? 0xff0054 : idx === 2 ? 0x9d4edd : 0x00eaff,
        transparent: true,
        opacity: layerId === 'currents' ? 0.9 : 0.45,
        linewidth: 2
      });
      const line = new THREE.Line(geom, lineMat);
      streamlinesGroup.add(line);

      // Leading current particle
      const leadingParticle = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      leadingParticle.position.copy(finePoints[finePoints.length - 1]);
      streamlinesGroup.add(leadingParticle);
    });
  }
}

// Draw radial gradient on canvas
function drawRadialSwell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Build pulsing Anomaly Beacon on Globe
export function buildAnomalyBeacon(
  group: THREE.Group,
  anomaly: OceanAnomalyRecord | null,
  latLonToPoint: (lat: number, lon: number, r?: number) => THREE.Vector3
) {
  clearGroup(group);
  if (!anomaly) return;

  const pos = latLonToPoint(anomaly.coordinates.latitude, anomaly.coordinates.longitude, 1.035);

  // Core Beacon
  const beaconMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffb703 })
  );
  beaconMesh.position.copy(pos);
  group.add(beaconMesh);

  // Outer Pulsing Ring
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.045, 0.08, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff7b00,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    })
  );
  ringMesh.position.copy(pos);
  ringMesh.lookAt(0, 0, 0);
  group.add(ringMesh);
}

// Build Operations Station Beacon on Globe
export function buildOperationsBeacon(
  group: THREE.Group,
  station: MaritimeStation | null,
  latLonToPoint: (lat: number, lon: number, r?: number) => THREE.Vector3
) {
  clearGroup(group);
  if (!station) return;

  const pos = latLonToPoint(station.coordinates.latitude, station.coordinates.longitude, 1.035);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x06d6a0 })
  );
  marker.position.copy(pos);
  group.add(marker);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.075, 24),
    new THREE.MeshBasicMaterial({
      color: 0x06d6a0,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    })
  );
  halo.position.copy(pos);
  halo.lookAt(0, 0, 0);
  group.add(halo);
}
