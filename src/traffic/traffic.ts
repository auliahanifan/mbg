import { DIR_VEC, TILE, roadSides, roadTiles, tileCenter, opposite, leftOf, headingOf, type Dir } from '../world/cityMap';
import type { Circle } from '../vehicle/collision';

export const TRAFFIC_SPEED = 7;
export const LANE_OFFSET = 2.4; // left-hand traffic (Indonesia); lane centre of a 9.6-wide road
export const TRAFFIC_RADIUS = 1.4;
const MODELS = ['sedan', 'suv', 'taxi', 'van', 'hatchback-sports', 'truck'];
const LOOK_AHEAD = 7;
const LOOK_WIDTH = 2.5;
const ACCEL = 12;
const STUCK_SECONDS = 3;

export interface TrafficCar {
  row: number;
  col: number;
  dir: Dir;
  t: number; // 0..1 progress from this tile's centre toward the next tile's centre
  speed: number;
  model: string;
  x: number;
  z: number;
  heading: number;
  stuck: number;
}

function placeCar(c: TrafficCar) {
  const { x, z } = tileCenter(c.row, c.col);
  const f = DIR_VEC[c.dir];
  const l = DIR_VEC[leftOf(c.dir)];
  c.x = x + f.dx * c.t * TILE + l.dx * LANE_OFFSET;
  c.z = z + f.dz * c.t * TILE + l.dz * LANE_OFFSET;
  c.heading = headingOf(c.dir);
}

export function spawnTraffic(map: string[], count: number, rng: () => number, avoid: { x: number; z: number; radius: number }): TrafficCar[] {
  const tiles = roadTiles(map).filter(({ row, col }) => {
    const { x, z } = tileCenter(row, col);
    return Math.hypot(x - avoid.x, z - avoid.z) > avoid.radius + TILE;
  });
  const cars: TrafficCar[] = [];
  while (cars.length < count) {
    const { row, col } = tiles[Math.floor(rng() * tiles.length)];
    const sides = roadSides(map, row, col);
    const c: TrafficCar = {
      row, col, dir: sides[Math.floor(rng() * sides.length)], t: rng(), speed: TRAFFIC_SPEED,
      model: MODELS[Math.floor(rng() * MODELS.length)], x: 0, z: 0, heading: 0, stuck: 0,
    };
    placeCar(c);
    cars.push(c);
  }
  return cars;
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

/** Moves every car along the road graph; cars queue behind obstacles/each other. Mutates `cars`. */
export function stepTraffic(cars: TrafficCar[], obstacles: { x: number; z: number }[], dt: number, rng: () => number, map: string[]): void {
  for (const c of cars) {
    placeCar(c);
    const blocked = obstacles.some((o) => blockedBy(c, o)) || cars.some((o) => o !== c && blockedBy(c, o));
    c.stuck = blocked ? c.stuck + dt : 0;
    const target = blocked && c.stuck < STUCK_SECONDS ? 0 : TRAFFIC_SPEED; // ponytail: after 3s just push through (breaks 4-way deadlocks)
    c.speed = Math.abs(target - c.speed) <= ACCEL * dt ? target : c.speed + Math.sign(target - c.speed) * ACCEL * dt;
    c.t += (c.speed * dt) / TILE;
    while (c.t >= 1) {
      c.t -= 1;
      c.row += DIR_VEC[c.dir].dz;
      c.col += DIR_VEC[c.dir].dx;
      const exits = roadSides(map, c.row, c.col).filter((d) => d !== opposite(c.dir));
      c.dir = exits.length ? exits[Math.floor(rng() * exits.length)] : opposite(c.dir);
    }
    placeCar(c);
  }
}

export const trafficCircles = (cars: TrafficCar[]): Circle[] => cars.map((c) => ({ x: c.x, z: c.z, r: TRAFFIC_RADIUS }));
