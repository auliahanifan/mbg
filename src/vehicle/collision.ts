import type { CarState } from './carPhysics';

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Circle { x: number; z: number; r: number; mass?: number } // no mass = immovable (buildings, trees)
export const CAR_RADIUS = 0.9;
const SAMPLE_OFFSETS = [1, -1]; // front/back sample circles along heading
const PLAYER_MASS = 1650; // Gran Max box van, kerb plus a load of meal trays
const REST = 0.25; // restitution: sheet metal folds, so most of the closing speed is eaten, not returned

/** One impact this frame. `index` is the circle hit (-1 for a box); (nx,nz) is the direction the thing hit gets thrown. */
export interface Hit { index: number; nx: number; nz: number; dv: number; impact: number }

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
  if (o.r <= 0) return null; // already wrecked and flying: no longer solid
  const dx = c.x - o.x;
  const dz = c.z - o.z;
  const d = Math.hypot(dx, dz);
  const min = c.r + o.r;
  if (d >= min) return null;
  if (d < 1e-6) return { dx: min, dz: 0 };
  return { dx: (dx / d) * (min - d), dz: (dz / d) * (min - d) };
}

/**
 * Pushes the car (two sample circles) out of boxes/circles and trades momentum with whatever it hit.
 * Only the speed driven *into* the contact is lost, shared by mass, so a glancing scrape barely
 * slows you, a motorbike costs you nothing, and a wall or a truck stops you dead. Pure.
 */
export function resolveCar(s: CarState, boxes: Box[], circles: Circle[]): { car: CarState; hits: Hit[] } {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  let x = s.x;
  let z = s.z;
  let vx = fx * s.speed;
  let vz = fz * s.speed;
  const hits: Hit[] = [];
  let pushed = false;

  for (const off of SAMPLE_OFFSETS) {
    const c: Circle = { x: x + fx * off, z: z + fz * off, r: CAR_RADIUS };
    const apply = (p: { dx: number; dz: number } | null, index: number, mass?: number) => {
      if (!p) return;
      pushed = true;
      x += p.dx;
      z += p.dz;
      c.x += p.dx;
      c.z += p.dz;
      const d = Math.hypot(p.dx, p.dz);
      if (d < 1e-9) return;
      const nx = p.dx / d; // points from the obstacle back towards the car
      const nz = p.dz / d;
      const closing = -(vx * nx + vz * nz); // > 0 only when actually driving into it
      if (closing <= 0) return;
      const j = closing * (1 + REST);
      const share = mass === undefined ? 1 : mass / (PLAYER_MASS + mass); // how much of the impulse the car keeps
      vx += nx * j * share;
      vz += nz * j * share;
      hits.push({ index, nx: -nx, nz: -nz, dv: j * (1 - share), impact: closing });
    };
    for (const b of boxes) apply(pushOutOfBox(c, b), -1);
    circles.forEach((o, i) => apply(pushOutOfCircle(c, o), i, o.mass));
  }

  if (!pushed) return { car: s, hits };
  return { car: { ...s, x, z, speed: vx * fx + vz * fz }, hits }; // back onto the heading axis: the model only carries scalar speed
}
