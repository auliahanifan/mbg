import { describe, it, expect } from 'vitest';
import { rails } from './terrain';

describe('rails', () => {
  it('lays two thin bars 1.067 m apart along the line', () => {
    const [l, r] = rails([[0, 0], [100, 0]], 0);
    const z = (g: { positions: number[] }) => (g.positions[2] + g.positions[5]) / 2; // centre z of the first cross-section
    expect(Math.abs(z(l) - z(r))).toBeCloseTo(1.067, 3);
    expect(Math.abs(l.positions[2] - l.positions[5])).toBeCloseTo(0.12, 3);
    expect(l.indices.length).toBe(6);
  });
});
