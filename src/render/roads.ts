import * as THREE from 'three';
import type { City } from '../world/city';

const SIDEWALK_EXTRA = 2.4;
const DASH = 3;
const MARK_W = 0.15;
const Y = { sidewalk: 0.02, asphalt: 0.04, marking: 0.06 };

export type Geo = { positions: number[]; indices: number[] };

/** Triangle strip along a polyline: vertices 2i (left, +normal) and 2i+1 (right) per point, mitered at interior points. Pure. */
export function ribbon(pts: [number, number][], width: number, y: number): Geo {
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
    positions.push(p[i][0] + ox, y, p[i][1] + oz, p[i][0] - ox, y, p[i][1] - oz);
    if (i > 0) {
      const b = 2 * (i - 1);
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  return { positions, indices };
}

export function disc(x: number, z: number, r: number, y: number, segments = 16): Geo {
  const positions = [x, y, z];
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
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
export function dashes(pts: [number, number][], margin: number, y: number): Geo[] {
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

export function buildRoads(city: City): THREE.Group {
  const { nodes, ways } = city.data;
  const sidewalk: Geo[] = [];
  const asphalt: Geo[] = [];
  const marking: Geo[] = [];
  const endRadius = new Map<number, number>();
  for (const way of ways) {
    const pts = way.n.map((i) => nodes[i]);
    sidewalk.push(ribbon(pts, way.w + SIDEWALK_EXTRA, Y.sidewalk));
    asphalt.push(ribbon(pts, way.w, Y.asphalt));
    if (way.w >= 6) marking.push(...dashes(pts, way.w, Y.marking));
    for (const n of [way.n[0], way.n[way.n.length - 1]]) endRadius.set(n, Math.max(endRadius.get(n) ?? 0, way.w / 2));
  }
  for (const [n, r] of endRadius) {
    const [x, z] = nodes[n];
    sidewalk.push(disc(x, z, r + SIDEWALK_EXTRA / 2, Y.sidewalk));
    asphalt.push(disc(x, z, r, Y.asphalt));
  }
  const mat = (color: number, offset: number) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset });
  const group = new THREE.Group();
  for (const [parts, color, offset] of [[sidewalk, 0xb9bcc4, 1], [asphalt, 0x4a4d55, 2], [marking, 0xf1f1e8, 3]] as const) {
    const m = new THREE.Mesh(merge(parts), mat(color, offset));
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
