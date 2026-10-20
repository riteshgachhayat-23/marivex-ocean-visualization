import * as THREE from 'three';
import {
  type GlobalVectorField,
  sampleVector,
} from '../utils/globalVectorFields';

/** Model-sampled wind/current traces + illustrative global ocean SST colors. */
export type OceanEffectMode = 'currents' | 'winds' | 'cyclones' | 'temperature' | 'bermuda' | 'off';
export const BERMUDA_CORNERS = [
  { name: 'Miami', latitude: 25.77, longitude: -80.19 },
  { name: 'Bermuda', latitude: 32.30, longitude: -64.75 },
  { name: 'San Juan', latitude: 18.46, longitude: -66.11 },
] as const;

const DEG = Math.PI / 180;
const RADIUS = 1.066;
const wrapLon = (n: number) => ((n + 180) % 360 + 360) % 360 - 180;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function illustrativeSST(latitude: number, longitude: number): number {
  const a = Math.abs(latitude);
  let t = 29.8 - 32.6 * Math.pow(a / 90, 1.45);
  const gaussian = (lat0: number, lon0: number, latW: number, lonW: number) =>
    Math.exp(-Math.pow((latitude - lat0) / latW, 2) - Math.pow(wrapLon(longitude - lon0) / lonW, 2));
  t += 2.2 * gaussian(7, 142, 20, 56);     // western tropical Pacific
  t += 1.7 * gaussian(9, 82, 20, 38);      // tropical Indian Ocean
  t += 2.6 * gaussian(35, -65, 13, 22);    // NW Atlantic warm current region
  t += 2.0 * gaussian(34, 145, 12, 23);    // NW Pacific warm current region
  t -= 3.6 * gaussian(-10, -88, 22, 24);   // eastern equatorial Pacific
  t -= 2.5 * gaussian(27, -122, 20, 18);   // eastern N Pacific
  t -= 2.8 * gaussian(-24, 12, 17, 18);    // SE Atlantic
  t -= 2.0 * gaussian(24, -18, 15, 16);    // NE Atlantic
  t -= 2.0 * Math.exp(-Math.pow((a - 60) / 13, 2));
  return clamp(t, -2, 35);
}

function point(lat: number, lon: number, radius = RADIUS): THREE.Vector3 {
  const phi = lat * DEG;
  const theta = -lon * DEG;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.sin(theta)
  );
}

function stepField(field: GlobalVectorField, lat: number, lon: number, degrees: number): [number, number] | null {
  const a = sampleVector(field, lat, lon);
  const minSpeed = field.kind === 'winds' ? 0.15 : 0.015;
  if (!a || a.speed < minSpeed) return null;
  const midLat = lat + a.north / a.speed * degrees * 0.5;
  const midLon = wrapLon(lon + a.east / a.speed * degrees * 0.5 / Math.max(0.27, Math.cos(lat * DEG)));
  const b = sampleVector(field, midLat, midLon);
  if (!b || b.speed < minSpeed) return null;
  const nextLat = lat + b.north / b.speed * degrees;
  const nextLon = wrapLon(lon + b.east / b.speed * degrees / Math.max(0.27, Math.cos(midLat * DEG)));
  return Math.abs(nextLat) > 72 ? null : [nextLat, nextLon];
}

function greatCircleLine(a: THREE.Vector3, b: THREE.Vector3) {
  const u = a.clone().normalize();
  const v = b.clone().normalize();
  const angle = Math.acos(clamp(u.dot(v), -1, 1));
  const result: THREE.Vector3[] = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const p = angle < 0.00001 ? u.clone() :
      u.clone().multiplyScalar(Math.sin((1 - t) * angle) / Math.sin(angle))
        .addScaledVector(v, Math.sin(t * angle) / Math.sin(angle));
    result.push(p.normalize().multiplyScalar(1.092));
  }
  return result;
}

const flowVertexShader = `
  attribute float aProgress;
  attribute float aSpeed;
  attribute float aSeed;
  varying float vProgress;
  varying float vSpeed;
  varying float vSeed;
  void main(){
    vProgress = aProgress;
    vSpeed = aSpeed;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flowFragmentShader = `
  uniform float uTime;
  uniform float uStorm;
  uniform float uOpacity;
  uniform vec3 uLowColor;
  uniform vec3 uHighColor;
  varying float vProgress;
  varying float vSpeed;
  varying float vSeed;
  void main(){
    float phase = fract(vProgress * 3.6 - uTime * (0.15 + vSpeed * 0.30) + vSeed);
    float pulse = smoothstep(0.05, 0.22, phase) * (1.0 - smoothstep(0.72, 0.98, phase));
    float ends = smoothstep(0.0, 0.07, vProgress) * (1.0 - smoothstep(0.92, 1.0, vProgress));
    float strongWind = smoothstep(0.22, 0.72, vSpeed);
    float emphasis = mix(1.0, 0.68 + 0.8 * strongWind, uStorm);
    float alpha = (0.26 + 0.74 * pulse) * ends * emphasis * uOpacity;
    vec3 color = mix(uLowColor, uHighColor, uStorm > 0.5 ? strongWind : clamp(vSpeed * 1.35, 0.0, 1.0));
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.96));
  }
`;

// Temperature colors imitate a global SST map but do NOT encode measured SST.
// Ocean/land discrimination uses the Blue Marble base texture already on the globe.
const sstVertexShader = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const sstFragmentShader = `
  uniform sampler2D uEarthMap;
  uniform float uOpacity;
  varying vec2 vUv;

  vec3 colorSST(float value) {
    vec3 c0 = vec3(0.35, 0.12, 0.66);
    vec3 c1 = vec3(0.13, 0.23, 0.90);
    vec3 c2 = vec3(0.00, 0.60, 1.00);
    vec3 c3 = vec3(0.00, 0.86, 0.76);
    vec3 c4 = vec3(0.34, 0.98, 0.28);
    vec3 c5 = vec3(0.98, 0.93, 0.09);
    vec3 c6 = vec3(1.00, 0.54, 0.06);
    vec3 c7 = vec3(0.98, 0.18, 0.10);
    float t = clamp((value + 2.0) / 37.0, 0.0, 1.0) * 7.0;
    if (t < 1.0) return mix(c0,c1,t);
    if (t < 2.0) return mix(c1,c2,t-1.0);
    if (t < 3.0) return mix(c2,c3,t-2.0);
    if (t < 4.0) return mix(c3,c4,t-3.0);
    if (t < 5.0) return mix(c4,c5,t-4.0);
    if (t < 6.0) return mix(c5,c6,t-5.0);
    return mix(c6,c7,t-6.0);
  }

  float gaussian(float lat, float lon, float lat0, float lon0, float latW, float lonW) {
    float dLon = abs(mod(lon - lon0 + 540.0, 360.0) - 180.0);
    vec2 d = vec2((lat-lat0)/latW, dLon/lonW);
    return exp(-dot(d,d));
  }

  void main(){
    vec3 earth = texture2D(uEarthMap, vUv).rgb;
    float blueDifference = earth.b - earth.r;
    float greenDifference = earth.b - earth.g;
    float waterEvidence = smoothstep(0.005, 0.070, blueDifference)
                         * smoothstep(-0.010, 0.045, greenDifference);
    // Blue Marble cloud/snow / pale land are not ocean.
    float brightExclusion = 1.0 - smoothstep(0.46, 0.76, max(max(earth.r,earth.g),earth.b));
    float oceanMask = waterEvidence * brightExclusion;
    if (oceanMask < 0.05) discard;

    float lat = (vUv.y - 0.5) * 180.0;
    // SphereGeometry equirectangular UV: front +X is near u=0.5.
    float lon = mod(450.0 - vUv.x * 360.0, 360.0) - 180.0;
    float a = abs(lat);
    float temperature = 29.8 - 32.6 * pow(a/90.0, 1.45);
    temperature += 2.2 * gaussian(lat,lon,7.0,142.0,20.0,56.0);
    temperature += 1.7 * gaussian(lat,lon,9.0,82.0,20.0,38.0);
    temperature += 2.6 * gaussian(lat,lon,35.0,-65.0,13.0,22.0);
    temperature += 2.0 * gaussian(lat,lon,34.0,145.0,12.0,23.0);
    temperature -= 3.6 * gaussian(lat,lon,-10.0,-88.0,22.0,24.0);
    temperature -= 2.5 * gaussian(lat,lon,27.0,-122.0,20.0,18.0);
    temperature -= 2.8 * gaussian(lat,lon,-24.0,12.0,17.0,18.0);
    temperature -= 2.0 * gaussian(lat,lon,24.0,-18.0,15.0,16.0);
    temperature -= 2.0 * exp(-pow((a-60.0)/13.0,2.0));
    temperature = clamp(temperature, -2.0, 35.0);
    gl_FragColor = vec4(colorSST(temperature), oceanMask * uOpacity);
  }
`;

export class OceanFlowEffects {
  readonly group = new THREE.Group();
  private readonly flowGroup = new THREE.Group();
  private readonly bermudaGroup = new THREE.Group();
  private readonly temperatureGroup = new THREE.Group();
  private field: GlobalVectorField | null = null;
  private mode: OceanEffectMode = 'off';
  private streamlines: THREE.LineSegments | null = null;
  private readonly clock = new THREE.Clock();
  private readonly flowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uOpacity: { value: 1.0 },
      uLowColor: { value: new THREE.Color('#46dff5') },
      uHighColor: { value: new THREE.Color('#fff6c0') },
    },
    vertexShader: flowVertexShader,
    fragmentShader: flowFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly temperatureMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uEarthMap: { value: new THREE.Texture() },
      uOpacity: { value: 0.96 },
    },
    vertexShader: sstVertexShader,
    fragmentShader: sstFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
  });
  private readonly temperatureSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.011, 128, 96),
    this.temperatureMaterial
  );

  constructor() {
    this.group.name = 'MARIVEX Ocean Effects';
    this.group.add(this.flowGroup, this.temperatureGroup, this.bermudaGroup);
    this.temperatureGroup.add(this.temperatureSphere);
    const segments: THREE.Vector3[] = [];
    for (let i = 0; i < BERMUDA_CORNERS.length; i++) {
      const a = BERMUDA_CORNERS[i];
      const b = BERMUDA_CORNERS[(i + 1) % BERMUDA_CORNERS.length];
      const arc = greatCircleLine(point(a.latitude, a.longitude), point(b.latitude, b.longitude));
      for (let k = 0; k < arc.length - 1; k++) segments.push(arc[k], arc[k + 1]);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.024, 14, 14),
        new THREE.MeshBasicMaterial({ color: '#ffd18f' })
      );
      marker.position.copy(point(a.latitude, a.longitude, 1.10));
      this.bermudaGroup.add(marker);
    }
    this.bermudaGroup.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(segments),
      new THREE.LineBasicMaterial({
        color: '#ffcd7a', transparent: true, opacity: 0.96, depthWrite: false,
      })
    ));
    this.setMode('off');
  }

  // Share the SAME Blue Marble texture used by the underlying Earth mesh.
  // This avoids turning continents into a rainbow heatmap.
  setEarthTexture(texture: THREE.Texture): void {
    this.temperatureMaterial.uniforms.uEarthMap.value = texture;
  }

  setTemperatureOpacity(opacity: number): void {
    this.temperatureMaterial.uniforms.uOpacity.value = clamp(opacity, 0.2, 1.0);
  }

  private requestedKind(): 'winds' | 'currents' | null {
    if (this.mode === 'currents') return 'currents';
    if (this.mode === 'winds' || this.mode === 'cyclones') return 'winds';
    return null;
  }

  setMode(mode: OceanEffectMode): void {
    this.mode = mode;
    this.bermudaGroup.visible = mode === 'bermuda';
    this.temperatureGroup.visible = mode === 'temperature';
    this.flowGroup.visible = mode === 'currents' || mode === 'winds' || mode === 'cyclones';
    if (this.field && this.field.kind !== this.requestedKind()) this.setField(null);
    this.applyColors();
  }

  private applyColors(): void {
    const storm = this.mode === 'cyclones';
    const currents = this.mode === 'currents';
    this.flowMaterial.uniforms.uStorm.value = storm ? 1 : 0;
    this.flowMaterial.uniforms.uOpacity.value = storm ? 1.2 : 1.0;
    this.flowMaterial.uniforms.uLowColor.value.set(storm ? '#6cbeff' : currents ? '#2cf8d2' : '#48d9ff');
    this.flowMaterial.uniforms.uHighColor.value.set(storm ? '#ff9e3b' : '#fff2bf');
  }

  setField(field: GlobalVectorField | null): void {
    if (field && field.kind !== this.requestedKind()) return;
    this.field = field;
    this.clearLines();
    if (!field) return;
    this.applyColors();

    const positions: number[] = [];
    const progress: number[] = [];
    const strengths: number[] = [];
    const seeds: number[] = [];
    const wind = field.kind === 'winds';
    const count = wind ? 1550 : 1000;
    const maxSteps = wind ? 55 : 42;
    const limit = wind ? 0.18 : 0.025;
    let randomSeed = wind ? 48195 : 16613;
    const random = () => {
      randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
      return randomSeed / 4294967296;
    };

    for (let line = 0; line < count; line++) {
      const band = Math.floor(line / 50);
      let lat = -67 + ((band + random() * 0.9) / Math.ceil(count / 50)) * 134;
      let lon = wrapLon(-180 + (((line % 50) + random()) / 50) * 360);
      const lineSeed = random();
      const path: Array<{ point: THREE.Vector3; strength: number }> = [];
      for (let k = 0; k < maxSteps; k++) {
        const sampled = sampleVector(field, lat, lon);
        if (!sampled || sampled.speed < limit) break;
        path.push({
          point: point(lat, lon, RADIUS + (wind ? 0.04 : 0.012)),
          strength: Math.min(1, sampled.speed / (wind ? 27 : 1.8)),
        });
        const angular = clamp(
          wind ? 1.0 + sampled.speed * 0.03 : 1.0 + sampled.speed * 0.30,
          0.85, 1.9
        );
        const next = stepField(field, lat, lon, angular);
        if (!next) break;
        [lat, lon] = next;
      }
      if (path.length < 4) continue;
      for (let k = 0; k < path.length - 1; k++) {
        positions.push(...path[k].point.toArray(), ...path[k + 1].point.toArray());
        progress.push(k / (path.length - 1), (k + 1) / (path.length - 1));
        strengths.push(path[k].strength, path[k + 1].strength);
        seeds.push(lineSeed, lineSeed);
      }
    }

    if (!positions.length) {
      console.warn('MARIVEX: model field returned no drawable lines', field.kind, field.validSamples);
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progress, 1));
    geometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(strengths, 1));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    this.streamlines = new THREE.LineSegments(geometry, this.flowMaterial);
    this.streamlines.frustumCulled = false;
    this.flowGroup.add(this.streamlines);
    this.clock.getDelta();
  }

  private clearLines(): void {
    if (!this.streamlines) return;
    this.flowGroup.remove(this.streamlines);
    this.streamlines.geometry.dispose();
    this.streamlines = null;
  }

  update(): void {
    const delta = this.clock.getDelta();
    if (this.flowGroup.visible && this.streamlines) {
      this.flowMaterial.uniforms.uTime.value += Math.min(delta, 0.05);
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.clearLines();
    this.flowMaterial.dispose();
    this.temperatureSphere.geometry.dispose();
    this.temperatureMaterial.dispose();
    this.bermudaGroup.traverse(object => {
      const drawable = object as THREE.Mesh;
      drawable.geometry?.dispose();
      if (drawable.material) {
        const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.group.clear();
  }
}
