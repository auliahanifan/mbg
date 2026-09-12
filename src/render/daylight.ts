// Sun state for a time of day. Pure numbers so scene.ts can push them into three and a test can check the arc.

export interface Daylight {
  dir: [number, number, number]; // unit sun direction; y < 0 = below the horizon
  intensity: number; // directional light
  color: number; // sun colour
  ambient: number; // hemisphere light
  env: number; // environment intensity
  exposure: number; // tone-mapping exposure: the camera stops down as the sun climbs
  haze: number; // fog + clear colour
}

// sunrise direction (east) and the axis the arc tilts towards (north), so the noon sun is never dead overhead
const E: [number, number, number] = [0.87, 0, 0.49];
const N: [number, number, number] = [-0.49, 0, 0.87];
const TILT = 0.42; // rad, ~24°: noon elevation ~66°
const REF_ELEV = 0.42; // the look is tuned for a sun ~24° up; above that the camera stops down instead of blowing out

const NIGHT = 0x0a1020, DUSK = 0xd8834a, DAY = 0xb9c4cf;
const SUN_LOW = 0xff8a3d, SUN_HIGH = 0xfff0d6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: number, b: number, t: number) => {
  const r = (a >> 16) + ((b >> 16) - (a >> 16)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export function daylight(hour: number): Daylight {
  const a = ((((hour % 24) + 24) % 24) - 6) / 12 * Math.PI; // 6h = east horizon, 12h = high, 18h = west horizon
  const y = Math.sin(a), h = Math.cos(a);
  const up = y * Math.cos(TILT), side = y * Math.sin(TILT);
  const day = clamp01(y / 0.18); // direct sun: gone by the time it touches the horizon
  const sky = clamp01((y + 0.25) / 0.45); // sky light: lingers through twilight, out by full night
  const low = clamp01(1 - Math.abs(y) / 0.3); // near the horizon: warm, orange
  return {
    dir: [E[0] * h + N[0] * side, up, E[2] * h + N[2] * side],
    intensity: 3.4 * day,
    color: mix(SUN_HIGH, SUN_LOW, low),
    ambient: lerp(0.65, 0.45, sky), // at night this fill IS the moonlight: no sun, no street lights, no headlights
    env: lerp(0.45, 0.9, sky),
    exposure: Math.max(0.55, REF_ELEV / Math.max(y, REF_ELEV)) * lerp(1.5, 1, sky),
    haze: mix(mix(NIGHT, DUSK, low * sky), DAY, day),
  };
}

export const clockText = (hour: number) => {
  const t = (((hour % 24) + 24) % 24);
  return `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;
};
