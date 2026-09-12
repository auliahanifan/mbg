import { describe, it, expect } from 'vitest';
import { pushOutOfBox, resolveCar, CAR_RADIUS } from './collision';

const box = { minX: 0, maxX: 8, minZ: 0, maxZ: 8 };

describe('pushOutOfBox', () => {
  it('returns null when clear', () => {
    expect(pushOutOfBox({ x: 10, z: 4, r: 1 }, box)).toBeNull();
  });
  it('pushes a circle overlapping an edge straight out', () => {
    const p = pushOutOfBox({ x: 8.5, z: 4, r: 1 }, box)!;
    expect(p.dx).toBeCloseTo(0.5);
    expect(p.dz).toBeCloseTo(0);
  });
  it('pushes a circle overlapping a corner diagonally', () => {
    const p = pushOutOfBox({ x: 8.5, z: 8.5, r: 1 }, box)!;
    expect(p.dx).toBeCloseTo(p.dz);
    expect(Math.hypot(8.5 + p.dx - 8, 8.5 + p.dz - 8)).toBeCloseTo(1);
  });
  it('pushes a centre inside the box out through the nearest face', () => {
    const p = pushOutOfBox({ x: 7.5, z: 4, r: 1 }, box)!;
    expect(p.dx).toBeCloseTo(1.5);
    expect(p.dz).toBeCloseTo(0);
  });
});

describe('resolveCar', () => {
  const clear = { x: 20, z: 20, heading: 0, speed: 10 };

  it('leaves a clear car untouched', () => {
    expect(resolveCar(clear, [box], []).car).toEqual(clear);
  });

  it('stops a car driven head-on into a building', () => {
    // facing -x, front sample sits on the box's east face (x = 8)
    const s = { x: 9, z: 4, heading: -Math.PI / 2, speed: 10 };
    const { car, hits } = resolveCar(s, [box], []);
    expect(car.x).toBeCloseTo(9 + CAR_RADIUS);
    expect(car.z).toBeCloseTo(4);
    expect(car.speed).toBeLessThan(0); // driven forwards into a wall: rebounds backwards
    expect(Math.abs(car.speed)).toBeLessThan(3);
    expect(hits[0].index).toBe(-1);
    expect(hits[0].impact).toBeCloseTo(10);
  });

  it('costs nothing to scrape past something it is already driving away from', () => {
    // facing +x with the rear sample overlapping the box: no closing speed, so no impulse
    const s = { x: 9, z: 4, heading: Math.PI / 2, speed: 10 };
    const { car, hits } = resolveCar(s, [box], []);
    expect(car.x).toBeCloseTo(9 + CAR_RADIUS);
    expect(car.speed).toBeCloseTo(10);
    expect(hits).toHaveLength(0);
  });

  it('barely slows for a motorbike but throws it hard', () => {
    const s = { x: 0, z: 0, heading: 0, speed: 30 };
    const { car, hits } = resolveCar(s, [], [{ x: 0, z: 2, r: 0.55, mass: 128 }]);
    expect(car.speed).toBeGreaterThan(26); // a 128 kg scooter costs the van almost nothing
    expect(hits[0].dv).toBeGreaterThan(30); // ...and the scooter goes flying
    expect(hits[0].nz).toBeCloseTo(1); // thrown forwards, away from the van
  });

  it('is stopped hard by a truck, which barely moves', () => {
    const s = { x: 0, z: 0, heading: 0, speed: 30 };
    const { car, hits } = resolveCar(s, [], [{ x: 0, z: 2, r: 1.55, mass: 2503 }]);
    expect(car.speed).toBeLessThan(10);
    expect(hits[0].dv).toBeLessThan(20);
  });

  it('ignores a wreck that is already flying', () => {
    const s = { x: 0, z: 0, heading: 0, speed: 30 };
    expect(resolveCar(s, [], [{ x: 0, z: 1, r: 0, mass: 128 }]).hits).toHaveLength(0);
  });

  it('collides with a boundary wall box far from the origin', () => {
    const s = { x: 500, z: 11, heading: 0, speed: 5 };
    const wall = { minX: -1750, maxX: 1750, minZ: 12, maxZ: 62 };
    const { car } = resolveCar(s, [wall], []);
    expect(car.z).toBeLessThan(12);
    expect(car.speed).toBeLessThan(5);
  });
});
