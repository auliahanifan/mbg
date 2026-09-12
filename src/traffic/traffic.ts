import { edgesFrom, pointOnEdge, type City } from '../world/city';
import type { Circle } from '../vehicle/collision';

export const TRAFFIC_RADIUS = 1.4;
const MODELS = ['sedan', 'suv', 'taxi', 'van', 'hatchback-sports', 'truck'];
const LOOK_AHEAD = 10;
const LOOK_WIDTH = 2.5;
const ACCEL = 6;
const STUCK_SECONDS = 3;
const NARROW = 4;
const KEEP_RADIUS = 250;
const RESPAWN_RADIUS = 350;
const SPAWN_MIN = 150;
const SPAWN_AVOID = 20;

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
}

function placeCar(city: City, c: TrafficCar) {
  const p = pointOnEdge(city, c.edge, c.dir === 1 ? c.t : 1 - c.t);
  const heading = c.dir === 1 ? p.heading : p.heading + Math.PI;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const lane = city.edges[c.edge].w / 4; // left-hand traffic: left of forward is (fz, -fx)
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
  placeCar(city, c);
}

export function spawnTraffic(city: City, count: number, rng: () => number, near: { x: number; z: number }): TrafficCar[] {
  return Array.from({ length: count }, () => {
    const c: TrafficCar = {
      edge: 0, dir: 1, t: 0, speed: 0, cruise: 8 + 4 * rng(), model: MODELS[Math.floor(rng() * MODELS.length)],
      x: 0, z: 0, heading: 0, stuck: 0,
    };
    respawn(city, c, rng, near, SPAWN_AVOID, KEEP_RADIUS);
    return c;
  });
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
    placeCar(city, c);
    if (Math.hypot(c.x - player.x, c.z - player.z) > RESPAWN_RADIUS) {
      respawn(city, c, rng, player, SPAWN_MIN, KEEP_RADIUS);
      continue;
    }
    const blocked = obstacles.some((o) => blockedBy(c, o)) || cars.some((o) => o !== c && blockedBy(c, o));
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

export const trafficCircles = (cars: TrafficCar[]): Circle[] => cars.map((c) => ({ x: c.x, z: c.z, r: TRAFFIC_RADIUS }));
