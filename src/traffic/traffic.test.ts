import { describe, it, expect } from 'vitest';
import { loadCity, pointOnEdge } from '../world/city';
import { spawnTraffic, stepTraffic, trafficCircles, TRAFFIC_RADIUS, type TrafficCar } from './traffic';

// 0 --100-- 1 --100-- 2 ; 1 --100-- 3 (south). Node 2 and 3 are dead ends.
const city = loadCity({
  nodes: [[0, 0], [100, 0], [200, 0], [100, 100]],
  ways: [{ n: [0, 1, 2], w: 6 }, { n: [1, 3], w: 4 }],
  buildings: [],
  pois: [],
});
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const car = (edge: number, dir: 1 | -1, t: number, speed = 10): TrafficCar =>
  ({ edge, dir, t, speed, cruise: 10, model: 'sedan', x: 0, z: 0, heading: 0, stuck: 0 });
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
  it('exposes collision circles', () => {
    expect(trafficCircles([car(0, 1, 0)])[0].r).toBe(TRAFFIC_RADIUS);
  });
});
