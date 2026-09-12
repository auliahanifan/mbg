import { describe, it, expect } from 'vitest';
import { HALF_SIZE } from './osm';
import { mdplAt, smooth, densify, makeGround, type Dem } from './terrain';

const dem: Dem = { step: 2 * HALF_SIZE, n: 2, h: [10, 20, 30, 40] }; // one cell over the whole map

describe('mdplAt', () => {
  it('hits the samples at the corners and is linear per triangle', () => {
    expect(mdplAt(dem, -HALF_SIZE, -HALF_SIZE)).toBe(10);
    expect(mdplAt(dem, HALF_SIZE, -HALF_SIZE)).toBe(20);
    expect(mdplAt(dem, -HALF_SIZE, HALF_SIZE)).toBe(30);
    expect(mdplAt(dem, HALF_SIZE, HALF_SIZE)).toBe(40);
    expect(mdplAt(dem, 0, 0)).toBe(25); // on the diagonal both triangles agree
    expect(mdplAt(dem, HALF_SIZE / 2, -HALF_SIZE / 2)).toBe(22.5); // upper triangle (10, 20, 40)
    expect(mdplAt(dem, 9999, 9999)).toBe(40); // clamped
  });
});

describe('smooth / makeGround', () => {
  it('keeps a constant field and flattens a spike', () => {
    expect(smooth({ step: 1, n: 3, h: Array(9).fill(5) }).h).toEqual(Array(9).fill(5));
    const spike = smooth({ step: 1, n: 3, h: [0, 0, 0, 0, 9, 0, 0, 0, 0] }, 1);
    expect(spike.h[4]).toBe(1);
    const g = makeGround(dem);
    expect(g.base).toBeLessThanOrEqual(Math.min(...g.dem.h));
    expect(g.y(-HALF_SIZE, -HALF_SIZE)).toBeGreaterThanOrEqual(0);
  });
});

describe('densify', () => {
  it('splits long segments and keeps the endpoints', () => {
    const pts = densify([[0, 0], [25, 0], [25, 4]], 10);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([25, 4]);
    expect(pts.length).toBe(5); // 3 + 1 sub-segments
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(10);
  });
});
