import { describe, it, expect } from 'vitest';
import { loadCity, pointOnEdge } from '../world/city';
import { spawnTraffic, stepTraffic, trafficCircles, launch, type TrafficCar } from './traffic';
import { vehicleSpec } from '../vehicle/vehicles';

// 0 --100-- 1 --100-- 2 ; 1 --100-- 3 (south). Node 2 and 3 are dead ends.
const city = loadCity({
  nodes: [[0, 0], [100, 0], [200, 0], [100, 100]],
  ways: [{ n: [0, 1, 2], w: 6 }, { n: [1, 3], w: 4 }],
  buildings: [],
  pois: [],
});
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const car = (edge: number, dir: 1 | -1, t: number, speed = 10, model = 'avanza'): TrafficCar =>
  ({ edge, dir, t, speed, cruise: 10, model, x: 0, z: 0, heading: 0, stuck: 0 });
const far = { x: 50, z: 0 }; // player reference that never triggers a respawn in these tests

describe('traffic', () => {
  it('moves along the edge in the left lane', () => {
    const c = car(0, 1, 0);
    stepTraffic(city, [c], [], 1, seq(0), far);
    expect(c.x).toBeCloseTo(10);
    expect(c.z).toBeCloseTo(-1.5); // left of eastbound = north = -z, offset w/4
    expect(c.heading).toBeCloseTo(Math.PI / 2);
  });
  it('turns onto a random exit at a node, never straight back', () => {
    const c = car(0, 1, 0.95);
    stepTraffic(city, [c], [], 1, seq(0.99), far); // rng picks the last exit
    expect(c.edge).toBe(2);
    expect(c.dir).toBe(1);
    expect(c.t).toBeCloseTo(0.05, 1);
  });
  it('u-turns at a dead end', () => {
    const c = car(1, 1, 0.95);
    stepTraffic(city, [c], [], 1, seq(0), far);
    expect(c.edge).toBe(1);
    expect(c.dir).toBe(-1);
    expect(c.t).toBeCloseTo(0.05, 1);
  });
  it('brakes behind an obstacle ahead and pushes through after 3 s', () => {
    const c = car(0, 1, 0.1);
    stepTraffic(city, [c], [{ x: 15, z: -1.5 }], 0.5, seq(0), far);
    expect(c.speed).toBeLessThan(10);
    for (let i = 0; i < 8; i++) stepTraffic(city, [c], [{ x: 15, z: -1.5 }], 0.5, seq(0), far);
    expect(c.speed).toBeGreaterThan(0);
  });
  it('drives slower on narrow roads', () => {
    const c = car(2, 1, 0, 0);
    for (let i = 0; i < 20; i++) stepTraffic(city, [c], [], 0.5, seq(0), far);
    expect(c.speed).toBeCloseTo(7);
  });
  it('spawns on edges whose midpoint is in range and respawns cars that fall behind', () => {
    const cars = spawnTraffic(city, 3, seq(0.1, 0.5, 0.9), { x: 0, z: 0 });
    expect(cars).toHaveLength(3);
    for (const c of cars) {
      const mid = pointOnEdge(city, c.edge, 0.5);
      expect(Math.hypot(mid.x, mid.z)).toBeGreaterThanOrEqual(20);
      expect(c.speed).toBe(0);
    }
    const c = car(0, 1, 0);
    stepTraffic(city, [c], [], 0.01, seq(0.5), { x: 2000, z: 2000 }); // > 350 m away → respawn; no edge is in ring, so closest-to-ring wins (edge 2)
    expect(c.edge).toBe(2);
    expect(c.dir).toBe(-1);
    expect(c.t).toBe(0.5);
    expect(c.speed).toBe(0);
  });
  it('puts motorbikes further left, by the kerb', () => {
    const c = car(0, 1, 0, 10, 'beat');
    stepTraffic(city, [c], [], 1, seq(0), far);
    expect(c.z).toBeCloseTo(-2.3); // w/4 + 0.8
  });
  it('exposes collision circles sized per vehicle', () => {
    expect(trafficCircles([car(0, 1, 0)])[0].r).toBe(vehicleSpec('avanza').radius);
    expect(trafficCircles([car(0, 1, 0, 10, 'beat')])[0].r).toBeLessThan(vehicleSpec('avanza').radius);
  });
});

describe('launch', () => {
  const fly = (c: TrafficCar, seconds: number, dt = 1 / 60) => {
    for (let i = 0; i < seconds / dt; i++) stepTraffic(city, [c], [], dt, seq(0.5), far);
  };

  it('throws a rear-ended scooter along the hit and into the air', () => {
    const c = car(0, 1, 0.5, 0, 'beat');
    stepTraffic(city, [c], [], 0.01, seq(0), far); // settle it onto the road first
    const x0 = c.x;
    launch(c, 1, 0, 35); // hit square from behind, travelling +x
    expect(c.crash!.vy).toBeGreaterThan(0);
    expect(c.crash!.spin).toBeCloseTo(0); // square in the back: shunted, not spun
    fly(c, 0.5);
    expect(c.x).toBeGreaterThan(x0 + 5);
    expect(c.crash!.y).toBeGreaterThan(0); // still airborne
  });

  it('spins and rolls a scooter hit side-on', () => {
    const c = car(0, 1, 0.5, 0, 'beat'); // heading +x
    stepTraffic(city, [c], [], 0.01, seq(0), far);
    launch(c, 0, 1, 35); // knocked sideways
    expect(Math.abs(c.crash!.spin)).toBeGreaterThan(1);
    expect(Math.abs(c.crash!.rollRate)).toBeGreaterThan(1);
  });

  it('barely lifts a truck and never spins anything absurdly fast', () => {
    const bike = car(0, 1, 0.5, 0, 'beat');
    const truck = car(0, 1, 0.5, 0, 'canter');
    launch(bike, 0, 1, 400); // a NOS run at 400 km/h
    launch(truck, 0, 1, 20);
    expect(truck.crash!.vy).toBeLessThan(bike.crash!.vy);
    expect(Math.abs(bike.crash!.spin)).toBeLessThanOrEqual(8);
    expect(Math.hypot(bike.crash!.vx, bike.crash!.vz)).toBeLessThanOrEqual(41);
  });

  it('ignores a second hit while it is already flying', () => {
    const c = car(0, 1, 0.5, 0, 'beat');
    launch(c, 1, 0, 20);
    const first = { ...c.crash! };
    launch(c, 1, 0, 20);
    expect(c.crash).toMatchObject({ vx: first.vx, vz: first.vz });
  });

  it('is not solid while flying, and rejoins traffic once it settles', () => {
    const c = car(0, 1, 0.5, 0, 'beat');
    stepTraffic(city, [c], [], 0.01, seq(0), far);
    launch(c, 1, 0, 30);
    expect(trafficCircles([c])[0].r).toBe(0);
    fly(c, 12); // lands, slides to a stop, sits there, then gets recycled
    expect(c.crash).toBeNull(); // recycled back into traffic
    expect(trafficCircles([c])[0].r).toBeGreaterThan(0); // solid again
  });

  it('lets other traffic drive through the space a wreck used to occupy', () => {
    const wreck = car(0, 1, 0.2, 0, 'beat');
    launch(wreck, 0, 1, 30);
    const behind = car(0, 1, 0.1);
    stepTraffic(city, [wreck, behind], [], 0.5, seq(0), far);
    expect(behind.stuck).toBe(0); // the wreck is debris, not a queue to sit behind
  });
});
