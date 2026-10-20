/**
 * MARIVEX astronomical day/night calculation from actual UTC time.
 * Implements standard low-precision solar ephemeris equations (Meeus/NOAA style).
 * No arbitrary night/day animation and no external API dependency.
 * Accuracy is adequate for a globe day/night terminator, not solar navigation.
 */
export interface SolarPosition {
  latitude: number;   // subsolar latitude, degrees north
  longitude: number;  // subsolar longitude, degrees east
  utc: string;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const normalizeDegrees = (angle: number) => ((angle % 360) + 360) % 360;
const normalizeLongitude = (lon: number) => normalizeDegrees(lon + 180) - 180;

/** Subsolar geographic position (the point where the Sun is overhead). */
export function getSolarPosition(now: Date = new Date()): SolarPosition {
  const jd = now.getTime() / 86_400_000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;

  const meanLongitude = normalizeDegrees(280.46646 + t * (36000.76983 + t * 0.0003032));
  const meanAnomaly = normalizeDegrees(357.52911 + t * (35999.05029 - 0.0001537 * t)) * DEG;
  const center = (1.914602 - t * (0.004817 + 0.000014 * t)) * Math.sin(meanAnomaly)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly)
    + 0.000289 * Math.sin(3 * meanAnomaly);
  const omega = (125.04 - 1934.136 * t) * DEG;
  const apparentLongitude = (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;

  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude)) * RAD;
  const rightAscension = normalizeDegrees(
    Math.atan2(Math.cos(obliquity) * Math.sin(apparentLongitude), Math.cos(apparentLongitude)) * RAD
  );
  const gmst = normalizeDegrees(
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t - (t * t * t) / 38710000
  );

  return {
    latitude: declination,
    longitude: normalizeLongitude(rightAscension - gmst),
    utc: now.toISOString(),
  };
}

/** Classification by Sun elevation at a requested geographic location. */
export function getDaylightState(latitude: number, longitude: number, solar: SolarPosition): {
  label: 'Daytime' | 'Civil twilight' | 'Nighttime';
  sunElevation: number;
} {
  const lat = latitude * DEG;
  const subLat = solar.latitude * DEG;
  const lonDelta = (longitude - solar.longitude) * DEG;
  const dot = Math.sin(lat) * Math.sin(subLat)
    + Math.cos(lat) * Math.cos(subLat) * Math.cos(lonDelta);
  const sunElevation = Math.asin(Math.max(-1, Math.min(1, dot))) * RAD;
  return {
    label: sunElevation >= -0.833 ? 'Daytime' : sunElevation >= -6 ? 'Civil twilight' : 'Nighttime',
    sunElevation,
  };
}
