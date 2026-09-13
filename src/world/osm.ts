// Pure OSM → CityData conversion. Also imported by scripts/fetch-osm.mjs (Node 24 strips the types).
export const CENTER = { lat: -7.4177, lon: 109.2362 }; // ruling: NE of the Alun-alun so every POI fits
export const HALF_SIZE = 1700; // metres; world spans ±HALF_SIZE
export const SPAWN = { lat: -7.42498, lon: 109.23004 }; // Jl. Jenderal Sudirman, depan Alun-alun

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((CENTER.lat * Math.PI) / 180);
const FLOOR = 3.2;
const round1 = (v: number) => Math.round(v * 10) / 10 || 0; // `|| 0` turns -0 into 0 (toEqual distinguishes them)

export const project = (lat: number, lon: number): [number, number] => [
  round1((lon - CENTER.lon) * M_PER_DEG_LON),
  round1(-(lat - CENTER.lat) * M_PER_DEG_LAT),
];

export const unproject = (x: number, z: number) => ({ lat: CENTER.lat - z / M_PER_DEG_LAT, lon: CENTER.lon + x / M_PER_DEG_LON });

export const bbox = () => ({
  south: CENTER.lat - HALF_SIZE / M_PER_DEG_LAT,
  north: CENTER.lat + HALF_SIZE / M_PER_DEG_LAT,
  west: CENTER.lon - HALF_SIZE / M_PER_DEG_LON,
  east: CENTER.lon + HALF_SIZE / M_PER_DEG_LON,
});

export interface CityPoi { id: string; name: string; kind: 'kitchen' | 'school' | 'landmark'; x: number; z: number }
export type Roof = 'hip' | 'gable' | 'dome' | 'joglo';
export type AreaKind = 'grass' | 'wood' | 'farm' | 'water' | 'sand' | 'paved';
export type LineKind = 'rail' | 'river' | 'stream';
export interface CityData {
  nodes: [number, number][];
  ways: { n: number[]; w: number; name?: string; one?: 1 }[]; // one: OSM oneway, so no centre line down it
  buildings: { p: [number, number][]; h: number; r?: Roof; t?: number; name?: string; civic?: 1 }[]; // t: tower rising above the roof (podium + tower blocks); civic: OSM says school/hospital/office/worship, so never a shopfront
  pois: CityPoi[];
  areas?: { p: [number, number][]; k: AreaKind }[]; // closed landuse / water rings
  lines?: { p: [number, number][]; k: LineKind }[]; // rail and waterways
  trees?: [number, number][];
}

export type OsmElement =
  | { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
  | { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> };

const POIS: (Omit<CityPoi, 'x' | 'z'> & { lat: number; lon: number })[] = [
  { id: 'K', name: 'SPPG Polresta Banyumas', kind: 'kitchen', lat: -7.40394, lon: 109.23185 },
  { id: '1', name: 'SDN 1 Bancarkembar', kind: 'school', lat: -7.41087, lon: 109.24605 },
  { id: '2', name: 'SDN 1 Sokanegara', kind: 'school', lat: -7.41809, lon: 109.23318 },
  { id: '3', name: 'SDN 1 Kranji', kind: 'school', lat: -7.42402, lon: 109.23991 },
  { id: 'A', name: 'Alun-alun Purwokerto', kind: 'landmark', lat: -7.42439, lon: 109.23012 },
  { id: 'M', name: 'Menara Teratai', kind: 'landmark', lat: -7.43145, lon: 109.2326 },
  { id: 'S', name: 'Stasiun Purwokerto', kind: 'landmark', lat: -7.41946, lon: 109.22184 },
  { id: 'G', name: 'GOR Satria', kind: 'landmark', lat: -7.41598, lon: 109.25068 },
];

const SKIP = new Set(['footway', 'path', 'steps', 'cycleway', 'track', 'pedestrian', 'bridleway', 'corridor', 'proposed', 'construction']);
const WIDTHS: Record<string, number> = {
  motorway: 12, trunk: 12, primary: 12, secondary: 10, tertiary: 8, residential: 6, unclassified: 6, service: 4, living_street: 4,
};
const LANE = 3.25; // metres of carriageway per marked lane
/**
 * Carriageway width in metres. OSM's own `width` wins, then `lanes` × LANE (180 of Purwokerto's ways carry it); only
 * where the map says nothing does the per-class table stand in. Null for the ways no car drives on.
 */
export function widthOf(tags: Record<string, string>): number | null {
  if (SKIP.has(tags.highway)) return null;
  const width = parseFloat(tags.width ?? '');
  if (width > 0) return round1(width);
  const lanes = parseInt(tags.lanes ?? '', 10);
  if (lanes > 0) return round1(lanes * LANE);
  return WIDTHS[tags.highway.replace(/_link$/, '')] ?? 6;
}

export const hash = (x: number, z: number) => ((Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663)) >>> 0;

/** Shoelace area of a ring (either winding). */
export function area(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

export interface OrientedBox { cx: number; cz: number; ux: number; uz: number; long: number; short: number }

/** Minimum-area bounding rectangle among the ring's edge directions; (ux, uz) is the unit long axis. */
export function orientedBox(ring: [number, number][]): OrientedBox {
  let best: OrientedBox | null = null;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l < 1e-6) continue;
    const ux = (x2 - x1) / l;
    const uz = (z2 - z1) / l;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const du = maxU - minU;
    const dv = maxV - minV;
    if (best && du * dv >= best.long * best.short) continue;
    const mu = (minU + maxU) / 2;
    const mv = (minV + maxV) / 2;
    const cx = ux * mu - uz * mv; // inverse rotation of (mu, mv)
    const cz = uz * mu + ux * mv;
    best = du >= dv ? { cx, cz, ux, uz, long: du, short: dv } : { cx, cz, ux: -uz, uz: ux, long: dv, short: du };
  }
  return best ?? { cx: ring[0][0], cz: ring[0][1], ux: 1, uz: 0, long: 0, short: 0 };
}

const HOUSE = new Set(['yes', 'house', 'residential', 'detached', 'terrace', 'bungalow']);
const RUKO = new Set(['commercial', 'retail', 'office', 'apartments']);
const CIVIC = /^(school|kindergarten|college|university|public|government|industrial|warehouse|train_station|railway|garage|garages|parking|roof|church|chapel)$/;
const isChurch = (t: Record<string, string>) =>
  t.building === 'church' || t.building === 'chapel' || t.religion === 'christian' || /gereja|\bgk[ij]\b|katolik|kristen|church|katedral|paroki|santo|santa\b|sekolah minggu/i.test(t.name ?? '');
const isMosque = (t: Record<string, string>) =>
  !isChurch(t) && (t.building === 'mosque' || t.religion === 'muslim' || (t.amenity === 'place_of_worship' && !t.religion) || /masjid|musholl?a/i.test(t.name ?? ''));

/**
 * Real Purwokerto landmarks OSM leaves untagged: floors (and a tower for podium + tower blocks) by name.
 * Rita Supermall = 5-storey mall under the 22-storey Swiss-Belhotel tower; Stasiun Purwokerto is the 1916 colonial hall under one big genteng roof.
 */
const KNOWN: [RegExp, { floors: number; r?: Roof; t?: number }][] = [
  [/^rita supermall/i, { floors: 5, t: 17 * FLOOR }],
  [/^dominic hotel/i, { floors: 8 }],
  [/^moro purwokerto/i, { floors: 4 }],
  [/^stasiun purwokerto$/i, { floors: 2, r: 'hip' }],
  [/^kantor bupati banyumas/i, { floors: 3, r: 'hip' }],
  [/baitussalam/i, { floors: 3, r: 'dome' }],
  [/^museum bank rakyat/i, { floors: 2, r: 'hip' }],
  [/^pendopo si panji/i, { floors: 1, r: 'joglo' }], // OSM has it only as a node, but that node falls inside a footprint: the open Banyumas pavilion under its tiered joglo
];

/**
 * Height + roof kind from tags and footprint. Named landmarks (KNOWN) and explicit height/levels win. Otherwise Purwokerto defaults:
 * small plain footprints are 1–2 storey houses under a genteng limasan (hip) or pelana (gable) roof, tagged shops/offices 2–3 storey flat ruko,
 * hotels 4–6, mall/hospital 3–4, civic 1–2, mosques 4.8 m with a dome.
 */
export function classify(tags: Record<string, string>, ring: [number, number][]): { h: number; r?: Roof; t?: number; civic?: 1 } {
  const rnd = hash(ring[0][0], ring[0][1]) % 100;
  const known = KNOWN.find(([re]) => re.test(tags.name ?? ''))?.[1];
  if (known) return { h: round1(known.floors * FLOOR), ...(known.r && { r: known.r }), ...(known.t && { t: round1(known.t) }) };
  const levels = parseInt(tags['building:levels'] ?? '', 10);
  const height = parseFloat(tags.height ?? '');
  const explicit = height > 0 ? height : levels > 0 ? levels * FLOOR : 0;
  if (isMosque(tags)) return { h: round1(explicit || FLOOR * 1.5), r: 'dome' };
  if (/^(church|chapel)$/.test(tags.building) || (isChurch(tags) && (tags.amenity === 'place_of_worship' || /gereja|church|\bgk[ij]\b/i.test(tags.name ?? '')))) return { h: round1(explicit || FLOOR * 2), r: 'gable' }; // a gabled hall, never a dome
  const a = area(ring);
  const b = tags.building;
  const tagged = !!(tags.shop || tags.amenity || tags.tourism || tags.office);
  if (HOUSE.has(b) && !tagged && (b !== 'yes' || a <= 300)) {
    const h = round1(explicit || FLOOR * (rnd < 78 ? 1 : 2));
    const box = orientedBox(ring);
    const pitched = ring.length <= 8 && box.short <= 18 && a >= 0.7 * box.long * box.short;
    return pitched ? { h, r: rnd % 5 < 2 ? 'gable' : 'hip' } : { h };
  }
  // what OSM actually calls this building decides whether it may wear a shopfront
  const civic = CIVIC.test(b) || /^(school|kindergarten|college|university|hospital|clinic|doctors|place_of_worship|townhall|police|fire_station|courthouse|prison|library|post_office|bus_station)$/.test(tags.amenity ?? '') || !!tags.office || !!tags.healthcare
    ? ({ civic: 1 } as const)
    : {};
  let floors: number;
  if (tags.tourism === 'hotel') floors = 4 + (rnd % 3);
  else if (tags.shop === 'mall' || b === 'hospital' || tags.amenity === 'hospital') floors = 3 + (rnd % 2);
  else if (CIVIC.test(b) || /school|kindergarten|college|university/.test(tags.amenity ?? '')) floors = 1 + (rnd % 2);
  else if (tagged || RUKO.has(b)) floors = 2 + (rnd % 2);
  else floors = 1 + (rnd % 2);
  return { h: round1(explicit || floors * FLOOR), ...civic };
}

export function areaKind(t: Record<string, string>): AreaKind | null {
  if (t.natural === 'water' || t.leisure === 'swimming_pool') return 'water';
  if (t.natural === 'wood' || t.landuse === 'forest' || t.landuse === 'orchard') return 'wood';
  if (t.landuse === 'farmland') return 'farm';
  if (t.natural === 'beach' || t.natural === 'sand') return 'sand';
  if (t.amenity === 'parking') return 'paved';
  if (/^(grass|meadow|cemetery|village_green)$/.test(t.landuse ?? '') || /^(park|garden|pitch|golf_course|stadium|track)$/.test(t.leisure ?? '') || /^(grassland|lawn|scrub)$/.test(t.natural ?? '')) return 'grass';
  return null;
}

export function lineKind(t: Record<string, string>): LineKind | null {
  if (t.railway === 'rail') return 'rail';
  if (t.waterway === 'river' || t.waterway === 'canal') return 'river';
  if (/^(stream|drain|ditch)$/.test(t.waterway ?? '')) return 'stream';
  return null;
}

/** Even-odd ray cast. */
export function pointInRing(x: number, z: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Deterministic jittered grid of points inside the ring, one per `spacing` metres. */
export function scatter(ring: [number, number][], spacing: number): [number, number][] {
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  const out: [number, number][] = [];
  for (let z = Math.min(...zs); z < Math.max(...zs); z += spacing) {
    for (let x = Math.min(...xs); x < Math.max(...xs); x += spacing) {
      const h = hash(x, z);
      const px = round1(x + ((h % 1000) / 1000 - 0.5) * spacing);
      const pz = round1(z + (((h >>> 10) % 1000) / 1000 - 0.5) * spacing);
      if (pointInRing(px, pz, ring)) out.push([px, pz]);
    }
  }
  return out;
}

/** Unnamed ways inherit the name of a named way they continue nearly straight (≤ 30°) at a shared end node; repeated so chains fill in. */
export function propagateNames(nodes: [number, number][], ways: CityData['ways']): void {
  const touching = new Map<number, number[]>();
  ways.forEach((w, i) => {
    for (const n of [w.n[0], w.n[w.n.length - 1]]) touching.set(n, [...(touching.get(n) ?? []), i]);
  });
  const outDir = (w: CityData['ways'][number], node: number): [number, number] => {
    const [a, b] = w.n[0] === node ? [w.n[0], w.n[1]] : [w.n[w.n.length - 1], w.n[w.n.length - 2]];
    const dx = nodes[b][0] - nodes[a][0];
    const dz = nodes[b][1] - nodes[a][1];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  const MAX_DOT = -Math.cos((30 * Math.PI) / 180); // outgoing directions of a straight continuation point opposite ways
  for (let changed = true, pass = 0; changed && pass < 10; pass++) {
    changed = false;
    for (const w of ways) {
      if (w.name || w.n.length < 2) continue;
      for (const node of [w.n[0], w.n[w.n.length - 1]]) {
        const [ox, oz] = outDir(w, node);
        let best: string | undefined;
        let bestDot = MAX_DOT;
        for (const j of touching.get(node)!) {
          const o = ways[j];
          if (o === w || !o.name || o.n.length < 2) continue;
          const [px, pz] = outDir(o, node);
          const dot = ox * px + oz * pz;
          if (dot < bestDot) { bestDot = dot; best = o.name; }
        }
        if (best) { w.name = best; changed = true; break; }
      }
    }
  }
}

/**
 * Names from standalone POI nodes (the way most Indonesian shops, banks and warung are actually mapped) onto the
 * building they stand in, or failing that the nearest footprint within REACH metres. REACH is deliberately short: a
 * node inside a footprint, or a shopfront node a few metres off its wall, identifies its building; past that the
 * nearest footprint is a guess, and an unnamed building beats a wrongly named one. Of Purwokerto's 164 named POI
 * nodes, 106 fall inside a footprint and 16 more within REACH; the rest stay unnamed.
 * A building keeps a name it already had; each POI claims at most one building.
 */
export function nameFromPois(buildings: CityData['buildings'], pois: { x: number; z: number; name: string }[]): void {
  const taken = new Set<number>();
  const centre = buildings.map((b) => [b.p.reduce((s, p) => s + p[0], 0) / b.p.length, b.p.reduce((s, p) => s + p[1], 0) / b.p.length] as const);
  const REACH = 12;
  for (const poi of pois) {
    let best = -1;
    let bestDist = REACH;
    for (let i = 0; i < buildings.length; i++) {
      if (taken.has(i) || buildings[i].name) continue;
      if (pointInRing(poi.x, poi.z, buildings[i].p)) { best = i; break; }
      const d = Math.hypot(centre[i][0] - poi.x, centre[i][1] - poi.z);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best < 0) continue;
    const b = buildings[best];
    b.name = poi.name;
    taken.add(best);
    const known = KNOWN.find(([re]) => re.test(poi.name))?.[1]; // the name only arrives now, so the landmark table has to be re-read
    if (known) Object.assign(b, { h: round1(known.floors * FLOOR) }, known.r ? { r: known.r } : {}, known.t ? { t: round1(known.t) } : {});
  }
}

export function buildCityData(elements: OsmElement[]): CityData {
  const latLon = new Map<number, [number, number]>();
  for (const e of elements) if (e.type === 'node') latLon.set(e.id, [e.lat, e.lon]);
  const nodes: [number, number][] = [];
  const index = new Map<number, number>();
  const nodeIndex = (id: number) => {
    let i = index.get(id);
    if (i === undefined) {
      const ll = latLon.get(id)!;
      i = nodes.push(project(ll[0], ll[1])) - 1;
      index.set(id, i);
    }
    return i;
  };
  const ways: CityData['ways'] = [];
  const buildings: CityData['buildings'] = [];
  const areas: NonNullable<CityData['areas']> = [];
  const lines: NonNullable<CityData['lines']> = [];
  const trees: [number, number][] = [];
  const poiNodes: { x: number; z: number; name: string }[] = [];
  for (const e of elements) {
    if (!e.tags) continue;
    if (e.type === 'node') {
      if (e.tags.natural === 'tree') trees.push(project(e.lat, e.lon));
      else if (e.tags.name && (e.tags.shop || e.tags.amenity || e.tags.tourism || e.tags.office || e.tags.healthcare)) {
        const [x, z] = project(e.lat, e.lon);
        poiNodes.push({ x, z, name: e.tags.name });
      }
      continue;
    }
    if (e.nodes.some((id) => !latLon.has(id))) continue;
    const closed = e.nodes.length >= 4 && e.nodes[0] === e.nodes[e.nodes.length - 1];
    const ring = () => e.nodes.slice(0, -1).map((id) => project(...latLon.get(id)!));
    if (e.tags.highway) {
      const w = widthOf(e.tags);
      if (w === null || e.nodes.length < 2) continue;
      const way: CityData['ways'][number] = { n: e.nodes.map(nodeIndex), w };
      if (/^(yes|1|-1)$/.test(e.tags.oneway ?? '')) way.one = 1;
      const name = e.tags.name ?? e.tags.alt_name ?? e.tags.official_name;
      if (name) way.name = name;
      ways.push(way);
    } else if (e.tags.building) {
      if (!closed) continue;
      const p = ring();
      const b: CityData['buildings'][number] = { p, ...classify(e.tags, p) };
      if (e.tags.name) b.name = e.tags.name;
      buildings.push(b);
    } else if (closed && areaKind(e.tags)) {
      const k = areaKind(e.tags)!;
      const p = ring();
      areas.push({ p, k });
      if (k === 'wood') trees.push(...scatter(p, 8));
      else if (k === 'grass') trees.push(...scatter(p, 30));
    } else if (!closed && lineKind(e.tags) && !e.tags.tunnel) {
      lines.push({ p: e.nodes.map((id) => project(...latLon.get(id)!)), k: lineKind(e.tags)! });
    }
  }
  propagateNames(nodes, ways);
  nameFromPois(buildings, poiNodes);
  const pois = POIS.map(({ lat, lon, ...rest }) => {
    const [x, z] = project(lat, lon);
    return { ...rest, x, z };
  });
  return { nodes, ways, buildings, pois, areas, lines, trees };
}

const ROAD_MARGIN = 1.4; // clearance beyond the asphalt edge: the 1.2 m sidewalk plus a kerb; the 0.6 m eaves may still overhang the sidewalk
const CELL = 10; // grid cell; must exceed the widest corridor half-width (12/2 + margin = 7.4) for the one-cell lookup below

/** Displacement that pushes a point out of every road corridor it is deeper than `tol` inside, or null if it is clear. A negative `tol` widens the corridor (proximity test). */
export function corridorEscape(data: CityData) {
  const segs: [number, number, number, number, number][] = []; // ax, az, bx, bz, half width
  const grid = new Map<number, number[]>();
  const key = (i: number, j: number) => i * 8192 + j;
  for (const w of data.ways) {
    for (let i = 0; i + 1 < w.n.length; i++) {
      const [ax, az] = data.nodes[w.n[i]];
      const [bx, bz] = data.nodes[w.n[i + 1]];
      if (Math.hypot(bx - ax, bz - az) < 0.01) continue;
      const s = segs.push([ax, az, bx, bz, w.w / 2 + ROAD_MARGIN]) - 1;
      // bucketed one cell beyond the segment's bounds, so a query only ever reads the cell it lands in
      for (let i2 = Math.floor(Math.min(ax, bx) / CELL) - 1; i2 <= Math.floor(Math.max(ax, bx) / CELL) + 1; i2++) {
        for (let j = Math.floor(Math.min(az, bz) / CELL) - 1; j <= Math.floor(Math.max(az, bz) / CELL) + 1; j++) {
          const cell = grid.get(key(i2, j));
          if (cell) cell.push(s); else grid.set(key(i2, j), [s]);
        }
      }
    }
  }
  return (x: number, z: number, tol = 0): [number, number] | null => {
    let ex = 0;
    let ez = 0;
    let inside = false;
    for (const s of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const [ax, az, bx, bz, hw] = segs[s];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const ox = x - (ax + dx * t);
      const oz = z - (az + dz * t);
      const dist = Math.hypot(ox, oz);
      const depth = hw - dist;
      if (depth <= tol) continue;
      inside = true;
      // sum the escapes so a corner inside two corridors leaves both at once instead of ping-ponging
      if (dist) { ex += (ox / dist) * depth; ez += (oz / dist) * depth; }
      else { const l = Math.hypot(dx, dz); ex += (-dz / l) * depth; ez += (dx / l) * depth; } // dead centre: sideways
    }
    return inside ? [ex, ez] : null;
  };
}

/**
 * Keeps buildings off the road: every footprint vertex inside a road corridor is pushed out past its edge,
 * and the ~2 % of footprints whose walls still cross one (they sit on a junction, or a road runs through them) are dropped.
 */
export function clearRoads(data: CityData): CityData['buildings'] {
  const escape = corridorEscape(data);
  const push = (p: [number, number]): [number, number] => {
    let [x, z] = p;
    for (let k = 0; k < 6; k++) {
      const e = escape(x, z);
      if (!e) break;
      x = round1(x + e[0] * 1.05); // overshoot so the 0.1 m rounding cannot land back inside
      z = round1(z + e[1] * 1.05);
    }
    return [x, z];
  };
  const clearWall = (a: [number, number], b: [number, number]) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); // ~0.5 m samples
    for (let i = 0; i <= steps; i++) if (escape(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps, 0.2)) return false;
    return true;
  };
  // A wall between two cleared vertices can still run through a corridor (a long facade along a road at a slight
  // angle): subdivide just those walls at 2 m and push the samples out too, bending the facade along the kerb.
  const repair = (ring: [number, number][]): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      out.push(a);
      if (clearWall(a, b)) continue;
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
      for (let k = 1; k < steps; k++) out.push(push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]));
    }
    return out.filter((p, i) => p[0] !== out[(i + 1) % out.length][0] || p[1] !== out[(i + 1) % out.length][1]);
  };
  const clearRing = (ring: [number, number][]) => ring.every((p, i) => clearWall(p, ring[(i + 1) % ring.length]));
  const side = (a: [number, number], b: [number, number], c: [number, number]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  /** No two non-adjacent walls cross: pushing vertices can fold a footprint over itself, and a bow-tie renders as garbage. */
  const simple = (ring: [number, number][]) => {
    for (let i = 0; i < ring.length; i++) {
      for (let j = i + 2; j < ring.length; j++) {
        if (i === 0 && j === ring.length - 1) continue;
        const [a, b, c, d] = [ring[i], ring[i + 1], ring[j], ring[(j + 1) % ring.length]];
        if (side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0) return false;
      }
    }
    return true;
  };
  const out: CityData['buildings'] = [];
  for (const b of data.buildings) {
    let p = b.p.map(push);
    if (!clearRing(p)) p = repair(p);
    if (p.length >= 3 && clearRing(p) && simple(p)) out.push({ ...b, p });
  }
  return out;
}
