import { HALF_SIZE } from './osm';

export const DEM_STEP = 40; // metres between samples (scripts/fetch-dem.mjs)
/** Elevation grid: h[j * n + i] is metres above sea level at x = -HALF_SIZE + i·step, z = -HALF_SIZE + j·step. */
export interface Dem { step: number; n: number; h: number[] }
/** World height (y = (MDPL − base) · EXAGGERATION, so the lowest point sits near y = 0) plus real MDPL for the HUD. */
export interface Ground { y: (x: number, z: number) => number; mdpl: (x: number, z: number) => number; dem: Dem }
/** Purwokerto's real relief is ~60 m over the 3.4 km map (median 2 % grade): true to scale it reads as flat, so heights are stretched. Shape stays the SRTM contour. */
export const EXAGGERATION = 2.5;
/** Arcade gravity along the road (m/s² per unit grade), tuned against ACCEL/ROLLING so climbs cost and descents roll. */
export const GRAVITY = 25;

export const FLAT: Ground = { y: () => 0, mdpl: () => 0, dem: { step: 2 * HALF_SIZE, n: 2, h: [0, 0, 0, 0] } };

/** 3×3 box blur, edge-clamped, `passes` times: SRTM in a city carries ±2 m rooftop noise that would make roads bounce. Pure. */
export function smooth(dem: Dem, passes = 2): Dem {
  let h = dem.h;
  const { n } = dem;
  for (let p = 0; p < passes; p++) {
    const out = new Array<number>(h.length);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) s += h[Math.min(n - 1, Math.max(0, j + dj)) * n + Math.min(n - 1, Math.max(0, i + di))];
        }
        out[j * n + i] = s / 9;
      }
    }
    h = out;
  }
  return { ...dem, h };
}

/** MDPL at (x, z): linear on the two triangles of each cell split along the (i, j)→(i+1, j+1) diagonal — the same split buildGround uses, so roads sit exactly on the ground mesh. Clamped outside the grid. Pure. */
export function mdplAt(dem: Dem, x: number, z: number): number {
  const { step, n, h } = dem;
  const fx = Math.min(Math.max((x + HALF_SIZE) / step, 0), n - 1);
  const fz = Math.min(Math.max((z + HALF_SIZE) / step, 0), n - 1);
  const i = Math.min(Math.floor(fx), n - 2);
  const j = Math.min(Math.floor(fz), n - 2);
  const u = fx - i;
  const v = fz - j;
  const h00 = h[j * n + i];
  const h11 = h[(j + 1) * n + i + 1];
  return u > v ? h00 + u * (h[j * n + i + 1] - h00) + v * (h11 - h[j * n + i + 1]) : h00 + v * (h[(j + 1) * n + i] - h00) + u * (h11 - h[(j + 1) * n + i]);
}

export function makeGround(raw: Dem): Ground {
  const dem = smooth(raw);
  const base = Math.floor(Math.min(...dem.h));
  return { y: (x, z) => (mdplAt(dem, x, z) - base) * EXAGGERATION, mdpl: (x, z) => mdplAt(dem, x, z), dem };
}

/** Rise over run of the ground along `heading`, sampled ±r metres around (x, z): positive = uphill ahead. */
export function grade(g: Ground, x: number, z: number, heading: number, r = 1.5): number {
  const fx = Math.sin(heading) * r;
  const fz = Math.cos(heading) * r;
  return (g.y(x + fx, z + fz) - g.y(x - fx, z - fz)) / (2 * r);
}

/** Inserts points so no segment is longer than maxLen; ribbons then follow the ground between road nodes. Pure. */
export function densify(pts: [number, number][], maxLen: number): [number, number][] {
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const k = Math.ceil(Math.hypot(bx - ax, bz - az) / maxLen);
    for (let s = 1; s <= k; s++) out.push([ax + ((bx - ax) * s) / k, az + ((bz - az) * s) / k]);
  }
  return out;
}
