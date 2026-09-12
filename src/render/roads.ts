import * as THREE from 'three';
import type { City } from '../world/city';
import { densify, FLAT, type Ground } from '../world/terrain';

const SIDEWALK_EXTRA = 2.4;
const DASH = 3;
const MARK_W = 0.15;
const Y = { sidewalk: 0.03, asphalt: 0.06, marking: 0.09 };

export type Geo = { positions: number[]; indices: number[] };
/** Constant height, or a height per (x, z) so the strip follows the ground. */
export type Y = number | ((x: number, z: number) => number);
const yAt = (y: Y): ((x: number, z: number) => number) => (typeof y === 'number' ? () => y : y);
/** Ground height plus a constant lift. */
export const lift = (ground: Ground, dy: number) => (x: number, z: number) => ground.y(x, z) + dy;

/** Triangle strip along a polyline: vertices 2i (left, +normal) and 2i+1 (right) per point, mitered at interior points. Pure. */
export function ribbon(pts: [number, number][], width: number, y: Y): Geo {
  const h = yAt(y);
  const p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-3);
  const positions: number[] = [];
  const indices: number[] = [];
  if (p.length < 2) return { positions, indices };
  const tangent = (i: number, j: number) => {
    const dx = p[j][0] - p[i][0];
    const dz = p[j][1] - p[i][1];
    const l = Math.hypot(dx, dz);
    return [dx / l, dz / l];
  };
  for (let i = 0; i < p.length; i++) {
    const tPrev = i > 0 ? tangent(i - 1, i) : tangent(i, i + 1);
    const tNext = i < p.length - 1 ? tangent(i, i + 1) : tangent(i - 1, i);
    const nPrev = [-tPrev[1], tPrev[0]];
    const nNext = [-tNext[1], tNext[0]];
    let mx = nPrev[0] + nNext[0];
    let mz = nPrev[1] + nNext[1];
    const ml = Math.hypot(mx, mz);
    let scale = 1;
    if (ml > 1e-6) {
      mx /= ml;
      mz /= ml;
      scale = Math.min(2, 1 / (mx * nPrev[0] + mz * nPrev[1]));
    } else {
      [mx, mz] = nPrev; // 180° turn: fall back to the incoming normal
    }
    const ox = mx * scale * (width / 2) || 0;
    const oz = mz * scale * (width / 2) || 0;
    positions.push(p[i][0] + ox, h(p[i][0] + ox, p[i][1] + oz), p[i][1] + oz, p[i][0] - ox, h(p[i][0] - ox, p[i][1] - oz), p[i][1] - oz);
    if (i > 0) {
      const b = 2 * (i - 1);
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  return { positions, indices };
}

export function disc(x: number, z: number, r: number, y: Y, segments = 16): Geo {
  const h = yAt(y);
  const positions = [x, h(x, z), z];
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    positions.push(px, h(px, pz), pz);
    indices.push(0, 1 + ((i + 1) % segments), 1 + i);
  }
  return { positions, indices };
}

export function merge(parts: Geo[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const g of parts) {
    const base = positions.length / 3;
    positions.push(...g.positions);
    for (const i of g.indices) indices.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Dashed centre line along a polyline, starting/ending `margin` metres from the ends. Dashes that would straddle a vertex are skipped. */
export function dashes(pts: [number, number][], margin: number, y: Y): Geo[] {
  const segs = pts.slice(1).map((b, i) => ({ a: pts[i], b, len: Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]) }));
  const total = segs.reduce((s, g) => s + g.len, 0);
  const out: Geo[] = [];
  let start = 0; // distance along the polyline where the current segment begins
  let next = margin; // distance where the next dash begins
  for (const { a, b, len } of segs) {
    if (next < start) next = start;
    while (next + DASH <= start + len && next + DASH <= total - margin) {
      const t0 = (next - start) / len;
      const t1 = (next + DASH - start) / len;
      out.push(ribbon([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]], MARK_W, y));
      next += DASH * 2;
    }
    start += len;
  }
  return out;
}

export function buildRoads(city: City, ground: Ground = FLAT): THREE.Group {
  const { nodes, ways } = city.data;
  const Yg = { sidewalk: lift(ground, Y.sidewalk), asphalt: lift(ground, Y.asphalt), marking: lift(ground, Y.marking) };
  const sidewalk: Geo[] = [];
  const asphalt: Geo[] = [];
  const marking: Geo[] = [];
  const endRadius = new Map<number, number>();
  for (const way of ways) {
    const pts = densify(way.n.map((i) => nodes[i]), 10);
    sidewalk.push(ribbon(pts, way.w + SIDEWALK_EXTRA, Yg.sidewalk));
    asphalt.push(ribbon(pts, way.w, Yg.asphalt));
    if (way.w >= 6) marking.push(...dashes(pts, way.w, Yg.marking));
    for (const n of [way.n[0], way.n[way.n.length - 1]]) endRadius.set(n, Math.max(endRadius.get(n) ?? 0, way.w / 2));
  }
  for (const [n, r] of endRadius) {
    const [x, z] = nodes[n];
    sidewalk.push(disc(x, z, r + SIDEWALK_EXTRA / 2, Yg.sidewalk));
    asphalt.push(disc(x, z, r, Yg.asphalt));
  }
  const mat = (color: number, offset: number, map?: THREE.Texture) =>
    new THREE.MeshStandardMaterial({ color, map, roughnessMap: map, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset });
  const group = new THREE.Group();
  const grime = grimeTexture();
  for (const [parts, color, offset, map] of [[sidewalk, 0xb8b5ae, 1, grime], [asphalt, 0x8a8e96, 2, grime], [marking, 0xe4e2d4, 3, undefined]] as const) {
    const m = new THREE.Mesh(worldUv(merge(parts), 7), mat(color, offset, map));
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/** Planar world-space UVs (1 repeat per `metres`) so a tiling texture reads the same on every ribbon. */
export function worldUv(geo: THREE.BufferGeometry, metres: number): THREE.BufferGeometry {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) / metres; uv[2 * i + 1] = p.getZ(i) / metres; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Tiling asphalt grime: mid grey with speckle, dark oil patches and pale wear streaks. Doubles as roughness map (dark = wetter). */
export function grimeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d4d4d4'; // sRGB → ~0.66 linear; the material colour carries the actual albedo
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)'; g.fillRect(rnd() * 256, rnd() * 256, 1, 1); }
  for (let i = 0; i < 14; i++) {
    const r = 10 + rnd() * 30;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(${rnd() < 0.6 ? '20,20,24' : '240,240,230'},0.09)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(rnd() * 256, rnd() * 256); g.scale(1, 0.4 + rnd()); g.fillStyle = grad; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
