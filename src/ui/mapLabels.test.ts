import { describe, it, expect } from 'vitest';
import { shortName, labelSpots, buildingSpots } from './mapLabels';

describe('shortName', () => {
  it('abbreviates Indonesian street prefixes and ranks', () => {
    expect(shortName('Jalan Jenderal Sudirman')).toBe('Jl. Jend. Sudirman');
    expect(shortName('Jalan Letnan Jenderal S. Parman')).toBe('Jl. Letjen S. Parman');
    expect(shortName('Jalan Profesor Dokter Soeharso')).toBe('Jl. Prof. Dr. Soeharso');
    expect(shortName('Gang Mawar')).toBe('Gg. Mawar');
    expect(shortName('Kranji')).toBe('Kranji');
    expect(shortName('Jalan Doktor Angka')).toBe('Jl. Dr. Angka');
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
    expect(spots[0].len).toBe(200);
    expect([50, 150]).toContain(spots[0].x);
  });
  it('accumulates length per name across many ways, placed on the longest piece', () => {
    const panjangNodes: [number, number][] = [[0, 0], [60, 0], [120, 0], [180, 0]];
    const nodes2 = [...panjangNodes, [0, 100] as [number, number], [100, 100] as [number, number]];
    const ways = [
      { n: [0, 1], w: 6, name: 'Jalan Panjang' },
      { n: [1, 2], w: 6, name: 'Jalan Panjang' },
      { n: [2, 3], w: 6, name: 'Jalan Panjang' },
      { n: [4, 5], w: 6, name: 'Jalan Lain' },
    ];
    const spots = labelSpots({ nodes: nodes2, ways }, 90, 50, 200);
    const panjang = spots.find((s) => s.text === 'Jl. Panjang')!;
    const lain = spots.find((s) => s.text === 'Jl. Lain')!;
    expect(panjang.len).toBe(180);
    expect([30, 90, 150]).toContain(panjang.x);
    expect(lain.len).toBe(100);
  });
});

describe('buildingSpots', () => {
  const sq = (x: number, z: number, s: number, name?: string) => ({ p: [[x, z], [x + s, z], [x + s, z + s], [x, z + s]] as [number, number][], name });
  it('labels named buildings in the window at their centroid, largest first', () => {
    const spots = buildingSpots([sq(0, 0, 10, 'Toko'), sq(50, 50, 40, 'Mall'), sq(0, 0, 10), sq(900, 900, 50, 'Jauh')], 50, 50, 100);
    expect(spots.map((s) => s.text)).toEqual(['Mall', 'Toko']);
    expect(spots[0]).toMatchObject({ x: 70, z: 70, area: 1600 });
  });
});
