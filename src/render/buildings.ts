import * as THREE from 'three';
import { area, hash, orientedBox, type CityData, type OrientedBox } from '../world/osm';
import { FLAT, type Ground } from '../world/terrain';

const WALLS = [0xf4efe6, 0xe9e1d2, 0xf7f3ea, 0xdfe6ea, 0xf3e7cf, 0xe6ece0, 0xd8cfc4];
const HIP_ROOFS = [0xa9513a, 0xb4623f, 0x93493a, 0xc26d4a, 0xa9513a, 0x72757c, 0x4d4b49]; // mostly genteng, some zinc / asbes
const FLAT_ROOFS = [0x9d9c98, 0x8f918f, 0xa8a49d];
const DOME = 0x3a9a68;
const MINARET = 0xf2eee4;
const WINDOW_W = 3; // metres per facade texture repeat (one window)
const FLOOR = 3.2; // metres per vertical repeat (one storey)
const TILE = 1.6; // metres per roof-tile texture repeat (4 rows of genteng)
const OVERHANG = 0.6;
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

/** Flat cap over the footprint at height y (earcut). */
export function flatCap(ring: [number, number][], y: number): Geo {
  const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
  return { positions: ring.flatMap(([x, z]) => [x, y, z]), indices: tris.flat() };
}

/** Closed hip roof over the oriented box: eaves at y (OVERHANG past the walls), ridge along the long axis at y + rise. 8 flat-shaded triangles; planar tile UVs. */
export function hipRoof(box: OrientedBox, y: number, rise: number): Geo {
  const { cx, cz, ux, uz } = box;
  const vx = -uz;
  const vz = ux;
  const L = box.long / 2 + OVERHANG;
  const S = box.short / 2 + OVERHANG;
  const at = (su: number, sv: number, yy: number) => [cx + ux * su + vx * sv, yy, cz + uz * su + vz * sv];
  const c = [at(-L, -S, y), at(L, -S, y), at(L, S, y), at(-L, S, y)];
  const r = Math.max(0, L - S); // 45° hips → ridge inset by the half-width
  const r0 = at(-r, 0, y + rise);
  const r1 = at(r, 0, y + rise);
  const faces = [[c[0], c[1], r1, r0], [c[2], c[3], r0, r1], [c[1], c[2], r1], [c[3], c[0], r0], [c[3], c[2], c[1], c[0]]];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const p of f) { positions.push(p[0], p[1], p[2]); uvs.push(p[0] / TILE, p[2] / TILE); }
    indices.push(base, base + 1, base + 2);
    if (f.length === 4) indices.push(base, base + 2, base + 3);
  }
  return { positions, uvs, indices };
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
  g.fillStyle = '#cfd6da'; g.fillRect(x, y, w, h); // frame
  g.fillStyle = '#42505f'; g.fillRect(x + 4, y + 4, w - 8, h - 8); // glass
};
/** Upper storeys: one window per 3 m (glass spans 1.0–2.5 m above the floor). */
const upperTexture = () => canvas((g) => window_(g, 40, 30, 48, 58));
/** House ground floor over 9 m: window, door, window; plinth band along the bottom. */
const houseTexture = () => canvas((g) => {
  window_(g, 8, 34, 28, 50);
  window_(g, 92, 34, 28, 50);
  g.fillStyle = '#6b4a2e'; g.fillRect(52, 30, 24, 98); // wooden door to the ground
  g.fillStyle = '#b8b0a4'; g.fillRect(0, 116, 128, 12); // plinth
});
/** Ruko ground floor: glass shopfront, half-open rolling shutter, signboard band at the top. */
const rukoTexture = () => canvas((g) => {
  g.fillStyle = '#3c4a5a'; g.fillRect(6, 30, 116, 98); // shopfront glass
  g.fillStyle = '#8f949a'; for (let y = 30; y < 62; y += 6) g.fillRect(6, y, 116, 3); // shutter slats
  g.fillStyle = '#d64541'; g.fillRect(0, 0, 128, 26); // signboard
  g.fillStyle = '#fff'; g.fillRect(14, 8, 60, 10); g.fillRect(84, 8, 30, 10); // lettering blocks
});
/** Genteng: 4 tile rows per repeat, staggered columns, darker lower lip on each tile. */
const tileTexture = () => canvas((g) => {
  for (let row = 0; row < 4; row++) {
    const y = row * 32;
    g.fillStyle = '#e8e0d8'; g.fillRect(0, y, 128, 32);
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
export function buildBuildings(buildings: CityData['buildings'], ground: Ground = FLAT): THREE.Group {
  const house = batch();
  const ruko = batch();
  const upper = batch();
  const hip = batch();
  const flat = batch();
  const color = new THREE.Color();
  for (const b of buildings) {
    if (b.p.length < 3) continue;
    const seed = hash(b.p[0][0], b.p[0][1]);
    const y0 = Math.min(...b.p.map(([x, z]) => ground.y(x, z))) - SINK;
    const h = b.h + SINK;
    const a = area(b.p);
    const wall = color.setHex(WALLS[seed % WALLS.length]);
    const isRuko = !b.r && b.h <= 3 * FLOOR && a <= 600;
    const groundBatch = b.r === 'hip' ? house : isRuko ? ruko : upper;
    push(groundBatch, wallQuads(b.p, Math.min(h, FLOOR + SINK), y0, groundBatch === house ? 3 * WINDOW_W : WINDOW_W), wall);
    if (h > FLOOR + SINK) push(upper, wallQuads(b.p, h - FLOOR - SINK, y0 + FLOOR + SINK), wall);
    const top = y0 + h;
    if (b.r === 'hip') {
      const box = orientedBox(b.p);
      push(hip, hipRoof(box, top, Math.min(4, Math.max(1.2, 0.3 * box.short))), color.setHex(HIP_ROOFS[(seed >>> 8) % HIP_ROOFS.length]));
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
  const textured = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const group = new THREE.Group();
  const meshes: [Batch, THREE.Material][] = [
    [house, textured(houseTexture())],
    [ruko, textured(rukoTexture())],
    [upper, textured(upperTexture())],
    [hip, textured(tileTexture())],
    [flat, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })],
  ];
  for (const [b, mat] of meshes) {
    const mesh = new THREE.Mesh(toGeometry(b), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
