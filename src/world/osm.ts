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

export const bbox = () => ({
  south: CENTER.lat - HALF_SIZE / M_PER_DEG_LAT,
  north: CENTER.lat + HALF_SIZE / M_PER_DEG_LAT,
  west: CENTER.lon - HALF_SIZE / M_PER_DEG_LON,
  east: CENTER.lon + HALF_SIZE / M_PER_DEG_LON,
});

export interface CityPoi { id: string; name: string; kind: 'kitchen' | 'school' | 'landmark'; x: number; z: number }
export type Roof = 'hip' | 'dome';
export interface CityData {
  nodes: [number, number][];
  ways: { n: number[]; w: number; name?: string }[];
  buildings: { p: [number, number][]; h: number; r?: Roof }[];
  pois: CityPoi[];
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
export function widthOf(highway: string): number | null {
  if (SKIP.has(highway)) return null;
  return WIDTHS[highway.replace(/_link$/, '')] ?? 6;
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
const isMosque = (t: Record<string, string>) =>
  t.building === 'mosque' || t.religion === 'muslim' || (t.amenity === 'place_of_worship' && !t.religion) || /masjid|musholl?a/i.test(t.name ?? '');

/**
 * Height + roof kind from tags and footprint. Explicit height/levels win. Otherwise Purwokerto defaults:
 * small plain footprints are 1–2 storey hip-roofed houses, tagged shops/offices 2–3 storey flat ruko,
 * hotels 6–9, mall/hospital 3–4, civic 1–2, mosques 4.8 m with a dome.
 */
export function classify(tags: Record<string, string>, ring: [number, number][]): { h: number; r?: Roof } {
  const rnd = hash(ring[0][0], ring[0][1]) % 100;
  const levels = parseInt(tags['building:levels'] ?? '', 10);
  const height = parseFloat(tags.height ?? '');
  const explicit = height > 0 ? height : levels > 0 ? levels * FLOOR : 0;
  if (isMosque(tags)) return { h: round1(explicit || FLOOR * 1.5), r: 'dome' };
  const a = area(ring);
  const b = tags.building;
  const tagged = !!(tags.shop || tags.amenity || tags.tourism || tags.office);
  if (HOUSE.has(b) && !tagged && (b !== 'yes' || a <= 300)) {
    const h = round1(explicit || FLOOR * (rnd < 78 ? 1 : 2));
    const box = orientedBox(ring);
    const hip = ring.length <= 8 && box.short <= 18 && a >= 0.7 * box.long * box.short;
    return hip ? { h, r: 'hip' } : { h };
  }
  let floors: number;
  if (tags.tourism === 'hotel') floors = 6 + (rnd % 4);
  else if (tags.shop === 'mall' || b === 'hospital' || tags.amenity === 'hospital') floors = 3 + (rnd % 2);
  else if (CIVIC.test(b) || /school|kindergarten|college|university/.test(tags.amenity ?? '')) floors = 1 + (rnd % 2);
  else if (tagged || RUKO.has(b)) floors = 2 + (rnd % 2);
  else floors = 1 + (rnd % 2);
  return { h: round1(explicit || floors * FLOOR) };
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
  for (const e of elements) {
    if (e.type !== 'way' || !e.tags) continue;
    if (e.nodes.some((id) => !latLon.has(id))) continue;
    if (e.tags.highway) {
      const w = widthOf(e.tags.highway);
      if (w === null || e.nodes.length < 2) continue;
      const way: CityData['ways'][number] = { n: e.nodes.map(nodeIndex), w };
      const name = e.tags.name ?? e.tags.alt_name ?? e.tags.official_name;
      if (name) way.name = name;
      ways.push(way);
    } else if (e.tags.building) {
      const closed = e.nodes.length >= 4 && e.nodes[0] === e.nodes[e.nodes.length - 1];
      if (!closed) continue;
      const p = e.nodes.slice(0, -1).map((id) => project(...latLon.get(id)!));
      buildings.push({ p, ...classify(e.tags, p) });
    }
  }
  propagateNames(nodes, ways);
  const pois = POIS.map(({ lat, lon, ...rest }) => {
    const [x, z] = project(lat, lon);
    return { ...rest, x, z };
  });
  return { nodes, ways, buildings, pois };
}
