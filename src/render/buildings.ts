import * as THREE from 'three';
import { area, hash, orientedBox, type CityData, type OrientedBox } from '../world/osm';

const WALLS = [0xf4efe6, 0xe9e1d2, 0xf7f3ea, 0xdfe6ea, 0xf3e7cf, 0xe6ece0, 0xd8cfc4];
const HIP_ROOFS = [0xa9513a, 0xb4623f, 0x93493a, 0xc26d4a, 0xa9513a, 0x72757c, 0x4d4b49]; // mostly genteng, some zinc / asbes
const FLAT_ROOFS = [0x9d9c98, 0x8f918f, 0xa8a49d];
const DOME = 0x3a9a68;
const WINDOW_W = 3; // metres per facade texture repeat (one window)
const FLOOR = 3.2; // metres per vertical repeat (one storey)
const OVERHANG = 0.6;

export type Geo = { positions: number[]; indices: number[]; uvs?: number[] };

/** One quad per footprint edge; u = metres along the edge / WINDOW_W, v = height / FLOOR. */
export function wallQuads(ring: [number, number][], h: number): Geo {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const u = Math.hypot(bx - ax, bz - az) / WINDOW_W;
    const v = h / FLOOR;
    const base = positions.length / 3;
    positions.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, h, az);
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

/** Closed hip roof over the oriented box: eaves at y (OVERHANG past the walls), ridge along the long axis at y + rise. 8 flat-shaded triangles. */
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
  const indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const p of f) positions.push(p[0], p[1], p[2]);
    indices.push(base, base + 1, base + 2);
    if (f.length === 4) indices.push(base, base + 2, base + 3);
  }
  return { positions, indices };
}

function dome(cx: number, cz: number, y: number, r: number): Geo {
  const s = new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx, y, cz);
  return { positions: Array.from(s.attributes.position.array), indices: Array.from(s.index!.array) };
}

/** White wall with one dark window per repeat; vertex colour tints the wall. */
function facadeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#cfd6da'; // frame
  g.fillRect(40, 30, 48, 58);
  g.fillStyle = '#42505f'; // glass (window spans 1.0–2.5 m above each floor)
  g.fillRect(44, 34, 40, 50);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

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

/** Two merged meshes: textured walls and vertex-coloured roofs (hip / flat / dome). */
export function buildBuildings(buildings: CityData['buildings']): THREE.Group {
  const walls = batch();
  const roofs = batch();
  const color = new THREE.Color();
  for (const b of buildings) {
    if (b.p.length < 3) continue;
    const seed = hash(b.p[0][0], b.p[0][1]);
    push(walls, wallQuads(b.p, b.h), color.setHex(WALLS[seed % WALLS.length]));
    if (b.r === 'hip') {
      const box = orientedBox(b.p);
      push(roofs, hipRoof(box, b.h, Math.min(4, Math.max(1.2, 0.3 * box.short))), color.setHex(HIP_ROOFS[(seed >>> 8) % HIP_ROOFS.length]));
    } else {
      push(roofs, flatCap(b.p, b.h), color.setHex(FLAT_ROOFS[(seed >>> 8) % FLAT_ROOFS.length]));
      if (b.r === 'dome') {
        const box = orientedBox(b.p);
        push(roofs, dome(box.cx, box.cz, b.h, Math.min(7, Math.sqrt(area(b.p)) / 3)), color.setHex(DOME));
      }
    }
  }
  // ponytail: DoubleSide instead of normalising ring winding; fix winding if fill rate ever shows in a profile
  const wallMat = new THREE.MeshStandardMaterial({ map: facadeTexture(), vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const group = new THREE.Group();
  for (const [b, mat] of [[walls, wallMat], [roofs, roofMat]] as const) {
    const mesh = new THREE.Mesh(toGeometry(b), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
