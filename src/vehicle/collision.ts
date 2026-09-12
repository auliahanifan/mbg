import type { CarState } from './carPhysics';

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Circle { x: number; z: number; r: number }
export const CAR_RADIUS = 0.9;
const SAMPLE_OFFSETS = [1, -1]; // front/back sample circles along heading
const HIT_SPEED_FACTOR = 0.4;

/** Minimal translation that moves circle c out of box b, or null when not overlapping. */
export function pushOutOfBox(c: Circle, b: Box): { dx: number; dz: number } | null {
  const px = Math.max(b.minX, Math.min(c.x, b.maxX));
  const pz = Math.max(b.minZ, Math.min(c.z, b.maxZ));
  const dx = c.x - px;
  const dz = c.z - pz;
  const d = Math.hypot(dx, dz);
  if (d >= c.r) return null;
  if (d > 1e-6) return { dx: (dx / d) * (c.r - d), dz: (dz / d) * (c.r - d) };
  // centre is inside the box: leave through the nearest face
  const faces = [
    { dx: -(c.x - b.minX + c.r), dz: 0, pen: c.x - b.minX },
    { dx: b.maxX - c.x + c.r, dz: 0, pen: b.maxX - c.x },
    { dx: 0, dz: -(c.z - b.minZ + c.r), pen: c.z - b.minZ },
    { dx: 0, dz: b.maxZ - c.z + c.r, pen: b.maxZ - c.z },
  ];
  const f = faces.reduce((a, b) => (b.pen < a.pen ? b : a));
  return { dx: f.dx, dz: f.dz };
}

function pushOutOfCircle(c: Circle, o: Circle): { dx: number; dz: number } | null {
  const dx = c.x - o.x;
  const dz = c.z - o.z;
  const d = Math.hypot(dx, dz);
  const min = c.r + o.r;
  if (d >= min) return null;
  if (d < 1e-6) return { dx: min, dz: 0 };
  return { dx: (dx / d) * (min - d), dz: (dz / d) * (min - d) };
}

/** Pushes the car (two sample circles) out of boxes/circles; a hit scales speed down. Pure. */
export function resolveCar(s: CarState, boxes: Box[], circles: Circle[]): CarState {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  let x = s.x;
  let z = s.z;
  let hit = false;
  for (const off of SAMPLE_OFFSETS) {
    const c: Circle = { x: x + fx * off, z: z + fz * off, r: CAR_RADIUS };
    const apply = (p: { dx: number; dz: number } | null) => {
      if (!p) return;
      x += p.dx;
      z += p.dz;
      c.x += p.dx;
      c.z += p.dz;
      hit = true;
    };
    for (const b of boxes) {
      // ponytail: linear scan over all boxes (~200); grid lookup if it ever shows in a profile
      if (Math.abs((b.minX + b.maxX) / 2 - c.x) > 30 || Math.abs((b.minZ + b.maxZ) / 2 - c.z) > 30) continue;
      apply(pushOutOfBox(c, b));
    }
    for (const o of circles) apply(pushOutOfCircle(c, o));
  }
  return hit ? { ...s, x, z, speed: s.speed * HIT_SPEED_FACTOR } : s;
}
