import { edgesFrom, pointOnEdge, type City } from '../world/city';
import type { Circle } from '../vehicle/collision';
import { pickVehicle, vehicleSpec, vehicleMass } from '../vehicle/vehicles';

const LOOK_AHEAD = 10;
const LOOK_WIDTH = 2.5;
const ACCEL = 6;
const STUCK_SECONDS = 3;
const NARROW = 4;
const KEEP_RADIUS = 250;
const RESPAWN_RADIUS = 350;
const SPAWN_MIN = 150;
const SPAWN_AVOID = 20;

const CRASH_G = 20;          // a little heavier than real gravity so a launch lands while you can still see it
const CRASH_AIR_DRAG = 0.2;  // per second while airborne
const CRASH_FRICTION = 9;    // m/s^2 scrubbed off while grinding along the tarmac
const CRASH_BOUNCE = 0.3;
const CRASH_SPIN_DAMP = 2.5; // per second once it is down
const CRASH_REST = 2.5;      // seconds lying still before the wreck is recycled out of sight
const AIRBORNE_MASS = 700;   // a vehicle lighter than this leaves the ground easily; a truck barely hops
const CRASH_MAX_DV = 40;     // m/s: caps what a NOS run at 400 km/h can do, or wrecks leave the map
const CRASH_MAX_LIFT = 9;    // m/s, about 2 m of air
const CRASH_MAX_SPIN = 8;    // rad/s: past ~1.3 turns a second it stops reading as physics

const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/** A vehicle knocked out of traffic: free ballistic flight, then a slide, then it is recycled. */
export interface Crash {
  vx: number; vz: number; vy: number;
  y: number;        // height above the road surface
  spin: number;     // yaw rate, rad/s
  roll: number;     // barrel roll, rad
  rollRate: number;
  rest: number;     // seconds settled
}

export interface TrafficCar {
  edge: number;
  dir: 1 | -1; // 1 = a→b
  t: number; // 0..1 along dir
  speed: number;
  cruise: number;
  model: string;
  x: number;
  z: number;
  heading: number;
  stuck: number;
  crash?: Crash | null; // set = knocked out of traffic and flying
}

function placeCar(city: City, c: TrafficCar) {
  const p = pointOnEdge(city, c.edge, c.dir === 1 ? c.t : 1 - c.t);
  const heading = c.dir === 1 ? p.heading : p.heading + Math.PI;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const spec = vehicleSpec(c.model);
  // left-hand traffic: left of forward is (fz, -fx); motorbikes hug the kerb like they do here
  const lane = city.edges[c.edge].w / 4 + ('bike' in spec ? 0.8 : 0);
  c.x = p.x + fz * lane;
  c.z = p.z - fx * lane;
  c.heading = heading;
}

/** Random edge whose midpoint is minR..maxR from `near`; if none exists, the edge whose midpoint is closest to that ring. */
function pickEdge(city: City, rng: () => number, near: { x: number; z: number }, minR: number, maxR: number): number {
  const candidates: number[] = [];
  let best = 0;
  let bestScore = Infinity;
  city.edges.forEach((_, ei) => {
    const p = pointOnEdge(city, ei, 0.5);
    const d = Math.hypot(p.x - near.x, p.z - near.z);
    if (d >= minR && d <= maxR) candidates.push(ei);
    const score = d < minR ? minR - d : d - maxR;
    if (score < bestScore) { bestScore = score; best = ei; }
  });
  return candidates.length ? candidates[Math.floor(rng() * candidates.length)] : best;
}

function respawn(city: City, c: TrafficCar, rng: () => number, near: { x: number; z: number }, minR: number, maxR: number) {
  c.edge = pickEdge(city, rng, near, minR, maxR);
  c.dir = rng() < 0.5 ? 1 : -1;
  c.t = rng();
  c.speed = 0;
  c.stuck = 0;
  c.crash = null;
  placeCar(city, c);
}

export function spawnTraffic(city: City, count: number, rng: () => number, near: { x: number; z: number }): TrafficCar[] {
  return Array.from({ length: count }, () => {
    const model = pickVehicle(rng);
    const c: TrafficCar = {
      edge: 0, dir: 1, t: 0, speed: 0, cruise: (8 + 4 * rng()) * vehicleSpec(model).speedK, model,
      x: 0, z: 0, heading: 0, stuck: 0,
    };
    respawn(city, c, rng, near, SPAWN_AVOID, KEEP_RADIUS);
    return c;
  });
}

/**
 * Knocks a vehicle out of traffic: `dv` m/s along (nx,nz), plus lift and spin scaled by how light
 * it is. A BeAT cartwheels off the road, a Canter just gets shoved and slews round.
 */
export function launch(c: TrafficCar, nx: number, nz: number, dv: number): void {
  if (c.crash) return; // already flying; don't re-launch it every frame while we overlap
  dv = Math.min(dv, CRASH_MAX_DV);
  const airborne = Math.min(1, AIRBORNE_MASS / vehicleMass(c.model));
  // how square the hit is on its flank: a T-bone spins and rolls it, a rear-end just shunts it
  const side = nx * Math.cos(c.heading) - nz * Math.sin(c.heading);
  c.crash = {
    vx: nx * dv + Math.sin(c.heading) * c.speed,
    vz: nz * dv + Math.cos(c.heading) * c.speed, // it keeps the speed it was already carrying
    vy: Math.min(dv * 0.35 * airborne, CRASH_MAX_LIFT),
    y: 0,
    spin: clampAbs(dv * side * 0.9 * airborne, CRASH_MAX_SPIN),
    roll: 0,
    rollRate: clampAbs(dv * side * 0.5 * airborne, CRASH_MAX_SPIN),
    rest: 0,
  };
  c.speed = 0;
}

/** One ballistic step for a wreck. Returns true once it has settled and should be recycled. */
function stepCrash(c: TrafficCar, dt: number): boolean {
  const k = c.crash!;
  k.vy -= CRASH_G * dt;
  k.y += k.vy * dt;
  const grounded = k.y <= 0;
  if (grounded) {
    k.y = 0;
    if (k.vy < -2.5) k.vy = -k.vy * CRASH_BOUNCE; // still enough in it to skip back up
    else k.vy = 0;
  }
  const speed = Math.hypot(k.vx, k.vz);
  if (speed > 1e-6) {
    // air drag is proportional, tarmac friction is a flat scrub: on the ground it stops fast
    const drop = grounded ? Math.min(speed, CRASH_FRICTION * dt) : speed * CRASH_AIR_DRAG * dt;
    k.vx -= (k.vx / speed) * drop;
    k.vz -= (k.vz / speed) * drop;
  }
  c.x += k.vx * dt;
  c.z += k.vz * dt;
  c.heading += k.spin * dt;
  k.roll += k.rollRate * dt;
  if (grounded) {
    const damp = Math.exp(-CRASH_SPIN_DAMP * dt);
    k.spin *= damp;
    k.rollRate *= damp;
    k.roll *= damp; // settles back down onto its wheels rather than sinking through the road on its side
  }
  k.rest = grounded && Math.hypot(k.vx, k.vz) < 0.5 ? k.rest + dt : 0;
  return k.rest > CRASH_REST;
}

const blockedBy = (c: TrafficCar, o: { x: number; z: number }) => {
  const rx = o.x - c.x;
  const rz = o.z - c.z;
  const fx = Math.sin(c.heading);
  const fz = Math.cos(c.heading);
  const along = rx * fx + rz * fz;
  const across = Math.abs(rx * fz - rz * fx);
  return along > 0.5 && along < LOOK_AHEAD && across < LOOK_WIDTH;
};

/** Moves every car along the road graph; cars queue behind obstacles/each other; far cars respawn near the player. Mutates `cars`. */
export function stepTraffic(city: City, cars: TrafficCar[], obstacles: { x: number; z: number }[], dt: number, rng: () => number, player: { x: number; z: number }): void {
  for (const c of cars) {
    if (c.crash) {
      if (stepCrash(c, dt)) respawn(city, c, rng, player, SPAWN_MIN, KEEP_RADIUS);
      continue;
    }
    placeCar(city, c);
    if (Math.hypot(c.x - player.x, c.z - player.z) > RESPAWN_RADIUS) {
      respawn(city, c, rng, player, SPAWN_MIN, KEEP_RADIUS);
      continue;
    }
    const blocked = obstacles.some((o) => blockedBy(c, o)) || cars.some((o) => o !== c && !o.crash && blockedBy(c, o));
    c.stuck = blocked ? c.stuck + dt : 0;
    const limit = c.cruise * (city.edges[c.edge].w <= NARROW ? 0.7 : 1);
    const target = blocked && c.stuck < STUCK_SECONDS ? 0 : limit; // ponytail: after 3s just push through (breaks deadlocks)
    c.speed = Math.abs(target - c.speed) <= ACCEL * dt ? target : c.speed + Math.sign(target - c.speed) * ACCEL * dt;
    let e = city.edges[c.edge];
    c.t += (c.speed * dt) / e.len;
    while (c.t >= 1) {
      const overflow = (c.t - 1) * e.len;
      const node = c.dir === 1 ? e.b : e.a;
      const exits = edgesFrom(city, node).filter((i) => i !== c.edge);
      if (exits.length) {
        c.edge = exits[Math.floor(rng() * exits.length)];
        e = city.edges[c.edge];
        c.dir = e.a === node ? 1 : -1;
      } else {
        c.dir = c.dir === 1 ? -1 : 1; // dead end: u-turn
      }
      c.t = overflow / e.len;
    }
    placeCar(city, c);
  }
}

export const trafficCircles = (cars: TrafficCar[]): Circle[] =>
  cars.map((c) => ({ x: c.x, z: c.z, r: c.crash ? 0 : vehicleSpec(c.model).radius, mass: vehicleMass(c.model) }));
