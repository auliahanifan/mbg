import { describe, it, expect } from 'vitest';
import purwokerto from '../../public/purwokerto.json';
import { ribbon, disc, dashes, polePoints, gapuraSpots, streetTrees } from './roads';
import { loadCity } from '../world/city';
import { buildSignals } from '../traffic/signals';
import { clearRoads, corridorEscape, type CityData } from '../world/osm';

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

describe('dashes', () => {
  it('lays 3 m dashes every 6 m, keeping the margin at both ends', () => {
    const d = dashes([[0, 0], [30, 0]], 6, 0);
    expect(d).toHaveLength(3); // dashes at 6-9, 12-15, 18-21 (24-27 would end past 30-6)
    expect(d[0].positions[0]).toBe(6);
    expect(d[2].positions[6]).toBe(21);
  });
  it('continues onto the next segment after a vertex', () => {
    const d = dashes([[0, 0], [10, 0], [10, 40]], 0, 0);
    expect(d.length).toBeGreaterThanOrEqual(6);
    expect(d.some((g) => g.positions[2] > 10)).toBe(true); // some dash lies on the vertical segment (z > 10)
  });
});

describe('polePoints', () => {
  it('spaces poles 35 m apart on the left kerb', () => {
    const p = polePoints([[0, 0], [100, 0]], 3);
    expect(p).toHaveLength(3); // at 17.5, 52.5, 87.5
    expect(p[0][0]).toBeCloseTo(17.5);
    expect(p[0][1]).toBeCloseTo(4); // left of an eastbound road (+z)
  });
});

describe('gapuraSpots', () => {
  const city = () => loadCity({
    nodes: [[0, 0], [100, 0], [50, 0], [50, 40], [50, 6]], // a wide road west→east, a gang running north off its middle
    ways: [{ n: [0, 2, 1], w: 10 }, { n: [2, 3], w: 6, name: 'Gang Mawar' }, { n: [2, 4], w: 6, name: 'Gang Melati' }],
    buildings: [], pois: [],
  });
  it('stands one portal per gang mouth, 5 m in, straddling the gang', () => {
    const s = gapuraSpots(city());
    expect(s).toHaveLength(1); // the second gang shares the mouth node, and its 6 m stub is too short anyway
    expect(s[0]).toMatchObject({ x: 50, z: 5, half: 3.7 });
    expect(s[0].heading).toBeCloseTo(0); // heading 0 points along +z, into the gang
  });
  it('ignores a gang that never meets a wide road', () => {
    expect(gapuraSpots(loadCity({ nodes: [[0, 0], [0, 40]], ways: [{ n: [0, 1], w: 6, name: 'Gang Mawar' }], buildings: [], pois: [] }))).toHaveLength(0);
  });
  it('only stands one where OSM names the lane a gang', () => {
    const off = (name?: string) => loadCity({ nodes: [[0, 0], [100, 0], [50, 0], [50, 40]], ways: [{ n: [0, 2, 1], w: 10 }, { n: [2, 3], w: 6, ...(name && { name }) }], buildings: [], pois: [] });
    expect(gapuraSpots(off())).toHaveLength(0); // unnamed stub
    expect(gapuraSpots(off('Jalan Penjara'))).toHaveLength(0); // a named street is not a gang
    expect(gapuraSpots(off('Gg. Melati'))).toHaveLength(1);
  });
});

describe('nothing but traffic stands on the carriageway', () => {
  const real = purwokerto as unknown as CityData;
  real.buildings = clearRoads(real);
  const city = loadCity(real);
  const probe = corridorEscape(real);
  const onRoad = (x: number, z: number) => probe(x, z) !== null;
  const onAsphalt = (x: number, z: number) => probe(x, z, 1.4) !== null; // past the kerb and the 1.2 m trotoar

  it('places no gapura, signal, tree, tenda or tiang in a road, across the whole city', () => {
    const piers = (s: ReturnType<typeof gapuraSpots>[number]): [number, number][] => {
      const [ox, oz] = [Math.cos(s.heading) * s.half, -Math.sin(s.heading) * s.half];
      return [[s.x + ox, s.z + oz], [s.x - ox, s.z - oz]];
    };
    // buildGapura drops a portal whose piers would land in the bigger road rather than shifting it; check the survivors
    const kept = gapuraSpots(city).filter((s) => !piers(s).some((p) => onAsphalt(p[0], p[1])));
    const trees = [...(real.trees ?? []), ...streetTrees(city, onRoad)].filter((p) => !onAsphalt(p[0], p[1]));
    const kerbWalk = (every: number, kerb: number, minW: number) => real.ways.flatMap((w) =>
      w.w >= minW ? polePoints(w.n.map((i) => real.nodes[i]), w.w / 2, every, kerb).filter((p) => !onRoad(p[0], p[1])) : []);
    expect({
      gapura: kept.flatMap(piers).filter((p) => onAsphalt(p[0], p[1])).length,
      gapuraKept: kept.length > 20,
      signals: buildSignals(city, onAsphalt).approaches.filter((a) => onAsphalt(a.x, a.z)).length,
      trees: trees.filter((p) => onAsphalt(p[0], p[1])).length,
      tenda: kerbWalk(90, 1.4, 8).filter((p) => onAsphalt(p[0], p[1])).length,
      tiang: kerbWalk(35, 1.0, 6).filter((p) => onAsphalt(p[0], p[1])).length,
    }).toEqual({ gapura: 0, gapuraKept: true, signals: 0, trees: 0, tenda: 0, tiang: 0 });
  });
});
