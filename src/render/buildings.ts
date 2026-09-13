import * as THREE from 'three';
import { area, hash, orientedBox, type CityData, type OrientedBox } from '../world/osm';
import { FLAT, type Ground } from '../world/terrain';

const WALLS = [0xf4f0e8, 0xece6da, 0xf0ebe0, 0xdfe8dc, 0xdde6ec, 0xf3e4d0, 0xf2eac6, 0xd6cec4, 0xe2d6c8, 0xeed8c6, 0xe2e8d6]; // cat tembok Purwokerto: putih, krem, mint, biru muda, peach, kuning muda
const FENCE = 0xbfb9ae; // pagar tembok plester
const PAVING = 0xa6a29a; // halaman semen / paving block
const HIP_ROOFS = [0xb8553a, 0xc4643f, 0x9e4a36, 0xcf7048, 0xb8553a, 0x3d3532, 0x6f7378, 0x4d6f86]; // genteng tanah liat, genteng glazur hitam, seng, galvalum biru
const FLAT_ROOFS = [0x9d9c98, 0x8f918f, 0xa8a49d];
const SIGNBOARDS = [0xd64541, 0x1c56a0, 0x1f7a3e, 0xf2c400, 0xf4f2ec, 0x1a1a1a, 0xe8862a]; // papan nama ruko: merah, biru, hijau, kuning, putih, hitam, oranye
const BAND = 0.65; // the signboard band at the top of a ruko's ground floor (rukoTexture's top 26 px)
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

export type Front = { fx: number; fz: number; tx: number; tz: number; half: number; nx: number; nz: number; off: number };

/**
 * The road-facing side of a house: the oriented-box side whose outward probe (5 m past the wall) lands near a road
 * corridor. `roadEscape` is corridorEscape's displacement for that probe (null = no road): its component along the
 * outward normal is minus the corridor depth, so `off` (wall → kerb line) lands 0.5 m outside the corridor edge, never
 * under 0.8 m. (fx, fz) is the kerb line's centre, (tx, tz) its direction, `half` its half-length. Null when no side faces a road.
 */
export function frontSide(box: OrientedBox, roadEscape: (x: number, z: number) => [number, number] | null): Front | null {
  const { cx, cz, ux, uz } = box;
  const vx = -uz;
  const vz = ux;
  const L = box.long / 2;
  const S = box.short / 2;
  // each side: outward normal (nx, nz), half-extent along the normal, and the tangent + half-length of the side
  const sides: [number, number, number, number, number, number][] = [[vx, vz, S, ux, uz, L], [-vx, -vz, S, ux, uz, L], [ux, uz, L, vx, vz, S], [-ux, -uz, L, vx, vz, S]];
  for (const [nx, nz, d, tx, tz, half] of sides) {
    const esc = roadEscape(cx + nx * (d + 5), cz + nz * (d + 5));
    if (!esc) continue;
    const off = Math.max(0.8, 5 + esc[0] * nx + esc[1] * nz - 0.5);
    return { fx: cx + nx * (d + off), fz: cz + nz * (d + off), tx, tz, half, nx, nz, off };
  }
  return null;
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
 */
export function buildBuildings(buildings: CityData['buildings'], ground: Ground = FLAT, roadEscape: (x: number, z: number) => [number, number] | null = () => null): THREE.Group {
  const house = batch();
  const ruko = batch();
  const upper = batch();
  const hip = batch();
  const flat = batch();
  const yards = batch(); // own mesh: polygon-offset onto the terrain like the sidewalks
  const color = new THREE.Color();
  const board = new THREE.Color(); // `wall` aliases `color`, so the band needs its own
  for (const b of buildings) {
    if (b.p.length < 3) continue;
    const seed = hash(b.p[0][0], b.p[0][1]);
    const y0 = Math.min(...b.p.map(([x, z]) => ground.y(x, z))) - SINK;
    const h = b.h + SINK;
    const a = area(b.p);
    const wall = color.setHex(WALLS[seed % WALLS.length]);
    const isRuko = !b.r && b.h <= 3 * FLOOR && a <= 600;
    const groundBatch = b.r === 'hip' || b.r === 'gable' ? house : isRuko ? ruko : upper;
    push(groundBatch, wallQuads(b.p, Math.min(h, FLOOR + SINK), y0, groundBatch === house ? 3 * WINDOW_W : WINDOW_W), wall);
    if (isRuko) push(flat, wallQuads(offsetRing(b.p, 0.04), BAND, y0 + FLOOR - BAND), board.setHex(SIGNBOARDS[(seed >>> 4) % SIGNBOARDS.length])); // its own signboard colour over the texture's red band
    if (h > FLOOR + SINK) push(upper, wallQuads(b.p, h - FLOOR - SINK, y0 + FLOOR + SINK), wall);
    const top = y0 + h;
    if (b.t) { // podium + tower: the tower's walls continue the upper-storey texture, its own flat cap on top
      const ring = towerRing(orientedBox(b.p));
      push(upper, wallQuads(ring, b.t, top), wall);
      push(flat, flatCap(ring, top + b.t), color.setHex(FLAT_ROOFS[(seed >>> 8) % FLAT_ROOFS.length]));
    }
    if (b.r === 'hip' || b.r === 'gable') {
      const box = orientedBox(b.p);
      const roof = hipRoof(box, top, Math.min(4, Math.max(1.2, 0.3 * box.short)), b.r === 'gable');
      const tile = color.setHex(HIP_ROOFS[(seed >>> 8) % HIP_ROOFS.length]);
      push(hip, roof, tile);
      if (roof.ends) push(flat, roof.ends, wall);
      // rumah Jawa: a second, lower skirt roof (emper) wraps the teras and carport of wider 1-storey houses
      const emper = b.h <= FLOOR && box.short >= 7;
      if (emper) push(hip, hipRoof(box, top - 1.0, 0.6, false, EMPER), tile);
      const front = frontSide(box, roadEscape);
      if (front) { // pagar on the kerb (sunk SINK into the slope), cement halaman behind it, teras pillars under the emper
        push(flat, fence(front, ground.y(front.fx, front.fz) - SINK), color.setHex(FENCE));
        push(yards, yard(front, (x, z) => ground.y(x, z)), color.setHex(PAVING));
        if (emper && front.off >= 2.2) push(flat, pillars(front, y0 + SINK, top - 1.0), wall);
      }
    } else {
      push(flat, flatCap(b.p, top), color.setHex(FLAT_ROOFS[(seed >>> 8) % FLAT_ROOFS.length]));
      if (b.r === 'dome') {
        const box = orientedBox(b.p);
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
  return group;
}
