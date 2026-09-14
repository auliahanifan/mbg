import * as THREE from 'three';
import { area, hash, orientedBox, type CityData, type OrientedBox } from '../world/osm';
import { FLAT, type Ground } from '../world/terrain';

const WALLS = [0xf4f0e8, 0xece6da, 0xf0ebe0, 0xdfe8dc, 0xdde6ec, 0xf3e4d0, 0xf2eac6, 0xd6cec4, 0xe2d6c8, 0xeed8c6, 0xe2e8d6]; // cat tembok Purwokerto: putih, krem, mint, biru muda, peach, kuning muda
const FENCE = 0xbfb9ae; // pagar tembok plester
const PAVING = 0xa6a29a; // halaman semen / paving block
const HIP_ROOFS = [0xb8553a, 0xc4643f, 0x9e4a36, 0xcf7048, 0xb8553a, 0x3d3532, 0x6f7378, 0x4d6f86]; // genteng tanah liat, genteng glazur hitam, seng, galvalum biru
const FLAT_ROOFS = [0x9d9c98, 0x8f918f, 0xa8a49d];
const SIGNBOARDS = [0xd64541, 0x1c56a0, 0x1f7a3e, 0xf2c400, 0xf4f2ec, 0x1a1a1a, 0xe8862a]; // papan nama ruko: merah, biru, hijau, kuning, putih, hitam, oranye
const UNIT = 5.5; // metres of shopfront per ruko unit: the module a Purwokerto row is actually built in
const BAND = 0.65; // the signboard band at the top of a ruko's ground floor (rukoTexture's top 26 px)
const PARAPET_H = 0.75; // the dwarf wall every flat Indonesian roof is edged with, hiding the roof deck from the street
const TANDON = [0xe4771f, 0x2f6fb0, 0xd8d5cc]; // tandon air: the orange, blue and white tanks on Purwokerto rooftops
const CANOPY = 0x8e9297; // seng gelombang / cor kanopi over the shopfront
const CANOPY_REACH = 2.6; // how far a kanopi cantilevers from the wall at most
const TROTOAR = 1.2; // width of the walkway the kanopi is allowed to reach out over, but no further
const DOME = 0x3a9a68;
const MINARET = 0xf2eee4;
const WINDOW_W = 3; // metres per facade texture repeat (one window)
const FLOOR = 3.2; // metres per vertical repeat (one storey)
const TILE = 1.6; // metres per roof-tile texture repeat (4 rows of genteng)
const OVERHANG = 0.6;
const EMPER = 2.2; // the lower skirt roof over the teras / carport on 1-storey houses
const FENCE_H = 1.1 + 0.25; // 1.1 m above the kerb; the extra is buried (SINK)
const GATE = 2.8;
const SINK = 0.25; // walls start this far below the highest ground under the footprint's lowest corner

export type Geo = { positions: number[]; indices: number[]; uvs?: number[] };

/** One quad per footprint edge from y0 to y0 + h; u = metres along the edge / uPer, v = height / FLOOR. */
export function wallQuads(ring: [number, number][], h: number, y0 = 0, uPer = WINDOW_W): Geo {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const u = Math.hypot(bx - ax, bz - az) / uPer;
    const v = h / FLOOR;
    const base = positions.length / 3;
    positions.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0 + h, az);
    uvs.push(0, 0, u, 0, u, v, 0, v);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, uvs, indices };
}

/** The ring pushed `d` metres outward at every vertex (along the mean of its two edge normals), whichever way it winds. */
export function offsetRing(ring: [number, number][], d: number): [number, number][] {
  const n = ring.length;
  let a = 0;
  for (let i = 0; i < n; i++) a += ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1];
  const s = a > 0 ? -1 : 1; // (−dz, dx) is the outward normal of a clockwise ring in x/z
  return ring.map((p, i) => {
    const q = ring[(i + n - 1) % n];
    const r = ring[(i + 1) % n];
    const l1 = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    const l2 = Math.hypot(r[0] - p[0], r[1] - p[1]) || 1;
    let nx = (-(p[1] - q[1]) / l1 - (r[1] - p[1]) / l2) * s;
    let nz = ((p[0] - q[0]) / l1 + (r[0] - p[0]) / l2) * s;
    const l = Math.hypot(nx, nz) || 1;
    return [p[0] + (nx / l) * d, p[1] + (nz / l) * d];
  });
}

/** Flat cap over the footprint at height y (earcut). */
export function flatCap(ring: [number, number][], y: number): Geo {
  const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
  return { positions: ring.flatMap(([x, z]) => [x, y, z]), indices: tris.flat() };
}

/**
 * Closed hip (limasan) roof over the oriented box: eaves at y (OVERHANG past the walls), ridge along the long axis at y + rise. 8 flat-shaded triangles; planar tile UVs.
 * `gable` (pelana) runs the ridge the full length; the two vertical end triangles are returned separately so they get wall colour.
 */
export function hipRoof(box: OrientedBox, y: number, rise: number, gable = false, overhang = OVERHANG): Geo & { ends?: Geo } {
  const { cx, cz, ux, uz } = box;
  const vx = -uz;
  const vz = ux;
  const L = box.long / 2 + overhang;
  const S = box.short / 2 + overhang;
  const at = (su: number, sv: number, yy: number) => [cx + ux * su + vx * sv, yy, cz + uz * su + vz * sv];
  const c = [at(-L, -S, y), at(L, -S, y), at(L, S, y), at(-L, S, y)];
  const r = gable ? L : Math.max(0, L - S); // 45° hips → ridge inset by the half-width
  const r0 = at(-r, 0, y + rise);
  const r1 = at(r, 0, y + rise);
  const ends = [[c[1], c[2], r1], [c[3], c[0], r0]];
  const faces = [[c[0], c[1], r1, r0], [c[2], c[3], r0, r1], ...(gable ? [] : ends), [c[3], c[2], c[1], c[0]]];
  const geo = (fs: number[][][]): Geo => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (const f of fs) {
      const base = positions.length / 3;
      for (const p of f) { positions.push(p[0], p[1], p[2]); uvs.push(p[0] / TILE, p[2] / TILE); }
      indices.push(base, base + 1, base + 2);
      if (f.length === 4) indices.push(base, base + 2, base + 3);
    }
    return { positions, uvs, indices };
  };
  return gable ? { ...geo(faces), ends: geo(ends) } : geo(faces);
}

/** Tower footprint over the podium: a rectangle at the oriented box's centre, capped so a wide mall grows a slender hotel block. */
export function towerRing(box: OrientedBox, long = Math.min(45, box.long * 0.4), short = Math.min(28, box.short * 0.6)): [number, number][] {
  const { cx, cz, ux, uz } = box;
  const L = long / 2;
  const S = short / 2;
  return [[-L, -S], [L, -S], [L, S], [-L, S]].map(([u, v]) => [cx + ux * u - uz * v, cz + uz * u + ux * v]);
}

/** Axis-free box from a segment a→b, `thick` wide, y0..y0+h: two wall quads + a cap so it reads as a plastered pagar. */
function slab(a: [number, number], b: [number, number], thick: number, y0: number, h: number): Geo {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = (-(b[1] - a[1]) / l) * thick / 2;
  const nz = ((b[0] - a[0]) / l) * thick / 2;
  const ring: [number, number][] = [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]];
  const w = wallQuads(ring, h, y0);
  const cap = flatCap(ring, y0 + h);
  return { positions: [...w.positions, ...cap.positions], uvs: [...w.uvs!, 0, 0, 0, 0, 0, 0, 0, 0], indices: [...w.indices, ...cap.indices.map((i) => i + 16)] };
}

/**
 * The papan nama band split into ~UNIT-wide shop units along every edge of the ring, each carrying its own hash so a
 * long block reads as the patchwork row of separately-painted shops it is, not one continuous board.
 */
export function bandUnits(ring: [number, number][], h: number, y0: number): { geo: Geo; seed: number }[] {
  const out: { geo: Geo; seed: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / UNIT));
    for (let k = 0; k < n; k++) {
      const [x0, z0] = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
      const [x1, z1] = [ax + ((bx - ax) * (k + 1)) / n, az + ((bz - az) * (k + 1)) / n];
      out.push({
        geo: { positions: [x0, y0, z0, x1, y0, z1, x1, y0 + h, z1, x0, y0 + h, z0], indices: [0, 1, 2, 0, 2, 3] },
        seed: hash(x0, z0),
      });
    }
  }
  return out;
}

export const FACING = 12; // furthest a wall can stand from the corridor and still be fronting the street
const MAX_YARD = 8; // deeper than this is a compound, not a halaman: pagar and paving are left off
const PROBE = 0.5; // step used to walk out to the kerb
const EDGE = 0.2; // the kerb line stops this far short of the corridor edge
const MIN_OFF = 0.8; // a yard narrower than this is not worth drawing
const CUTS = [0, 0.05, 0.12, 0.25, 0.4, 0.6, 0.8, 1]; // retractions fitBox tries, as a fraction of the side's half-extent

/**
 * Distance from (x, z) out along (nx, nz) to the kerb: 0 when the wall stands right on it, which is what a ruko does.
 * Null only when there is no road within FACING or the point is itself inside the corridor. Walked in PROBE steps
 * against the corridor as it actually is: corridorEscape's grid buckets one cell (10 m) beyond each segment, so asking
 * it about a corridor widened by 5 m — which is what this used to do — silently misses segments and lies about
 * distance. Whether the gap is big enough for a pagar and a halaman is the caller's question, not this one's.
 */
export function gapToKerb(x: number, z: number, nx: number, nz: number, onRoad: (x: number, z: number) => boolean): number | null {
  if (onRoad(x, z)) return null;
  for (let d = PROBE; d <= FACING; d += PROBE) {
    if (!onRoad(x + nx * d, z + nz * d)) continue;
    return Math.max(0, d - PROBE - EDGE); // the last step that was still clear
  }
  return null;
}

export type Front = { fx: number; fz: number; tx: number; tz: number; half: number; nx: number; nz: number; off: number };

/**
 * The road-facing side of a house: the oriented-box side that stands within FACING metres of a road corridor, with
 * `off` the measured wall → kerb distance — 0 for a ruko built out to the kerb, which still very much fronts the
 * street. `onRoad` is true inside the corridor (asphalt plus kerb and trotoar). (fx, fz) is the kerb line's centre,
 * (tx, tz) its direction, `half` its half-length. Null when no side faces a road at all.
 */
export function frontSide(box: OrientedBox, onRoad: (x: number, z: number) => boolean): Front | null {
  const { cx, cz, ux, uz } = box;
  const vx = -uz;
  const vz = ux;
  const L = box.long / 2;
  const S = box.short / 2;
  // each side: outward normal (nx, nz), half-extent along the normal, and the tangent + half-length of the side
  const sides: [number, number, number, number, number, number][] = [[vx, vz, S, ux, uz, L], [-vx, -vz, S, ux, uz, L], [ux, uz, L, vx, vz, S], [-ux, -uz, L, vx, vz, S]];
  for (const [nx, nz, d, tx, tz, half] of sides) {
    const off = gapToKerb(cx + nx * d, cz + nz * d, nx, nz, onRoad);
    if (off === null) continue;
    return { fx: cx + nx * (d + off), fz: cz + nz * (d + off), tx, tz, half, nx, nz, off };
  }
  return null;
}

const WALK_MAX = 96; // samples per side: a 150 m facade does not need 300 probes to notice a road
/** True when any point sampled along a→b (every `step` m, at most WALK_MAX of them) satisfies `f`. */
const walk = (a: [number, number], b: [number, number], step: number, f: (x: number, z: number) => boolean): boolean => {
  const n = Math.min(WALK_MAX, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)));
  for (let i = 0; i <= n; i++) if (f(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)) return true;
  return false;
};

/**
 * `frontSide` measures one gap at the middle of a box side, and the box is the footprint's bounding rectangle, not the
 * footprint — so on a bending street, or under an L-shaped plan, the pagar, halaman, teras and kanopi it carries still
 * run out onto the carriageway at the ends. This re-measures the gap every metre along the side and keeps only the
 * longest stretch that still faces the road without standing in it, re-centring the front on it and taking the
 * tightest gap along it. Null when no usable stretch is left.
 */
export function fitFront(f: Front, onRoad: (x: number, z: number) => boolean): Front | null {
  const n = Math.min(WALK_MAX, Math.max(2, Math.ceil(f.half)));
  const reach = Array.from({ length: n + 1 }, (_, i) => {
    const s = -f.half + (2 * f.half * i) / n;
    return gapToKerb(f.fx + f.tx * s - f.nx * f.off, f.fz + f.tz * s - f.nz * f.off, f.nx, f.nz, onRoad);
  });
  let best = { i0: 0, i1: -1 };
  for (let i = 0, start = -1; i <= n; i++) {
    if (reach[i] !== null) { if (start < 0) start = i; if (i - start > best.i1 - best.i0) best = { i0: start, i1: i }; }
    else start = -1;
  }
  if (best.i1 <= best.i0) return null;
  const at = (i: number) => -f.half + (2 * f.half * i) / n;
  const half = (at(best.i1) - at(best.i0)) / 2;
  if (half < 1.5) return null;
  const off = Math.min(...(reach.slice(best.i0, best.i1 + 1) as number[]));
  const mid = (at(best.i0) + at(best.i1)) / 2;
  return { ...f, half, off, fx: f.fx + f.tx * mid - f.nx * (f.off - off), fz: f.fz + f.tz * mid - f.nz * (f.off - off) };
}

/**
 * The same problem for roofs: `hipRoof` spans the bounding rectangle plus its eaves, so a limasan over an L-shaped or
 * skewed plan hangs into the street even though every wall is clear. Retracts whichever of the four sides needs it
 * until the overhung outline is off the carriageway; eaves over the trotoar are left alone, as they are in real life.
 * Null when even the deepest retraction leaves the outline on the road — a plot wrapped around a corner, whose
 * bounding box a street runs straight through. The caller falls back to the footprint, which is always clear.
 */
export function fitBox(box: OrientedBox, overhang: number, onRoad: (x: number, z: number) => boolean): OrientedBox | null {
  let { cx, cz, long, short } = box;
  const { ux, uz } = box;
  const [vx, vz] = [-uz, ux];
  for (const [ax, az, along] of [[ux, uz, false], [-ux, -uz, false], [vx, vz, true], [-vx, -vz, true]] as const) {
    const [tx, tz] = along ? [ux, uz] : [vx, vz];
    const reach = (along ? short : long) / 2;
    const span = ((along ? long : short) / 2 + overhang) * 1.0;
    for (const [k, frac] of CUTS.entries()) { // the first frac is 0, so a side already clear costs a single walk
      const cut = frac * reach;
      const d = reach + overhang - cut;
      const p = (j: number): [number, number] => [cx + ax * d + tx * j * span, cz + az * d + tz * j * span];
      if (walk(p(-1), p(1), 0.5, onRoad)) { if (k === CUTS.length - 1) return null; continue; }
      if (cut) { cx -= ax * (cut / 2); cz -= az * (cut / 2); if (along) short -= cut; else long -= cut; }
      break;
    }
  }
  return { cx, cz, ux, uz, long: Math.max(0, long), short: Math.max(0, short) };
}

const concat = (parts: Geo[]): Geo => {
  const out: Geo = { positions: [], uvs: [], indices: [] };
  for (const g of parts) {
    const base = out.positions.length / 3;
    out.positions.push(...g.positions);
    out.uvs!.push(...(g.uvs ?? new Array((g.positions.length / 3) * 2).fill(0)));
    out.indices.push(...g.indices.map((i) => i + base));
  }
  return out;
};

/** Pagar along the kerb line of the front, split by a GATE gap in the middle. */
export function fence(f: Front, y0: number): Geo {
  const at = (t: number): [number, number] => [f.fx + f.tx * t, f.fz + f.tz * t];
  const g = Math.min(GATE / 2, f.half * 0.4);
  return concat([slab(at(-f.half), at(-g), 0.2, y0, FENCE_H), slab(at(g), at(f.half), 0.2, y0, FENCE_H)]);
}

/** Halaman: a cement slab from the front wall out to the pagar, each corner on the ground (+12 cm: clears the terrain crease inside a DEM cell) so it hugs a slope. */
export function yard(f: Front, y: (x: number, z: number) => number): Geo {
  const wall = (t: number): [number, number] => [f.fx + f.tx * t - f.nx * f.off, f.fz + f.tz * t - f.nz * f.off];
  const kerb = (t: number): [number, number] => [f.fx + f.tx * t, f.fz + f.tz * t];
  const ring = [wall(-f.half), wall(f.half), kerb(f.half), kerb(-f.half)];
  return { positions: ring.flatMap(([x, z]) => [x, y(x, z) + 0.12, z]), indices: [0, 1, 2, 0, 2, 3] };
}

/**
 * Kanopi ruko: the cantilevered slab every Purwokerto shophouse hangs over the trotoar, starting above the signboard
 * at the wall and sloping 0.35 m down to its outer lip `reach` metres out, plus a thin fascia so it reads as a slab
 * and not a plane. It may overhang the trotoar — that is the point of it — but never the carriageway.
 */
export function canopy(f: Front, yWall: number, reach: number): Geo {
  const at = (t: number, out: number): [number, number] => [f.fx + f.tx * t - f.nx * (f.off - out), f.fz + f.tz * t - f.nz * (f.off - out)];
  const [a, b, c, e] = [at(-f.half, 0), at(f.half, 0), at(f.half, reach), at(-f.half, reach)];
  const yLip = yWall - 0.35;
  const p = (q: [number, number], y: number) => [q[0], y, q[1]];
  const positions = [...p(a, yWall), ...p(b, yWall), ...p(c, yLip), ...p(e, yLip), ...p(c, yLip - 0.18), ...p(e, yLip - 0.18)];
  return { positions, indices: [0, 1, 2, 0, 2, 3, 2, 4, 5, 2, 5, 3] };
}

/** Teras: three 0.22 m square pillars 1.6 m in front of the wall, holding up the emper roof (y0 → yTop). */
export function pillars(f: Front, y0: number, yTop: number): Geo {
  const out: Geo[] = [];
  for (const t of [-0.6, 0, 0.6].map((k) => k * f.half)) {
    const cx = f.fx + f.tx * t - f.nx * (f.off - 1.6);
    const cz = f.fz + f.tz * t - f.nz * (f.off - 1.6);
    out.push(slab([cx - f.tx * 0.11, cz - f.tz * 0.11], [cx + f.tx * 0.11, cz + f.tz * 0.11], 0.22, y0, yTop - y0));
  }
  return concat(out);
}

function dome(cx: number, cz: number, y: number, r: number): Geo {
  const s = new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx, y, cz);
  return { positions: Array.from(s.attributes.position.array), indices: Array.from(s.index!.array) };
}

function cylinder(cx: number, cz: number, y0: number, h: number, r: number): Geo {
  const s = new THREE.CylinderGeometry(r * 0.8, r, h, 10).translate(cx, y0 + h / 2, cz);
  return { positions: Array.from(s.attributes.position.array), indices: Array.from(s.index!.array) };
}

const canvas = (draw: (g: CanvasRenderingContext2D) => void): THREE.Texture => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 128, 128);
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
const window_ = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  g.fillStyle = '#b9bfc2'; g.fillRect(x, y, w, h); // frame
  const glass = g.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, '#6f8499'); glass.addColorStop(1, '#2b3540'); // sky reflection fading to a dark interior
  g.fillStyle = glass; g.fillRect(x + 4, y + 4, w - 8, h - 8);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y, w, 3); // lintel shadow
};
/** Rain streaks and soot creeping up from the ground; drawn last over every ground-floor texture. */
const grime = (g: CanvasRenderingContext2D) => {
  const grad = g.createLinearGradient(0, 128, 0, 70);
  grad.addColorStop(0, 'rgba(40,35,30,0.5)'); grad.addColorStop(1, 'rgba(40,35,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + (i % 5) / 60})`; g.fillRect((i * 37) % 128, 0, 1 + (i % 3), 128); }
};
/** Upper storeys: one window per 3 m (glass spans 1.0–2.5 m above the floor). */
const upperTexture = () => canvas((g) => { window_(g, 40, 30, 48, 58); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 118, 128, 10); });
/** Jendela rumah: white frame, pale glass, teralis (three vertical bars) — the Purwokerto house window. */
const houseWindow = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  g.fillStyle = '#f4f2ec'; g.fillRect(x, y, w, h); // frame
  g.fillStyle = '#8fa4b4'; g.fillRect(x + 3, y + 3, w - 6, h - 6); // glass with a curtain behind it
  g.fillStyle = '#2d2d2d'; for (let k = 1; k <= 3; k++) g.fillRect(x + (k * w) / 4 - 1, y + 3, 2, h - 6); // teralis
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 2, y - 3, w + 4, 3); // lintel shadow
};
/** House ground floor over 9 m: window, door, window; plinth band along the bottom. */
const houseTexture = () => canvas((g) => {
  houseWindow(g, 8, 36, 28, 46);
  houseWindow(g, 92, 36, 28, 46);
  g.fillStyle = '#6b4a2e'; g.fillRect(52, 30, 24, 98); // wooden door to the ground
  g.fillStyle = '#4e3520'; g.fillRect(63, 30, 2, 98); g.fillRect(52, 60, 24, 2); // door panels
  g.fillStyle = '#b8b0a4'; g.fillRect(0, 116, 128, 12); // plinth
  grime(g);
});
/** Ruko ground floor: glass shopfront, half-open rolling shutter, signboard band at the top. */
const rukoTexture = () => canvas((g) => {
  g.fillStyle = '#3c4a5a'; g.fillRect(6, 30, 116, 98); // shopfront glass
  g.fillStyle = '#8f949a'; for (let y = 30; y < 62; y += 6) g.fillRect(6, y, 116, 3); // shutter slats
  g.fillStyle = '#d64541'; g.fillRect(0, 0, 128, 26); // signboard
  g.fillStyle = '#fff'; g.fillRect(14, 8, 60, 10); g.fillRect(84, 8, 30, 10); // lettering blocks
  grime(g);
});
/** Genteng: 4 tile rows per repeat, staggered columns, darker lower lip on each tile. */
const tileTexture = () => canvas((g) => {
  for (let row = 0; row < 4; row++) {
    const y = row * 32;
    g.fillStyle = '#f3ebe3'; g.fillRect(0, y, 128, 32);
    for (let k = 0; k < 24; k++) { g.fillStyle = `rgba(60,50,40,${0.05 + ((k * 7 + row) % 5) / 40})`; g.fillRect((k * 53 + row * 17) % 128, y + ((k * 11) % 24), 6, 5); } // moss / weathering
    g.fillStyle = '#9c9088'; g.fillRect(0, y + 26, 128, 6); // shadow under the tile lip
    g.fillStyle = '#cfc6bd';
    for (let col = 0; col < 8; col++) g.fillRect(col * 16 + (row % 2 ? 8 : 0), y, 2, 26);
  }
});

type Batch = { positions: number[]; uvs: number[]; colors: number[]; indices: number[] };
const batch = (): Batch => ({ positions: [], uvs: [], colors: [], indices: [] });

function push(b: Batch, g: Geo, color: THREE.Color): void {
  const base = b.positions.length / 3;
  const n = g.positions.length / 3;
  for (const p of g.positions) b.positions.push(p);
  if (g.uvs) for (const u of g.uvs) b.uvs.push(u);
  else for (let i = 0; i < n; i++) b.uvs.push(0, 0);
  for (let i = 0; i < n; i++) b.colors.push(color.r, color.g, color.b);
  for (const i of g.indices) b.indices.push(base + i);
}

function toGeometry(b: Batch): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
  geo.setIndex(b.indices);
  geo.computeVertexNormals(); // per-face vertices → flat shading; the dome shares vertices → smooth
  return geo;
}

/**
 * Five merged meshes: house / ruko ground floors, upper storeys (all textured, vertex-tinted), tiled hip roofs,
 * and plain flat roofs + domes + minarets. Buildings sit SINK below the lowest ground corner so slopes never show a gap.
 * `clearRoads` guarantees only the walls; `onRoad` (inside the corridor) and `onAsphalt` (past the kerb, on the
 * carriageway) are what keep everything the bounding box carries — eaves, pagar, halaman, kanopi, tandon — off it too.
 */
export function buildBuildings(buildings: CityData['buildings'], ground: Ground = FLAT, onRoad: (x: number, z: number) => boolean = () => false, onAsphalt: (x: number, z: number) => boolean = () => false): THREE.Group {
  const house = batch();
  const ruko = batch();
  const upper = batch();
  const hip = batch();
  const flat = batch();
  const yards = batch(); // own mesh: polygon-offset onto the terrain like the sidewalks
  const color = new THREE.Color();
  const tandons: [number, number, number, number][] = []; // x, y, z, seed
  const board = new THREE.Color(); // `wall` aliases `color`, so the band needs its own
  for (const b of buildings) {
    if (b.p.length < 3) continue;
    const seed = hash(b.p[0][0], b.p[0][1]);
    const y0 = Math.min(...b.p.map(([x, z]) => ground.y(x, z))) - SINK;
    const h = b.h + SINK;
    const a = area(b.p);
    const wall = color.setHex(WALLS[seed % WALLS.length]);
    const box = orientedBox(b.p);
    const raw = frontSide(box, onRoad);           // does this building face a street at all
    const front = raw && fitFront(raw, onRoad);   // and which stretch of that side may carry something
    // Every flat-roofed block up to 3 storeys standing on a street in Purwokerto is a ruko row, however long its
    // footprint: shopfront, papan nama, kanopi over the trotoar. Facing a street is enough to earn a shopfront; only
    // the kanopi needs the fitted stretch, since it is the part that could reach out over the road. Buildings OSM
    // calls a school, hospital, office or place of worship are exempt — they are not shops — as are deep blocks.
    const isRuko = !b.r && !b.civic && b.h <= 3 * FLOOR && !!raw && box.short <= 40;
    const groundBatch = b.r === 'hip' || b.r === 'gable' || b.r === 'joglo' ? house : isRuko ? ruko : upper;
    push(groundBatch, wallQuads(b.p, Math.min(h, FLOOR + SINK), y0, groundBatch === house ? 3 * WINDOW_W : WINDOW_W), wall);
    if (isRuko) {
      for (const u of bandUnits(offsetRing(b.p, 0.04), BAND, y0 + FLOOR - BAND)) push(flat, u.geo, board.setHex(SIGNBOARDS[u.seed % SIGNBOARDS.length])); // a colour per shop unit over the texture's red band
      if (front) push(flat, canopy(front, y0 + FLOOR + SINK, Math.min(CANOPY_REACH, front.off + TROTOAR)), color.setHex(CANOPY));
    }
    if (h > FLOOR + SINK) push(upper, wallQuads(b.p, h - FLOOR - SINK, y0 + FLOOR + SINK), wall);
    const top = y0 + h;
    if (b.t) { // podium + tower: the tower's walls continue the upper-storey texture, its own flat cap on top
      const ring = towerRing(box);
      push(upper, wallQuads(ring, b.t, top), wall);
      push(flat, flatCap(ring, top + b.t), color.setHex(FLAT_ROOFS[(seed >>> 8) % FLAT_ROOFS.length]));
    }
    if (b.r === 'joglo') { // tiered Javanese pavilion roof: a wide shallow skirt, then the steep brunjung over the middle
      const tile = color.setHex(HIP_ROOFS[(seed >>> 8) % HIP_ROOFS.length]);
      const skirt = fitBox(box, 1.5, onAsphalt);
      if (skirt) {
        push(hip, hipRoof(skirt, top, 1.6, false, 1.5), tile);
        push(hip, hipRoof({ ...skirt, long: skirt.long * 0.55, short: skirt.short * 0.55 }, top + 1.6, 0.42 * skirt.short), tile);
      } else push(hip, flatCap(b.p, top), tile);
    } else if (b.r === 'hip' || b.r === 'gable') {
      const eaves = fitBox(box, OVERHANG, onAsphalt);
      const tile = color.setHex(HIP_ROOFS[(seed >>> 8) % HIP_ROOFS.length]);
      if (eaves) {
        const roof = hipRoof(eaves, top, Math.min(4, Math.max(1.2, 0.3 * eaves.short)), b.r === 'gable');
        push(hip, roof, tile);
        if (roof.ends) push(flat, roof.ends, wall);
      } else push(hip, flatCap(b.p, top), tile); // a street runs through the bounding box: cap the footprint itself
      // rumah Jawa: a second, lower skirt roof (emper) wraps the teras and carport of wider 1-storey houses
      const skirt = eaves && b.h <= FLOOR && box.short >= 7 ? fitBox(box, EMPER, onAsphalt) : null;
      if (skirt) push(hip, hipRoof(skirt, top - 1.0, 0.6, false, EMPER), tile);
      if (front && front.off >= MIN_OFF && front.off <= MAX_YARD) { // pagar on the kerb (sunk SINK into the slope), cement halaman behind it, teras pillars under the emper
        push(flat, fence(front, ground.y(front.fx, front.fz) - SINK), color.setHex(FENCE));
        push(yards, yard(front, (x, z) => ground.y(x, z)), color.setHex(PAVING));
        if (skirt && front.off >= 2.2) push(flat, pillars(front, y0 + SINK, top - 1.0), wall);
      }
    } else {
      push(flat, flatCap(b.p, top), color.setHex(FLAT_ROOFS[(seed >>> 8) % FLAT_ROOFS.length]));
      if (!b.t && !b.r) { // dak beton: a parapet round the edge and a tandon air in one corner
        push(flat, wallQuads(b.p, PARAPET_H, top, WINDOW_W), wall);
        if (box.short >= 5 && box.long >= 5) {
          const tx = box.cx + box.ux * (box.long / 2 - 1.6) - box.uz * (box.short / 2 - 1.6); // a box corner, so it can fall outside an L-shaped plan
          const tz = box.cz + box.uz * (box.long / 2 - 1.6) + box.ux * (box.short / 2 - 1.6);
          if (!onAsphalt(tx, tz)) tandons.push([tx, top + PARAPET_H, tz, seed]);
        }
      }
      if (b.r === 'dome') {
        push(flat, dome(box.cx, box.cz, top, Math.min(7, Math.sqrt(a) / 3)), color.setHex(DOME));
        if (a >= 250) { // minaret at one corner of the oriented box, pulled 2 m inside
          const L = box.long / 2 - 2;
          const S = box.short / 2 - 2;
          const mx = box.cx + box.ux * L - box.uz * S;
          const mz = box.cz + box.uz * L + box.ux * S;
          push(flat, cylinder(mx, mz, y0, h + 12, 1.1), color.setHex(MINARET));
          push(flat, dome(mx, mz, y0 + h + 12, 1.4), color.setHex(DOME));
        }
      }
    }
  }
  // ponytail: DoubleSide instead of normalising ring winding; fix winding if fill rate ever shows in a profile
  const textured = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.8, envMapIntensity: 0.6, side: THREE.DoubleSide });
  const group = new THREE.Group();
  const meshes: [Batch, THREE.Material][] = [
    [house, textured(houseTexture())],
    [ruko, textured(rukoTexture())],
    [upper, textured(upperTexture())],
    [hip, textured(tileTexture())],
    [flat, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })],
    [yards, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })],
  ];
  for (const [b, mat] of meshes) {
    const mesh = new THREE.Mesh(toGeometry(b), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (tandons.length) { // one instanced tank (1.1 m tall, 0.55 m across) per flat roof, on its little steel stand
    const tank = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10).translate(0, 0.85, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), tandons.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    tandons.forEach(([x, y, z, seed], i) => {
      o.position.set(x, y, z);
      o.rotation.set(0, (seed % 628) / 100, 0);
      o.updateMatrix();
      tank.setMatrixAt(i, o.matrix);
      tank.setColorAt(i, c.setHex(TANDON[(seed >>> 12) % TANDON.length]));
    });
    tank.castShadow = true;
    group.add(tank);
  }
  return group;
}
