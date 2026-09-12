# Purwokerto from OpenStreetMap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 17×17 Kenney tile grid with the real Purwokerto road network and building footprints from OpenStreetMap (1 unit = 1 m), with quest stops at the real SPPG/schools, graph-following traffic, and building collision.

**Architecture:** An offline Node script fetches OSM data via Overpass and writes `public/purwokerto.json` (nodes, ways, buildings, POIs) using pure conversion code in `src/world/osm.ts`. At runtime `src/world/city.ts` turns it into a road graph (edges/adjacency, nearest-edge lookup) used by rendering (`render/roads.ts` ribbons, `render/buildings.ts` merged extrusions, `render/landmarks.ts`), routing (`world/routing.ts` Dijkstra field), traffic (`traffic/traffic.ts` rewritten for the graph), the minimap and quest timer. Collision reuses `resolveCar` with 1×1 m boxes from a rasterised building occupancy grid (`vehicle/occupancy.ts`).

**Tech Stack:** three ^0.186 (`BufferGeometry`, `ExtrudeGeometry`, `BufferGeometryUtils.mergeGeometries`), Vite 8, TypeScript, Vitest, pnpm, Node 24 (runs `.ts` imports natively via type stripping), Overpass API.

**Spec:** `docs/superpowers/specs/2026-09-12-purwokerto-osm-design.md`

## Global Constraints

- Package manager **pnpm**. `pnpm build` (= `tsc --noEmit && vite build`) and `pnpm test` must pass at the end of every task. Tasks are ordered so the game keeps building at every commit.
- All in-game copy in **Indonesian**.
- Coordinates: **1 unit = 1 metre**, y up, **north = −z, east = +x**. Heading 0 = facing +z, forward vector = `(sin h, 0, cos h)`; heading of a segment a→b is `Math.atan2(bx − ax, bz − az)`. Left of a forward vector `(fx, fz)` is `(fz, −fx)` (E→N).
- World centre `CENTER = { lat: -7.4177, lon: 109.2362 }` (ruling: shifted north-east of the Alun-alun so SPPG Polresta Banyumas, GOR Satria and Stasiun all fit); `HALF_SIZE = 1700` m → world spans x, z ∈ [−1700, 1700].
- Projection: `x = (lon − lon0) · 111320 · cos(lat0)`, `z = −(lat − lat0) · 110574`; coordinates rounded to 0.1 m in the JSON.
- Road widths by `highway` (after stripping `_link`): motorway/trunk/primary 12, secondary 10, tertiary 8, residential/unclassified 6, service/living_street 4, anything else 6. Skipped: `footway path steps cycleway track pedestrian bridleway corridor proposed construction`.
- Pure modules — must **not** import `three`: `src/world/osm.ts`, `src/world/city.ts`, `src/world/routing.ts`, `src/vehicle/occupancy.ts`, `src/vehicle/collision.ts`, `src/vehicle/carPhysics.ts`, `src/traffic/traffic.ts`, `src/quest/quest.ts`, `src/camera/chaseMath.ts`. (`occupancy.rasterize` uses the DOM canvas but no three.)
- POIs (hardcoded lat/lon, from OSM): `K` SPPG Polresta Banyumas (−7.40394, 109.23185), `1` SDN 1 Bancarkembar (−7.41087, 109.24605), `2` SDN 1 Sokanegara (−7.41809, 109.23318), `3` SDN 1 Kranji (−7.42402, 109.23991), landmarks `A` Alun-alun Purwokerto (−7.42439, 109.23012), `M` Menara Teratai (−7.43145, 109.23260), `S` Stasiun Purwokerto (−7.41946, 109.22184), `G` GOR Satria (−7.41598, 109.25068). Player spawn `SPAWN = { lat: -7.42498, lon: 109.23004 }` (Jl. Jenderal Sudirman in front of the Alun-alun).
- Quest: `STOP_RADIUS = 8`; `roundTime(round, routeLen) = (30 + routeLen / 8) · max(0.6, 1 − 0.1·(round − 1))`.
- Traffic: 30 cars kept within 250 m of the player; respawn when > 350 m away onto a random edge 150–250 m from the player; left-lane offset `w/4`; cruise 8–12 m/s, ×0.7 on `w ≤ 4`.
- HUD `KMH_PER_UNIT = 3.6`. Minimap = 400 × 400 m window centred on the car, north up, 200 px.
- Don't touch: `carPhysics.ts`, `chaseMath.ts`/`chaseCamera.ts`, `post.ts`, `playerCar.ts`, `livery.ts`, `input.ts`.
- Git commits end with the two attribution lines the controller supplies.

**Rulings that deviate from the spec text** (spec remains authority for everything else):
- World box 3.4 km (spec: 2.5 km) and centre moved NE — otherwise SPPG Polresta Banyumas (2.3 km north of the Alun-alun) falls outside.
- Every polyline vertex is a graph node (spec: only shared/end nodes) — degree-2 nodes are harmless for traffic/routing and remove a dedup step.
- Gunung Slamet cone at z = −2600, camera far 5000 (spec: −700 / 1500) — with a ±1700 m map, −700 would be inside the city.
- Label sprites 24 × 4.5 units (were 16 × 3) because 1 unit is now 1 m.

---

## File Structure

```
scripts/fetch-osm.mjs             NEW  Overpass fetch → buildCityData → public/purwokerto.json (Node 24, imports the .ts directly)
public/purwokerto.json            NEW  committed city data (~2–3 MB)
src/world/osm.ts                  NEW  CENTER/HALF_SIZE/project/bbox, widthOf, heightOf, POIS, SPAWN, buildCityData (pure, tested)
src/world/city.ts                 NEW  loadCity → edges/adjacency; edgesFrom, pointOnEdge, nearestEdge (pure, tested)
src/world/routing.ts              NEW  routeField (Dijkstra from a target), pathFrom, routeLength (pure, tested)
src/vehicle/occupancy.ts          NEW  gridFromImage, rasterize (canvas), boxesAround (+ boundary walls) (tested)
src/vehicle/collision.ts          MOD  owns the Box type (was imported from cityMap)
src/render/roads.ts               NEW  ribbonGeometry (pure, tested) + buildRoads(city): sidewalk / asphalt+node discs / dashed markings
src/render/buildings.ts           NEW  buildBuildings(buildings): one merged vertex-coloured extrusion mesh
src/render/landmarks.ts           NEW  labels, Menara Teratai, Gunung Slamet (moved from cityBuilder)
src/render/scene.ts               MOD  camera far 5000, ground plane 8000
src/quest/quest.ts                MOD  Poi type + questPois(city, pois), roundTime(round, routeLen), createQuest(..., routeLen)
src/quest/markers.ts              MOD  Poi import
src/traffic/traffic.ts            REWRITE graph-following traffic with dynamic spawn (pure, tested)
src/traffic/trafficRenderer.ts    MOD  snap instead of lerp after a respawn teleport
src/ui/hud.ts                     MOD  km/h factor, car-centred minimap with route line
src/main.ts                       REWRITE fetch JSON → city → world → loop
src/assets.ts                     MOD  cars pack only (packOf removed)
DELETE src/world/cityMap.ts, cityMap.test.ts, cityBuilder.ts, src/assets.test.ts, public/models/{roads,commercial,suburban}
scripts/fetch-assets.sh           MOD  car kit only
README.md                         MOD  OSM/ODbL credit, data refresh command
```

---

### Task 1: OSM conversion module + fetch script + city data

**Files:**
- Create: `src/world/osm.ts`, `src/world/osm.test.ts`, `scripts/fetch-osm.mjs`, `public/purwokerto.json`
- Modify: `README.md` (Aset section)

**Interfaces:**
- Produces:
  ```ts
  export const CENTER: { lat: number; lon: number };
  export const HALF_SIZE: number;                       // 1700
  export const SPAWN: { lat: number; lon: number };
  export function project(lat: number, lon: number): [number, number]; // [x, z]
  export function bbox(): { south: number; west: number; north: number; east: number };
  export interface CityPoi { id: string; name: string; kind: 'kitchen' | 'school' | 'landmark'; x: number; z: number }
  export interface CityData {
    nodes: [number, number][];
    ways: { n: number[]; w: number; name?: string }[];
    buildings: { p: [number, number][]; h: number }[];
    pois: CityPoi[];
  }
  export function widthOf(highway: string): number | null;   // null = skip this way
  export function heightOf(tags: Record<string, string>, x: number, z: number): number;
  export function buildCityData(elements: OsmElement[]): CityData;
  ```

- [ ] **Step 1: Write the failing tests**

`src/world/osm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CENTER, project, bbox, widthOf, heightOf, buildCityData, type OsmElement } from './osm';

describe('project', () => {
  it('maps the centre to the origin, north to -z, east to +x', () => {
    expect(project(CENTER.lat, CENTER.lon)).toEqual([0, 0]);
    const [x, z] = project(CENTER.lat + 0.001, CENTER.lon + 0.001);
    expect(z).toBeCloseTo(-110.574, 1);
    expect(x).toBeCloseTo(111.32 * Math.cos((CENTER.lat * Math.PI) / 180), 1);
  });
  it('bbox is centred and 3400 m wide', () => {
    const b = bbox();
    expect((b.north + b.south) / 2).toBeCloseTo(CENTER.lat, 6);
    expect((b.north - b.south) * 110574).toBeCloseTo(3400, 0);
  });
});

describe('widthOf / heightOf', () => {
  it('classifies highways and skips footways', () => {
    expect(widthOf('primary')).toBe(12);
    expect(widthOf('primary_link')).toBe(12);
    expect(widthOf('residential')).toBe(6);
    expect(widthOf('service')).toBe(4);
    expect(widthOf('road')).toBe(6);
    expect(widthOf('footway')).toBeNull();
    expect(widthOf('steps')).toBeNull();
  });
  it('uses building:levels, tall tags, else 1-3 floors', () => {
    expect(heightOf({ 'building:levels': '4' }, 0, 0)).toBeCloseTo(12.8);
    const tall = heightOf({ building: 'hotel' }, 5, 5);
    expect(tall).toBeGreaterThanOrEqual(16);
    expect(tall).toBeLessThanOrEqual(25.6);
    const low = heightOf({ building: 'yes' }, 5, 5);
    expect(low).toBeGreaterThanOrEqual(3.2);
    expect(low).toBeLessThanOrEqual(9.6);
    expect(heightOf({ building: 'yes' }, 5, 5)).toBe(low); // deterministic
  });
});

describe('buildCityData', () => {
  const lat = CENTER.lat;
  const lon = CENTER.lon;
  const d = 0.001;
  const elements: OsmElement[] = [
    { type: 'node', id: 1, lat, lon },
    { type: 'node', id: 2, lat, lon: lon + d },
    { type: 'node', id: 3, lat: lat + d, lon: lon + d },
    { type: 'node', id: 4, lat: lat - d, lon: lon - d },
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', name: 'Jalan A' } },
    { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'footway' } },
    { type: 'way', id: 12, nodes: [3, 2], tags: { highway: 'service' } },
    { type: 'way', id: 20, nodes: [1, 2, 4, 1], tags: { building: 'yes' } },
    { type: 'way', id: 21, nodes: [1, 2], tags: { building: 'yes' } }, // not closed → skipped
  ];
  const data = buildCityData(elements);
  it('keeps only drivable ways, sharing node indices', () => {
    expect(data.ways).toHaveLength(2);
    expect(data.ways[0]).toEqual({ n: [0, 1], w: 6, name: 'Jalan A' });
    expect(data.ways[1]).toEqual({ n: [2, 1], w: 4 });
    expect(data.nodes).toHaveLength(3);
    expect(data.nodes[0]).toEqual([0, 0]);
    expect(data.nodes[1][0]).toBeCloseTo(110.4, 0);
  });
  it('emits closed buildings without the repeated last point', () => {
    expect(data.buildings).toHaveLength(1);
    expect(data.buildings[0].p).toHaveLength(3);
    expect(data.buildings[0].h).toBeGreaterThan(0);
  });
  it('projects the hardcoded POIs', () => {
    expect(data.pois.map((p) => p.id)).toEqual(['K', '1', '2', '3', 'A', 'M', 'S', 'G']);
    const k = data.pois[0];
    expect(k.kind).toBe('kitchen');
    expect(k.z).toBeLessThan(-1000); // Polresta is north of centre
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/world/osm.test.ts`
Expected: FAIL — cannot resolve `./osm`.

- [ ] **Step 3: Implement `src/world/osm.ts`**

```ts
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
  return (TALL.has(tags.building) ? 5 + (h % 4) : 1 + (h % 3)) * FLOOR;
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
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/world/osm.test.ts`
Expected: PASS (7 tests). Note: `nodes[1][0]` ≈ 110.4 because `M_PER_DEG_LON` = 111320·cos(−7.4177°) ≈ 110390.

- [ ] **Step 5: Write the fetch script**

`scripts/fetch-osm.mjs`:

```js
#!/usr/bin/env node
// Fetches Purwokerto roads + buildings from Overpass and writes public/purwokerto.json. Needs Node >= 23.6 (type stripping).
import { writeFileSync } from 'node:fs';
import { bbox, buildCityData } from '../src/world/osm.ts';

const { south, west, north, east } = bbox();
const box = `${south},${west},${north},${east}`;
const query = `[out:json][timeout:180];(way["highway"](${box});way["building"](${box}););out body;>;out skel qt;`;
const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) });
if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}`);
const { elements } = await res.json();
const data = buildCityData(elements);
writeFileSync('public/purwokerto.json', JSON.stringify(data));
console.log(`nodes ${data.nodes.length}, ways ${data.ways.length}, buildings ${data.buildings.length}, pois ${data.pois.length}`);
```

- [ ] **Step 6: Generate the data**

Run: `node scripts/fetch-osm.mjs && ls -la public/purwokerto.json`
Expected: prints roughly `nodes 20000–40000, ways 1500–3000, buildings 12000–25000, pois 8`; file 2–5 MB. If Overpass returns 429/504, wait a minute and retry (or swap the host to `https://overpass.kumi.systems/api/interpreter`).

- [ ] **Step 7: README credit**

Append to the `## Aset` section of `README.md`:

```
Data jalan & gedung Purwokerto (`public/purwokerto.json`) © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, lisensi ODbL. Perbarui dengan `node scripts/fetch-osm.mjs`.
```

- [ ] **Step 8: Build, test, commit**

Run: `pnpm build && pnpm test`
Expected: PASS (osm.ts is not yet imported by the app; tsc still checks it).

```bash
git add src/world/osm.ts src/world/osm.test.ts scripts/fetch-osm.mjs public/purwokerto.json README.md
git commit -m "feat: OSM conversion module and Purwokerto city data"
```

---

### Task 2: Road graph (`city.ts`) and routing

**Files:**
- Create: `src/world/city.ts`, `src/world/city.test.ts`, `src/world/routing.ts`, `src/world/routing.test.ts`

**Interfaces:**
- Consumes: `CityData` from Task 1.
- Produces:
  ```ts
  export interface Edge { a: number; b: number; w: number; len: number }
  export interface City { data: CityData; edges: Edge[]; adj: number[][] }   // adj[node] = edge indices touching node
  export function loadCity(data: CityData): City;
  export const edgesFrom: (city: City, node: number) => number[];
  export function pointOnEdge(city: City, edge: number, t: number): { x: number; z: number; heading: number }; // a→b, heading of a→b
  export function nearestEdge(city: City, x: number, z: number): { edge: number; t: number; dist: number };
  export function nearestNode(city: City, x: number, z: number): number;   // nearer endpoint of nearestEdge
  // routing.ts
  export interface RouteField { target: number; dist: Float64Array; prev: Int32Array }
  export function routeField(city: City, target: number): RouteField;      // Dijkstra from target over all nodes
  export function pathFrom(field: RouteField, node: number): number[];     // node ... target ([] if unreachable)
  export function routeLength(city: City, nodes: number[]): number;        // sum of leg lengths; unreachable leg = 0
  ```

- [ ] **Step 1: Write the failing tests**

`src/world/city.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadCity, edgesFrom, pointOnEdge, nearestEdge, nearestNode } from './city';
import type { CityData } from './osm';

// 0 --100-- 1 --100-- 2      node 3 is 100 m south (+z) of node 1
export const tiny: CityData = {
  nodes: [[0, 0], [100, 0], [200, 0], [100, 100]],
  ways: [{ n: [0, 1, 2], w: 6 }, { n: [1, 3], w: 4 }, { n: [3, 3], w: 4 }],
  buildings: [],
  pois: [],
};

describe('loadCity', () => {
  const city = loadCity(tiny);
  it('builds one edge per consecutive node pair, skipping zero-length', () => {
    expect(city.edges).toEqual([
      { a: 0, b: 1, w: 6, len: 100 },
      { a: 1, b: 2, w: 6, len: 100 },
      { a: 1, b: 3, w: 4, len: 100 },
    ]);
    expect(edgesFrom(city, 1)).toEqual([0, 1, 2]);
    expect(edgesFrom(city, 3)).toEqual([2]);
  });
  it('pointOnEdge interpolates a→b with the segment heading', () => {
    expect(pointOnEdge(city, 0, 0.25)).toEqual({ x: 25, z: 0, heading: Math.PI / 2 }); // east
    expect(pointOnEdge(city, 2, 1).heading).toBeCloseTo(0); // south = +z
  });
  it('nearestEdge projects onto the closest segment', () => {
    expect(nearestEdge(city, 150, 10)).toEqual({ edge: 1, t: 0.5, dist: 10 });
    expect(nearestEdge(city, 300, 0)).toEqual({ edge: 1, t: 1, dist: 100 });
    expect(nearestEdge(city, 95, 60).edge).toBe(2);
    expect(nearestNode(city, 160, 3)).toBe(2);
    expect(nearestNode(city, 140, 3)).toBe(1);
  });
});
```

`src/world/routing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadCity } from './city';
import { routeField, pathFrom, routeLength } from './routing';
import type { CityData } from './osm';

// square 0-1-2-3 with a diagonal shortcut 0-2 of length 100 (shorter than 0-1-2 = 200); node 4 isolated
const data: CityData = {
  nodes: [[0, 0], [100, 0], [100, 100], [0, 100], [500, 500]],
  ways: [{ n: [0, 1, 2, 3, 0], w: 6 }, { n: [0, 2], w: 6 }],
  buildings: [],
  pois: [],
};
const city = loadCity(data);
// force the diagonal to 100 m so it beats the two sides
city.edges[4].len = 100;

describe('routing', () => {
  it('finds shortest paths to the target from every node', () => {
    const f = routeField(city, 2);
    expect(f.dist[2]).toBe(0);
    expect(f.dist[0]).toBe(100);
    expect(f.dist[1]).toBe(100);
    expect(f.dist[3]).toBe(100);
    expect(pathFrom(f, 0)).toEqual([0, 2]);
    expect(pathFrom(f, 3)).toEqual([3, 2]);
    expect(pathFrom(f, 4)).toEqual([]);
    expect(f.dist[4]).toBe(Infinity);
  });
  it('sums leg lengths for a multi-stop route', () => {
    expect(routeLength(city, [0, 2, 3])).toBe(200);
    expect(routeLength(city, [0, 4])).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/world`
Expected: FAIL — cannot resolve `./city` / `./routing`.

- [ ] **Step 3: Implement `src/world/city.ts`**

```ts
import type { CityData } from './osm';

export interface Edge { a: number; b: number; w: number; len: number }
export interface City { data: CityData; edges: Edge[]; adj: number[][] }

export function loadCity(data: CityData): City {
  const edges: Edge[] = [];
  const adj: number[][] = data.nodes.map(() => []);
  for (const way of data.ways) {
    for (let i = 0; i + 1 < way.n.length; i++) {
      const a = way.n[i];
      const b = way.n[i + 1];
      const len = Math.hypot(data.nodes[b][0] - data.nodes[a][0], data.nodes[b][1] - data.nodes[a][1]);
      if (len < 0.01) continue;
      const idx = edges.push({ a, b, w: way.w, len }) - 1;
      adj[a].push(idx);
      adj[b].push(idx);
    }
  }
  return { data, edges, adj };
}

export const edgesFrom = (city: City, node: number): number[] => city.adj[node];

export function pointOnEdge(city: City, edge: number, t: number): { x: number; z: number; heading: number } {
  const e = city.edges[edge];
  const [ax, az] = city.data.nodes[e.a];
  const [bx, bz] = city.data.nodes[e.b];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
}

/** Closest edge to (x, z) by point-segment distance. ponytail: linear scan over ~30k edges (~0.3 ms); grid-bucket it if profiling says so. */
export function nearestEdge(city: City, x: number, z: number): { edge: number; t: number; dist: number } {
  let best = { edge: -1, t: 0, dist: Infinity };
  city.edges.forEach((e, i) => {
    const [ax, az] = city.data.nodes[e.a];
    const [bx, bz] = city.data.nodes[e.b];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const dist = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (dist < best.dist) best = { edge: i, t, dist };
  });
  return best;
}

export function nearestNode(city: City, x: number, z: number): number {
  const { edge, t } = nearestEdge(city, x, z);
  const e = city.edges[edge];
  return t < 0.5 ? e.a : e.b;
}
```

- [ ] **Step 4: Implement `src/world/routing.ts`**

```ts
import type { City } from './city';

export interface RouteField { target: number; dist: Float64Array; prev: Int32Array }

/** Binary min-heap of [dist, node]. */
class Heap {
  private h: [number, number][] = [];
  get size() { return this.h.length; }
  push(d: number, n: number) {
    const h = this.h;
    h.push([d, n]);
    for (let i = h.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const h = this.h;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Dijkstra from `target`; the graph is undirected so dist[n] is the length of the shortest n→target route. */
export function routeField(city: City, target: number): RouteField {
  const n = city.data.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new Heap();
  dist[target] = 0;
  heap.push(0, target);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    for (const ei of city.adj[u]) {
      const e = city.edges[ei];
      const v = e.a === u ? e.b : e.a;
      const nd = d + e.len;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(nd, v);
      }
    }
  }
  return { target, dist, prev };
}

export function pathFrom(field: RouteField, node: number): number[] {
  if (field.dist[node] === Infinity) return [];
  const out = [node];
  for (let u = node; u !== field.target; ) {
    u = field.prev[u];
    out.push(u);
  }
  return out;
}

export function routeLength(city: City, nodes: number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const d = routeField(city, nodes[i + 1]).dist[nodes[i]];
    if (d !== Infinity) total += d;
  }
  return total;
}
```

- [ ] **Step 5: Run tests, build, commit**

Run: `pnpm test && pnpm build`
Expected: PASS.

```bash
git add src/world/city.ts src/world/city.test.ts src/world/routing.ts src/world/routing.test.ts
git commit -m "feat: road graph with nearest-edge lookup and Dijkstra route field"
```

---

### Task 3: Building occupancy grid for collision

**Files:**
- Create: `src/vehicle/occupancy.ts`, `src/vehicle/occupancy.test.ts`
- Modify: `src/vehicle/collision.ts:1-4` (own the `Box` type)

**Interfaces:**
- Consumes: `CityData['buildings']`, `HALF_SIZE` from Task 1; `Box` from `collision.ts`.
- Produces:
  ```ts
  export interface Occupancy { size: number; origin: number; cells: Uint8Array } // cell (i, j) covers x ∈ [origin+i, origin+i+1), z ∈ [origin+j, origin+j+1)
  export function gridFromImage(rgba: Uint8ClampedArray, size: number, origin: number): Occupancy; // alpha > 0 → 1
  export function rasterize(buildings: { p: [number, number][] }[], size?: number, origin?: number): Occupancy; // DOM canvas
  export function boxesAround(o: Occupancy, x: number, z: number, r?: number): Box[]; // occupied cells within r + 4 boundary walls
  ```

- [ ] **Step 1: Move `Box` into collision.ts**

In `src/vehicle/collision.ts` replace `import type { Box } from '../world/cityMap';` with:

```ts
export interface Box { minX: number; maxX: number; minZ: number; maxZ: number }
```

(`cityMap.ts` keeps its own structurally identical `Box` until it is deleted in Task 6.)

- [ ] **Step 2: Write the failing tests**

`src/vehicle/occupancy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gridFromImage, boxesAround } from './occupancy';

// 4x4 grid, origin -2: only cell (2,1) (x∈[0,1), z∈[-1,0)) is filled
const rgba = new Uint8ClampedArray(4 * 4 * 4);
rgba[(1 * 4 + 2) * 4 + 3] = 255;
const occ = gridFromImage(rgba, 4, -2);

describe('occupancy', () => {
  it('reads alpha into cells', () => {
    expect(occ.cells[1 * 4 + 2]).toBe(1);
    expect(Array.from(occ.cells).reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('returns the filled cell as a 1x1 box when in range, plus 4 walls', () => {
    const boxes = boxesAround(occ, 0.5, -0.5, 1);
    expect(boxes).toContainEqual({ minX: 0, maxX: 1, minZ: -1, maxZ: 0 });
    expect(boxes).toHaveLength(5);
    expect(boxesAround(occ, 1.5, 1.5, 0.4)).toHaveLength(4); // walls only
  });
  it('walls sit just outside the grid', () => {
    const walls = boxesAround(occ, 100, 100, 1);
    expect(walls).toContainEqual({ minX: 2, maxX: 52, minZ: -52, maxZ: 52 });   // east
    expect(walls).toContainEqual({ minX: -52, maxX: -2, minZ: -52, maxZ: 52 }); // west
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/vehicle/occupancy.test.ts`
Expected: FAIL — cannot resolve `./occupancy`.

- [ ] **Step 4: Implement `src/vehicle/occupancy.ts`**

```ts
import { HALF_SIZE } from '../world/osm';
import type { Box } from './collision';

export interface Occupancy { size: number; origin: number; cells: Uint8Array }
const WALL = 50;

export function gridFromImage(rgba: Uint8ClampedArray, size: number, origin: number): Occupancy {
  const cells = new Uint8Array(size * size);
  for (let i = 0; i < cells.length; i++) cells[i] = rgba[i * 4 + 3] > 0 ? 1 : 0;
  return { size, origin, cells };
}

/** Rasterises building footprints at 1 m/cell by filling them on an offscreen canvas (canvas x = world x, canvas y = world z). */
export function rasterize(buildings: { p: [number, number][] }[], size = HALF_SIZE * 2, origin = -HALF_SIZE): Occupancy {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.translate(-origin, -origin);
  g.fillStyle = '#000';
  for (const b of buildings) {
    g.beginPath();
    b.p.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.closePath();
    g.fill();
  }
  return gridFromImage(g.getImageData(0, 0, size, size).data, size, origin);
}

/** 1x1 boxes for occupied cells within r of (x, z), plus four walls hemming in the whole grid. */
export function boxesAround(o: Occupancy, x: number, z: number, r = 3): Box[] {
  const lo = o.origin;
  const hi = o.origin + o.size;
  const out: Box[] = [
    { minX: hi, maxX: hi + WALL, minZ: lo - WALL, maxZ: hi + WALL },
    { minX: lo - WALL, maxX: lo, minZ: lo - WALL, maxZ: hi + WALL },
    { minX: lo - WALL, maxX: hi + WALL, minZ: hi, maxZ: hi + WALL },
    { minX: lo - WALL, maxX: hi + WALL, minZ: lo - WALL, maxZ: lo },
  ];
  const i0 = Math.max(0, Math.floor(x - r - lo));
  const i1 = Math.min(o.size - 1, Math.floor(x + r - lo));
  const j0 = Math.max(0, Math.floor(z - r - lo));
  const j1 = Math.min(o.size - 1, Math.floor(z + r - lo));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (o.cells[j * o.size + i]) out.push({ minX: lo + i, maxX: lo + i + 1, minZ: lo + j, maxZ: lo + j + 1 });
    }
  }
  return out;
}
```

- [ ] **Step 5: Widen the early-out in `resolveCar`**

`resolveCar` in `src/vehicle/collision.ts` skips boxes whose centre is > 10 m away; the boundary walls are 50 m thick so their centres sit 25 m outside the map. Change the early-out to 30 m:

```ts
      if (Math.abs((b.minX + b.maxX) / 2 - c.x) > 30 || Math.abs((b.minZ + b.maxZ) / 2 - c.z) > 30) continue;
```

- [ ] **Step 6: Run tests, build, commit**

Run: `pnpm test && pnpm build`
Expected: PASS (collision.test.ts uses small boxes, unaffected).

```bash
git add src/vehicle/occupancy.ts src/vehicle/occupancy.test.ts src/vehicle/collision.ts
git commit -m "feat: building occupancy grid feeding circle-vs-box collision"
```

---

### Task 4: Road ribbons

**Files:**
- Create: `src/render/roads.ts`, `src/render/roads.test.ts`

**Interfaces:**
- Consumes: `City`, `Edge` from Task 2.
- Produces:
  ```ts
  export function ribbon(pts: [number, number][], width: number, y: number): { positions: number[]; indices: number[] }; // pure
  export function disc(x: number, z: number, r: number, y: number, segments?: number): { positions: number[]; indices: number[] };
  export function buildRoads(city: City): THREE.Group; // 3 meshes: sidewalk, asphalt, markings
  ```

- [ ] **Step 1: Write the failing tests**

`src/render/roads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ribbon, disc } from './roads';

const xz = (p: number[]) => Array.from({ length: p.length / 3 }, (_, i) => [p[i * 3], p[i * 3 + 2]]);

describe('ribbon', () => {
  it('offsets a straight segment by ±width/2 with upward-facing quads', () => {
    const r = ribbon([[0, 0], [10, 0]], 2, 0.5);
    expect(xz(r.positions)).toEqual([[0, 1], [0, -1], [10, 1], [10, -1]]);
    expect(r.positions[1]).toBe(0.5);
    expect(r.indices).toEqual([0, 2, 1, 1, 2, 3]);
  });
  it('miters the corner of a right-angle bend', () => {
    const r = ribbon([[0, 0], [10, 0], [10, 10]], 2, 0);
    const p = xz(r.positions);
    expect(p[2][0]).toBeCloseTo(9); expect(p[2][1]).toBeCloseTo(1);
    expect(p[3][0]).toBeCloseTo(11); expect(p[3][1]).toBeCloseTo(-1);
    expect(r.indices).toHaveLength(12);
  });
  it('drops repeated points and degenerate polylines', () => {
    expect(ribbon([[0, 0], [0, 0], [5, 0]], 2, 0).positions).toHaveLength(12);
    expect(ribbon([[3, 3]], 2, 0).indices).toEqual([]);
  });
});

describe('disc', () => {
  it('is a fan around the centre', () => {
    const d = disc(5, 5, 2, 0.1, 8);
    expect(d.positions).toHaveLength(9 * 3);
    expect(d.indices).toHaveLength(8 * 3);
    expect(d.positions.slice(0, 3)).toEqual([5, 0.1, 5]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/render/roads.test.ts`
Expected: FAIL — cannot resolve `./roads`.

- [ ] **Step 3: Implement `src/render/roads.ts`**

```ts
import * as THREE from 'three';
import type { City } from '../world/city';

const SIDEWALK_EXTRA = 2.4;
const DASH = 3;
const MARK_W = 0.15;
const Y = { sidewalk: 0.02, asphalt: 0.04, marking: 0.06 };

type Geo = { positions: number[]; indices: number[] };

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
    const ox = mx * scale * (width / 2);
    const oz = mz * scale * (width / 2);
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

function merge(parts: Geo[]): THREE.BufferGeometry {
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
function dashes(pts: [number, number][], margin: number, y: number): Geo[] {
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
```

- [ ] **Step 4: Run tests, build, commit**

Run: `pnpm test && pnpm build`
Expected: PASS.

```bash
git add src/render/roads.ts src/render/roads.test.ts
git commit -m "feat: mitered road ribbons with node discs and dashed centre lines"
```

---

### Task 5: Buildings and landmarks renderers

**Files:**
- Create: `src/render/buildings.ts`, `src/render/landmarks.ts`

**Interfaces:**
- Consumes: `CityData['buildings']`, `CityPoi` from Task 1.
- Produces:
  ```ts
  export function buildBuildings(buildings: CityData['buildings']): THREE.Mesh;   // one merged mesh, vertex colours
  export function buildLandmarks(pois: CityPoi[]): THREE.Group;                   // labels for every poi, tower at 'M', Gunung Slamet
  ```

- [ ] **Step 1: Implement `src/render/buildings.ts`**

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityData } from '../world/osm';

const PALETTE = [0xf2e9dc, 0xe8d8c3, 0xd9e4ec, 0xe6e6e6, 0xf5e6c8, 0xdfe8d5].map((c) => new THREE.Color(c));

/** Every footprint extruded to its height; vertex-coloured and merged into one draw call. */
export function buildBuildings(buildings: CityData['buildings']): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  buildings.forEach((b, i) => {
    if (b.p.length < 3) return;
    // ExtrudeGeometry extrudes along local +z; rotateX(-90°) maps local (x, y, z) → world (x, z, −y), so shape y = −world z
    const shape = new THREE.Shape(b.p.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const n = geo.attributes.position.count;
    const color = PALETTE[i % PALETTE.length];
    const colors = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) color.toArray(colors, k * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.deleteAttribute('uv');
    geos.push(geo);
  });
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
```

- [ ] **Step 2: Implement `src/render/landmarks.ts`** (moved from `cityBuilder.ts`, positions now from POIs)

```ts
import * as THREE from 'three';
import type { CityPoi } from '../world/osm';

const WHITE = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,20,40,0.75)';
  g.roundRect(8, 8, 1008, 176, 40);
  g.fill();
  g.font = 'bold 96px system-ui, sans-serif';
  const w = g.measureText(text).width;
  if (w > 940) g.font = `bold ${Math.floor((96 * 940) / w)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  s.scale.set(24, 4.5, 1);
  return s;
}

/** Lotus tower: slim stem, viewing deck, bulb. ~30 m tall so it reads as the city's landmark from anywhere. */
function menaraTeratai(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 26, 12), WHITE);
  stem.position.y = 13;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.6, 16), WHITE);
  deck.position.y = 25;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), WHITE);
  bulb.position.y = 28.5;
  g.add(stem, deck, bulb);
  g.traverse((o) => { o.castShadow = true; });
  g.position.set(x, 0, z);
  return g;
}

/** Gunung Slamet silhouette beyond the north edge of the map; fog off so it stays a hazy blue shape. */
function gunungSlamet(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(900, 300, 9),
    new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 1, flatShading: true, fog: false }),
  );
  m.position.set(0, 150, -2600);
  return m;
}

export function buildLandmarks(pois: CityPoi[]): THREE.Group {
  const g = new THREE.Group();
  for (const p of pois) {
    const label = makeLabel(p.name);
    label.position.set(p.x, p.id === 'M' ? 36 : 14, p.z);
    g.add(label);
    if (p.id === 'M') g.add(menaraTeratai(p.x, p.z));
  }
  g.add(gunungSlamet());
  return g;
}
```

- [ ] **Step 3: Build, test, commit**

Run: `pnpm build && pnpm test`
Expected: PASS (tsc type-checks the new files; nothing imports them yet).

```bash
git add src/render/buildings.ts src/render/landmarks.ts
git commit -m "feat: merged OSM building extrusions and landmark renderer"
```

---

### Task 6: Switch the game over to the OSM world (no traffic yet)

**Files:**
- Modify: `src/quest/quest.ts`, `src/quest/quest.test.ts`, `src/quest/markers.ts:2`, `src/ui/hud.ts`, `src/render/scene.ts:25,52`, `src/assets.ts`, `src/main.ts` (rewrite), `scripts/fetch-assets.sh`, `README.md`
- Delete: `src/world/cityMap.ts`, `src/world/cityMap.test.ts`, `src/world/cityBuilder.ts`, `src/assets.test.ts`, `public/models/roads/`, `public/models/commercial/`, `public/models/suburban/`
- Temporarily removed from `main.ts`: traffic (restored in Task 7).

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces:
  ```ts
  // quest.ts
  export interface Poi { id: string; name: string; kind: 'kitchen' | 'school' | 'landmark'; x: number; z: number; stop: { x: number; z: number; node: number } }
  export function questPois(city: City, pois: CityPoi[]): Poi[];
  export const roundTime: (round: number, routeLen?: number) => number;
  export function createQuest(kitchen: Poi, schools: Poi[], round?: number, routeLen?: number): Quest;
  // hud.ts
  export function createHud(city: City): { update(quest: Quest, car: CarState): void };
  ```

- [ ] **Step 1: Update the quest tests**

In `src/quest/quest.test.ts` replace the `poi` helper and the `roundTime` test:

```ts
const poi = (id: string, name: string, kind: Poi['kind'], x: number): Poi => ({
  id, name, kind, x, z: 0, stop: { x, z: 0, node: 0 },
});
```

```ts
  it('round time scales with route length and shrinks per round', () => {
    expect(roundTime(1)).toBe(30);
    expect(roundTime(1, 800)).toBe(130);
    expect(roundTime(3, 800)).toBeCloseTo(104);
    expect(roundTime(9, 800)).toBeCloseTo(78);
    const q = stepQuest(createQuest(kitchen, schools), stopped(2), 0.1);
    expect(q.toastTtl).toBeGreaterThan(0);
    expect(stepQuest(q, away, 5).toastTtl).toBe(0);
  });
```

Add to the same file a `questPois` test (import `loadCity` from `../world/city` and `questPois` from `./quest`):

```ts
describe('questPois', () => {
  it('snaps each POI to the nearest road edge and records its nearer node', () => {
    const city = loadCity({ nodes: [[0, 0], [100, 0]], ways: [{ n: [0, 1], w: 6 }], buildings: [], pois: [] });
    const [p] = questPois(city, [{ id: 'K', name: 'Dapur', kind: 'kitchen', x: 75, z: 15 }]);
    expect(p.stop).toEqual({ x: 75, z: 0, node: 1 }); // 100 * 0.75 is exact in floating point
    expect(p.name).toBe('Dapur');
  });
});
```

Run: `pnpm test src/quest` → FAIL (Poi shape / roundTime / questPois missing).

- [ ] **Step 2: Update `src/quest/quest.ts`**

Replace the import and the top constants/`roundTime`, add `Poi` + `questPois`, thread `routeLen` through `createQuest`:

```ts
import { nearestEdge, pointOnEdge, type City } from '../world/city';
import type { CityPoi } from '../world/osm';

export const STOP_RADIUS = 8;
export const STOP_SPEED = 1.5;
const SCHOOL_SCORE = 100;
const TOAST_SECONDS = 3;
const AVG_SPEED = 8; // m/s, incl. corners and traffic

export interface Poi extends CityPoi { stop: { x: number; z: number; node: number } }

/** Snaps POIs onto the road: the stop is the projection onto the nearest edge; node = nearer endpoint (for routing). */
export function questPois(city: City, pois: CityPoi[]): Poi[] {
  return pois.map((p) => {
    const { edge, t } = nearestEdge(city, p.x, p.z);
    const { x, z } = pointOnEdge(city, edge, t);
    const e = city.edges[edge];
    return { ...p, stop: { x, z, node: t < 0.5 ? e.a : e.b } };
  });
}

export const roundTime = (round: number, routeLen = 0) => (30 + routeLen / AVG_SPEED) * Math.max(0.6, 1 - 0.1 * (round - 1));
```

and

```ts
export function createQuest(kitchen: Poi, schools: Poi[], round = 1, routeLen = 0): Quest {
  return { phase: 'toKitchen', round, kitchen, schools, next: 0, timeLeft: roundTime(round, routeLen), score: 0, toast: '', toastTtl: 0 };
}
```

Everything else in quest.ts (Quest interface, questTarget, questText, stepQuest) stays.

Run: `pnpm test src/quest` → PASS.

- [ ] **Step 3: markers.ts import**

`src/quest/markers.ts` line 2: `import type { Poi } from './quest';` (remove the cityMap import). Also scale the ring to the new radius: it already uses `STOP_RADIUS * 0.7` — leave.

- [ ] **Step 4: Rewrite the minimap in `src/ui/hud.ts`**

Replace the whole file:

```ts
import type { CarState } from '../vehicle/carPhysics';
import { questText, questTarget, type Quest } from '../quest/quest';
import { nearestNode, type City } from '../world/city';
import { routeField, pathFrom, type RouteField } from '../world/routing';

const KMH_PER_UNIT = 3.6; // 1 unit = 1 m
const MAP_PX = 200;
const MAP_M = 400; // window width in metres

export function createHud(city: City) {
  const root = document.getElementById('hud')!;
  root.innerHTML = `
    <style>
      #hud .box { position: absolute; background: rgba(8,12,24,.55); border-radius: 12px; padding: 10px 14px; backdrop-filter: blur(4px); }
      #q { top: 16px; left: 16px; max-width: 420px; font-size: 18px; font-weight: 600; }
      #q small { display: block; font-weight: 400; opacity: .85; margin-top: 4px; }
      #speed { bottom: 16px; left: 16px; font-size: 34px; font-weight: 800; }
      #speed span { font-size: 14px; font-weight: 400; margin-left: 4px; }
      #toast { top: 18%; left: 50%; transform: translateX(-50%); font-size: 26px; font-weight: 700; color: #ffe066; transition: opacity .3s; }
      #help { bottom: 16px; right: 16px; font-size: 13px; opacity: .8; }
      #map { position: absolute; top: 16px; right: 16px; border-radius: 12px; background: rgba(8,12,24,.55); }
    </style>
    <div id="q" class="box"></div>
    <div id="speed" class="box"></div>
    <div id="toast" class="box"></div>
    <div id="help" class="box">WASD / panah · Spasi rem · R ulang</div>
    <canvas id="map" width="${MAP_PX}" height="${MAP_PX}"></canvas>`;
  const q = root.querySelector<HTMLElement>('#q')!;
  const speed = root.querySelector<HTMLElement>('#speed')!;
  const toast = root.querySelector<HTMLElement>('#toast')!;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const mg = root.querySelector<HTMLCanvasElement>('#map')!.getContext('2d')!;
  const SCALE = MAP_PX / MAP_M;
  const { nodes, ways } = city.data;
  let field: RouteField | null = null;

  return {
    update(quest: Quest, car: CarState) {
      const timer = quest.phase === 'delivering' ? ` · ⏱ ${fmt(quest.timeLeft)}` : '';
      q.innerHTML = `${questText(quest)}<small>Ronde ${quest.round} · Skor ${quest.score}${timer}</small>`;
      speed.innerHTML = `${Math.round(Math.abs(car.speed) * KMH_PER_UNIT)}<span>km/j</span>`;
      toast.textContent = quest.toast;
      toast.style.opacity = quest.toastTtl > 0 ? '1' : '0';

      mg.clearRect(0, 0, MAP_PX, MAP_PX);
      mg.save();
      mg.translate(MAP_PX / 2, MAP_PX / 2);
      mg.scale(SCALE, SCALE);
      mg.translate(-car.x, -car.z);
      mg.lineCap = 'round';
      mg.lineJoin = 'round';
      mg.strokeStyle = '#9aa5a0';
      for (const w of ways) {
        // ponytail: draws every way each frame (~2k polylines, ~1 ms); cull by bbox if the minimap ever shows in a profile
        mg.lineWidth = w.w;
        mg.beginPath();
        w.n.forEach((n, i) => (i ? mg.lineTo(nodes[n][0], nodes[n][1]) : mg.moveTo(nodes[n][0], nodes[n][1])));
        mg.stroke();
      }
      const target = questTarget(quest);
      if (target) {
        if (field?.target !== target.stop.node) field = routeField(city, target.stop.node);
        const path = pathFrom(field, nearestNode(city, car.x, car.z));
        mg.strokeStyle = '#ffd43b';
        mg.lineWidth = 5;
        mg.beginPath();
        mg.moveTo(car.x, car.z);
        for (const n of path) mg.lineTo(nodes[n][0], nodes[n][1]);
        mg.lineTo(target.stop.x, target.stop.z);
        mg.stroke();
        mg.fillStyle = '#ffd43b';
        mg.beginPath();
        mg.arc(target.stop.x, target.stop.z, 10, 0, Math.PI * 2);
        mg.fill();
      }
      mg.restore();
      mg.save();
      mg.translate(MAP_PX / 2, MAP_PX / 2);
      mg.rotate(-car.heading); // canvas y-down flips the rotation direction
      mg.fillStyle = '#4dabf7';
      mg.beginPath();
      mg.moveTo(0, 6);
      mg.lineTo(-4, -4);
      mg.lineTo(4, -4);
      mg.closePath();
      mg.fill();
      mg.restore();
    },
  };
}
```

- [ ] **Step 5: scene.ts** — camera far and ground size

`src/render/scene.ts`: `new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 5000)` and `new THREE.PlaneGeometry(8000, 8000)`.

- [ ] **Step 6: assets.ts** — cars only

Replace `src/assets.ts` with:

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

/** Loads /models/cars/<name>.glb once; every call returns a fresh clone (geometry/materials shared). */
export async function loadModel(name: string): Promise<THREE.Group> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`/models/cars/${name}.glb`).then((gltf) => {
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        return gltf.scene;
      }),
    );
  }
  return (await cache.get(name)!).clone();
}
```

Delete `src/assets.test.ts`.

- [ ] **Step 7: Rewrite `src/main.ts`** (traffic comes back in Task 7)

```ts
import * as THREE from 'three';
import { createScene } from './render/scene';
import { createPost } from './render/post';
import { buildRoads } from './render/roads';
import { buildBuildings } from './render/buildings';
import { buildLandmarks } from './render/landmarks';
import { loadCity, nearestEdge, pointOnEdge } from './world/city';
import { project, SPAWN, type CityData } from './world/osm';
import { routeLength } from './world/routing';
import { rasterize, boxesAround } from './vehicle/occupancy';
import { stepCar, type CarState } from './vehicle/carPhysics';
import { resolveCar } from './vehicle/collision';
import { createPlayerCar } from './vehicle/playerCar';
import { readCarInput, consumeKey } from './input';
import { createChaseCamera } from './camera/chaseCamera';
import { createQuest, stepQuest, questTarget, questPois, type Quest } from './quest/quest';
import { createHud } from './ui/hud';
import { createMarkers } from './quest/markers';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const post = createPost(ctx);
const data: CityData = await (await fetch('/purwokerto.json')).json();
const city = loadCity(data);
ctx.scene.add(buildRoads(city), buildBuildings(data.buildings), buildLandmarks(data.pois));
const occupancy = rasterize(data.buildings);
const player = await createPlayerCar(ctx.scene);
const chase = createChaseCamera(ctx);

const pois = questPois(city, data.pois);
const kitchen = pois.find((p) => p.kind === 'kitchen')!;
const schools = pois.filter((p) => p.kind === 'school');
const routeLen = routeLength(city, [kitchen, ...schools].map((p) => p.stop.node));
const [sx, sz] = project(SPAWN.lat, SPAWN.lon);
const spawnEdge = nearestEdge(city, sx, sz);
const spawn = pointOnEdge(city, spawnEdge.edge, spawnEdge.t);
const resetCar = (): CarState => ({ x: spawn.x, z: spawn.z, heading: spawn.heading, speed: 0 });
let car = resetCar();
let quest: Quest = createQuest(kitchen, schools, 1, routeLen);
const hud = createHud(city);
const markers = createMarkers(ctx.scene);
document.getElementById('loading')!.remove();

const clock = new THREE.Clock();
ctx.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const input = readCarInput();
  car = stepCar(car, input, dt);
  car = resolveCar(car, boxesAround(occupancy, car.x, car.z), []);
  player.sync(car, input, dt);
  quest = stepQuest(quest, car, dt);
  if (consumeKey('KeyR') && (quest.phase === 'done' || quest.phase === 'failed')) {
    quest = createQuest(kitchen, schools, quest.phase === 'done' ? quest.round + 1 : 1, routeLen);
    car = resetCar();
    chase.reset();
  }
  markers.update(questTarget(quest), car, clock.elapsedTime);
  hud.update(quest, car);
  chase.update(car, dt);
  post.render();
});
```

- [ ] **Step 8: Delete the grid world and unused Kenney packs**

```bash
git rm -q src/world/cityMap.ts src/world/cityMap.test.ts src/world/cityBuilder.ts src/assets.test.ts
git rm -q src/traffic/traffic.ts src/traffic/traffic.test.ts   # grid traffic; rewritten for the graph in Task 7
git rm -rq public/models/roads public/models/commercial public/models/suburban
```

`src/traffic/trafficRenderer.ts` only needs the `TrafficCar` type; until Task 7 restores the real module, replace its `import type { TrafficCar } from './traffic';` with a local stand-in so it compiles:

```ts
type TrafficCar = { x: number; z: number; heading: number; speed: number; model: string };
```

In `scripts/fetch-assets.sh` delete the `roads`, `commercial`, `suburban` lines from the download heredoc and the three `copy roads …`, `copy commercial …`, `copy suburban …` lines, keeping `cars`. In `README.md` change the Kenney line to: `Model mobil dari [Kenney](https://kenney.nl) Car Kit (CC0). Ambil ulang dengan \`scripts/fetch-assets.sh\`.`

- [ ] **Step 9: Build, test, run**

Run: `pnpm build && pnpm test`
Expected: PASS (tsc confirms nothing still imports `cityMap`).

Run: `pnpm dev`, open the game. Expected: white truck on Jl. Jenderal Sudirman facing along the road, Alun-alun label nearby, grey ribbons with dashed lines, pastel extruded buildings, labels over POIs, mountain to the north; HUD "Ambil paket MBG di SPPG Polresta Banyumas"; minimap shows local streets with a yellow route line; driving into a building stops the truck; driving to the SPPG stop starts the timer (expect ~5–8 minutes for round 1).

- [ ] **Step 10: Commit**

```bash
git add -A src scripts/fetch-assets.sh README.md
git commit -m "feat: switch the world to OSM Purwokerto roads, buildings, routing minimap"
```

---

### Task 7: Graph-following traffic with dynamic spawn

**Files:**
- Create: `src/traffic/traffic.ts`, `src/traffic/traffic.test.ts`
- Modify: `src/traffic/trafficRenderer.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `City`, `edgesFrom`, `pointOnEdge` from Task 2; `Circle` from collision.
- Produces:
  ```ts
  export interface TrafficCar { edge: number; dir: 1 | -1; t: number; speed: number; cruise: number; model: string; x: number; z: number; heading: number; stuck: number }
  export const TRAFFIC_RADIUS: number; // 1.4
  export function spawnTraffic(city: City, count: number, rng: () => number, near: { x: number; z: number }): TrafficCar[];
  export function stepTraffic(city: City, cars: TrafficCar[], obstacles: { x: number; z: number }[], dt: number, rng: () => number, player: { x: number; z: number }): void;
  export const trafficCircles: (cars: TrafficCar[]) => Circle[];
  ```

- [ ] **Step 1: Write the failing tests**

`src/traffic/traffic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadCity, pointOnEdge } from '../world/city';
import { spawnTraffic, stepTraffic, trafficCircles, TRAFFIC_RADIUS, type TrafficCar } from './traffic';

// 0 --100-- 1 --100-- 2 ; 1 --100-- 3 (south). Node 2 and 3 are dead ends.
const city = loadCity({
  nodes: [[0, 0], [100, 0], [200, 0], [100, 100]],
  ways: [{ n: [0, 1, 2], w: 6 }, { n: [1, 3], w: 4 }],
  buildings: [],
  pois: [],
});
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const car = (edge: number, dir: 1 | -1, t: number, speed = 10): TrafficCar =>
  ({ edge, dir, t, speed, cruise: 10, model: 'sedan', x: 0, z: 0, heading: 0, stuck: 0 });
const far = { x: 50, z: 0 }; // player reference that never triggers a respawn in these tests

describe('traffic', () => {
  it('moves along the edge in the left lane', () => {
    const c = car(0, 1, 0);
    stepTraffic(city, [c], [], 1, seq(0), far);
    expect(c.x).toBeCloseTo(10);
    expect(c.z).toBeCloseTo(-1.5); // left of eastbound = north = -z, offset w/4
    expect(c.heading).toBeCloseTo(Math.PI / 2);
  });
  it('turns onto a random exit at a node, never straight back', () => {
    const c = car(0, 1, 0.95);
    stepTraffic(city, [c], [], 1, seq(0.99), far); // rng picks the last exit
    expect(c.edge).toBe(2);
    expect(c.dir).toBe(1);
    expect(c.t).toBeCloseTo(0.05, 1);
  });
  it('u-turns at a dead end', () => {
    const c = car(1, 1, 0.95);
    stepTraffic(city, [c], [], 1, seq(0), far);
    expect(c.edge).toBe(1);
    expect(c.dir).toBe(-1);
    expect(c.t).toBeCloseTo(0.05, 1);
  });
  it('brakes behind an obstacle ahead and pushes through after 3 s', () => {
    const c = car(0, 1, 0.1);
    stepTraffic(city, [c], [{ x: 15, z: -1.5 }], 0.5, seq(0), far);
    expect(c.speed).toBeLessThan(10);
    for (let i = 0; i < 8; i++) stepTraffic(city, [c], [{ x: 15, z: -1.5 }], 0.5, seq(0), far);
    expect(c.speed).toBeGreaterThan(0);
  });
  it('drives slower on narrow roads', () => {
    const c = car(2, 1, 0, 0);
    for (let i = 0; i < 20; i++) stepTraffic(city, [c], [], 0.5, seq(0), far);
    expect(c.speed).toBeCloseTo(7);
  });
  it('spawns on edges whose midpoint is in range and respawns cars that fall behind', () => {
    const cars = spawnTraffic(city, 3, seq(0.1, 0.5, 0.9), { x: 0, z: 0 });
    expect(cars).toHaveLength(3);
    for (const c of cars) {
      const mid = pointOnEdge(city, c.edge, 0.5);
      expect(Math.hypot(mid.x, mid.z)).toBeGreaterThanOrEqual(20);
      expect(c.speed).toBe(0);
    }
    const c = car(0, 1, 0);
    stepTraffic(city, [c], [], 0.01, seq(0.5), { x: 2000, z: 2000 }); // > 350 m away → respawn; rng 0.5 always picks edge 1
    expect(c.edge).toBe(1);
    expect(c.dir).toBe(-1);
    expect(c.t).toBe(0.5);
    expect(c.speed).toBe(0);
  });
  it('exposes collision circles', () => {
    expect(trafficCircles([car(0, 1, 0)])[0].r).toBe(TRAFFIC_RADIUS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/traffic`
Expected: FAIL — cannot resolve `./traffic`.

- [ ] **Step 3: Implement `src/traffic/traffic.ts`**

```ts
import { edgesFrom, pointOnEdge, type City } from '../world/city';
import type { Circle } from '../vehicle/collision';

export const TRAFFIC_RADIUS = 1.4;
const MODELS = ['sedan', 'suv', 'taxi', 'van', 'hatchback-sports', 'truck'];
const LOOK_AHEAD = 10;
const LOOK_WIDTH = 2.5;
const ACCEL = 6;
const STUCK_SECONDS = 3;
const NARROW = 4;
export const KEEP_RADIUS = 250;
const RESPAWN_RADIUS = 350;
const SPAWN_MIN = 150;
const SPAWN_AVOID = 20;

export interface TrafficCar {
  edge: number;
  dir: 1 | -1; // 1 = a→b
  t: number; // 0..1 along dir
  speed: number;
  cruise: number;
  model: string;
  x: number;
  z: number;
  heading: number;
  stuck: number;
}

function placeCar(city: City, c: TrafficCar) {
  const p = pointOnEdge(city, c.edge, c.dir === 1 ? c.t : 1 - c.t);
  const heading = c.dir === 1 ? p.heading : p.heading + Math.PI;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const lane = city.edges[c.edge].w / 4; // left-hand traffic: left of forward is (fz, -fx)
  c.x = p.x + fz * lane;
  c.z = p.z - fx * lane;
  c.heading = heading;
}

/** Random edge whose midpoint is minR..maxR from `near` (falls back to the closest candidate after 50 tries). */
function pickEdge(city: City, rng: () => number, near: { x: number; z: number }, minR: number, maxR: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 50; i++) {
    const ei = Math.floor(rng() * city.edges.length);
    const p = pointOnEdge(city, ei, 0.5);
    const d = Math.hypot(p.x - near.x, p.z - near.z);
    if (d >= minR && d <= maxR) return ei;
    const score = d < minR ? minR - d : d - maxR;
    if (score < bestScore) { bestScore = score; best = ei; }
  }
  return best;
}

function respawn(city: City, c: TrafficCar, rng: () => number, near: { x: number; z: number }, minR: number, maxR: number) {
  c.edge = pickEdge(city, rng, near, minR, maxR);
  c.dir = rng() < 0.5 ? 1 : -1;
  c.t = rng();
  c.speed = 0;
  c.stuck = 0;
  placeCar(city, c);
}

export function spawnTraffic(city: City, count: number, rng: () => number, near: { x: number; z: number }): TrafficCar[] {
  return Array.from({ length: count }, () => {
    const c: TrafficCar = {
      edge: 0, dir: 1, t: 0, speed: 0, cruise: 8 + 4 * rng(), model: MODELS[Math.floor(rng() * MODELS.length)],
      x: 0, z: 0, heading: 0, stuck: 0,
    };
    respawn(city, c, rng, near, SPAWN_AVOID, KEEP_RADIUS);
    return c;
  });
}

const blockedBy = (c: TrafficCar, o: { x: number; z: number }) => {
  const rx = o.x - c.x;
  const rz = o.z - c.z;
  const fx = Math.sin(c.heading);
  const fz = Math.cos(c.heading);
  const along = rx * fx + rz * fz;
  const across = Math.abs(rx * fz - rz * fx);
  return along > 0.5 && along < LOOK_AHEAD && across < LOOK_WIDTH;
};

/** Moves every car along the road graph; cars queue behind obstacles/each other; far cars respawn near the player. Mutates `cars`. */
export function stepTraffic(city: City, cars: TrafficCar[], obstacles: { x: number; z: number }[], dt: number, rng: () => number, player: { x: number; z: number }): void {
  for (const c of cars) {
    placeCar(city, c);
    if (Math.hypot(c.x - player.x, c.z - player.z) > RESPAWN_RADIUS) {
      respawn(city, c, rng, player, SPAWN_MIN, KEEP_RADIUS);
      continue;
    }
    const blocked = obstacles.some((o) => blockedBy(c, o)) || cars.some((o) => o !== c && blockedBy(c, o));
    c.stuck = blocked ? c.stuck + dt : 0;
    const limit = c.cruise * (city.edges[c.edge].w <= NARROW ? 0.7 : 1);
    const target = blocked && c.stuck < STUCK_SECONDS ? 0 : limit; // ponytail: after 3s just push through (breaks deadlocks)
    c.speed = Math.abs(target - c.speed) <= ACCEL * dt ? target : c.speed + Math.sign(target - c.speed) * ACCEL * dt;
    let e = city.edges[c.edge];
    c.t += (c.speed * dt) / e.len;
    while (c.t >= 1) {
      const overflow = (c.t - 1) * e.len;
      const node = c.dir === 1 ? e.b : e.a;
      const exits = edgesFrom(city, node).filter((i) => i !== c.edge);
      if (exits.length) {
        c.edge = exits[Math.floor(rng() * exits.length)];
        e = city.edges[c.edge];
        c.dir = e.a === node ? 1 : -1;
      } else {
        c.dir = c.dir === 1 ? -1 : 1; // dead end: u-turn
      }
      c.t = overflow / e.len;
    }
    placeCar(city, c);
  }
}

export const trafficCircles = (cars: TrafficCar[]): Circle[] => cars.map((c) => ({ x: c.x, z: c.z, r: TRAFFIC_RADIUS }));
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/traffic`
Expected: PASS (7 tests). If "turns onto a random exit" picks edge 1 instead of 2, check `exits` order: `edgesFrom(city, 1)` is `[0, 1, 2]`, filtered to `[1, 2]`, and `rng = 0.99` → index 1 → edge 2 ✓.

- [ ] **Step 5: Renderer snap after teleport**

In `src/traffic/trafficRenderer.ts` restore `import type { TrafficCar } from './traffic';` (remove the temporary local type from Task 6) and in `update`, before the lerp:

```ts
        const target = new THREE.Vector3(c.x, 0, c.z);
        if (m.position.distanceTo(target) > 20) m.position.copy(target); // respawn teleport: don't streak across the map
        m.position.lerp(target, k);
```

- [ ] **Step 6: Wire into `src/main.ts`**

Add imports:

```ts
import { spawnTraffic, stepTraffic, trafficCircles } from './traffic/traffic';
import { createTrafficRenderer } from './traffic/trafficRenderer';
```

After `let car = resetCar();`:

```ts
const traffic = spawnTraffic(city, 30, Math.random, car);
const trafficView = await createTrafficRenderer(ctx.scene, traffic);
```

In the loop, replace the `resolveCar` line with:

```ts
  stepTraffic(city, traffic, [car], dt, Math.random, car);
  car = resolveCar(car, boxesAround(occupancy, car.x, car.z), trafficCircles(traffic));
  trafficView.update(dt);
```

- [ ] **Step 7: Build, test, run, commit**

Run: `pnpm build && pnpm test` → PASS.
Run: `pnpm dev`. Expected: cars on the left side of the road, turning at junctions, queueing behind the truck; no cars popping in within view; collisions with cars slow the truck.

```bash
git add src/traffic src/main.ts
git commit -m "feat: graph-following traffic with left lane and dynamic respawn"
```

---

### Task 8: Spec/README polish

**Files:**
- Modify: `README.md:3`, `docs/superpowers/specs/2026-09-12-mbg-delivery-game-design.md`

- [ ] **Step 1: README line 3**

`Game 3D browser bergaya GTA di **Purwokerto asli** (jalan & gedung dari OpenStreetMap, 1 unit = 1 m): kemudikan mobil boks putih SPPG (Makan Bergizi Gratis) berlogo BGN, ambil paket di SPPG Polresta Banyumas, antar ke 3 SD sebelum waktu habis.`

- [ ] **Step 2: Old spec pointer**

Append to `docs/superpowers/specs/2026-09-12-mbg-delivery-game-design.md`:

```markdown
## Amandemen 2026-09-12 — dunia OSM

Bagian "World" (grid 17×17, tile Kenney) digantikan oleh `2026-09-12-purwokerto-osm-design.md`: jalan & gedung asli dari OpenStreetMap, 1 unit = 1 m, traffic mengikuti graph jalan, tabrakan via grid okupansi.
```

- [ ] **Step 3: Build, test, commit**

Run: `pnpm build && pnpm test` → PASS.

```bash
git add README.md docs/superpowers/specs/2026-09-12-mbg-delivery-game-design.md
git commit -m "docs: point README and old spec at the OSM world"
```

---

## Deliberately skipped

- Trees/landuse, street-name HUD, traffic lights, multipolygon buildings, streaming — per spec non-goals.
- Spatial index for `nearestEdge` / minimap culling — linear scans are ~1 ms; add only if profiling shows it.
- Overpass retry/mirror logic in the fetch script — rerun by hand if it fails.
