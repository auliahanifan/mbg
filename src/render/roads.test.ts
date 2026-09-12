import { describe, it, expect } from 'vitest';
import { ribbon, disc } from './roads';

const xz = (p: number[]) => Array.from({ length: p.length / 3 }, (_, i) => [p[i * 3], p[i * 3 + 2]]);

describe('ribbon', () => {
  it('offsets a straight segment by ±width/2 with upward-facing quads', () => {
    const r = ribbon([[0, 0], [10, 0]], 2, 0.5);
    expect(xz(r.positions)).toEqual([[0, 1], [0, -1], [10, 1], [10, -1]]);
    expect(r.positions[1]).toBe(0.5);
    expect(r.indices).toEqual([0, 2, 1, 1, 2, 3]);
  });
  it('miters the corner of a right-angle bend', () => {
    const r = ribbon([[0, 0], [10, 0], [10, 10]], 2, 0);
    const p = xz(r.positions);
    expect(p[2][0]).toBeCloseTo(9); expect(p[2][1]).toBeCloseTo(1);
    expect(p[3][0]).toBeCloseTo(11); expect(p[3][1]).toBeCloseTo(-1);
    expect(r.indices).toHaveLength(12);
  });
  it('drops repeated points and degenerate polylines', () => {
    expect(ribbon([[0, 0], [0, 0], [5, 0]], 2, 0).positions).toHaveLength(12);
    expect(ribbon([[3, 3]], 2, 0).indices).toEqual([]);
  });
});

describe('disc', () => {
  it('is a fan around the centre', () => {
    const d = disc(5, 5, 2, 0.1, 8);
    expect(d.positions).toHaveLength(9 * 3);
    expect(d.indices).toHaveLength(8 * 3);
    expect(d.positions.slice(0, 3)).toEqual([5, 0.1, 5]);
  });
});
