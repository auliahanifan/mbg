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
export interface CityData {
  nodes: [number, number][];
  ways: { n: number[]; w: number; name?: string }[];
  buildings: { p: [number, number][]; h: number }[];
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

const TALL = new Set(['commercial', 'retail', 'hotel', 'office', 'mall']);
const hash = (x: number, z: number) => ((Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663)) >>> 0;
export function heightOf(tags: Record<string, string>, x: number, z: number): number {
  const levels = parseInt(tags['building:levels'] ?? '', 10);
  if (levels > 0) return levels * FLOOR;
  const h = hash(x, z);
  return round1((TALL.has(tags.building) ? 5 + (h % 4) : 1 + (h % 3)) * FLOOR);
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
      if (e.tags.name) way.name = e.tags.name;
      ways.push(way);
    } else if (e.tags.building) {
      const closed = e.nodes.length >= 4 && e.nodes[0] === e.nodes[e.nodes.length - 1];
      if (!closed) continue;
      const p = e.nodes.slice(0, -1).map((id) => project(...latLon.get(id)!));
      buildings.push({ p, h: heightOf(e.tags, p[0][0], p[0][1]) });
    }
  }
  const pois = POIS.map(({ lat, lon, ...rest }) => {
    const [x, z] = project(lat, lon);
    return { ...rest, x, z };
  });
  return { nodes, ways, buildings, pois };
}
