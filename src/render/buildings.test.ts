import { describe, it, expect } from 'vitest';
import { wallQuads, flatCap, hipRoof } from './buildings';

const ys = (p: number[]) => p.filter((_, i) => i % 3 === 1);

describe('wallQuads', () => {
  it('makes one quad per edge with one window per 3 m × storey', () => {
    const g = wallQuads([[0, 0], [6, 0], [6, 6], [0, 6]], 6.4);
    expect(g.positions).toHaveLength(4 * 4 * 3);
    expect(g.indices).toHaveLength(4 * 6);
    expect(g.uvs!.slice(0, 8)).toEqual([0, 0, 2, 0, 2, 2, 0, 2]);
    expect(Math.max(...ys(g.positions))).toBe(6.4);
  });
});

describe('flatCap', () => {
  it('triangulates a concave ring at the given height', () => {
    const g = flatCap([[0, 0], [10, 0], [10, 10], [5, 5], [0, 10]], 3.2);
    expect(g.indices).toHaveLength(3 * 3); // n − 2 triangles
    expect(new Set(ys(g.positions))).toEqual(new Set([3.2]));
  });
});

describe('hipRoof', () => {
  it('puts the ridge on the long axis at y + rise and overhangs the eaves', () => {
    const g = hipRoof({ cx: 0, cz: 0, ux: 1, uz: 0, long: 10, short: 6 }, 3.2, 2);
    expect(g.indices).toHaveLength(8 * 3);
    expect(Math.max(...ys(g.positions))).toBe(5.2);
    expect(Math.min(...ys(g.positions))).toBe(3.2);
    const xs = g.positions.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(5.6); // 10/2 + 0.6 overhang
    const ridge = Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions.slice(i * 3, i * 3 + 3)).filter((p) => p[1] === 5.2);
    for (const [x, , z] of ridge) {
      expect(Math.abs(x)).toBeCloseTo(2); // (5.6 − 3.6)
      expect(z).toBeCloseTo(0);
    }
  });
});
