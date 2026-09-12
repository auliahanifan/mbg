# Purwokerto Map + White BGN Truck Livery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the player's MBG truck look like a real SPPG delivery vehicle (white box van with the Badan Gizi Nasional emblem and "MAKAN BERGIZI GRATIS" livery) and turn the generic city into Purwokerto (real SPPG/school names, Alun-alun, Menara Teratai, Stasiun, GOR Satria, Unsoed, Gunung Slamet on the northern horizon, no skyscrapers).

**Architecture:** No new systems. The truck stays Kenney `delivery.glb`; its body is whitened by remapping UVs from the grey/green palette cells to the white cell of Kenney's `colormap.png` (no texture edits, no material clone), and a canvas-drawn livery texture (BGN logo PNG + text + stripes) is applied as planes on both box sides and the rear door. The city stays a 17×17 char grid; new landmark chars get a label sprite and either a Kenney building or a tiny procedural mesh (Menara Teratai). Gunung Slamet is one fog-less cone far north.

**Tech Stack:** three ^0.186, Vite 8, TypeScript, Vitest, pnpm. Assets: Kenney CC0 packs (already in `public/models`), `public/logo-bgn.png` (official BGN emblem, downloaded from bgn.go.id).

**Spec:** `docs/superpowers/specs/2026-09-12-mbg-delivery-game-design.md` (amended in Task 5 of this plan).

## Research summary (source of the visual targets)

- Real MBG/SPPG vehicles are **white** small box vans (Daihatsu Gran Max / Suzuki Carry box). BGN mandates closed-box, hygienic vehicles used only for MBG distribution ([BGN siaran pers](https://www.bgn.go.id/news/siaran-pers/waka-bgn-jangan-memakai-mobil-sppg-untuk-berbelanja), [Suzuki Carry Box MBG](https://suzukisumberbaru.co.id/berita/suzuki-new-carry-box-maksimalkan-misi-badan-gizi-nasional-menuju-indonesia-emas-muat-hingga-1050-porsi)). Aftermarket "stiker mobil MBG SPPG" kits show the standard livery: BGN round emblem, big "MAKAN BERGIZI GRATIS" text, the SPPG unit name, blue/green accents.
- BGN emblem: round seal, dark-blue field, Garuda Pancasila centre, gold figures, green leaves, light-blue ring with "BADAN GIZI NASIONAL · REPUBLIK INDONESIA". Official colours: **#071e49** dark blue, **#92d05d** green, **#b5e0ea** light blue, **#d1b06c** gold ([bgn.go.id/logo-meaning](https://www.bgn.go.id/logo-meaning)). Image: `https://www.bgn.go.id/logo-bgn.png` (1122×1112 RGBA).
- Purwokerto facts used: SPPG at Polresta Banyumas (Purwokerto Utara) delivers to 20 schools incl. **SD Negeri 1 Bancarkembar** ([ANTARA](https://www.antaranews.com/berita/5216461/dapur-sppg-polresta-banyumas-rawat-gizi-anak-lewat-sajian-aman)). Other real schools: **SD Negeri 1 Sokanegara** (Purwokerto Timur), **SD Negeri 1 Kranji** (Jl. Adhyaksa, Purwokerto Timur). Landmarks: Alun-alun Purwokerto (centre), Menara Teratai (lotus tower, north), Stasiun Purwokerto (west), GOR Satria + Unsoed campus (north-east), Gunung Slamet dominating the northern skyline. Purwokerto has essentially no skyscrapers.

## Global Constraints

- Package manager: **pnpm**. `pnpm build` (= `tsc --noEmit && vite build`) and `pnpm test` must pass at the end of every task.
- All in-game copy in **Indonesian**.
- Compass: N = −z, E = +x, S = +z, W = −x. Tile `(row, col)` centre = `(x: col*TILE, z: row*TILE)`, TILE = 12. Map centre is `(96, 0, 96)`.
- Heading 0 = facing +z; Kenney car models face +z natively.
- Pure modules (`src/world/cityMap.ts`, `src/quest/quest.ts`, …) must **not** import `three`. `src/vehicle/livery.ts` (new) may import `three` (BufferGeometry only) — it is unit-tested in node.
- Kenney `colormap.png` is a **512×512, 8 columns × 4 rows** palette; each 64×64 cell has a horizontal light→dark gradient. glTF UV origin is top-left, GLTFLoader keeps UVs as-is (`flipY = false`). Cell `(col c, row r)` covers `u ∈ [c/8, (c+1)/8)`, `v ∈ [r/4, (r+1)/4)`.
- `delivery.glb` meshes: `body`, `door` (rear door), `wheel-*`. Measured: the box sides are at local `x = ±0.65`, `y 0.15–1.4`, `z −1.57…0.47` (node `body` is translated `(0, 0.15, −0.025)`, so world `y 0.3–1.55`, `z −1.6…0.45`). Body/door colour cells: **col 3 row 2** (grey, cab + frame) and **col 3 row 1** (green, box). White cell: **col 6 row 2**. Rear door face is at world `z ≈ −1.59`, `x ±0.55`, `y 0.54–1.46`.
- Don't touch traffic, physics, quest logic, camera.

---

## File Structure

```
public/logo-bgn.png                 NEW  BGN emblem, downscaled to 512 px
src/vehicle/livery.ts               NEW  paintWhite(group): UV remap of body/door to the white palette cell (pure-ish, tested)
src/vehicle/livery.test.ts          NEW
src/vehicle/playerCar.ts            MOD  white body + BGN livery planes (sides + rear)
src/world/cityMap.ts                MOD  new MAP (Purwokerto layout), real POI names, LANDMARKS table
src/world/cityMap.test.ts           MOD  updated MAP expectations + landmark test
src/world/cityBuilder.ts            MOD  landmarks (label + building / Menara Teratai), Gunung Slamet, X ring → low-rise
src/render/scene.ts                 MOD  camera far 600 → 1500 (mountain)
src/quest/quest.ts                  MOD  kitchen text uses the real SPPG name
src/quest/quest.test.ts             MOD  (no change needed — asserts via the same template; verify)
index.html / README.md              MOD  title + loading copy mention Purwokerto; logo credit
docs/superpowers/specs/...design.md MOD  amendment section
```

---

### Task 1: Whiten the truck body via palette UV remap

**Files:**
- Create: `src/vehicle/livery.ts`
- Create: `src/vehicle/livery.test.ts`
- Modify: `src/vehicle/playerCar.ts:31-32`

**Interfaces:**
- Produces: `paintWhite(group: THREE.Object3D): void` — for meshes named `body` and `door`, clones the geometry and moves every UV in column 3 rows 1–2 to column 6 row 2.

- [ ] **Step 1: Write the failing test**

`src/vehicle/livery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { paintWhite } from './livery';

function meshWithUvs(name: string, uvs: number[][]): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(uvs.length * 3).fill(0), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  const m = new THREE.Mesh(geo);
  m.name = name;
  return m;
}
const uvsOf = (m: THREE.Mesh) => Array.from((m.geometry.attributes.uv as THREE.BufferAttribute).array);

describe('paintWhite', () => {
  it('moves grey (col3,row2) and green (col3,row1) cells to the white cell (col6,row2), leaves others', () => {
    const body = meshWithUvs('body', [[0.469, 0.7], [0.469, 0.3], [0.1, 0.9]]);
    const g = new THREE.Group().add(body);
    paintWhite(g);
    const uv = uvsOf(body);
    expect(uv[0]).toBeCloseTo(0.844); expect(uv[1]).toBeCloseTo(0.7);   // grey → white, same row
    expect(uv[2]).toBeCloseTo(0.844); expect(uv[3]).toBeCloseTo(0.55);  // green (row1) → white (row2)
    expect(uv[4]).toBeCloseTo(0.1);   expect(uv[5]).toBeCloseTo(0.9);   // untouched
  });
  it('does not mutate the shared source geometry and ignores wheels', () => {
    const body = meshWithUvs('body', [[0.469, 0.7]]);
    const wheel = meshWithUvs('wheel-front-left', [[0.469, 0.7]]);
    const original = body.geometry;
    paintWhite(new THREE.Group().add(body, wheel));
    expect(body.geometry).not.toBe(original);
    expect(uvsOf(wheel)[0]).toBeCloseTo(0.469);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/vehicle/livery.test.ts`
Expected: FAIL — cannot resolve `./livery`.

- [ ] **Step 3: Write the implementation**

`src/vehicle/livery.ts`:

```ts
import * as THREE from 'three';

// Kenney colormap.png is an 8x4 grid of 64px cells. delivery.glb paints the cab/frame with
// (col 3,row 2) grey and the cargo box with (col 3,row 1) green; (col 6,row 2) is white.
const SRC_COL = 3;
const WHITE_COL = 6;
const WHITE_ROW = 2;

/** Repaints the truck white by moving body/door UVs into the white palette cell. Clones geometry so the cached model is untouched. */
export function paintWhite(group: THREE.Object3D): void {
  for (const name of ['body', 'door']) {
    const mesh = group.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh) continue;
    const geo = mesh.geometry.clone();
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const col = Math.floor(u * 8);
      const row = Math.floor(v * 4);
      if (col === SRC_COL && (row === 1 || row === 2)) uv.setXY(i, u + (WHITE_COL - SRC_COL) / 8, v + (WHITE_ROW - row) / 4);
    }
    uv.needsUpdate = true;
    mesh.geometry = geo;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: all PASS (2 new tests).

- [ ] **Step 5: Wire into the player car**

In `src/vehicle/playerCar.ts` add the import and call it right after loading:

```ts
import { paintWhite } from './livery';
// ...
  const group = await loadModel('delivery');
  paintWhite(group);
  scene.add(group);
```

- [ ] **Step 6: Visual check**

Run: `pnpm dev`, open http://localhost:5173. Expected: the truck cab and box are white (light grey gradient in shade); tyres black, windows light cyan, bumpers dark. Old blue "MBG" decals still present (replaced in Task 2).

- [ ] **Step 7: Build + commit**

Run: `pnpm build`
Expected: PASS.

```bash
git add src/vehicle/livery.ts src/vehicle/livery.test.ts src/vehicle/playerCar.ts
git commit -m "feat: white MBG truck body via colormap UV remap"
```

---

### Task 2: BGN livery decals (logo + "MAKAN BERGIZI GRATIS")

**Files:**
- Create: `public/logo-bgn.png`
- Modify: `src/vehicle/playerCar.ts` (replace `mbgDecal`, decal placement)
- Modify: `README.md` (asset credit)

**Interfaces:**
- Consumes: `paintWhite` from Task 1.
- Produces: nothing exported; `createPlayerCar` signature unchanged.

- [ ] **Step 1: Fetch and downscale the BGN emblem**

```bash
curl -sSL -o /tmp/logo-bgn.png https://www.bgn.go.id/logo-bgn.png
sips -Z 512 /tmp/logo-bgn.png --out public/logo-bgn.png
file public/logo-bgn.png   # expect PNG ~512 x 507, RGBA
```

- [ ] **Step 2: Replace `mbgDecal` with the livery texture**

In `src/vehicle/playerCar.ts` delete `mbgDecal()` and add:

```ts
const BGN_BLUE = '#071e49';
const BGN_GREEN = '#92d05d';

/** Side/rear sticker: BGN emblem, "MAKAN BERGIZI GRATIS", SPPG name, green+blue stripe. 1024x560 → aspect 1.83. */
async function liveryTexture(): Promise<THREE.Texture> {
  const logo = await new THREE.ImageLoader().loadAsync('/logo-bgn.png');
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 560;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 1024, 560);
  g.fillStyle = BGN_GREEN;
  g.fillRect(0, 476, 1024, 52);
  g.fillStyle = BGN_BLUE;
  g.fillRect(0, 528, 1024, 32);
  g.drawImage(logo, 40, 40, 400, 400);
  g.fillStyle = BGN_BLUE;
  g.textAlign = 'left';
  g.font = 'bold 108px system-ui, sans-serif';
  g.fillText('MAKAN', 470, 150);
  g.fillText('BERGIZI', 470, 262);
  g.fillText('GRATIS', 470, 374);
  g.font = 'bold 34px system-ui, sans-serif';
  g.fillText('SPPG POLRESTA BANYUMAS', 470, 440);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function decal(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
}
```

- [ ] **Step 3: Place decals on both box sides and the rear door**

Replace the existing "decals on both sides" loop in `createPlayerCar` with:

```ts
  const tex = await liveryTexture();
  // cargo box sides: x ±0.65, y 0.3..1.55, z -1.6..0.45 (measured from delivery.glb)
  for (const side of [1, -1]) {
    const d = decal(tex, 1.9, 1.04);
    d.position.set(side * 0.66, 0.93, -0.57);
    d.rotation.y = side * (Math.PI / 2);
    group.add(d);
  }
  // rear door faces the chase camera all game
  const rear = decal(tex, 1.0, 0.55);
  rear.position.set(0, 1.05, -1.6);
  rear.rotation.y = Math.PI;
  group.add(rear);
```

- [ ] **Step 4: Visual check**

Run: `pnpm dev`. Expected: white truck; from the default chase view the rear door shows the round BGN seal + "MAKAN BERGIZI GRATIS"; drive and turn — both sides show the sticker with text reading left-to-right from outside, green/blue stripe along the bottom edge of the box, no z-fighting flicker. If the side plane visibly floats or clips, adjust only `0.66` (x) and `0.93` (y).

- [ ] **Step 5: README credit**

Append to the `## Aset` paragraph in `README.md`:

```
Logo Badan Gizi Nasional (`public/logo-bgn.png`) diambil dari [bgn.go.id](https://www.bgn.go.id) — lambang instansi pemerintah, dipakai hanya sebagai livery mobil SPPG dalam game.
```

- [ ] **Step 6: Build, test, commit**

Run: `pnpm build && pnpm test`
Expected: PASS.

```bash
git add public/logo-bgn.png src/vehicle/playerCar.ts README.md
git commit -m "feat: BGN livery decals with official emblem on the MBG truck"
```

---

### Task 3: Purwokerto map data (pure module)

**Files:**
- Modify: `src/world/cityMap.ts:24-42` (MAP), `:104-109` (POI_INFO), add `LANDMARKS`
- Modify: `src/world/cityMap.test.ts:86-95`
- Modify: `src/quest/quest.ts:34`

**Interfaces:**
- Produces: `export const LANDMARKS: Record<string, { name: string; model?: string }>` keyed by map char (`A`, `M`, `S`, `G`, `U`). `Poi.name` values become the real names below. `MAP` remains `string[]` 17×17.

- [ ] **Step 1: Update the failing tests**

In `src/world/cityMap.test.ts`, change the `findPois` test and add a landmarks test:

```ts
describe('findPois', () => {
  it('finds kitchen + 3 schools in MAP with a road stop next to each', () => {
    const pois = findPois(MAP);
    expect(pois.map((p) => p.id)).toEqual(['K', '1', '2', '3']);
    const k = pois[0];
    expect(k.kind).toBe('kitchen');
    expect(k.name).toBe('SPPG Polresta Banyumas');
    expect(k).toMatchObject({ row: 3, col: 4, stop: { row: 2, col: 4, x: 48, z: 24 } });
    expect(pois.slice(1).map((p) => p.name)).toEqual(['SDN 1 Bancarkembar', 'SDN 1 Sokanegara', 'SDN 1 Kranji']);
    for (const p of pois) expect(isRoad(MAP, p.stop.row, p.stop.col)).toBe(true);
  });
  it('throws when a POI has no adjacent road', () => {
    expect(() => findPois(['XXX', 'XKX', 'XXX'])).toThrow();
  });
});

describe('LANDMARKS', () => {
  it('every landmark char appears exactly once in MAP and every MAP char is known', () => {
    const chars = MAP.join('');
    for (const ch of Object.keys(LANDMARKS)) expect(chars.split(ch).length - 1).toBe(1);
    for (const ch of new Set(chars)) expect('RX.HTK123'.includes(ch) || ch in LANDMARKS).toBe(true);
  });
});
```

Add `LANDMARKS` to the import list at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/world/cityMap.test.ts`
Expected: FAIL — `LANDMARKS` not exported, kitchen name/position mismatch.

- [ ] **Step 3: Replace MAP, POI_INFO and add LANDMARKS**

In `src/world/cityMap.ts`:

```ts
// R road, . ruko/commercial, X low-rise ring (solid), H house, T park, K SPPG kitchen, 1-3 schools,
// landmarks: A Alun-alun, M Menara Teratai, S Stasiun, G GOR Satria, U Unsoed. North (Gunung Slamet) is -z / row 0.
export const MAP: string[] = [
  'XXXXXXXXXXXXXXXXX',
  'X...............X',
  'X.RRRRRRRRRRRRR.X',
  'X.R.K.R.1.R.U.R.X',
  'X.R...RM..R...R.X',
  'X.R...R...R.G.R.X',
  'X.RRRRRRRRRRRRR.X',
  'X.R...RTTTR...R.X',
  'X.RS..RTATR..2R.X',
  'X.R...RTTTR...R.X',
  'X.RRRRRRRRRRRRR.X',
  'X.RHHHR...RHHHR.X',
  'X.RHHHR...RHHHR.X',
  'X.RHHHR...RH3HR.X',
  'X.RRRRRRRRRRRRR.X',
  'X...............X',
  'XXXXXXXXXXXXXXXXX',
];

/** Named places that are scenery only (no quest stop). `model` = Kenney commercial building; none = custom/empty tile. */
export const LANDMARKS: Record<string, { name: string; model?: string }> = {
  A: { name: 'Alun-alun Purwokerto' },
  M: { name: 'Menara Teratai' },
  S: { name: 'Stasiun Purwokerto', model: 'building-e' },
  G: { name: 'GOR Satria', model: 'building-i' },
  U: { name: 'Kampus Unsoed', model: 'building-m' },
};
```

and

```ts
const POI_INFO: Record<string, { kind: Poi['kind']; name: string }> = {
  K: { kind: 'kitchen', name: 'SPPG Polresta Banyumas' },
  '1': { kind: 'school', name: 'SDN 1 Bancarkembar' },
  '2': { kind: 'school', name: 'SDN 1 Sokanegara' },
  '3': { kind: 'school', name: 'SDN 1 Kranji' },
};
```

- [ ] **Step 4: Quest text uses the kitchen name**

`src/quest/quest.ts` line 34:

```ts
    case 'toKitchen': return `Ambil paket MBG di ${q.kitchen.name}`;
```

(`quest.test.ts` builds its kitchen as `'Dapur SPPG'`, so its existing assertion still passes.)

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/world/cityMap.ts src/world/cityMap.test.ts src/quest/quest.ts
git commit -m "feat: Purwokerto map layout with real SPPG/school names and landmarks"
```

---

### Task 4: Render landmarks, Menara Teratai, Gunung Slamet, low-rise ring

**Files:**
- Modify: `src/world/cityBuilder.ts`
- Modify: `src/render/scene.ts:25` (camera far)

**Interfaces:**
- Consumes: `LANDMARKS`, `MAP` from Task 3; `makeLabel` (existing, made auto-fit).
- Produces: nothing new exported; `buildCity` signature unchanged.

- [ ] **Step 1: Auto-fit long labels**

`makeLabel` in `src/world/cityBuilder.ts` draws at a fixed 96 px; "Alun-alun Purwokerto" / "SPPG Polresta Banyumas" overflow the 1008 px box. After `g.font = 'bold 96px …'` add:

```ts
  const w = g.measureText(text).width;
  if (w > 940) g.font = `bold ${Math.floor((96 * 940) / w)}px system-ui, sans-serif`;
```

- [ ] **Step 2: Add Menara Teratai + Gunung Slamet meshes**

Add near `makeLabel`:

```ts
const WHITE = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });

/** Lotus tower: slim stem, viewing deck, bulb. ~30 units tall so it reads as the city's landmark from anywhere. */
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

/** Gunung Slamet silhouette on the northern horizon; fog off so it stays a hazy blue shape instead of vanishing. */
function gunungSlamet(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(500, 160, 9),
    new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 1, flatShading: true, fog: false }),
  );
  m.position.set(8 * TILE, 80, -700);
  return m;
}
```

- [ ] **Step 3: Low-rise ring and landmark tiles in `buildCity`**

Change the `'X'` case to place commercial buildings (Purwokerto has no skyscrapers) and rewrite `default`:

```ts
        case 'X':
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, pick(COMMERCIAL, row, col), x, z, BUILDING_SCALE, rot));
          break;
        // ... H and T unchanged ...
        default: {
          const lm = LANDMARKS[ch];
          const poi = pois.find((p) => p.id === ch);
          const name = lm?.name ?? poi?.name;
          if (!name) return;
          const label = makeLabel(name);
          label.position.set(x, ch === 'M' ? 36 : 12, z);
          city.add(label);
          if (ch === 'A') return; // open lawn in the middle of the square
          if (ch === 'M') city.add(menaraTeratai(x, z));
          const model = lm?.model ?? POI_BUILDING[ch];
          jobs.push(place(city, 'tile-low', x, z, TILE));
          if (model) jobs.push(place(city, model, x, z, BUILDING_SCALE, rot));
        }
```

Then after the `map.forEach(...)` block, before `await Promise.all(jobs)`:

```ts
  city.add(gunungSlamet());
```

Update the import line to `import { MAP, TILE, LANDMARKS, tileCenter, roadSides, pickRoadModel, findPois, type Poi } from './cityMap';` and delete the now-unused `SKYSCRAPERS` and `SKYSCRAPER_SCALE` constants.

- [ ] **Step 4: Camera far plane**

`src/render/scene.ts`: `new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1500)` (was 600) so the mountain apex at z = −700 is not clipped from the south end of the map.

- [ ] **Step 5: Typecheck + visual check**

Run: `pnpm build` → PASS (tsc catches the removed constants / import).
Run: `pnpm dev`. Expected:
- Start facing east on the top road; a hazy blue mountain fills the northern horizon on the left; no skyscraper ring.
- Labels: "SPPG Polresta Banyumas" (NW block), "SDN 1 Bancarkembar" (N), "Menara Teratai" high above a white tower just west of the N block, "Kampus Unsoed" / "GOR Satria" (NE), "Stasiun Purwokerto" (W), "Alun-alun Purwokerto" over the tree square, "SDN 1 Sokanegara" (E), "SDN 1 Kranji" (SE).
- HUD reads "Ambil paket MBG di SPPG Polresta Banyumas"; full round (kitchen → 3 schools) completes; traffic unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/world/cityBuilder.ts src/render/scene.ts
git commit -m "feat: Purwokerto landmarks, Menara Teratai, Gunung Slamet horizon, low-rise ring"
```

---

### Task 5: Copy + spec amendment

**Files:**
- Modify: `index.html:7,17`, `README.md:1-3`
- Modify: `docs/superpowers/specs/2026-09-12-mbg-delivery-game-design.md`

- [ ] **Step 1: index.html**

`<title>Kurir MBG — Purwokerto</title>` and `<div id="loading">Memuat Purwokerto…</div>`.

- [ ] **Step 2: README**

Line 3 → `Game 3D browser bergaya GTA di kota Purwokerto: kemudikan mobil boks putih SPPG (Makan Bergizi Gratis) berlogo BGN, ambil paket di SPPG Polresta Banyumas, antar ke 3 SD sebelum waktu habis.`

- [ ] **Step 3: Spec amendment**

Append to the spec:

```markdown
## Amandemen 2026-09-12 — Purwokerto & livery BGN

- Kota = **Purwokerto**. POI nyata: dapur `SPPG Polresta Banyumas`; SD `SDN 1 Bancarkembar`, `SDN 1 Sokanegara`, `SDN 1 Kranji`.
- Tile landmark baru (scenery, bukan quest stop): `A` Alun-alun Purwokerto (pusat taman), `M` Menara Teratai (mesh prosedural ±30 unit), `S` Stasiun Purwokerto, `G` GOR Satria, `U` Kampus Unsoed — semua berlabel. Ring `X` kini gedung rendah (Purwokerto tanpa pencakar langit). Gunung Slamet = cone tanpa fog di utara (−z), camera far 1500.
- Mobil pemain: `delivery.glb` **putih** (UV body/door dipindah ke sel putih colormap Kenney), stiker livery di kedua sisi boks + pintu belakang: lambang BGN resmi (`public/logo-bgn.png`, warna resmi #071e49 / #92d05d), teks "MAKAN BERGIZI GRATIS", "SPPG POLRESTA BANYUMAS", strip hijau-biru.
- Teks quest "Ambil paket MBG di {nama dapur}".
```

- [ ] **Step 4: Build, test, commit**

Run: `pnpm build && pnpm test` → PASS.

```bash
git add index.html README.md docs/superpowers/specs/2026-09-12-mbg-delivery-game-design.md
git commit -m "docs: Purwokerto copy and spec amendment for BGN livery"
```

---

## Skipped on purpose (say so if asked)

- Street-name signs (Jl. Jend. Soedirman etc.) and minimap landmark icons — add if navigation feels anonymous.
- Cab-door mini logo and roof number plate — sides + rear already sell the livery.
- Replacing `delivery.glb` with a Gran Max-shaped model — Kenney van is close enough for low-poly; a custom model is a separate asset task.
- Removing the now-unused `building-skyscraper-*.glb` files from `public/models` / `fetch-assets.sh` — harmless on disk (~few hundred KB); delete in a later cleanup if bundle size matters.
