import { describe, it, expect } from 'vitest';
import { shortName, labelSpots } from './mapLabels';

describe('shortName', () => {
  it('abbreviates Indonesian street prefixes and ranks', () => {
    expect(shortName('Jalan Jenderal Sudirman')).toBe('Jl. Jend. Sudirman');
    expect(shortName('Jalan Letnan Jenderal S. Parman')).toBe('Jl. Letjen S. Parman');
    expect(shortName('Jalan Profesor Dokter Soeharso')).toBe('Jl. Prof. Dr. Soeharso');
    expect(shortName('Gang Mawar')).toBe('Gg. Mawar');
    expect(shortName('Kranji')).toBe('Kranji');
  });
});

describe('labelSpots', () => {
  const nodes: [number, number][] = [[0, 0], [100, 0], [200, 0], [0, 100], [900, 900]];
  it('labels the midpoint of the in-window length, along the road', () => {
    const [s] = labelSpots({ nodes, ways: [{ n: [0, 1, 2], w: 6, name: 'Jalan A' }] }, 100, 0, 200);
    expect(s).toMatchObject({ text: 'Jl. A', x: 100, z: 0, angle: 0, len: 200 });
  });
  it('keeps text upright and handles vertical roads', () => {
    const [rev] = labelSpots({ nodes, ways: [{ n: [2, 1, 0], w: 6, name: 'Jalan A' }] }, 100, 0, 200);
    expect(rev.angle).toBeCloseTo(0);
    const [up] = labelSpots({ nodes, ways: [{ n: [0, 3], w: 6, name: 'Jalan B' }] }, 0, 50, 200);
    expect(up.angle).toBeCloseTo(Math.PI / 2);
  });
  it('one label per name (longest), none for unnamed or out-of-window ways', () => {
    const ways = [
      { n: [0, 1], w: 6, name: 'Jalan A' },
      { n: [1, 2], w: 6, name: 'Jalan A' },
      { n: [0, 3], w: 6 },
      { n: [4, 4], w: 6, name: 'Jauh' },
    ];
    const spots = labelSpots({ nodes, ways }, 100, 0, 200);
    expect(spots).toHaveLength(1);
    expect(spots[0].len).toBe(100);
  });
});
