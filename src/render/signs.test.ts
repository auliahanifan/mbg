import { describe, it, expect } from 'vitest';
import { frontEdge, signColors } from './signs';
import { orientedBox } from '../world/osm';
import type { Front } from './buildings';

describe('frontEdge', () => {
  // 10 × 6 shop, road to the south (+z); the kerb line 3 m past the south wall
  const ring: [number, number][] = [[0, 0], [10, 0], [10, 6], [0, 6]];
  const box = orientedBox(ring);
  const front: Front = { fx: 5, fz: 9, tx: 1, tz: 0, half: 5, nx: 0, nz: 1, off: 3 };
  it('hangs the board on the wall facing the road', () => {
    expect(frontEdge(ring, box, front)).toEqual([[10, 6], [0, 6]]);
  });
  it('picks the wing that reaches the street on an L-shape, not the recessed wall', () => {
    const L: [number, number][] = [[0, 0], [10, 0], [10, 6], [6, 6], [6, 3], [0, 3]];
    expect(frontEdge(L, orientedBox(L), front)).toEqual([[10, 6], [6, 6]]);
  });
  it('gives up when the street wall is too short for a board', () => {
    const sliver: [number, number][] = [[0, 0], [10, 0], [10, 6], [8, 6], [8, 3], [0, 3]];
    expect(frontEdge(sliver, orientedBox(sliver), front)).toBeNull();
  });
});

describe('signColors', () => {
  it('uses the real brand colours for the chains and a stable palette pick otherwise', () => {
    expect(signColors('Indomaret')).toEqual(['#0b5cad', '#ffffff']);
    expect(signColors('Toko Obat Berkat')).toEqual(signColors('Toko Obat Berkat'));
  });
});
