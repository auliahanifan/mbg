import { edgesFrom, pointOnEdge, type City } from '../world/city';
import type { Circle } from '../vehicle/collision';
import { makeCrash, pickEdge, stepCrash, type Crash } from '../traffic/traffic';

export const PERSON_MASS = 65;
export const PERSON_RADIUS = 0.35;
const KERB = 0.8; // metres past the asphalt edge: on the sidewalk, under the eaves of whatever fronts the road
const KEEP_RADIUS = 160;
const RESPAWN_RADIUS = 220;
const SPAWN_MIN = 40;
const SPAWN_AVOID = 12;
const IDLE_SHARE = 0.2; // standing at a warung, waiting for an angkot
const DODGE = 6; // a car this close, coming at them, and they hurry off the kerb line
const MAX_DV = 25; // m/s: a person hit at 200 km/h still lands inside the block

export interface Person {
  edge: number;
  dir: 1 | -1; // 1 = a→b
  t: number; // 0..1 along dir
  side: 1 | -1; // 1 = left kerb of the walking direction (Indonesia walks and drives on the left)
  speed: number; // current, m/s
  pace: number; // own walking speed; 0 = standing
  x: number;
  z: number;
  heading: number;
  phase: number; // walk cycle, radians
  look: number; // shirt / skin / hijab variant seed
  crash?: Crash | null; // set = hit by a vehicle and flying / lying
}

/** Somewhere on the kerb is inside another carriageway (a dual carriageway's median, an overlapping service road): nobody walks there. */
export type Blocked = (x: number, z: number) => boolean;

function kerb(city: City, edge: number, dir: 1 | -1, t: number, side: 1 | -1): { x: number; z: number; heading: number } {
  const at = pointOnEdge(city, edge, dir === 1 ? t : 1 - t);
  const heading = dir === 1 ? at.heading : at.heading + Math.PI;
  const off = (city.edges[edge].w / 2 + KERB) * side;
  return { x: at.x + Math.cos(heading) * off, z: at.z - Math.sin(heading) * off, heading }; // left of forward is (cos h, -sin h)
}

const walkable = (city: City, blocked: Blocked, edge: number, dir: 1 | -1, side: 1 | -1) => { const k = kerb(city, edge, dir, 0.5, side); return !blocked(k.x, k.z); };

function place(city: City, p: Person) {
  const k = kerb(city, p.edge, p.dir, p.t, p.side);
  p.x = k.x;
  p.z = k.z;
  p.heading = k.heading;
}

function respawn(city: City, p: Person, rng: () => number, near: { x: number; z: number }, minR: number, maxR: number, blocked: Blocked) {
  for (let tries = 0; tries < 12; tries++) {
    p.edge = pickEdge(city, rng, near, minR, maxR);
    p.dir = rng() < 0.5 ? 1 : -1;
    p.side = rng() < 0.5 ? 1 : -1;
    if (walkable(city, blocked, p.edge, p.dir, p.side)) break;
  }
  p.t = rng();
  p.pace = rng() < IDLE_SHARE ? 0 : 1.0 + 0.6 * rng();
  p.speed = p.pace;
  p.crash = null;
  place(city, p);
}

export function spawnPeople(city: City, count: number, rng: () => number, near: { x: number; z: number }, blocked: Blocked = () => false): Person[] {
  return Array.from({ length: count }, () => {
    const p: Person = { edge: 0, dir: 1, t: 0, side: 1, speed: 0, pace: 0, x: 0, z: 0, heading: 0, phase: rng() * Math.PI * 2, look: Math.floor(rng() * 1e6) };
    respawn(city, p, rng, near, SPAWN_AVOID, KEEP_RADIUS, blocked);
    return p;
  });
}

/** Knocks a pedestrian down: same ballistic step as a wrecked bike, then they lie there until recycled. */
export function hitPerson(p: Person, nx: number, nz: number, dv: number): void {
  if (p.crash) return;
  p.crash = makeCrash(p.heading, p.speed, PERSON_MASS, nx, nz, Math.min(dv, MAX_DV));
  p.speed = 0;
}

/**
 * Walks everyone along the kerbs; at a junction each picks a random exit with a walkable kerb on their side, crossing to
 * the other side when there is none; far people respawn near the player. Mutates `people`.
 */
export function stepPeople(city: City, people: Person[], dt: number, rng: () => number, player: { x: number; z: number; heading: number; speed: number }, blocked: Blocked = () => false): void {
  for (const p of people) {
    if (p.crash) {
      if (stepCrash(p, dt)) respawn(city, p, rng, player, SPAWN_MIN, KEEP_RADIUS, blocked);
      continue;
    }
    if (Math.hypot(p.x - player.x, p.z - player.z) > RESPAWN_RADIUS) {
      respawn(city, p, rng, player, SPAWN_MIN, KEEP_RADIUS, blocked);
      continue;
    }
    // a car bearing down on them: break into a run along the kerb (they cannot leave the graph, but they get out of the way faster)
    const rx = p.x - player.x;
    const rz = p.z - player.z;
    const closing = (rx * Math.sin(player.heading) + rz * Math.cos(player.heading)) * player.speed;
    const scared = closing > 0 && Math.hypot(rx, rz) < DODGE + Math.abs(player.speed) * 0.5;
    p.speed = scared ? 3.5 : p.pace;
    p.phase += p.speed * dt * 4;
    let e = city.edges[p.edge];
    p.t += (p.speed * dt) / e.len;
    while (p.t >= 1) {
      const overflow = (p.t - 1) * e.len;
      const node = p.dir === 1 ? e.b : e.a;
      const exits = edgesFrom(city, node).filter((i) => i !== p.edge);
      const dirOf = (i: number): 1 | -1 => (city.edges[i].a === node ? 1 : -1);
      let side = p.side;
      let open = exits.filter((i) => walkable(city, blocked, i, dirOf(i), side));
      if (!open.length) { side = side === 1 ? -1 : 1; open = exits.filter((i) => walkable(city, blocked, i, dirOf(i), side)); }
      if (open.length) {
        p.edge = open[Math.floor(rng() * open.length)];
        e = city.edges[p.edge];
        p.dir = dirOf(p.edge);
        p.side = side;
      } else {
        p.dir = p.dir === 1 ? -1 : 1; // dead end: turn round
        p.side = p.side === 1 ? -1 : 1; // and stay on the same physical kerb
      }
      p.t = overflow / e.len;
    }
    place(city, p);
  }
}

export const peopleCircles = (people: Person[]): Circle[] =>
  people.map((p) => ({ x: p.x, z: p.z, r: p.crash ? 0 : PERSON_RADIUS, mass: PERSON_MASS }));
