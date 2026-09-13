import { describe, it, expect } from 'vitest';
import { wallQuads, flatCap, hipRoof, towerRing, frontSide, fence, yard, pillars, offsetRing, bandUnits, canopy } from './buildings';

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

describe('offsetRing', () => {
  it('grows a square outward by d whichever way it winds', () => {
    const cw: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const r = Math.SQRT1_2; // along the corner bisector, d from the corner
    const out = [[-r, -r], [10 + r, -r], [10 + r, 10 + r], [-r, 10 + r]];
    offsetRing(cw, 1).forEach(([x, z], i) => { expect(x).toBeCloseTo(out[i][0]); expect(z).toBeCloseTo(out[i][1]); });
    offsetRing([...cw].reverse(), 1).forEach(([x, z], i) => { expect(x).toBeCloseTo(out[3 - i][0]); expect(z).toBeCloseTo(out[3 - i][1]); });
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

describe('gable roof', () => {
  it('runs the ridge the full length and returns the end triangles separately', () => {
    const g = hipRoof({ cx: 0, cz: 0, ux: 1, uz: 0, long: 10, short: 6 }, 3.2, 2, true);
    expect(g.indices).toHaveLength(6 * 3); // 2 slopes + underside, no hips
    expect(g.ends!.indices).toHaveLength(2 * 3);
    const ridge = Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions.slice(i * 3, i * 3 + 3)).filter((p) => p[1] === 5.2);
    for (const [x] of ridge) expect(Math.abs(x)).toBeCloseTo(5.6);
  });
});

describe('towerRing', () => {
  it('is a rectangle centred on the box, no wider than the caps', () => {
    const r = towerRing({ cx: 10, cz: 5, ux: 0, uz: 1, long: 200, short: 100 });
    expect(r).toHaveLength(4);
    const xs = r.map(([x]) => x);
    const zs = r.map(([, z]) => z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(45); // long axis is +z here
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(28);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(10);
  });
});

describe('frontSide + fence + yard + pillars', () => {
  const box = { cx: 0, cz: 0, ux: 1, uz: 0, long: 10, short: 6 };
  // road to the +z side: probe at z = 8 is 2 m short of a corridor edge at z = 10 → escape (0, +2), kerb line at z = 3 + 5 + 2 − 0.5
  const f = frontSide(box, (_x, z) => (z > 5 ? [0, 2] : null))!;
  it('kerb line sits 0.5 m outside the corridor edge on the road-facing side', () => {
    expect(f.fz).toBeCloseTo(9.5);
    expect(f.off).toBeCloseTo(6.5);
    expect(f.nx).toBeCloseTo(0); expect(f.nz).toBeCloseTo(1);
    expect(frontSide(box, () => null)).toBeNull();
    expect(frontSide(box, (_x, z) => (z > 5 ? [0, -6] : null))!.off).toBeCloseTo(0.8); // probe deep inside a corridor: never closer than 0.8 m
  });
  it('fence spans the front with a gate gap', () => {
    const g = fence(f, 0);
    const zs = g.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(9.4);
    expect(Math.max(...zs)).toBeCloseTo(9.6);
    expect(Math.max(...g.positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(1.35);
    const xs = g.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(-5);
    expect(Math.max(...xs)).toBeCloseTo(5);
    expect(xs.some((x) => Math.abs(x - 1.4) < 1e-6)).toBe(true); // gate edge
  });
  it('yard fills wall → kerb, pillars stand 1.6 m out from the wall', () => {
    const y = yard(f, () => 0);
    const zs = y.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(3);
    expect(Math.max(...zs)).toBeCloseTo(9.5);
    const p = pillars(f, 0, 2.2);
    expect(p.positions).toHaveLength(3 * 20 * 3);
    const pz = p.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...pz)).toBeCloseTo(4.6 - 0.11);
    expect(Math.max(...p.positions.filter((_, i) => i % 3 === 1))).toBe(2.2);
  });
});

describe('bandUnits', () => {
  it('splits every edge into ~5.5 m shop units, each with its own seed', () => {
    const units = bandUnits([[0, 0], [22, 0], [22, 5.5], [0, 5.5]], 0.65, 3);
    expect(units).toHaveLength(4 + 1 + 4 + 1); // 22 m → 4 units, 5.5 m → 1
    expect(new Set(units.map((u) => u.seed)).size).toBe(units.length);
    expect(units[0].geo.positions).toEqual([0, 3, 0, 5.5, 3, 0, 5.5, 3.65, 0, 0, 3.65, 0]);
  });
});

describe('canopy', () => {
  it('slopes from the wall down to a lipped outer edge, never past the kerb', () => {
    const g = canopy({ fx: 0, fz: 4, tx: 1, tz: 0, half: 5, nx: 0, nz: 1, off: 1.5 }, 3.2);
    const zs = g.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(4); // the lip stops at the kerb line, not beyond it
    expect(Math.min(...zs)).toBeCloseTo(2.5); // the wall
    expect(Math.min(...ys(g.positions))).toBeCloseTo(3.2 - 0.35 - 0.18);
  });
});
