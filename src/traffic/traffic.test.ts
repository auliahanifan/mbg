import { describe, it, expect } from 'vitest';
import { spawnTraffic, stepTraffic, trafficCircles, TRAFFIC_SPEED, LANE_OFFSET, type TrafficCar } from './traffic';
import { TILE } from '../world/cityMap';

// a 1-tile-wide ring road: row1 and row3 are E-W roads joined by col1 and col3
const ring = [
  'XXXXX',
  'XRRRX',
  'XRXRX',
  'XRRRX',
  'XXXXX',
];
const rng0 = () => 0;
const car = (over: Partial<TrafficCar> = {}): TrafficCar => ({
  row: 1, col: 1, dir: 'E', t: 0, speed: TRAFFIC_SPEED, model: 'sedan', x: 0, z: 0, heading: 0, stuck: 0, ...over,
});

describe('traffic', () => {
  it('spawns on road tiles away from the avoid point', () => {
    const cars = spawnTraffic(ring, 4, Math.random, { x: 8, z: 8, radius: 3 });
    expect(cars.length).toBe(4);
    for (const c of cars) {
      expect(ring[c.row][c.col]).toBe('R');
      expect(Math.hypot(c.x - 8, c.z - 8)).toBeGreaterThan(3);
    }
  });
  it('drives on the left lane of its heading', () => {
    const c = car({ dir: 'E', t: 0.5 });
    stepTraffic([c], [], 0, rng0, ring);
    expect(c.x).toBeCloseTo(TILE + 0.5 * TILE); // tile (1,1) centre x=8, halfway to next tile
    expect(c.z).toBeCloseTo(TILE - LANE_OFFSET); // left of east = north (-z)
    expect(c.heading).toBeCloseTo(Math.PI / 2);
  });
  it('advances into the next tile and turns at a corner (never reverses when it can turn)', () => {
    const c = car({ row: 1, col: 2, dir: 'E', t: 0.9 });
    stepTraffic([c], [], 0.5, rng0, ring); // moves 3.5 units = 0.4375 tiles -> crosses into (1,3)
    expect(c.col).toBe(3);
    expect(c.dir).toBe('S'); // only exit from (1,3) besides back west
    expect(c.t).toBeGreaterThan(0);
  });
  it('turns around at a dead end', () => {
    const deadEnd = ['XXX', 'XRX', 'XRX', 'XXX'];
    const c = car({ row: 2, col: 1, dir: 'N', t: 0.95 }); // about to enter (1,1), whose only exit is back south
    stepTraffic([c], [], 0.2, rng0, deadEnd);
    expect(c.dir).toBe('S');
  });
  it('stops behind an obstacle ahead and ignores one beside it', () => {
    const ahead = car({ dir: 'E', t: 0 });
    stepTraffic([ahead], [], 0, rng0, ring); // place it
    const blocker = { x: ahead.x + 4, z: ahead.z };
    stepTraffic([ahead], [blocker], 0.5, rng0, ring);
    expect(ahead.speed).toBeLessThan(TRAFFIC_SPEED);
    const free = car({ dir: 'E', t: 0 });
    stepTraffic([free], [], 0, rng0, ring);
    stepTraffic([free], [{ x: free.x + 4, z: free.z + 2 * LANE_OFFSET }], 0.5, rng0, ring); // opposite lane
    expect(free.speed).toBe(TRAFFIC_SPEED);
  });
  it('gives up waiting after 3 seconds', () => {
    const c = car({ dir: 'E', t: 0 });
    stepTraffic([c], [], 0, rng0, ring);
    const blocker = { x: c.x + 4, z: c.z };
    for (let i = 0; i < 40; i++) stepTraffic([c], [blocker], 0.1, rng0, ring);
    expect(c.speed).toBeGreaterThan(0);
  });
  it('exposes collision circles', () => {
    const c = car();
    stepTraffic([c], [], 0, rng0, ring);
    expect(trafficCircles([c])).toEqual([{ x: c.x, z: c.z, r: 1.4 }]);
  });
});
