# Realistic Purwokerto Buildings & Street Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the uniform pastel boxes with typologically correct low-poly Purwokerto buildings (hip-roofed tile houses, flat-roofed ruko, tall hotels, domed mosques, window facades) and show street names on the minimap plus a "current street" HUD label, completing missing OSM names by tag fallback and straight-continuation propagation.

**Architecture:** The offline pipeline (`src/world/osm.ts`, pure, imported by `scripts/fetch-osm.mjs` under Node 24) gains footprint geometry helpers (`area`, `orientedBox`), a `classify(tags, ring)` that emits height + roof kind into `public/purwokerto.json`, and `propagateNames` that fills unnamed ways. `src/render/buildings.ts` is rewritten to build two merged meshes (textured walls, vertex-coloured roofs) from hand-built quads, hip roofs over the oriented box, earcut flat caps and sphere domes. `src/world/city.ts` links every edge to its way; a new pure `src/ui/mapLabels.ts` computes label placements and abbreviations, and `src/ui/hud.ts` draws them and the current street.

**Tech Stack:** three ^0.186 (`BufferGeometry`, `ShapeUtils.triangulateShape`, `SphereGeometry`, `CanvasTexture`), Vite 8, TypeScript, Vitest, pnpm, Node 24 (type stripping; **`src/world/osm.ts` must stay import-free** because Node cannot resolve extension-less `.ts` imports), Overpass API.

**Spec:** `docs/superpowers/specs/2026-09-12-purwokerto-buildings-streetnames-design.md` (read it; base OSM world spec is `docs/superpowers/specs/2026-09-12-purwokerto-osm-design.md`)

## Global Constraints

- Package manager **pnpm**. `pnpm build` (= `tsc --noEmit && vite build`) and `pnpm test` must pass at the end of every task. Every commit keeps the game running.
- All in-game copy in **Indonesian**.
- Coordinates: **1 unit = 1 metre**, y up, **north = −z, east = +x**. Rings in `CityData.buildings[i].p` are `[x, z]` pairs without the closing point, orientation unspecified (either winding).
- `FLOOR = 3.2` m per storey. Building heights rounded to 0.1 m (`round1`).
- Hash: `hash(x, z)` in `osm.ts` (unsigned 32-bit, deterministic from the first ring point) is the only source of randomness for buildings; render-time colour picks derive from the same seed.
- `src/world/osm.ts` has **no imports** (Node runs it directly). Pure modules must **not** import `three`: `src/world/osm.ts`, `src/world/city.ts`, `src/ui/mapLabels.ts`. `src/render/buildings.ts` may import `three` (tests still import its pure helpers, as `roads.test.ts` does).
- JSON schema after this plan: `buildings: { p: [number, number][]; h: number; r?: 'hip' | 'dome' }[]` (absent `r` = flat roof). `ways` unchanged. Regenerate with `node scripts/fetch-osm.mjs` (network; Overpass).
- Name completion order: `name` → `alt_name` → `official_name` → propagation (≤ 30° continuation, ≤ 10 passes). Never use `int_name` (English).
- Minimap stays 200 px / 400 m window, north up, car-centred. Label font `bold 10px system-ui, sans-serif`, white fill with `rgba(8,12,24,.9)` 3 px stroke.
- Don't touch: `carPhysics.ts`, `chaseMath.ts`/`chaseCamera.ts`, `post.ts`, `playerCar.ts`, `livery.ts`, `input.ts`, `occupancy.ts`, `roads.ts`, `traffic*.ts`, `quest*.ts`, `scene.ts`.
- Git commits end with the attribution lines the controller supplies.

---

## File Structure

```
src/world/osm.ts               MOD  export hash; + area, orientedBox, OrientedBox, Roof, classify (replaces heightOf), propagateNames; name fallback; buildings carry r?
src/world/osm.test.ts          MOD  tests for area/orientedBox/classify/propagateNames; heightOf test removed
scripts/fetch-osm.mjs          MOD  log named-way count
public/purwokerto.json         REGEN data with r? and completed names
README.md                      MOD  one line on name completion
src/render/buildings.ts        REWRITE wallQuads, flatCap, hipRoof, dome, facadeTexture, buildBuildings → Group of 2 meshes
src/render/buildings.test.ts   NEW  pure geometry tests
src/world/city.ts              MOD  Edge.way
src/ui/mapLabels.ts            NEW  shortName, labelSpots (pure)
src/ui/mapLabels.test.ts       NEW
src/ui/hud.ts                  MOD  current-street box, minimap labels, nearestEdge reuse
```

Data facts driving the thresholds (measured 2026-09-12 on the live Overpass result): 21 068 closed footprints, 20 931 tagged only `building=yes`; footprint area quantiles 10/25/50/75/90/95/99 % = 31/55/91/148/239/335/850 m²; 70 % are 4-vertex; 18 423 of the 19 744 footprints ≤ 300 m² pass the hip-roof test. Roads: 1 783 drivable ways, 324 named; propagation prototype yields 413.

---

### Task 1: Footprint helpers and building classification (`osm.ts`)

**Files:**
- Modify: `src/world/osm.ts`
- Test: `src/world/osm.test.ts`

**Interfaces:**
- Produces: `export const hash: (x: number, z: number) => number` (now exported); `export function area(ring: [number, number][]): number`; `export interface OrientedBox { cx: number; cz: number; ux: number; uz: number; long: number; short: number }`; `export function orientedBox(ring): OrientedBox` (`(ux, uz)` unit long axis, `long ≥ short`); `export type Roof = 'hip' | 'dome'`; `export function classify(tags: Record<string, string>, ring: [number, number][]): { h: number; r?: Roof }`; `CityData.buildings[i].r?: Roof`. `heightOf` is deleted (only `osm.ts` and its test used it).

- [ ] **Step 1: Write the failing tests**

In `src/world/osm.test.ts` replace the import line and the `'uses building:levels, tall tags, else 1-3 floors'` test with:

```ts
import { CENTER, project, bbox, widthOf, area, orientedBox, classify, buildCityData, type OsmElement } from './osm';
```

(`propagateNames` is added to this import in Task 2 — importing it now would fail `tsc`.)

```ts
const SQ: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]; // 100 m² house
const BIG: [number, number][] = [[0, 0], [30, 0], [30, 30], [0, 30]]; // 900 m², short side 30 > 18
const HOUSE_BIG: [number, number][] = [[0, 0], [25, 0], [25, 16], [0, 16]]; // 400 m² but still roofable (short 16)
const L: [number, number][] = [[0, 0], [20, 0], [20, 4], [4, 4], [4, 20], [0, 20]]; // 144 m² in a 400 m² box → fill 0.36

describe('area / orientedBox', () => {
  it('area is orientation independent', () => {
    expect(area(SQ)).toBe(100);
    expect(area([...SQ].reverse())).toBe(100);
    expect(area(L)).toBe(144);
  });
  it('finds the rotated minimum box', () => {
    const b = orientedBox([[0, 0], [10, 10], [5, 15], [-5, 5]]); // 14.14 × 7.07 rectangle at 45°
    expect(b.long).toBeCloseTo(Math.sqrt(200), 3);
    expect(b.short).toBeCloseTo(Math.sqrt(50), 3);
    expect(b.cx).toBeCloseTo(2.5, 3);
    expect(b.cz).toBeCloseTo(7.5, 3);
    expect(Math.abs(b.ux)).toBeCloseTo(Math.SQRT1_2, 3);
    expect(Math.abs(b.uz)).toBeCloseTo(Math.SQRT1_2, 3);
  });
});

describe('classify', () => {
  it('explicit levels/height win', () => {
    expect(classify({ building: 'yes', 'building:levels': '4' }, BIG)).toEqual({ h: 12.8 });
    expect(classify({ building: 'yes', height: '15' }, BIG)).toEqual({ h: 15 });
    expect(classify({ building: 'yes', 'building:levels': '2' }, SQ)).toEqual({ h: 6.4, r: 'hip' }); // a 2-storey house keeps its roof
  });
  it('small plain footprints are 1-2 storey hip-roofed houses', () => {
    const c = classify({ building: 'yes' }, SQ);
    expect([3.2, 6.4]).toContain(c.h);
    expect(c.r).toBe('hip');
    expect(classify({ building: 'yes' }, HOUSE_BIG).r).toBeUndefined(); // 400 m² plain box: not a house
    expect(classify({ building: 'house' }, HOUSE_BIG).r).toBe('hip'); // explicit house tag ignores the area cap
    expect(classify({ building: 'yes' }, SQ)).toEqual(c); // deterministic
  });
  it('L-shapes and big plain boxes get flat roofs', () => {
    expect(classify({ building: 'yes' }, L).r).toBeUndefined();
    const big = classify({ building: 'yes' }, BIG);
    expect([3.2, 6.4]).toContain(big.h);
    expect(big.r).toBeUndefined();
  });
  it('shops are 2-3 storey ruko, hotels 6-9, mosques domed', () => {
    const ruko = classify({ building: 'yes', shop: 'bakery' }, SQ);
    expect([6.4, 9.6]).toContain(ruko.h);
    expect(ruko.r).toBeUndefined();
    const hotel = classify({ building: 'yes', tourism: 'hotel' }, BIG);
    expect(hotel.h).toBeGreaterThanOrEqual(19.2);
    expect(hotel.h).toBeLessThanOrEqual(28.8);
    expect(classify({ building: 'mosque' }, SQ)).toEqual({ h: 4.8, r: 'dome' });
    expect(classify({ building: 'yes', amenity: 'place_of_worship' }, SQ).r).toBe('dome');
    expect(classify({ building: 'yes', amenity: 'place_of_worship', religion: 'christian' }, SQ).r).toBeUndefined();
    expect(classify({ building: 'yes', name: 'Mushola Darul Hikmah' }, SQ).r).toBe('dome');
  });
});
```

Also in the `buildCityData` describe, change the buildings assertion to:

```ts
  it('emits closed buildings without the repeated last point, classified', () => {
    expect(data.buildings).toHaveLength(1);
    expect(data.buildings[0].p).toHaveLength(3);
    expect(data.buildings[0].h).toBeGreaterThan(0);
    expect(data.buildings[0].r).toBeUndefined(); // 6105 m² triangle: not a house → flat
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/world/osm.test.ts`
Expected: FAIL — `area`, `orientedBox`, `classify` are not exported.

- [ ] **Step 3: Implement in `src/world/osm.ts`**

Replace the `CityData` building type, export `hash`, delete `heightOf` and the `TALL` set, and add the helpers. Final relevant code:

```ts
export type Roof = 'hip' | 'dome';
export interface CityData {
  nodes: [number, number][];
  ways: { n: number[]; w: number; name?: string }[];
  buildings: { p: [number, number][]; h: number; r?: Roof }[];
  pois: CityPoi[];
}
```

```ts
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
```

In `buildCityData`, replace the building push:

```ts
      const p = e.nodes.slice(0, -1).map((id) => project(...latLon.get(id)!));
      buildings.push({ p, ...classify(e.tags, p) });
```

- [ ] **Step 4: Run tests and the build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS (the old `purwokerto.json` has no `r`, so the runtime still renders flat boxes); build OK.

- [ ] **Step 5: Commit**

```bash
git add src/world/osm.ts src/world/osm.test.ts
git commit -m "feat: classify OSM footprints into houses, ruko, hotels, mosques with roof kind"
```

---

### Task 2: Complete street names and regenerate the data

**Files:**
- Modify: `src/world/osm.ts` (`buildCityData` name fallback + `propagateNames`)
- Modify: `scripts/fetch-osm.mjs:19` (log line)
- Regenerate: `public/purwokerto.json`
- Modify: `README.md` (Aset section)
- Test: `src/world/osm.test.ts`

**Interfaces:**
- Produces: `export function propagateNames(nodes: [number, number][], ways: CityData['ways']): void` (mutates `ways[i].name`); called at the end of `buildCityData`.

- [ ] **Step 1: Write the failing test**

Add `propagateNames` to the import line of `src/world/osm.test.ts`:

```ts
import { CENTER, project, bbox, widthOf, area, orientedBox, classify, propagateNames, buildCityData, type OsmElement } from './osm';
```

Append to `src/world/osm.test.ts`:

```ts
describe('propagateNames', () => {
  const nodes: [number, number][] = [[0, 0], [100, 0], [200, 5], [100, 100], [300, 0]];
  const mk = () => [
    { n: [0, 1], w: 6, name: 'Jalan A' },
    { n: [1, 2], w: 6 }, // continues A almost straight (≈3°)
    { n: [1, 3], w: 6 }, // perpendicular side street
    { n: [4, 2], w: 6 }, // continues the (now named) way 1, reversed direction
  ];
  it('names straight continuations transitively, never side streets', () => {
    const ways = mk();
    propagateNames(nodes, ways);
    expect(ways.map((w) => w.name)).toEqual(['Jalan A', 'Jalan A', undefined, 'Jalan A']);
  });
  it('picks the straightest named neighbour at a junction', () => {
    const ways = [{ n: [0, 1], w: 6, name: 'Jalan A' }, { n: [3, 1], w: 6, name: 'Jalan B' }, { n: [1, 2], w: 6 }];
    propagateNames(nodes, ways);
    expect(ways[2].name).toBe('Jalan A');
  });
});
```

And in the `buildCityData` fixture add an `alt_name`-only way and assert the fallback: change way 12 to `tags: { highway: 'service', alt_name: 'Gang B' }` and the assertion to `expect(data.ways[1]).toEqual({ n: [2, 1], w: 4, name: 'Gang B' });`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/world/osm.test.ts`
Expected: FAIL — `propagateNames` is not a function; `Gang B` missing.

- [ ] **Step 3: Implement**

In `src/world/osm.ts` add:

```ts
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
```

In `buildCityData`:

```ts
      const way: CityData['ways'][number] = { n: e.nodes.map(nodeIndex), w };
      const name = e.tags.name ?? e.tags.alt_name ?? e.tags.official_name;
      if (name) way.name = name;
      ways.push(way);
```

and just before `const pois = ...`: `propagateNames(nodes, ways);`

In `scripts/fetch-osm.mjs` change the last line to:

```js
console.log(`nodes ${data.nodes.length}, ways ${data.ways.length} (named ${data.ways.filter((w) => w.name).length}), buildings ${data.buildings.length}, pois ${data.pois.length}`);
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Regenerate the city data (network)**

Run: `node scripts/fetch-osm.mjs`
Expected (live data, ±a few): `nodes ~8808, ways ~1783 (named ~413), buildings ~21068, pois 8`. Then verify the roof field landed:

```bash
node -e 'const d=JSON.parse(require("fs").readFileSync("public/purwokerto.json"));const c={};for(const b of d.buildings)c[b.r??"flat"]=(c[b.r??"flat"]||0)+1;console.log(c)'
```

Expected roughly `{ hip: ~18400, flat: ~2600, dome: ~25 }`. If Overpass returns 429/504, wait a minute and rerun; do not hand-edit the JSON.

- [ ] **Step 6: README note**

In `README.md`, after the ODbL line in "Aset", add:

```
Nama jalan diambil dari tag `name` (fallback `alt_name`/`official_name`); ruas tanpa nama mewarisi nama ruas yang diteruskannya lurus (≤ 30°), lihat `propagateNames` di `src/world/osm.ts`.
```

- [ ] **Step 7: Build and commit**

Run: `pnpm build && pnpm test`
Expected: PASS.

```bash
git add src/world/osm.ts src/world/osm.test.ts scripts/fetch-osm.mjs public/purwokerto.json README.md
git commit -m "feat: complete street names via alt_name fallback and straight-continuation propagation; regenerate city data"
```

---

### Task 3: Realistic building renderer

**Files:**
- Rewrite: `src/render/buildings.ts`
- Create: `src/render/buildings.test.ts`
- `src/main.ts:27` needs no change (`scene.add` accepts the returned `Group`).

**Interfaces:**
- Consumes: `area`, `hash`, `orientedBox`, `OrientedBox`, `CityData` from `../world/osm` (Task 1).
- Produces: `export type Geo = { positions: number[]; indices: number[]; uvs?: number[] }`; `export function wallQuads(ring, h): Geo`; `export function flatCap(ring, y): Geo`; `export function hipRoof(box: OrientedBox, y: number, rise: number): Geo`; `export function buildBuildings(buildings: CityData['buildings']): THREE.Group` (two meshes: walls, roofs).

- [ ] **Step 1: Write the failing tests**

Create `src/render/buildings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wallQuads, flatCap, hipRoof } from './buildings';

const ys = (p: number[]) => p.filter((_, i) => i % 3 === 1);

describe('wallQuads', () => {
  it('makes one quad per edge with one window per 3 m × storey', () => {
    const g = wallQuads([[0, 0], [6, 0], [6, 6], [0, 6]], 6.4);
    expect(g.positions).toHaveLength(4 * 4 * 3);
    expect(g.indices).toHaveLength(4 * 6);
    expect(g.uvs!.slice(0, 8)).toEqual([0, 0, 2, 0, 2, 2, 0, 2]);
    expect(Math.max(...ys(g.positions))).toBe(6.4);
  });
});

describe('flatCap', () => {
  it('triangulates a concave ring at the given height', () => {
    const g = flatCap([[0, 0], [10, 0], [10, 10], [5, 5], [0, 10]], 3.2);
    expect(g.indices).toHaveLength(3 * 3); // n − 2 triangles
    expect(new Set(ys(g.positions))).toEqual(new Set([3.2]));
  });
});

describe('hipRoof', () => {
  it('puts the ridge on the long axis at y + rise and overhangs the eaves', () => {
    const g = hipRoof({ cx: 0, cz: 0, ux: 1, uz: 0, long: 10, short: 6 }, 3.2, 2);
    expect(g.indices).toHaveLength(8 * 3);
    expect(Math.max(...ys(g.positions))).toBe(5.2);
    expect(Math.min(...ys(g.positions))).toBe(3.2);
    const xs = g.positions.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(5.6); // 10/2 + 0.6 overhang
    const ridge = Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions.slice(i * 3, i * 3 + 3)).filter((p) => p[1] === 5.2);
    for (const [x, , z] of ridge) {
      expect(Math.abs(x)).toBeCloseTo(2); // (5.6 − 3.6)
      expect(z).toBeCloseTo(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/render/buildings.test.ts`
Expected: FAIL — `wallQuads` etc. not exported.

- [ ] **Step 3: Rewrite `src/render/buildings.ts`**

```ts
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
```

- [ ] **Step 4: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: PASS; `tsc` clean (the `mergeGeometries` import is gone).

- [ ] **Step 5: Visual check**

Run: `pnpm dev`, open http://localhost:5173, drive around the spawn (Alun-alun). Check:
- Small houses have red/orange tile hip roofs with visible eaves; walls show a window per storey.
- Ruko rows along Jl. Jenderal Sudirman are 2–3 storeys, flat grey roofs.
- Aston Imperium (north-east, near Jl. Overste Isdiman) towers at 12 storeys; Masjid Jenderal Soedirman / Baitussalam have green domes.
- No z-fighting between roofs and walls, no obvious holes under eaves from the chase camera, frame rate unchanged (2 building draw calls; ~400k triangles).

- [ ] **Step 6: Commit**

```bash
git add src/render/buildings.ts src/render/buildings.test.ts
git commit -m "feat: hip-roofed houses, flat ruko, domed mosques and window facades from OSM footprints"
```

---

### Task 4: Edge → way link and minimap label placement (pure)

**Files:**
- Modify: `src/world/city.ts:3-21`
- Create: `src/ui/mapLabels.ts`
- Create: `src/ui/mapLabels.test.ts`

**Interfaces:**
- Produces: `Edge.way: number` (index into `city.data.ways`) set in `loadCity`; `export function shortName(name: string): string`; `export interface LabelSpot { text: string; x: number; z: number; angle: number; len: number }`; `export function labelSpots(data: Pick<CityData, 'nodes' | 'ways'>, cx: number, cz: number, half: number): LabelSpot[]` — `angle` in radians for `ctx.rotate` (canvas x = world x, canvas y = world z), always in `(−π/2, π/2]`; `len` = in-window length of the labelled way in metres.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/mapLabels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shortName, labelSpots } from './mapLabels';

describe('shortName', () => {
  it('abbreviates Indonesian street prefixes and ranks', () => {
    expect(shortName('Jalan Jenderal Sudirman')).toBe('Jl. Jend. Sudirman');
    expect(shortName('Jalan Letnan Jenderal S. Parman')).toBe('Jl. Letjen S. Parman');
    expect(shortName('Jalan Profesor Dokter Soeharso')).toBe('Jl. Prof. Dr. Soeharso');
    expect(shortName('Gang Mawar')).toBe('Gg. Mawar');
    expect(shortName('Kranji')).toBe('Kranji');
  });
});

describe('labelSpots', () => {
  const nodes: [number, number][] = [[0, 0], [100, 0], [200, 0], [0, 100], [900, 900]];
  it('labels the midpoint of the in-window length, along the road', () => {
    const [s] = labelSpots({ nodes, ways: [{ n: [0, 1, 2], w: 6, name: 'Jalan A' }] }, 100, 0, 200);
    expect(s).toMatchObject({ text: 'Jl. A', x: 100, z: 0, angle: 0, len: 200 });
  });
  it('keeps text upright and handles vertical roads', () => {
    const [rev] = labelSpots({ nodes, ways: [{ n: [2, 1, 0], w: 6, name: 'Jalan A' }] }, 100, 0, 200);
    expect(rev.angle).toBeCloseTo(0);
    const [up] = labelSpots({ nodes, ways: [{ n: [0, 3], w: 6, name: 'Jalan B' }] }, 0, 50, 200);
    expect(up.angle).toBeCloseTo(Math.PI / 2);
  });
  it('one label per name (longest), none for unnamed or out-of-window ways', () => {
    const ways = [
      { n: [0, 1], w: 6, name: 'Jalan A' },
      { n: [1, 2], w: 6, name: 'Jalan A' },
      { n: [0, 3], w: 6 },
      { n: [4, 4], w: 6, name: 'Jauh' },
    ];
    const spots = labelSpots({ nodes, ways }, 100, 0, 200);
    expect(spots).toHaveLength(1);
    expect(spots[0].len).toBe(100);
  });
});
```

In `src/world/city.test.ts`, the `loadCity` test compares edges with `toEqual`, so extend the expected objects with the way index (`tiny.ways[0]` = nodes 0-1-2, `tiny.ways[1]` = nodes 1-3):

```ts
    expect(city.edges).toEqual([
      { a: 0, b: 1, w: 6, len: 100, way: 0 },
      { a: 1, b: 2, w: 6, len: 100, way: 0 },
      { a: 1, b: 3, w: 4, len: 100, way: 1 },
    ]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/ui/mapLabels.test.ts src/world/city.test.ts`
Expected: FAIL — module `./mapLabels` not found; edges lack `way`.

- [ ] **Step 3: Implement**

`src/world/city.ts`:

```ts
export interface Edge { a: number; b: number; w: number; len: number; way: number }
```

and in `loadCity` change the loop to `data.ways.forEach((way, wi) => { ... edges.push({ a, b, w: way.w, len, way: wi }) ... })` — full loop:

```ts
  data.ways.forEach((way, wi) => {
    for (let i = 0; i + 1 < way.n.length; i++) {
      const a = way.n[i];
      const b = way.n[i + 1];
      const len = Math.hypot(data.nodes[b][0] - data.nodes[a][0], data.nodes[b][1] - data.nodes[a][1]);
      if (len < 0.01) continue;
      const idx = edges.push({ a, b, w: way.w, len, way: wi }) - 1;
      adj[a].push(idx);
      adj[b].push(idx);
    }
  });
```

Create `src/ui/mapLabels.ts`:

```ts
import type { CityData } from '../world/osm';

const ABBR: [RegExp, string][] = [
  [/^Jalan /, 'Jl. '], [/^Gang /, 'Gg. '],
  [/\bLetnan Jenderal\b/, 'Letjen'], [/\bMayor Jenderal\b/, 'Mayjen'], [/\bBrigadir Jenderal\b/, 'Brigjen'], [/\bPanglima Besar\b/, 'Pangsar'],
  [/\bJenderal\b/, 'Jend.'], [/\bProfesor\b/, 'Prof.'], [/\bDokter\b/, 'Dr.'], [/\bKolonel\b/, 'Kol.'], [/\bKomisaris\b/, 'Kom.'],
  [/\bKapten\b/, 'Kapt.'], [/\bKyai Haji\b/, 'KH.'],
];
export const shortName = (name: string): string => ABBR.reduce((s, [re, to]) => s.replace(re, to), name);

export interface LabelSpot { text: string; x: number; z: number; angle: number; len: number }

/** One label per distinct name inside the window (cx ± half, cz ± half), at the midpoint of the longest way's in-window length, rotated along the road and kept upright. */
export function labelSpots(data: Pick<CityData, 'nodes' | 'ways'>, cx: number, cz: number, half: number): LabelSpot[] {
  const inside = (p: [number, number]) => Math.abs(p[0] - cx) <= half && Math.abs(p[1] - cz) <= half;
  const best = new Map<string, LabelSpot>();
  for (const w of data.ways) {
    if (!w.name) continue;
    // ponytail: only segments with both ends in the window count; clip segments if long sparse roads lose labels
    const segs: { a: [number, number]; b: [number, number]; len: number }[] = [];
    let total = 0;
    for (let i = 0; i + 1 < w.n.length; i++) {
      const a = data.nodes[w.n[i]];
      const b = data.nodes[w.n[i + 1]];
      if (!inside(a) || !inside(b)) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len === 0) continue;
      segs.push({ a, b, len });
      total += len;
    }
    if (!total || (best.get(w.name)?.len ?? 0) >= total) continue;
    let d = total / 2;
    let s = segs[0];
    for (s of segs) {
      if (d <= s.len) break;
      d -= s.len;
    }
    const t = d / s.len;
    let angle = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle <= -Math.PI / 2) angle += Math.PI;
    best.set(w.name, { text: shortName(w.name), x: s.a[0] + (s.b[0] - s.a[0]) * t, z: s.a[1] + (s.b[1] - s.a[1]) * t, angle, len: total });
  }
  return [...best.values()];
}
```

- [ ] **Step 4: Run tests and build**

Run: `pnpm test && pnpm build`
Expected: PASS (traffic/routing tests construct `City` via `loadCity`, so they pick up `way` automatically).

- [ ] **Step 5: Commit**

```bash
git add src/world/city.ts src/world/city.test.ts src/ui/mapLabels.ts src/ui/mapLabels.test.ts
git commit -m "feat: edge→way link and pure minimap street-label placement with Indonesian abbreviations"
```

---

### Task 5: Street names in the HUD (minimap labels + current street)

**Files:**
- Modify: `src/ui/hud.ts`

**Interfaces:**
- Consumes: `nearestEdge` from `../world/city` (replaces `nearestNode` import), `Edge.way` (Task 4), `labelSpots` from `./mapLabels` (Task 4).
- Produces: nothing new; `createHud(city).update(quest, car)` signature unchanged.

- [ ] **Step 1: Edit `src/ui/hud.ts`**

Imports:

```ts
import { nearestEdge, type City } from '../world/city';
import { labelSpots } from './mapLabels';
```

Add to the `<style>` block and markup (after `#help`):

```css
      #street { bottom: 16px; left: 50%; transform: translateX(-50%); font-size: 16px; font-weight: 600; white-space: nowrap; }
```

```html
    <div id="street" class="box" hidden></div>
```

and `const street = root.querySelector<HTMLElement>('#street')!;` next to the other element lookups.

In `update`, right after the toast lines:

```ts
      const ne = nearestEdge(city, car.x, car.z);
      const edge = city.edges[ne.edge];
      const name = ways[edge.way].name;
      street.textContent = name ?? '';
      street.hidden = !name;
```

Replace `const path = pathFrom(field, nearestNode(city, car.x, car.z));` with:

```ts
        const path = pathFrom(field, ne.t < 0.5 ? edge.a : edge.b);
```

After the first `mg.restore();` (end of the world-space drawing) and **before** the car-arrow `mg.save()`, add:

```ts
      mg.font = 'bold 10px system-ui, sans-serif';
      mg.textAlign = 'center';
      mg.textBaseline = 'middle';
      mg.lineWidth = 3;
      mg.strokeStyle = 'rgba(8,12,24,.9)';
      mg.fillStyle = '#fff';
      for (const l of labelSpots(city.data, car.x, car.z, MAP_M / 2)) {
        if (mg.measureText(l.text).width > l.len * SCALE) continue; // label longer than its road: skip
        mg.save();
        mg.translate(MAP_PX / 2 + (l.x - car.x) * SCALE, MAP_PX / 2 + (l.z - car.z) * SCALE);
        mg.rotate(l.angle);
        mg.strokeText(l.text, 0, 0);
        mg.fillText(l.text, 0, 0);
        mg.restore();
      }
```

- [ ] **Step 2: Build and test**

Run: `pnpm build && pnpm test`
Expected: PASS; `tsc` reports no unused import (`nearestNode` is no longer imported).

- [ ] **Step 3: Visual check**

Run: `pnpm dev`. At spawn the bottom-centre box reads **Jalan Jenderal Sudirman**; the minimap shows "Jl. Jend. Sudirman" along the road and side streets labelled where they fit (e.g. "Jl. Merdeka", "Jl. Kolonel Sugiri"). Drive into an unnamed gang: the box disappears. Turn onto a side street: the box changes within a second. Labels stay upright and readable while the map pans; nothing overlaps the car arrow badly. Frame rate unchanged (label pass is < 1 ms).

- [ ] **Step 4: Commit**

```bash
git add src/ui/hud.ts
git commit -m "feat: street names on the minimap and current-street HUD label"
```

---

## Self-review

- **Spec coverage:** classification by footprint + tags (Task 1), hip/flat/dome roofs, facade texture, roof palettes, 2 draw calls (Task 3), name fallback + propagation + regenerated JSON + README (Task 2), minimap labels with abbreviation/upright/dedupe/fit check, current-street box (Tasks 4–5), `r?` schema and `Edge.way` (Tasks 1, 4). Non-goals (3D signs, trees, minarets, parapets) intentionally absent.
- **Placeholders:** none; every code step is complete.
- **Type consistency:** `Roof`, `OrientedBox { cx, cz, ux, uz, long, short }`, `Geo { positions, indices, uvs? }`, `LabelSpot { text, x, z, angle, len }`, `Edge.way`, `classify → { h, r? }` are used with the same names and shapes across tasks. `hash` is exported in Task 1 and consumed in Task 3.
