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
  it('leaves a clear car untouched', () => {
    const s = { x: 20, z: 20, heading: 0, speed: 10 };
    expect(resolveCar(s, [box], [])).toEqual(s);
  });
  it('pushes the car out of a building and slows it', () => {
    // facing +x; rear sample sits on the box's east face (x = 8)
    const s = { x: 9, z: 4, heading: Math.PI / 2, speed: 10 };
    const r = resolveCar(s, [box], []);
    expect(r.x).toBeCloseTo(9 + CAR_RADIUS);
    expect(r.z).toBeCloseTo(4);
    expect(r.speed).toBeCloseTo(4);
  });
  it('pushes the car away from another car circle', () => {
    const s = { x: 0, z: 0, heading: 0, speed: 10 };
    const r = resolveCar(s, [], [{ x: 0, z: 2, r: 1.4 }]); // front sample at z=1 overlaps
    expect(r.z).toBeLessThan(0);
    expect(r.speed).toBeCloseTo(4);
  });
});
