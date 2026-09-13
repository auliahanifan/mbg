import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { City } from '../world/city';
import { densify, FLAT, type Ground } from '../world/terrain';

const SIDEWALK_EXTRA = 2.4;
const DASH = 3;
const MARK_W = 0.15;
const Y = { sidewalk: 0.03, asphalt: 0.06, marking: 0.09 };
const POLE_EVERY = 35; // tiang listrik spacing along the left kerb
const POLE_H = 9;
const STALL_EVERY = 90; // tenda PKL spacing along main-road kerbs
const TARPS = [0x2f6fb0, 0xe8862a, 0x3f8f5a, 0xd9a52a, 0xc94a3c]; // terpal biru, oranye, hijau, kuning, merah

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
    if (way.w >= 6 && !way.one) marking.push(...dashes(pts, way.w, Yg.marking)); // a one-way carriageway has no centre line to divide
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

/** Points every `every` m along the left kerb of a polyline, `kerb` m past the asphalt. Poles: 1 m out every POLE_EVERY. */
export function polePoints(pts: [number, number][], halfWidth: number, every = POLE_EVERY, kerb = 1.0): [number, number][] {
  const out: [number, number][] = [];
  let next = every / 2;
  let start = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    while (next <= start + len) {
      const t = (next - start) / len;
      out.push([ax + (bx - ax) * t + nx * (halfWidth + kerb), az + (bz - az) * t + nz * (halfWidth + kerb)]);
      next += every;
    }
    start += len;
  }
  return out;
}

/**
 * Concrete power poles along every road ≥ 6 m wide, strung with three sagging cables per span. `onRoad` drops poles
 * that land on another carriageway (dual carriageways, junctions); a dropped pole also breaks the cable run.
 */
export function buildPoles(city: City, ground: Ground = FLAT, onRoad: (x: number, z: number) => boolean = () => false): THREE.Group {
  const { nodes, ways } = city.data;
  const runs: [number, number][][] = [];
  for (const way of ways) {
    if (way.w < 6) continue;
    let run: [number, number][] = [];
    for (const p of polePoints(way.n.map((i) => nodes[i]), way.w / 2)) {
      if (onRoad(p[0], p[1])) { if (run.length) runs.push(run); run = []; } else run.push(p);
    }
    if (run.length) runs.push(run);
  }
  const poles = runs.flat();
  const g = new THREE.Group();
  if (!poles.length) return g;
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.16, POLE_H, 6).translate(0, POLE_H / 2, 0), new THREE.MeshStandardMaterial({ color: 0x9a9791, roughness: 1 }), poles.length);
  const o = new THREE.Object3D();
  poles.forEach(([x, z], i) => { o.position.set(x, ground.y(x, z), z); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
  mesh.castShadow = true;
  const cable: number[] = [];
  for (const run of runs) {
    for (let i = 0; i + 1 < run.length; i++) {
      const [ax, az] = run[i];
      const [bx, bz] = run[i + 1];
      const ay = ground.y(ax, az);
      const by = ground.y(bx, bz);
      for (const dy of [-0.4, -0.8, -1.2]) { // three wires below the pole top, each sagging 0.5 m mid-span
        const top = POLE_H + dy;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ay + by) / 2 + top - 0.5;
        cable.push(ax, ay + top, az, mx, my, mz, mx, my, mz, bx, by + top, bz);
      }
    }
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
  g.add(mesh, new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
  return g;
}

/**
 * Tenda PKL on the kerb of every road ≥ 8 m: a gerobak under a tarpaulin on four poles, every STALL_EVERY m, facing the
 * road. `blocked` skips spots on another carriageway or inside a building.
 */
export function buildStalls(city: City, ground: Ground = FLAT, blocked: (x: number, z: number) => boolean = () => false): THREE.Group {
  const { nodes, ways } = city.data;
  const spots: [number, number, number][] = []; // x, z, heading of the kerb
  for (const way of ways) {
    if (way.w < 8) continue;
    const pts = way.n.map((i) => nodes[i]);
    for (const [x, z] of polePoints(pts, way.w / 2, STALL_EVERY, 1.4)) {
      if (blocked(x, z)) continue;
      let best = 0, bd = Infinity; // heading of the nearest segment, so the stall's long side runs along the kerb
      for (let i = 0; i + 1 < pts.length; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
        const d = Math.hypot(mx - x, mz - z);
        if (d < bd) { bd = d; best = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); }
      }
      spots.push([x, z, best]);
    }
  }
  const g = new THREE.Group();
  if (!spots.length) return g;
  const cart = new THREE.BoxGeometry(1.8, 1.0, 0.9).translate(0, 1.0, 0); // gerobak on its wheels, 0.5–1.5 m
  const tarp = mergeGeometries([
    new THREE.BoxGeometry(2.8, 0.06, 2.4).translate(0, 2.3, 0),
    ...[[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]].map(([x, z]) => new THREE.BoxGeometry(0.06, 2.3, 0.06).translate(x, 1.15, z)),
  ]);
  const carts = new THREE.InstancedMesh(cart, new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }), spots.length);
  const tarps = new THREE.InstancedMesh(tarp, new THREE.MeshStandardMaterial({ roughness: 0.8 }), spots.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  spots.forEach(([x, z, heading], i) => {
    o.position.set(x, ground.y(x, z), z); o.rotation.set(0, heading, 0); o.updateMatrix();
    carts.setMatrixAt(i, o.matrix); tarps.setMatrixAt(i, o.matrix);
    tarps.setColorAt(i, c.setHex(TARPS[i % TARPS.length]));
  });
  carts.castShadow = tarps.castShadow = true;
  g.add(carts, tarps);
  return g;
}

const TREE_EVERY = 26; // trembesi/angsana spacing along a Purwokerto kerb

/**
 * Peneduh along both kerbs of the main roads (≥ 8 m, the ones Purwokerto actually plants), TREE_EVERY metres apart and
 * 1.8 m past the asphalt — outside the 1.2 m sidewalk, so they line the street without standing in it. A 6 m gang gets
 * none: a trembesi crown is wider than the gang. `blocked` drops spots on another carriageway.
 */
export function streetTrees(city: City, blocked: (x: number, z: number) => boolean = () => false): [number, number][] {
  const { nodes, ways } = city.data;
  const out: [number, number][] = [];
  for (const way of ways) {
    if (way.w < 8) continue;
    const pts = way.n.map((i) => nodes[i]);
    for (const side of [pts, [...pts].reverse()]) for (const p of polePoints(side, way.w / 2, TREE_EVERY, 1.8)) if (!blocked(p[0], p[1])) out.push(p);
  }
  return out;
}

const GANG = /^(gang|gg\.?)\s/i; // OSM's own name for a kampung lane — the only evidence the map gives that a gapura belongs here
const GAPURA_H = 4.6; // underside of the lintel: a gang portal has to clear a pickup
const GAPURA_IN = 5; // metres in from the mouth, past the bigger road's kerb

/**
 * Mouths of the gangs: the end of every way OSM actually names "Gang …" where it meets a wider road. OSM does not map
 * gapura themselves, so the portal is ambience — but the map does say which lanes are gang, and that is the only place
 * one is put, rather than over every narrow street (28 of them in Purwokerto). Returns the portal's centre
 * GAPURA_IN metres into the small road, its heading along that road, and the half-width it has to straddle.
 */
export function gapuraSpots(city: City): { x: number; z: number; heading: number; half: number }[] {
  const { nodes, ways } = city.data;
  const widest = new Map<number, number>();
  for (const w of ways) for (const n of w.n) widest.set(n, Math.max(widest.get(n) ?? 0, w.w));
  const out: { x: number; z: number; heading: number; half: number }[] = [];
  const seen = new Set<number>();
  for (const way of ways) {
    if (way.n.length < 2 || !GANG.test(way.name ?? '')) continue;
    for (const [end, next] of [[0, 1], [way.n.length - 1, way.n.length - 2]] as const) {
      const node = way.n[end];
      if ((widest.get(node) ?? 0) <= way.w || seen.has(node)) continue; // the mouth is where the gang meets something wider than itself
      const [ax, az] = nodes[node];
      const [bx, bz] = nodes[way.n[next]];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < GAPURA_IN + 2) continue; // too short a stub to stand a portal in
      seen.add(node);
      out.push({ x: ax + ((bx - ax) / l) * GAPURA_IN, z: az + ((bz - az) / l) * GAPURA_IN, heading: Math.atan2(bx - ax, bz - az), half: way.w / 2 + 0.7 });
    }
  }
  return out;
}

/** Gapura merah-putih over every gang mouth: two plastered piers and a lintel banded in the flag's colours. */
export function buildGapura(city: City, ground: Ground = FLAT): THREE.Group {
  const spots = gapuraSpots(city);
  const g = new THREE.Group();
  if (!spots.length) return g;
  const pier = new THREE.BoxGeometry(0.4, GAPURA_H, 0.4);
  const white = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.95 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8262c, roughness: 0.9 });
  const piers = new THREE.InstancedMesh(pier, white, spots.length * 2);
  const lintels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.85, 0.34), white, spots.length);
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, 0.38), red, spots.length); // the merah stripe under the white board
  const o = new THREE.Object3D();
  spots.forEach((s, i) => {
    const y = ground.y(s.x, s.z);
    // the portal's tangent is across the road: rotate the pier offsets by the heading
    const ox = Math.cos(s.heading) * s.half;
    const oz = -Math.sin(s.heading) * s.half;
    for (const k of [-1, 1]) {
      o.position.set(s.x + ox * k, y + GAPURA_H / 2, s.z + oz * k);
      o.rotation.set(0, s.heading, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      piers.setMatrixAt(2 * i + (k > 0 ? 1 : 0), o.matrix);
    }
    o.position.set(s.x, y + GAPURA_H + 0.42, s.z);
    o.rotation.set(0, s.heading, 0);
    o.scale.set(2 * s.half + 0.4, 1, 1);
    o.updateMatrix();
    lintels.setMatrixAt(i, o.matrix);
    o.position.set(s.x, y + GAPURA_H - 0.15, s.z);
    o.updateMatrix();
    bands.setMatrixAt(i, o.matrix);
  });
  piers.castShadow = lintels.castShadow = bands.castShadow = true;
  g.add(piers, lintels, bands);
  return g;
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
