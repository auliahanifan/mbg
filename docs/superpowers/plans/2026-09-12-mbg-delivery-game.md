# Kurir MBG (GTA-style Delivery Game) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser 3D game (three.js) with a GTA-style chase camera where the player drives an MBG box truck, picks up meals at the SPPG kitchen and delivers them to 3 schools before the timer runs out, in a low-poly city with traffic.

**Architecture:** Vite + TypeScript + three.js. Pure game logic (map, car physics, collision, quest, traffic, camera math) lives in dependency-free modules tested with Vitest; three.js rendering modules consume them. City is a 17×17 tile grid built from Kenney CC0 glTF tiles; no physics engine — arcade car model + circle-vs-AABB collision.

**Tech Stack:** pnpm, Vite 6, TypeScript 5, three (latest, `three/addons/*`), Vitest. Assets: Kenney City Kit Roads / Commercial / Suburban + Car Kit (CC0). Deploy: Vercel static.

**Spec:** `docs/superpowers/specs/2026-09-12-mbg-delivery-game-design.md`

## Global Constraints

- Package manager: **pnpm** (lockfile `pnpm-lock.yaml` must be committed; Vercel detects it).
- Language for all in-game copy: **Indonesian**.
- Coordinate convention: y up. **Heading 0 = facing +z**, forward vector = `(sin(heading), 0, cos(heading))`. Positive steer turns **left** (heading increases). Kenney car models face +z natively, so `mesh.rotation.y = heading` needs no offset.
- Compass: N = −z, E = +x, S = +z, W = −x. Tile `(row, col)` center = `(x: col*8, z: row*8)`.
- One quarter turn of `Object3D.rotation.y` (+π/2) maps E→N→W→S→E.
- Traffic drives on the **left** (Indonesia).
- Pure modules (`src/world/cityMap.ts`, `src/vehicle/carPhysics.ts`, `src/vehicle/collision.ts`, `src/quest/quest.ts`, `src/traffic/traffic.ts`, `src/camera/chaseMath.ts`) must **not** import `three`.
- `pnpm build` = `tsc --noEmit && vite build` and must pass at the end of every task.
- Models are served from `public/models/<pack>/<name>.glb` (+ `<pack>/Textures/colormap.png`, pack ∈ roads|commercial|suburban|cars) and loaded via `loadModel(name)`, which resolves the pack from the name prefix.
- No mkdir of `docs/`; it already exists.

---

## File Structure

```
index.html                     canvas + HUD DOM + loading overlay
vite.config.ts                 vitest config
tsconfig.json
package.json
scripts/fetch-assets.sh        downloads Kenney zips, copies needed .glb into public/models
public/models/*.glb            committed assets (~4 MB) + LICENSE-kenney.txt
src/main.ts                    bootstrap + game loop (wires everything)
src/assets.ts                  GLTF loader with cache → clone
src/input.ts                   keyboard state → CarInput, one-shot keys
src/render/scene.ts            renderer, camera, Sky, lights, ground, fog
src/render/post.ts             EffectComposer (MSAA + bloom + output)
src/world/cityMap.ts           PURE: MAP, tile helpers, road model picker, POIs, collision boxes
src/world/cityBuilder.ts       three: instantiates tiles/buildings/labels into the scene
src/vehicle/carPhysics.ts      PURE: arcade car step
src/vehicle/collision.ts       PURE: circle vs AABB / circle, resolveCar
src/vehicle/playerCar.ts       three: delivery truck mesh, wheels, MBG decal
src/camera/chaseMath.ts        PURE: desired camera pos/look
src/camera/chaseCamera.ts      three: smoothed follow + sun shadow follow
src/quest/quest.ts             PURE: quest state machine
src/quest/markers.ts           three: target ring + arrow above truck
src/traffic/traffic.ts         PURE: agents on the road graph, left lane, blocking
src/traffic/trafficRenderer.ts three: car meshes for agents
src/ui/hud.ts                  DOM HUD + minimap canvas
```

---

### Task 1: Project scaffold + base scene (sky, sun, shadows, ground)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/render/scene.ts`

**Interfaces:**
- Produces: `createScene(canvas): SceneCtx` where `SceneCtx = { renderer, scene, camera, sun, sunDir }` (three types). Later tasks add objects to `ctx.scene`, move `ctx.sun`/`ctx.sun.target`, and render with `ctx.renderer`.

- [ ] **Step 1: Init project and install deps**

```bash
cd /Users/noice/Dev/personal/embegames
pnpm init
pnpm add three
pnpm add -D typescript vite vitest @types/three
```

- [ ] **Step 2: Write package.json scripts (replace the generated file's `scripts`, keep deps)**

```json
{
  "name": "kurir-mbg",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```
(Keep the `dependencies` / `devDependencies` blocks pnpm generated.)

- [ ] **Step 3: Write tsconfig.json, vite.config.ts, .gitignore**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true },
});
```

`.gitignore`:
```
node_modules
dist
.vercel
```

- [ ] **Step 4: Write index.html**

```html
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kurir MBG</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #000; font-family: system-ui, sans-serif; }
    canvas#game { display: block; width: 100%; height: 100%; }
    #hud { position: fixed; inset: 0; pointer-events: none; color: #fff; text-shadow: 0 1px 3px #000; }
    #loading { position: fixed; inset: 0; display: grid; place-items: center; background: #0b1020; color: #fff; font-size: 24px; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="hud"></div>
  <div id="loading">Memuat kota…</div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Write src/render/scene.ts**

```ts
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
}

export function createScene(canvas: HTMLCanvasElement): SceneCtx {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfd8e3, 70, 230);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(0, 6, -12);

  const sunDir = new THREE.Vector3(0.4, 0.55, 0.3).normalize();
  const sky = new Sky();
  sky.scale.setScalar(2000);
  const u = sky.material.uniforms;
  u.sunPosition.value.copy(sunDir);
  u.turbidity.value = 6;
  u.rayleigh.value = 1.5;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x6b7a4a, 0.6));

  const sun = new THREE.DirectionalLight(0xfff2dc, 2.5);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 45;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x5e7a3c, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera, sun, sunDir };
}
```

- [ ] **Step 6: Write src/main.ts (temporary smoke content, replaced in Task 4)**

```ts
import * as THREE from 'three';
import { createScene } from './render/scene';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
document.getElementById('loading')!.remove();

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: 0xffaa00 }),
);
cube.position.y = 1;
cube.castShadow = true;
ctx.scene.add(cube);
ctx.camera.lookAt(0, 1, 0);

ctx.renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01;
  ctx.renderer.render(ctx.scene, ctx.camera);
});
```

- [ ] **Step 7: Verify build + test runner + visual**

Run: `pnpm build && pnpm test`
Expected: tsc passes, `dist/` created, vitest prints "No test files found" and exits 0.

Run: `pnpm dev` and open http://localhost:5173
Expected: blue gradient sky, green ground, orange spinning cube with a soft shadow. No console errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold vite+three project with sky, sun and shadows"
```

---

### Task 2: Kenney assets + GLTF loader

> **Amendment (2026-09-12, during execution):** the Kenney GLBs reference an external `Textures/colormap.png` (one per pack), so the flat `public/models/` layout renders everything white. Actual layout is `public/models/<pack>/{*.glb,Textures/colormap.png}` with pack ∈ `roads|commercial|suburban|cars`; `src/assets.ts` derives the pack from the model-name prefix (`packOf(name)`, tested in `src/assets.test.ts`) and `loadModel(name)` keeps its interface. The steps below show the original flat layout.


**Files:**
- Create: `scripts/fetch-assets.sh`, `public/models/*.glb` (generated), `public/models/LICENSE-kenney.txt`, `src/assets.ts`
- Modify: `src/main.ts` (temporary visual check)

**Interfaces:**
- Produces: `loadModel(name: string): Promise<THREE.Group>` — fetches `/models/<name>.glb` once (cached), returns a **clone** with `castShadow`/`receiveShadow` set on every mesh. Model names available (exact): roads `road-straight, road-crossing, road-bend, road-intersection, road-crossroad, road-end, tile-low, light-curved`; commercial `building-a … building-n`, `building-skyscraper-a … building-skyscraper-e`; suburban `building-type-a … building-type-f`, `tree-large, tree-small`; cars `delivery, sedan, suv, taxi, van, hatchback-sports, truck`.
- Model facts (measured): road tiles are 1×1 units (scale ×8 to fill a tile). `road-straight` runs along **x** (open W,E). `road-bend` open **W,S**. `road-intersection` (T) open **W,E,S**. `road-end` open **E**. Cars are ~1.5 wide × ~3 long, origin at ground, front = +z; wheels are child nodes named `wheel-front-left`, `wheel-front-right`, `wheel-back-left`, `wheel-back-right` (radius 0.3). `delivery` is 2.5 tall.

- [ ] **Step 1: Write scripts/fetch-assets.sh**

```bash
#!/usr/bin/env bash
# Downloads Kenney CC0 packs and copies only the models the game uses into public/models.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
mkdir -p public/models

while read -r pack url; do
  echo "fetching $pack"
  curl -sSL -o "$tmp/$pack.zip" "$url"
  unzip -qo "$tmp/$pack.zip" -d "$tmp/$pack"
done <<'EOF'
roads https://kenney.nl/media/pages/assets/city-kit-roads/74288c9459-1787042796/kenney_city-kit-roads.zip
commercial https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip
suburban https://kenney.nl/media/pages/assets/city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip
cars https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip
EOF

copy() { # copy <pack> <names...>
  local pack=$1; shift
  for n in "$@"; do cp "$tmp/$pack/Models/GLB format/$n.glb" public/models/; done
}
copy roads road-straight road-crossing road-bend road-intersection road-crossroad road-end tile-low light-curved
copy commercial building-a building-b building-c building-d building-e building-f building-g building-h \
  building-i building-j building-k building-l building-m building-n \
  building-skyscraper-a building-skyscraper-b building-skyscraper-c building-skyscraper-d building-skyscraper-e
copy suburban building-type-a building-type-b building-type-c building-type-d building-type-e building-type-f tree-large tree-small
copy cars delivery sedan suv taxi van hatchback-sports truck
cp "$tmp/cars/License.txt" public/models/LICENSE-kenney.txt
rm -rf "$tmp"
ls public/models | wc -l
```

If a URL 404s (Kenney rotates the hash in the path), get the current one with
`curl -sL https://kenney.nl/assets/<pack-slug> | grep -oE 'https?://[^"]*\.zip'` (slugs: `city-kit-roads`, `city-kit-commercial`, `city-kit-suburban`, `car-kit`) and update the script.

- [ ] **Step 2: Run it**

Run: `chmod +x scripts/fetch-assets.sh && ./scripts/fetch-assets.sh`
Expected: last line prints `43` (42 glb + license). `ls public/models/delivery.glb public/models/road-bend.glb` both exist.

- [ ] **Step 3: Write src/assets.ts**

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

/** Loads /models/<name>.glb once; every call returns a fresh clone (geometry/materials shared). */
export async function loadModel(name: string): Promise<THREE.Group> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`/models/${name}.glb`).then((gltf) => {
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

- [ ] **Step 4: Temporary visual check in src/main.ts (replace the cube block)**

```ts
import { createScene } from './render/scene';
import { loadModel } from './assets';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);

const road = await loadModel('road-straight');
road.scale.setScalar(8);
ctx.scene.add(road);
const truck = await loadModel('delivery');
truck.position.set(0, 0, 0);
ctx.scene.add(truck);
document.getElementById('loading')!.remove();

ctx.camera.position.set(6, 5, -10);
ctx.camera.lookAt(0, 1, 0);
ctx.renderer.setAnimationLoop(() => {
  truck.rotation.y += 0.01;
  ctx.renderer.render(ctx.scene, ctx.camera);
});
```
(Top-level `await` is fine: Vite targets ES2022 modules.)

- [ ] **Step 5: Verify**

Run: `pnpm build && pnpm dev`, open http://localhost:5173
Expected: an 8-unit road tile (grey asphalt with sidewalks running left-right) and a white/orange box truck rotating on it, casting a shadow. No 404s in the Network tab.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Kenney CC0 city/car assets and cached GLTF loader"
```

---

### Task 3: City map (pure): tiles, road model picker, POIs, collision boxes

**Files:**
- Create: `src/world/cityMap.ts`
- Test: `src/world/cityMap.test.ts`

**Interfaces:**
- Produces (all pure, no three):
  - `TILE = 8`, `type Dir = 'N'|'E'|'S'|'W'`, `DIR_VEC: Record<Dir,{dx,dz}>`, `rotateDir(d, quarterTurns): Dir`, `opposite(d)`, `leftOf(d)`, `headingOf(d): number`
  - `MAP: string[]` (17×17)
  - `tileAt(map,row,col): string` (out of bounds → `'X'`), `isRoad(map,row,col)`, `tileCenter(row,col): {x,z}`, `worldToTile(x,z): {row,col}`
  - `roadSides(map,row,col): Dir[]` (neighbouring road directions, order N,E,S,W)
  - `pickRoadModel(sides: Dir[]): { name: string; rotationY: number }`
  - `interface Box { minX; maxX; minZ; maxZ }`, `collisionBoxes(map): Box[]` (one per non-road tile)
  - `interface Poi { id; name; kind: 'kitchen'|'school'; row; col; stop: { row; col; x; z } }`, `findPois(map): Poi[]`
  - `roadTiles(map): {row,col}[]`

- [ ] **Step 1: Write the failing tests**

`src/world/cityMap.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  MAP, TILE, rotateDir, opposite, leftOf, headingOf, tileAt, isRoad, tileCenter, worldToTile,
  roadSides, pickRoadModel, collisionBoxes, findPois, roadTiles,
} from './cityMap';

const small = [
  'XXXX',
  'XRRX',
  'XR.X',
  'XXXX',
];

describe('directions', () => {
  it('quarter turn cycles E→N→W→S→E', () => {
    expect(rotateDir('E', 1)).toBe('N');
    expect(rotateDir('N', 1)).toBe('W');
    expect(rotateDir('W', 1)).toBe('S');
    expect(rotateDir('S', 1)).toBe('E');
    expect(rotateDir('E', 4)).toBe('E');
    expect(rotateDir('E', -1)).toBe('S');
  });
  it('opposite/left/heading', () => {
    expect(opposite('N')).toBe('S');
    expect(leftOf('E')).toBe('N');
    expect(headingOf('S')).toBeCloseTo(0);
    expect(headingOf('E')).toBeCloseTo(Math.PI / 2);
    expect(headingOf('N')).toBeCloseTo(Math.PI);
  });
});

describe('tiles', () => {
  it('reads tiles and treats out-of-bounds as solid X', () => {
    expect(tileAt(small, 1, 1)).toBe('R');
    expect(tileAt(small, -1, 0)).toBe('X');
    expect(tileAt(small, 0, 99)).toBe('X');
    expect(isRoad(small, 1, 2)).toBe(true);
    expect(isRoad(small, 2, 2)).toBe(false);
  });
  it('converts tile <-> world', () => {
    expect(tileCenter(2, 3)).toEqual({ x: 24, z: 16 });
    expect(worldToTile(24, 16)).toEqual({ row: 2, col: 3 });
    expect(worldToTile(27.9, 12.1)).toEqual({ row: 2, col: 3 });
  });
  it('lists road neighbours', () => {
    expect(roadSides(small, 1, 1)).toEqual(['E', 'S']);
    expect(roadSides(small, 1, 2)).toEqual(['W']);
  });
  it('MAP is 17x17 and every road tile has a road neighbour', () => {
    expect(MAP.length).toBe(17);
    for (const row of MAP) expect(row.length).toBe(17);
    for (const { row, col } of roadTiles(MAP)) expect(roadSides(MAP, row, col).length).toBeGreaterThan(0);
  });
});

describe('pickRoadModel', () => {
  it('straight W-E has rotation 0, N-S is a quarter turn', () => {
    expect(pickRoadModel(['E', 'W'])).toEqual({ name: 'road-straight', rotationY: 0 });
    expect(pickRoadModel(['N', 'S'])).toEqual({ name: 'road-straight', rotationY: Math.PI / 2 });
  });
  it('bend: model opens W,S; N,E needs a half turn', () => {
    expect(pickRoadModel(['S', 'W'])).toEqual({ name: 'road-bend', rotationY: 0 });
    expect(pickRoadModel(['N', 'E'])).toEqual({ name: 'road-bend', rotationY: Math.PI });
  });
  it('T, crossroad, end', () => {
    expect(pickRoadModel(['E', 'S', 'W'])).toEqual({ name: 'road-intersection', rotationY: 0 });
    expect(pickRoadModel(['N', 'E', 'S', 'W']).name).toBe('road-crossroad');
    expect(pickRoadModel(['E'])).toEqual({ name: 'road-end', rotationY: 0 });
    expect(pickRoadModel(['N'])).toEqual({ name: 'road-end', rotationY: Math.PI / 2 });
  });
  it('falls back to straight for isolated tiles', () => {
    expect(pickRoadModel([]).name).toBe('road-straight');
  });
});

describe('collisionBoxes', () => {
  it('makes one 8x8 box per non-road tile', () => {
    const boxes = collisionBoxes(small);
    expect(boxes.length).toBe(16 - 3);
    expect(boxes).toContainEqual({ minX: 2 * TILE - 4, maxX: 2 * TILE + 4, minZ: 2 * TILE - 4, maxZ: 2 * TILE + 4 });
  });
});

describe('findPois', () => {
  it('finds kitchen + 3 schools in MAP with a road stop next to each', () => {
    const pois = findPois(MAP);
    expect(pois.map((p) => p.id)).toEqual(['K', '1', '2', '3']);
    const k = pois[0];
    expect(k.kind).toBe('kitchen');
    expect(k.name).toBe('Dapur SPPG');
    expect(k).toMatchObject({ row: 3, col: 3, stop: { row: 2, col: 3, x: 24, z: 16 } });
    for (const p of pois) expect(isRoad(MAP, p.stop.row, p.stop.col)).toBe(true);
  });
  it('throws when a POI has no adjacent road', () => {
    expect(() => findPois(['XXX', 'XKX', 'XXX'])).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./cityMap`.

- [ ] **Step 3: Write src/world/cityMap.ts**

```ts
export const TILE = 8;
export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_VEC: Record<Dir, { dx: number; dz: number }> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 },
};
// One quarter turn of Object3D.rotation.y (+PI/2) maps E->N->W->S->E.
const TURN: Record<Dir, Dir> = { E: 'N', N: 'W', W: 'S', S: 'E' };

export function rotateDir(d: Dir, quarterTurns: number): Dir {
  let r = d;
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) r = TURN[r];
  return r;
}
export const opposite = (d: Dir): Dir => rotateDir(d, 2);
export const leftOf = (d: Dir): Dir => rotateDir(d, 1);
/** Heading such that forward = (sin h, cos h) points along d. */
export const headingOf = (d: Dir): number => Math.atan2(DIR_VEC[d].dx, DIR_VEC[d].dz);

// R road, . commercial, X skyscraper ring, H house, T park, K SPPG kitchen, 1-3 schools
export const MAP: string[] = [
  'XXXXXXXXXXXXXXXXX',
  'X...............X',
  'X.RRRRRRRRRRRRR.X',
  'X.RK..R.1.RHHHR.X',
  'X.R...R...RHHHR.X',
  'X.R...R...RHHHR.X',
  'X.RRRRRRRRRRRRR.X',
  'X.R...RTTTR...R.X',
  'X.R...RTTTR..2R.X',
  'X.R...RTTTR...R.X',
  'X.RRRRRRRRRRRRR.X',
  'X.RHHHR...RHHHR.X',
  'X.RHHHR...RHHHR.X',
  'X.RHHHR.3.RHHHR.X',
  'X.RRRRRRRRRRRRR.X',
  'X...............X',
  'XXXXXXXXXXXXXXXXX',
];

export const tileAt = (map: string[], row: number, col: number): string => map[row]?.[col] ?? 'X';
export const isRoad = (map: string[], row: number, col: number): boolean => tileAt(map, row, col) === 'R';
export const tileCenter = (row: number, col: number) => ({ x: col * TILE, z: row * TILE });
export const worldToTile = (x: number, z: number) => ({ row: Math.round(z / TILE), col: Math.round(x / TILE) });

export function roadSides(map: string[], row: number, col: number): Dir[] {
  return DIRS.filter((d) => isRoad(map, row + DIR_VEC[d].dz, col + DIR_VEC[d].dx));
}

export function roadTiles(map: string[]): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  map.forEach((line, row) => [...line].forEach((ch, col) => ch === 'R' && out.push({ row, col })));
  return out;
}

// Open sides of each Kenney road model in its native orientation (measured from the glb).
const ROAD_MODELS: { name: string; open: Dir[] }[] = [
  { name: 'road-crossroad', open: ['N', 'E', 'S', 'W'] },
  { name: 'road-intersection', open: ['W', 'E', 'S'] },
  { name: 'road-straight', open: ['W', 'E'] },
  { name: 'road-bend', open: ['W', 'S'] },
  { name: 'road-end', open: ['E'] },
];
const key = (ds: Dir[]) => [...ds].sort().join('');

export function pickRoadModel(sides: Dir[]): { name: string; rotationY: number } {
  const want = key(sides);
  for (const m of ROAD_MODELS) {
    for (let k = 0; k < 4; k++) {
      if (key(m.open.map((d) => rotateDir(d, k))) === want) return { name: m.name, rotationY: (k * Math.PI) / 2 };
    }
  }
  return { name: 'road-straight', rotationY: 0 };
}

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

export function collisionBoxes(map: string[]): Box[] {
  const out: Box[] = [];
  map.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === 'R') return;
      const { x, z } = tileCenter(row, col);
      out.push({ minX: x - TILE / 2, maxX: x + TILE / 2, minZ: z - TILE / 2, maxZ: z + TILE / 2 });
    }),
  );
  return out;
}

export interface Poi {
  id: string;
  name: string;
  kind: 'kitchen' | 'school';
  row: number;
  col: number;
  stop: { row: number; col: number; x: number; z: number };
}

const POI_INFO: Record<string, { kind: Poi['kind']; name: string }> = {
  K: { kind: 'kitchen', name: 'Dapur SPPG' },
  '1': { kind: 'school', name: 'SDN 1 Merdeka' },
  '2': { kind: 'school', name: 'SDN 2 Harapan' },
  '3': { kind: 'school', name: 'SDN 3 Nusantara' },
};

export function findPois(map: string[]): Poi[] {
  const out: Poi[] = [];
  map.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      const info = POI_INFO[ch];
      if (!info) return;
      const side = roadSides(map, row, col)[0];
      if (!side) throw new Error(`POI ${ch} at ${row},${col} has no adjacent road`);
      const srow = row + DIR_VEC[side].dz;
      const scol = col + DIR_VEC[side].dx;
      out.push({ id: ch, ...info, row, col, stop: { row: srow, col: scol, ...tileCenter(srow, scol) } });
    }),
  );
  return out; // scan order in MAP is already K, 1, 2, 3
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: all cityMap tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world
git commit -m "feat: pure city map with road model picker, POIs and collision boxes"
```

---

### Task 4: City builder (three) + main loads the city

**Files:**
- Create: `src/world/cityBuilder.ts`
- Modify: `src/main.ts` (replace whole file)

**Interfaces:**
- Consumes: `loadModel` (Task 2); `MAP, TILE, tileAt, tileCenter, roadSides, pickRoadModel, findPois, Poi` (Task 3).
- Produces: `buildCity(scene: THREE.Scene, map?: string[]): Promise<{ pois: Poi[] }>`.

- [ ] **Step 1: Write src/world/cityBuilder.ts**

```ts
import * as THREE from 'three';
import { loadModel } from '../assets';
import { MAP, TILE, tileAt, tileCenter, roadSides, pickRoadModel, findPois, type Poi } from './cityMap';

const COMMERCIAL = 'abcdefghijklmn'.split('').map((c) => `building-${c}`);
const SKYSCRAPERS = 'abcde'.split('').map((c) => `building-skyscraper-${c}`);
const HOUSES = 'abcdef'.split('').map((c) => `building-type-${c}`);
const POI_BUILDING: Record<string, string> = { K: 'building-k', '1': 'building-d', '2': 'building-d', '3': 'building-d' };

const hash = (r: number, c: number) => ((r * 73856093) ^ (c * 19349663)) >>> 0;
const pick = (arr: string[], r: number, c: number) => arr[hash(r, c) % arr.length];

async function place(parent: THREE.Object3D, name: string, x: number, z: number, scale: number, rotY = 0) {
  const m = await loadModel(name);
  m.position.set(x, 0, z);
  m.scale.setScalar(scale);
  m.rotation.y = rotY;
  parent.add(m);
  return m;
}

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,20,40,0.75)';
  g.roundRect(8, 8, 1008, 176, 40);
  g.fill();
  g.font = 'bold 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(16, 3, 1);
  return s;
}

export async function buildCity(scene: THREE.Scene, map: string[] = MAP): Promise<{ pois: Poi[] }> {
  const city = new THREE.Group();
  scene.add(city);
  const pois = findPois(map);
  const stopKeys = new Set(pois.map((p) => `${p.stop.row},${p.stop.col}`));
  const jobs: Promise<unknown>[] = [];

  map.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      const { x, z } = tileCenter(row, col);
      const rot = (hash(row, col) % 4) * (Math.PI / 2);
      switch (ch) {
        case 'R': {
          const sides = roadSides(map, row, col);
          let { name, rotationY } = pickRoadModel(sides);
          if (name === 'road-straight' && stopKeys.has(`${row},${col}`)) name = 'road-crossing';
          jobs.push(
            place(city, name, x, z, TILE, rotationY).then(async (tile) => {
              if (name === 'road-straight' && (row + col) % 3 === 0) {
                const lamp = await loadModel('light-curved'); // inherits tile scale; arm points to local -z = the road
                lamp.position.set(0.15, 0, 0.45);
                tile.add(lamp);
              }
            }),
          );
          break;
        }
        case '.':
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, pick(COMMERCIAL, row, col), x, z, TILE, rot));
          break;
        case 'X':
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, pick(SKYSCRAPERS, row, col), x, z, 5.5, rot));
          break;
        case 'H':
          jobs.push(place(city, pick(HOUSES, row, col), x, z, 5, rot), place(city, 'tree-small', x + 3, z + 3, TILE));
          break;
        case 'T':
          jobs.push(
            place(city, 'tree-large', x - 2, z - 2, TILE),
            place(city, 'tree-large', x + 2, z + 2, TILE),
            place(city, 'tree-small', x + 2, z - 2, TILE),
          );
          break;
        default: {
          const poi = pois.find((p) => p.id === ch);
          if (!poi) return;
          const label = makeLabel(poi.name);
          label.position.set(x, 12, z);
          city.add(label);
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, POI_BUILDING[ch], x, z, TILE, rot));
        }
      }
    }),
  );

  await Promise.all(jobs);
  return { pois };
}
```

- [ ] **Step 2: Replace src/main.ts**

```ts
import * as THREE from 'three';
import { createScene } from './render/scene';
import { buildCity } from './world/cityBuilder';
import { tileCenter } from './world/cityMap';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const { pois } = await buildCity(ctx.scene);
document.getElementById('loading')!.remove();
console.log('POIs', pois);

// temporary orbit-ish overview until the player car exists (Task 5)
const center = tileCenter(8, 8);
let t = 0;
ctx.renderer.setAnimationLoop(() => {
  t += 0.003;
  ctx.camera.position.set(center.x + Math.sin(t) * 90, 45, center.z + Math.cos(t) * 90);
  ctx.camera.lookAt(center.x, 0, center.z);
  ctx.sun.position.set(center.x, 0, center.z).add(new THREE.Vector3().copy(ctx.sunDir).multiplyScalar(80));
  ctx.sun.target.position.set(center.x, 0, center.z);
  ctx.renderer.render(ctx.scene, ctx.camera);
});
```

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm dev`, open http://localhost:5173
Expected: a slowly orbiting overview of a 17×17 city: 4×4 road grid with correctly joined straights/bends/T/crossroads (no sidewalks cutting across a road — if a tile looks wrong, the `ROAD_MODELS.open` entry for that model in `cityMap.ts` is the only thing to fix), skyscraper ring, central park with trees, three suburban blocks, labels "Dapur SPPG", "SDN 1 Merdeka", "SDN 2 Harapan", "SDN 3 Nusantara" floating above their buildings, lamp posts on some straight roads on the sidewalk with the arm over the road. Console: `POIs` array of 4. No 404s.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: build the city from Kenney tiles with POI labels"
```

---

### Task 5: Car physics (pure) + keyboard input + drivable player truck

**Files:**
- Create: `src/vehicle/carPhysics.ts`, `src/vehicle/carPhysics.test.ts`, `src/input.ts`, `src/vehicle/playerCar.ts`
- Modify: `src/main.ts` (replace whole file)

**Interfaces:**
- Produces:
  - `interface CarState { x; z; heading; speed }`, `interface CarInput { throttle: number; steer: number; brake: boolean }` (throttle −1..1, steer −1..1 where +1 = left)
  - `MAX_SPEED = 28`, `stepCar(s: CarState, input: CarInput, dt: number): CarState` (pure, returns new state)
  - `readCarInput(): CarInput`, `consumeKey(code: string): boolean` (true once per physical key press)
  - `createPlayerCar(scene): Promise<PlayerCar>` with `PlayerCar = { group: THREE.Group; sync(state: CarState, input: CarInput, dt: number): void }`

- [ ] **Step 1: Write the failing tests**

`src/vehicle/carPhysics.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { stepCar, MAX_SPEED, type CarState } from './carPhysics';

const rest: CarState = { x: 0, z: 0, heading: 0, speed: 0 };
const idle = { throttle: 0, steer: 0, brake: false };
const run = (s: CarState, input: typeof idle, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) s = stepCar(s, input, 1 / 60);
  return s;
};

describe('stepCar', () => {
  it('accelerates forward along +z at heading 0', () => {
    const s = run(rest, { ...idle, throttle: 1 }, 1);
    expect(s.speed).toBeGreaterThan(5);
    expect(s.z).toBeGreaterThan(1);
    expect(s.x).toBeCloseTo(0);
  });
  it('never exceeds MAX_SPEED', () => {
    const s = run(rest, { ...idle, throttle: 1 }, 20);
    expect(s.speed).toBeLessThanOrEqual(MAX_SPEED);
    expect(s.speed).toBeGreaterThan(MAX_SPEED * 0.6);
  });
  it('reverse is slow and capped', () => {
    const s = run(rest, { ...idle, throttle: -1 }, 10);
    expect(s.speed).toBeLessThan(0);
    expect(s.speed).toBeGreaterThanOrEqual(-8);
  });
  it('does not steer when stationary, steers left (heading up) when moving', () => {
    expect(stepCar(rest, { ...idle, steer: 1 }, 0.1).heading).toBe(0);
    const moving = { ...rest, speed: 10 };
    expect(stepCar(moving, { ...idle, steer: 1 }, 0.1).heading).toBeGreaterThan(0);
    expect(stepCar(moving, { ...idle, steer: -1 }, 0.1).heading).toBeLessThan(0);
  });
  it('steering is mirrored in reverse', () => {
    expect(stepCar({ ...rest, speed: -5 }, { ...idle, steer: 1 }, 0.1).heading).toBeLessThan(0);
  });
  it('coasts to a stop and brake stops faster', () => {
    const coast = run({ ...rest, speed: 20 }, idle, 3);
    const braked = run({ ...rest, speed: 20 }, { ...idle, brake: true }, 3);
    expect(coast.speed).toBeLessThan(20);
    expect(braked.speed).toBeCloseTo(0, 1);
    expect(braked.speed).toBeLessThan(coast.speed);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./carPhysics`.

- [ ] **Step 3: Write src/vehicle/carPhysics.ts**

```ts
export interface CarState { x: number; z: number; heading: number; speed: number }
export interface CarInput { throttle: number; steer: number; brake: boolean }

export const MAX_SPEED = 28;
const REVERSE_MAX = 8;
const ACCEL = 14;
const BRAKE = 30;
const ROLLING = 3;
const DRAG = 0.35; // per second, proportional
const TURN_RATE = 2.2; // rad/s at full grip

const moveToward = (v: number, target: number, maxDelta: number) =>
  Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta;

/** Arcade car model: scalar speed along heading, steering scaled by speed. Pure. */
export function stepCar(s: CarState, input: CarInput, dt: number): CarState {
  let speed = s.speed;
  if (input.brake) speed = moveToward(speed, 0, BRAKE * dt);
  else if (input.throttle > 0) speed = moveToward(speed, MAX_SPEED, ACCEL * input.throttle * dt);
  else if (input.throttle < 0) speed = moveToward(speed, -REVERSE_MAX, ACCEL * -input.throttle * dt);
  else speed = moveToward(speed, 0, ROLLING * dt);
  speed -= speed * DRAG * dt;

  const a = Math.abs(speed);
  const grip = Math.min(a / 8, 1) * (1 - 0.35 * Math.min(a / MAX_SPEED, 1));
  const heading = s.heading + input.steer * TURN_RATE * grip * Math.sign(speed) * dt;
  return {
    x: s.x + Math.sin(heading) * speed * dt,
    z: s.z + Math.cos(heading) * speed * dt,
    heading,
    speed,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: carPhysics tests PASS (cityMap still passing).

- [ ] **Step 5: Write src/input.ts**

```ts
import type { CarInput } from './vehicle/carPhysics';

const down = new Set<string>();
const pressed = new Set<string>();

addEventListener('keydown', (e) => {
  if (!down.has(e.code)) pressed.add(e.code);
  down.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

const axis = (a: string, b: string) => (down.has(a) || down.has(b) ? 1 : 0);

export function readCarInput(): CarInput {
  return {
    throttle: axis('KeyW', 'ArrowUp') - axis('KeyS', 'ArrowDown'),
    steer: axis('KeyA', 'ArrowLeft') - axis('KeyD', 'ArrowRight'),
    brake: down.has('Space'),
  };
}

/** True exactly once per physical key press. */
export function consumeKey(code: string): boolean {
  return pressed.delete(code);
}
```

- [ ] **Step 6: Write src/vehicle/playerCar.ts**

```ts
import * as THREE from 'three';
import { loadModel } from '../assets';
import type { CarInput, CarState } from './carPhysics';

const WHEEL_RADIUS = 0.3;

export interface PlayerCar {
  group: THREE.Group;
  sync(state: CarState, input: CarInput, dt: number): void;
}

function mbgDecal(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d4ed8';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = 'bold 150px system-ui, sans-serif';
  g.fillText('MBG', 256, 150);
  g.font = 'bold 44px system-ui, sans-serif';
  g.fillText('Makan Bergizi Gratis', 256, 220);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
}

export async function createPlayerCar(scene: THREE.Scene): Promise<PlayerCar> {
  const group = await loadModel('delivery');
  scene.add(group);

  // decals on both sides of the cargo box (body is 1.5 wide; box sits roughly y 1..2.5, z -1.6..0.4)
  for (const side of [1, -1]) {
    const d = mbgDecal();
    d.position.set(side * 0.76, 1.65, -0.55);
    d.rotation.y = side * (Math.PI / 2);
    group.add(d);
  }

  const wheels = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']
    .map((n) => group.getObjectByName(n))
    .filter((o): o is THREE.Object3D => !!o);
  const front = wheels.slice(0, 2);

  return {
    group,
    sync(state, input, dt) {
      group.position.set(state.x, 0, state.z);
      group.rotation.y = state.heading;
      for (const w of wheels) w.rotation.x += (state.speed * dt) / WHEEL_RADIUS;
      for (const w of front) w.rotation.y = input.steer * 0.45;
    },
  };
}
```

- [ ] **Step 7: Replace src/main.ts (temporary static-offset camera; real chase cam in Task 7)**

```ts
import * as THREE from 'three';
import { createScene } from './render/scene';
import { buildCity } from './world/cityBuilder';
import { tileCenter } from './world/cityMap';
import { stepCar, type CarState } from './vehicle/carPhysics';
import { createPlayerCar } from './vehicle/playerCar';
import { readCarInput } from './input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const { pois } = await buildCity(ctx.scene);
const player = await createPlayerCar(ctx.scene);
document.getElementById('loading')!.remove();
console.log('POIs', pois);

const start = tileCenter(2, 5);
let car: CarState = { x: start.x, z: start.z, heading: Math.PI / 2, speed: 0 }; // facing east along the top road

const clock = new THREE.Clock();
ctx.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const input = readCarInput();
  car = stepCar(car, input, dt);
  player.sync(car, input, dt);

  ctx.camera.position.set(car.x - Math.sin(car.heading) * 10, 5, car.z - Math.cos(car.heading) * 10);
  ctx.camera.lookAt(car.x, 1.5, car.z);
  ctx.sun.position.set(car.x, 0, car.z).add(new THREE.Vector3().copy(ctx.sunDir).multiplyScalar(80));
  ctx.sun.target.position.set(car.x, 0, car.z);
  ctx.renderer.render(ctx.scene, ctx.camera);
});
```

- [ ] **Step 8: Verify**

Run: `pnpm build && pnpm dev`, open http://localhost:5173
Expected: truck on the top road facing east, "MBG / Makan Bergizi Gratis" blue decal on both sides of the box (if the decal floats off the box or is buried, adjust only `d.position` in `playerCar.ts`). W accelerates, S reverses, A turns left, D right, Space brakes; wheels spin and front wheels steer. Truck currently drives through buildings (fixed in Task 6). Shadow stays under the truck.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: arcade car physics, keyboard input and drivable MBG truck"
```

---

### Task 6: Collision (pure) — buildings and other cars block the truck

**Files:**
- Create: `src/vehicle/collision.ts`, `src/vehicle/collision.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Box` (Task 3), `CarState` (Task 5).
- Produces: `interface Circle { x; z; r }`, `CAR_RADIUS = 0.9`, `pushOutOfBox(c: Circle, b: Box): {dx,dz} | null`, `resolveCar(s: CarState, boxes: Box[], circles: Circle[]): CarState` (samples two circles at ±1 along heading; on any hit pushes the car out and multiplies speed by 0.4).

- [ ] **Step 1: Write the failing tests**

`src/vehicle/collision.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pushOutOfBox, resolveCar, CAR_RADIUS } from './collision';

const box = { minX: 0, maxX: 8, minZ: 0, maxZ: 8 };

describe('pushOutOfBox', () => {
  it('returns null when clear', () => {
    expect(pushOutOfBox({ x: 10, z: 4, r: 1 }, box)).toBeNull();
  });
  it('pushes a circle overlapping an edge straight out', () => {
    const p = pushOutOfBox({ x: 8.5, z: 4, r: 1 }, box)!;
    expect(p.dx).toBeCloseTo(0.5);
    expect(p.dz).toBeCloseTo(0);
  });
  it('pushes a circle overlapping a corner diagonally', () => {
    const p = pushOutOfBox({ x: 8.5, z: 8.5, r: 1 }, box)!;
    expect(p.dx).toBeCloseTo(p.dz);
    expect(Math.hypot(8.5 + p.dx - 8, 8.5 + p.dz - 8)).toBeCloseTo(1);
  });
  it('pushes a centre inside the box out through the nearest face', () => {
    const p = pushOutOfBox({ x: 7.5, z: 4, r: 1 }, box)!;
    expect(p.dx).toBeCloseTo(1.5);
    expect(p.dz).toBeCloseTo(0);
  });
});

describe('resolveCar', () => {
  it('leaves a clear car untouched', () => {
    const s = { x: 20, z: 20, heading: 0, speed: 10 };
    expect(resolveCar(s, [box], [])).toEqual(s);
  });
  it('pushes the car out of a building and slows it', () => {
    // facing +x; rear sample sits on the box's east face (x = 8)
    const s = { x: 9, z: 4, heading: Math.PI / 2, speed: 10 };
    const r = resolveCar(s, [box], []);
    expect(r.x).toBeCloseTo(9 + CAR_RADIUS);
    expect(r.z).toBeCloseTo(4);
    expect(r.speed).toBeCloseTo(4);
  });
  it('pushes the car away from another car circle', () => {
    const s = { x: 0, z: 0, heading: 0, speed: 10 };
    const r = resolveCar(s, [], [{ x: 0, z: 2, r: 1.4 }]); // front sample at z=1 overlaps
    expect(r.z).toBeLessThan(0);
    expect(r.speed).toBeCloseTo(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./collision`.

- [ ] **Step 3: Write src/vehicle/collision.ts**

```ts
import type { Box } from '../world/cityMap';
import type { CarState } from './carPhysics';

export interface Circle { x: number; z: number; r: number }
export const CAR_RADIUS = 0.9;
const SAMPLE_OFFSETS = [1, -1]; // front/back sample circles along heading
const HIT_SPEED_FACTOR = 0.4;

/** Minimal translation that moves circle c out of box b, or null when not overlapping. */
export function pushOutOfBox(c: Circle, b: Box): { dx: number; dz: number } | null {
  const px = Math.max(b.minX, Math.min(c.x, b.maxX));
  const pz = Math.max(b.minZ, Math.min(c.z, b.maxZ));
  const dx = c.x - px;
  const dz = c.z - pz;
  const d = Math.hypot(dx, dz);
  if (d >= c.r) return null;
  if (d > 1e-6) return { dx: (dx / d) * (c.r - d), dz: (dz / d) * (c.r - d) };
  // centre is inside the box: leave through the nearest face
  const faces = [
    { dx: -(c.x - b.minX + c.r), dz: 0, pen: c.x - b.minX },
    { dx: b.maxX - c.x + c.r, dz: 0, pen: b.maxX - c.x },
    { dx: 0, dz: -(c.z - b.minZ + c.r), pen: c.z - b.minZ },
    { dx: 0, dz: b.maxZ - c.z + c.r, pen: b.maxZ - c.z },
  ];
  const f = faces.reduce((a, b) => (b.pen < a.pen ? b : a));
  return { dx: f.dx, dz: f.dz };
}

function pushOutOfCircle(c: Circle, o: Circle): { dx: number; dz: number } | null {
  const dx = c.x - o.x;
  const dz = c.z - o.z;
  const d = Math.hypot(dx, dz);
  const min = c.r + o.r;
  if (d >= min) return null;
  if (d < 1e-6) return { dx: min, dz: 0 };
  return { dx: (dx / d) * (min - d), dz: (dz / d) * (min - d) };
}

/** Pushes the car (two sample circles) out of boxes/circles; a hit scales speed down. Pure. */
export function resolveCar(s: CarState, boxes: Box[], circles: Circle[]): CarState {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  let x = s.x;
  let z = s.z;
  let hit = false;
  for (const off of SAMPLE_OFFSETS) {
    const c: Circle = { x: x + fx * off, z: z + fz * off, r: CAR_RADIUS };
    const apply = (p: { dx: number; dz: number } | null) => {
      if (!p) return;
      x += p.dx;
      z += p.dz;
      c.x += p.dx;
      c.z += p.dz;
      hit = true;
    };
    for (const b of boxes) {
      // ponytail: linear scan over all boxes (~200); grid lookup if it ever shows in a profile
      if (Math.abs((b.minX + b.maxX) / 2 - c.x) > 10 || Math.abs((b.minZ + b.maxZ) / 2 - c.z) > 10) continue;
      apply(pushOutOfBox(c, b));
    }
    for (const o of circles) apply(pushOutOfCircle(c, o));
  }
  return hit ? { ...s, x, z, speed: s.speed * HIT_SPEED_FACTOR } : s;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: collision tests PASS.

- [ ] **Step 5: Wire into src/main.ts**

Add imports and the box list:
```ts
import { MAP, tileCenter, collisionBoxes } from './world/cityMap';
import { resolveCar } from './vehicle/collision';
// after buildCity:
const boxes = collisionBoxes(MAP);
```
In the loop, right after `car = stepCar(car, input, dt);` add:
```ts
  car = resolveCar(car, boxes, []);
```

- [ ] **Step 6: Verify**

Run: `pnpm build && pnpm test && pnpm dev`
Expected: driving into a building stops the truck with a jolt and it can reverse away; sliding along a wall at an angle works; cannot leave the city (the skyscraper ring blocks). The sidewalk is still drivable (accepted).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: circle-vs-AABB collision keeps the truck out of buildings"
```

---

### Task 7: GTA-style chase camera (pure math + smoothed three camera)

**Files:**
- Create: `src/camera/chaseMath.ts`, `src/camera/chaseMath.test.ts`, `src/camera/chaseCamera.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `CarState`, `MAX_SPEED` (Task 5); `SceneCtx` (Task 1).
- Produces: `chaseTarget(car: CarState): { pos: [number,number,number]; look: [number,number,number] }`; `createChaseCamera(ctx: SceneCtx): { update(car: CarState, dt: number): void }` (also moves the sun + shadow frustum with the car).

- [ ] **Step 1: Write the failing test**

`src/camera/chaseMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { chaseTarget } from './chaseMath';
import { MAX_SPEED } from '../vehicle/carPhysics';

describe('chaseTarget', () => {
  it('sits behind and above the car, looking slightly ahead', () => {
    const { pos, look } = chaseTarget({ x: 0, z: 0, heading: 0, speed: 0 });
    expect(pos[0]).toBeCloseTo(0);
    expect(pos[1]).toBeCloseTo(4.2);
    expect(pos[2]).toBeCloseTo(-9);
    expect(look).toEqual([0, 1.6, 3]);
  });
  it('rotates with heading', () => {
    const { pos } = chaseTarget({ x: 10, z: 10, heading: Math.PI / 2, speed: 0 }); // facing +x
    expect(pos[0]).toBeCloseTo(1);
    expect(pos[2]).toBeCloseTo(10);
  });
  it('pulls back at speed', () => {
    const slow = chaseTarget({ x: 0, z: 0, heading: 0, speed: 0 });
    const fast = chaseTarget({ x: 0, z: 0, heading: 0, speed: MAX_SPEED });
    expect(fast.pos[2]).toBeCloseTo(-12);
    expect(fast.pos[2]).toBeLessThan(slow.pos[2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./chaseMath`.

- [ ] **Step 3: Write src/camera/chaseMath.ts**

```ts
import { MAX_SPEED, type CarState } from '../vehicle/carPhysics';

const BASE_DIST = 9;
const SPEED_PULLBACK = 3;
const HEIGHT = 4.2;
const LOOK_AHEAD = 3;
const LOOK_HEIGHT = 1.6;

/** Desired camera position/look-at for a third-person chase cam. Pure. */
export function chaseTarget(car: CarState): { pos: [number, number, number]; look: [number, number, number] } {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const dist = BASE_DIST + (Math.min(Math.abs(car.speed), MAX_SPEED) / MAX_SPEED) * SPEED_PULLBACK;
  return {
    pos: [car.x - fx * dist, HEIGHT, car.z - fz * dist],
    look: [car.x + fx * LOOK_AHEAD, LOOK_HEIGHT, car.z + fz * LOOK_AHEAD],
  };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Write src/camera/chaseCamera.ts**

```ts
import * as THREE from 'three';
import type { SceneCtx } from '../render/scene';
import type { CarState } from '../vehicle/carPhysics';
import { chaseTarget } from './chaseMath';

const FOLLOW_SHARPNESS = 5;
const SUN_DISTANCE = 80;

export function createChaseCamera(ctx: SceneCtx) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const sunOffset = ctx.sunDir.clone().multiplyScalar(SUN_DISTANCE);
  let first = true;
  return {
    update(car: CarState, dt: number) {
      const t = chaseTarget(car);
      pos.set(...t.pos);
      look.set(...t.look);
      if (first) {
        ctx.camera.position.copy(pos);
        first = false;
      } else {
        ctx.camera.position.lerp(pos, 1 - Math.exp(-FOLLOW_SHARPNESS * dt));
      }
      ctx.camera.lookAt(look);
      ctx.sun.target.position.set(car.x, 0, car.z);
      ctx.sun.position.copy(ctx.sun.target.position).add(sunOffset);
    },
  };
}
```

- [ ] **Step 6: Use it in src/main.ts**

Add `import { createChaseCamera } from './camera/chaseCamera';` and after `createPlayerCar`: `const chase = createChaseCamera(ctx);`. In the loop, delete the four `ctx.camera.*` / `ctx.sun.*` lines and replace with `chase.update(car, dt);`.

- [ ] **Step 7: Verify**

Run: `pnpm build && pnpm test && pnpm dev`
Expected: camera trails the truck smoothly, swings around on turns with a little lag, pulls back at speed; shadows stay crisp around the truck everywhere in the city.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: smoothed third-person chase camera with following sun shadow"
```

---

### Task 8: Quest state machine (pure) + HUD

**Files:**
- Create: `src/quest/quest.ts`, `src/quest/quest.test.ts`, `src/ui/hud.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Poi` (Task 3), `consumeKey` (Task 5).
- Produces:
  - `STOP_RADIUS = 5`, `STOP_SPEED = 1.5`, `roundTime(round): number` (150 − 20·(round−1), min 60)
  - `interface Quest { phase: 'toKitchen'|'delivering'|'done'|'failed'; round; kitchen: Poi; schools: Poi[]; next: number; timeLeft; score; toast: string; toastTtl: number }`
  - `createQuest(kitchen: Poi, schools: Poi[], round = 1): Quest`
  - `questTarget(q): Poi | null`, `questText(q): string`
  - `stepQuest(q, car: {x,z,speed}, dt): Quest` (pure, returns new object)
  - `createHud(): { update(q: Quest, car: CarState): void }`

- [ ] **Step 1: Write the failing tests**

`src/quest/quest.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createQuest, stepQuest, questTarget, questText, roundTime, STOP_RADIUS } from './quest';
import type { Poi } from '../world/cityMap';

const poi = (id: string, name: string, kind: Poi['kind'], x: number): Poi => ({
  id, name, kind, row: 0, col: 0, stop: { row: 0, col: 0, x, z: 0 },
});
const kitchen = poi('K', 'Dapur SPPG', 'kitchen', 0);
const schools = [poi('1', 'SDN 1', 'school', 50), poi('2', 'SDN 2', 'school', 100)];
const stopped = (x: number) => ({ x, z: 0, speed: 0 });
const away = { x: 999, z: 999, speed: 0 };

describe('quest', () => {
  it('starts heading to the kitchen with the timer paused', () => {
    const q = createQuest(kitchen, schools);
    expect(q.phase).toBe('toKitchen');
    expect(questTarget(q)).toBe(kitchen);
    expect(questText(q)).toBe('Ambil paket MBG di Dapur SPPG');
    expect(stepQuest(q, away, 10).timeLeft).toBe(roundTime(1));
  });
  it('loads at the kitchen only when stopped inside the radius', () => {
    const q = createQuest(kitchen, schools);
    expect(stepQuest(q, { x: 2, z: 0, speed: 5 }, 0.1).phase).toBe('toKitchen');
    expect(stepQuest(q, stopped(STOP_RADIUS + 0.1), 0.1).phase).toBe('toKitchen');
    const loaded = stepQuest(q, stopped(2), 0.1);
    expect(loaded.phase).toBe('delivering');
    expect(questTarget(loaded)).toBe(schools[0]);
    expect(questText(loaded)).toBe('Antar ke SDN 1 (1/2)');
    expect(loaded.toast).toContain('dimuat');
  });
  it('delivers in order, scores, and finishes with a time bonus', () => {
    let q = stepQuest(createQuest(kitchen, schools), stopped(2), 0.1);
    q = stepQuest(q, away, 10);
    expect(q.timeLeft).toBeCloseTo(roundTime(1) - 10);
    q = stepQuest(q, stopped(50), 0.1);
    expect(q.next).toBe(1);
    expect(q.score).toBe(100);
    expect(questText(q)).toBe('Antar ke SDN 2 (2/2)');
    q = stepQuest(q, stopped(100), 0.1);
    expect(q.phase).toBe('done');
    expect(q.score).toBe(200 + Math.round(q.timeLeft));
    expect(questTarget(q)).toBeNull();
    expect(questText(q)).toContain('tekan R');
  });
  it('fails when the timer runs out', () => {
    let q = stepQuest(createQuest(kitchen, schools), stopped(2), 0.1);
    q = stepQuest(q, away, roundTime(1) + 1);
    expect(q.phase).toBe('failed');
    expect(q.timeLeft).toBe(0);
  });
  it('rounds get shorter down to 60s and toasts expire', () => {
    expect(roundTime(1)).toBe(150);
    expect(roundTime(3)).toBe(110);
    expect(roundTime(9)).toBe(60);
    const q = stepQuest(createQuest(kitchen, schools), stopped(2), 0.1);
    expect(q.toastTtl).toBeGreaterThan(0);
    expect(stepQuest(q, away, 5).toastTtl).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./quest`.

- [ ] **Step 3: Write src/quest/quest.ts**

```ts
import type { Poi } from '../world/cityMap';

export const STOP_RADIUS = 5;
export const STOP_SPEED = 1.5;
const SCHOOL_SCORE = 100;
const TOAST_SECONDS = 3;

export const roundTime = (round: number) => Math.max(60, 150 - 20 * (round - 1));

export interface Quest {
  phase: 'toKitchen' | 'delivering' | 'done' | 'failed';
  round: number;
  kitchen: Poi;
  schools: Poi[];
  next: number;
  timeLeft: number;
  score: number;
  toast: string;
  toastTtl: number;
}

export function createQuest(kitchen: Poi, schools: Poi[], round = 1): Quest {
  return { phase: 'toKitchen', round, kitchen, schools, next: 0, timeLeft: roundTime(round), score: 0, toast: '', toastTtl: 0 };
}

export function questTarget(q: Quest): Poi | null {
  if (q.phase === 'toKitchen') return q.kitchen;
  if (q.phase === 'delivering') return q.schools[q.next];
  return null;
}

export function questText(q: Quest): string {
  switch (q.phase) {
    case 'toKitchen': return 'Ambil paket MBG di Dapur SPPG';
    case 'delivering': return `Antar ke ${q.schools[q.next].name} (${q.next + 1}/${q.schools.length})`;
    case 'done': return 'Misi selesai! Semua anak sudah makan 🍱 — tekan R untuk ronde berikutnya';
    case 'failed': return 'Waktu habis! Tekan R untuk mengulang';
  }
}

const atStop = (q: Quest, car: { x: number; z: number; speed: number }) => {
  const t = questTarget(q);
  return !!t && Math.hypot(car.x - t.stop.x, car.z - t.stop.z) <= STOP_RADIUS && Math.abs(car.speed) < STOP_SPEED;
};

/** Advances the quest by dt. Pure. */
export function stepQuest(q: Quest, car: { x: number; z: number; speed: number }, dt: number): Quest {
  const n: Quest = { ...q, toastTtl: Math.max(0, q.toastTtl - dt) };
  if (n.phase === 'delivering') {
    n.timeLeft = Math.max(0, n.timeLeft - dt);
    if (n.timeLeft === 0) return { ...n, phase: 'failed', toast: 'Waktu habis!', toastTtl: TOAST_SECONDS };
  }
  if (!atStop(n, car)) return n;
  if (n.phase === 'toKitchen') {
    return { ...n, phase: 'delivering', toast: `Paket MBG dimuat untuk ${n.schools.length} sekolah`, toastTtl: TOAST_SECONDS };
  }
  if (n.phase === 'delivering') {
    const school = n.schools[n.next];
    const next = n.next + 1;
    const finished = next >= n.schools.length;
    const bonus = finished ? Math.round(n.timeLeft) : 0;
    return {
      ...n,
      next,
      phase: finished ? 'done' : 'delivering',
      score: n.score + SCHOOL_SCORE + bonus,
      toast: finished ? `Bonus waktu +${bonus}` : `+${SCHOOL_SCORE} · Terkirim ke ${school.name}`,
      toastTtl: TOAST_SECONDS,
    };
  }
  return n;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: quest tests PASS.

- [ ] **Step 5: Write src/ui/hud.ts**

```ts
import type { CarState } from '../vehicle/carPhysics';
import { questText, type Quest } from '../quest/quest';

const KMH_PER_UNIT = 4;

export function createHud() {
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
    </style>
    <div id="q" class="box"></div>
    <div id="speed" class="box"></div>
    <div id="toast" class="box"></div>
    <div id="help" class="box">WASD / panah · Spasi rem · R ulang</div>`;
  const q = root.querySelector<HTMLElement>('#q')!;
  const speed = root.querySelector<HTMLElement>('#speed')!;
  const toast = root.querySelector<HTMLElement>('#toast')!;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return {
    update(quest: Quest, car: CarState) {
      const timer = quest.phase === 'delivering' ? ` · ⏱ ${fmt(quest.timeLeft)}` : '';
      q.innerHTML = `${questText(quest)}<small>Ronde ${quest.round} · Skor ${quest.score}${timer}</small>`;
      speed.innerHTML = `${Math.round(Math.abs(car.speed) * KMH_PER_UNIT)}<span>km/j</span>`;
      toast.textContent = quest.toast;
      toast.style.opacity = quest.toastTtl > 0 ? '1' : '0';
    },
  };
}
```

- [ ] **Step 6: Wire into src/main.ts**

Add imports:
```ts
import { createQuest, stepQuest, type Quest } from './quest/quest';
import { createHud } from './ui/hud';
import { readCarInput, consumeKey } from './input';
```
After `createChaseCamera`:
```ts
const kitchen = pois.find((p) => p.kind === 'kitchen')!;
const schools = pois.filter((p) => p.kind === 'school');
let quest: Quest = createQuest(kitchen, schools);
const hud = createHud();
const resetCar = () => ({ x: start.x, z: start.z, heading: Math.PI / 2, speed: 0 });
```
Change `let car: CarState = {...}` to `let car: CarState = resetCar();` (keep `start` defined before it). In the loop, after `car = resolveCar(...)`:
```ts
  quest = stepQuest(quest, car, dt);
  if (consumeKey('KeyR') && (quest.phase === 'done' || quest.phase === 'failed')) {
    quest = createQuest(kitchen, schools, quest.phase === 'done' ? quest.round + 1 : 1);
    car = resetCar();
  }
  hud.update(quest, car);
```
Remove the `console.log('POIs', pois)` line.

- [ ] **Step 7: Verify**

Run: `pnpm build && pnpm test && pnpm dev`
Expected: HUD top-left "Ambil paket MBG di Dapur SPPG / Ronde 1 · Skor 0", speed bottom-left in km/j. Drive to the road tile north of "Dapur SPPG" (top road, 3rd tile from the left) and stop → toast "Paket MBG dimuat untuk 3 sekolah", text switches to "Antar ke SDN 1 Merdeka (1/3)" with a ticking timer. Deliver to all three → "Misi selesai…", R starts round 2 with 130 s.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: MBG delivery quest state machine with Indonesian HUD"
```

---

### Task 9: Target markers (ring + arrow) and minimap

**Files:**
- Create: `src/quest/markers.ts`
- Modify: `src/ui/hud.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `Poi`, `roadTiles`, `TILE`, `MAP` (Task 3); `CarState`; `Quest`, `questTarget` (Task 8).
- Produces: `createMarkers(scene): { update(target: Poi | null, car: CarState, t: number): void }`; `createHud()` gains a minimap and its `update(quest, car)` signature is unchanged.

- [ ] **Step 1: Write src/quest/markers.ts**

```ts
import * as THREE from 'three';
import type { Poi } from '../world/cityMap';
import type { CarState } from '../vehicle/carPhysics';
import { STOP_RADIUS } from './quest';

export function createMarkers(scene: THREE.Scene) {
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(STOP_RADIUS * 0.7, STOP_RADIUS * 0.7, 1.2, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.position.y = 0.6;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  beam.position.y = 30;
  const target = new THREE.Group();
  target.add(ring, beam);
  scene.add(target);

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.4, 4),
    new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xffa500, emissiveIntensity: 0.6 }),
  );
  arrow.rotation.x = Math.PI / 2; // cone points along +z (heading 0)
  const arrowPivot = new THREE.Group();
  arrowPivot.add(arrow);
  scene.add(arrowPivot);

  return {
    update(poi: Poi | null, car: CarState, t: number) {
      target.visible = arrowPivot.visible = !!poi;
      if (!poi) return;
      target.position.set(poi.stop.x, 0, poi.stop.z);
      ring.rotation.y = t;
      arrowPivot.position.set(car.x, 4 + Math.sin(t * 4) * 0.2, car.z);
      arrowPivot.rotation.y = Math.atan2(poi.stop.x - car.x, poi.stop.z - car.z);
    },
  };
}
```

- [ ] **Step 2: Add the minimap to src/ui/hud.ts**

Add imports at the top:
```ts
import { MAP, TILE, roadTiles } from '../world/cityMap';
import { questTarget } from '../quest/quest';
```
Inside `root.innerHTML`, add to the `<style>` block: `#map { position: absolute; top: 16px; right: 16px; border-radius: 12px; background: rgba(8,12,24,.55); }` and after the help div: `<canvas id="map" width="200" height="200"></canvas>`.

After `const toast = ...` add:
```ts
  const map = root.querySelector<HTMLCanvasElement>('#map')!;
  const mg = map.getContext('2d')!;
  const SCALE = map.width / (MAP.length * TILE); // world units -> px
  const toPx = (v: number) => (v + TILE / 2) * SCALE;
  const bg = document.createElement('canvas');
  bg.width = map.width;
  bg.height = map.height;
  const bgCtx = bg.getContext('2d')!;
  bgCtx.fillStyle = '#9aa5a0';
  for (const { row, col } of roadTiles(MAP)) bgCtx.fillRect(col * TILE * SCALE, row * TILE * SCALE, TILE * SCALE + 0.5, TILE * SCALE + 0.5);
```
Inside `update(quest, car)` append:
```ts
      mg.clearRect(0, 0, map.width, map.height);
      mg.drawImage(bg, 0, 0);
      const target = questTarget(quest);
      if (target) {
        mg.fillStyle = '#ffd43b';
        mg.beginPath();
        mg.arc(toPx(target.stop.x), toPx(target.stop.z), 5, 0, Math.PI * 2);
        mg.fill();
      }
      mg.save();
      mg.translate(toPx(car.x), toPx(car.z));
      mg.rotate(-car.heading); // canvas y-down flips the rotation direction
      mg.fillStyle = '#4dabf7';
      mg.beginPath();
      mg.moveTo(0, 6);
      mg.lineTo(-4, -4);
      mg.lineTo(4, -4);
      mg.closePath();
      mg.fill();
      mg.restore();
```

- [ ] **Step 3: Wire markers into src/main.ts**

Add `import { createMarkers } from './quest/markers';` and `import { questTarget } from './quest/quest';` (merge with the existing quest import). After `createHud()`: `const markers = createMarkers(ctx.scene);`. In the loop before `hud.update(...)`: `markers.update(questTarget(quest), car, clock.elapsedTime);`.

- [ ] **Step 4: Verify**

Run: `pnpm build && pnpm test && pnpm dev`
Expected: a rotating translucent yellow ring with a tall faint beam at the current stop; a bobbing yellow arrow above the truck that always points at it (check: drive past the target — arrow swings to point behind you). Minimap top-right shows the grey road grid, yellow target dot, blue triangle for the truck that rotates with heading (nose points in driving direction; if it points backwards, flip the sign in `mg.rotate`). Markers disappear when the quest is done/failed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: quest markers (ring, beam, arrow) and minimap"
```

---

### Task 10: Traffic AI (pure) + traffic cars in the scene

**Files:**
- Create: `src/traffic/traffic.ts`, `src/traffic/traffic.test.ts`, `src/traffic/trafficRenderer.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Dir, DIR_VEC, TILE, roadSides, roadTiles, tileCenter, opposite, leftOf, headingOf` (Task 3); `Circle` (Task 6); `loadModel` (Task 2).
- Produces:
  - `interface TrafficCar { row; col; dir: Dir; t: number; speed: number; model: string; x; z; heading; stuck: number }`
  - `TRAFFIC_SPEED = 7`, `LANE_OFFSET = 1.6`, `TRAFFIC_RADIUS = 1.4`
  - `spawnTraffic(map, count, rng, avoid: {x,z,radius}): TrafficCar[]`
  - `stepTraffic(cars, obstacles: {x,z}[], dt, rng, map): void` (mutates cars; `obstacles` = player position; cars also avoid each other)
  - `trafficCircles(cars): Circle[]`
  - `createTrafficRenderer(scene, cars): Promise<{ update(dt): void }>`

- [ ] **Step 1: Write the failing tests**

`src/traffic/traffic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { spawnTraffic, stepTraffic, trafficCircles, TRAFFIC_SPEED, LANE_OFFSET, type TrafficCar } from './traffic';
import { TILE } from '../world/cityMap';

// a 1-tile-wide ring road: row1 and row3 are E-W roads joined by col1 and col3
const ring = [
  'XXXXX',
  'XRRRX',
  'XRXRX',
  'XRRRX',
  'XXXXX',
];
const rng0 = () => 0;
const car = (over: Partial<TrafficCar> = {}): TrafficCar => ({
  row: 1, col: 1, dir: 'E', t: 0, speed: TRAFFIC_SPEED, model: 'sedan', x: 0, z: 0, heading: 0, stuck: 0, ...over,
});

describe('traffic', () => {
  it('spawns on road tiles away from the avoid point', () => {
    const cars = spawnTraffic(ring, 4, Math.random, { x: 8, z: 8, radius: 3 });
    expect(cars.length).toBe(4);
    for (const c of cars) {
      expect(ring[c.row][c.col]).toBe('R');
      expect(Math.hypot(c.x - 8, c.z - 8)).toBeGreaterThan(3);
    }
  });
  it('drives on the left lane of its heading', () => {
    const c = car({ dir: 'E', t: 0.5 });
    stepTraffic([c], [], 0, rng0, ring);
    expect(c.x).toBeCloseTo(TILE + 0.5 * TILE); // tile (1,1) centre x=8, halfway to next tile
    expect(c.z).toBeCloseTo(TILE - LANE_OFFSET); // left of east = north (-z)
    expect(c.heading).toBeCloseTo(Math.PI / 2);
  });
  it('advances into the next tile and turns at a corner (never reverses when it can turn)', () => {
    const c = car({ row: 1, col: 2, dir: 'E', t: 0.9 });
    stepTraffic([c], [], 0.5, rng0, ring); // moves 3.5 units = 0.4375 tiles -> crosses into (1,3)
    expect(c.col).toBe(3);
    expect(c.dir).toBe('S'); // only exit from (1,3) besides back west
    expect(c.t).toBeGreaterThan(0);
  });
  it('turns around at a dead end', () => {
    const deadEnd = ['XXX', 'XRX', 'XRX', 'XXX'];
    const c = car({ row: 2, col: 1, dir: 'N', t: 0.95 }); // about to enter (1,1), whose only exit is back south
    stepTraffic([c], [], 0.2, rng0, deadEnd);
    expect(c.dir).toBe('S');
  });
  it('stops behind an obstacle ahead and ignores one beside it', () => {
    const ahead = car({ dir: 'E', t: 0 });
    stepTraffic([ahead], [], 0, rng0, ring); // place it
    const blocker = { x: ahead.x + 4, z: ahead.z };
    stepTraffic([ahead], [blocker], 0.5, rng0, ring);
    expect(ahead.speed).toBeLessThan(TRAFFIC_SPEED);
    const free = car({ dir: 'E', t: 0 });
    stepTraffic([free], [], 0, rng0, ring);
    stepTraffic([free], [{ x: free.x + 4, z: free.z + 3.2 }], 0.5, rng0, ring); // opposite lane
    expect(free.speed).toBe(TRAFFIC_SPEED);
  });
  it('gives up waiting after 3 seconds', () => {
    const c = car({ dir: 'E', t: 0 });
    stepTraffic([c], [], 0, rng0, ring);
    const blocker = { x: c.x + 4, z: c.z };
    for (let i = 0; i < 40; i++) stepTraffic([c], [blocker], 0.1, rng0, ring);
    expect(c.speed).toBeGreaterThan(0);
  });
  it('exposes collision circles', () => {
    const c = car();
    stepTraffic([c], [], 0, rng0, ring);
    expect(trafficCircles([c])).toEqual([{ x: c.x, z: c.z, r: 1.4 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./traffic`.

- [ ] **Step 3: Write src/traffic/traffic.ts**

```ts
import { DIR_VEC, TILE, roadSides, roadTiles, tileCenter, opposite, leftOf, headingOf, type Dir } from '../world/cityMap';
import type { Circle } from '../vehicle/collision';

export const TRAFFIC_SPEED = 7;
export const LANE_OFFSET = 1.6; // left-hand traffic (Indonesia)
export const TRAFFIC_RADIUS = 1.4;
const MODELS = ['sedan', 'suv', 'taxi', 'van', 'hatchback-sports', 'truck'];
const LOOK_AHEAD = 7;
const LOOK_WIDTH = 2.5;
const ACCEL = 12;
const STUCK_SECONDS = 3;

export interface TrafficCar {
  row: number;
  col: number;
  dir: Dir;
  t: number; // 0..1 progress from this tile's centre toward the next tile's centre
  speed: number;
  model: string;
  x: number;
  z: number;
  heading: number;
  stuck: number;
}

function placeCar(c: TrafficCar) {
  const { x, z } = tileCenter(c.row, c.col);
  const f = DIR_VEC[c.dir];
  const l = DIR_VEC[leftOf(c.dir)];
  c.x = x + f.dx * c.t * TILE + l.dx * LANE_OFFSET;
  c.z = z + f.dz * c.t * TILE + l.dz * LANE_OFFSET;
  c.heading = headingOf(c.dir);
}

export function spawnTraffic(map: string[], count: number, rng: () => number, avoid: { x: number; z: number; radius: number }): TrafficCar[] {
  const tiles = roadTiles(map).filter(({ row, col }) => {
    const { x, z } = tileCenter(row, col);
    return Math.hypot(x - avoid.x, z - avoid.z) > avoid.radius + TILE;
  });
  const cars: TrafficCar[] = [];
  while (cars.length < count) {
    const { row, col } = tiles[Math.floor(rng() * tiles.length)];
    const sides = roadSides(map, row, col);
    const c: TrafficCar = {
      row, col, dir: sides[Math.floor(rng() * sides.length)], t: rng(), speed: TRAFFIC_SPEED,
      model: MODELS[Math.floor(rng() * MODELS.length)], x: 0, z: 0, heading: 0, stuck: 0,
    };
    placeCar(c);
    cars.push(c);
  }
  return cars;
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

/** Moves every car along the road graph; cars queue behind obstacles/each other. Mutates `cars`. */
export function stepTraffic(cars: TrafficCar[], obstacles: { x: number; z: number }[], dt: number, rng: () => number, map: string[]): void {
  for (const c of cars) {
    placeCar(c);
    const blocked = obstacles.some((o) => blockedBy(c, o)) || cars.some((o) => o !== c && blockedBy(c, o));
    c.stuck = blocked ? c.stuck + dt : 0;
    const target = blocked && c.stuck < STUCK_SECONDS ? 0 : TRAFFIC_SPEED; // ponytail: after 3s just push through (breaks 4-way deadlocks)
    c.speed = Math.abs(target - c.speed) <= ACCEL * dt ? target : c.speed + Math.sign(target - c.speed) * ACCEL * dt;
    c.t += (c.speed * dt) / TILE;
    while (c.t >= 1) {
      c.t -= 1;
      c.row += DIR_VEC[c.dir].dz;
      c.col += DIR_VEC[c.dir].dx;
      const exits = roadSides(map, c.row, c.col).filter((d) => d !== opposite(c.dir));
      c.dir = exits.length ? exits[Math.floor(rng() * exits.length)] : opposite(c.dir);
    }
    placeCar(c);
  }
}

export const trafficCircles = (cars: TrafficCar[]): Circle[] => cars.map((c) => ({ x: c.x, z: c.z, r: TRAFFIC_RADIUS }));
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: traffic tests PASS. (`rng0` always picks the first exit; in the corner test the only exits from (1,3) are W (excluded, reverse) and S.)

- [ ] **Step 5: Write src/traffic/trafficRenderer.ts**

```ts
import * as THREE from 'three';
import { loadModel } from '../assets';
import type { TrafficCar } from './traffic';

const WHEEL_RADIUS = 0.3;
const SMOOTH = 10; // visual lerp hides the lane-offset jump when a car turns a corner

const lerpAngle = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export async function createTrafficRenderer(scene: THREE.Scene, cars: TrafficCar[]) {
  const meshes = await Promise.all(
    cars.map(async (c) => {
      const m = await loadModel(c.model);
      m.position.set(c.x, 0, c.z);
      m.rotation.y = c.heading;
      scene.add(m);
      const wheels = m.children.filter((o) => o.name.startsWith('wheel'));
      return { m, wheels };
    }),
  );
  return {
    update(dt: number) {
      const k = 1 - Math.exp(-SMOOTH * dt);
      cars.forEach((c, i) => {
        const { m, wheels } = meshes[i];
        m.position.lerp(new THREE.Vector3(c.x, 0, c.z), k);
        m.rotation.y = lerpAngle(m.rotation.y, c.heading, k);
        for (const w of wheels) w.rotation.x += (c.speed * dt) / WHEEL_RADIUS;
      });
    },
  };
}
```

- [ ] **Step 6: Wire into src/main.ts**

Imports:
```ts
import { spawnTraffic, stepTraffic, trafficCircles } from './traffic/traffic';
import { createTrafficRenderer } from './traffic/trafficRenderer';
```
After `const start = tileCenter(2, 5);` (must come before traffic spawn) and after `createPlayerCar`:
```ts
const traffic = spawnTraffic(MAP, 16, Math.random, { x: start.x, z: start.z, radius: 12 });
const trafficView = await createTrafficRenderer(ctx.scene, traffic);
```
In the loop, replace `car = resolveCar(car, boxes, []);` with:
```ts
  stepTraffic(traffic, [car], dt, Math.random, MAP);
  car = resolveCar(car, boxes, trafficCircles(traffic));
  trafficView.update(dt);
```

- [ ] **Step 7: Verify**

Run: `pnpm build && pnpm test && pnpm dev`
Expected: 16 assorted cars cruising on the left lane, turning at intersections without reversing, queueing behind the player if you stop in their lane, and never driving through buildings. Ramming one pushes the truck back and cuts its speed; cars visually glide through corners (small lateral slide is accepted). Frame rate stays smooth (check the Performance tab if in doubt — traffic is O(n²) with n=16).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: left-lane traffic AI with queueing and player collision"
```

---

### Task 11: Visual polish (bloom + MSAA composer), README, Vercel-ready build

**Files:**
- Create: `src/render/post.ts`, `README.md`
- Modify: `src/main.ts`, `src/render/scene.ts`

**Interfaces:**
- Consumes: `SceneCtx` (Task 1).
- Produces: `createPost(ctx: SceneCtx): { render(): void }` — replaces the direct `renderer.render` call.

- [ ] **Step 1: Write src/render/post.ts**

```ts
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { SceneCtx } from './scene';

export function createPost(ctx: SceneCtx) {
  const size = ctx.renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(ctx.renderer, target);
  composer.addPass(new RenderPass(ctx.scene, ctx.camera));
  composer.addPass(new UnrealBloomPass(size, 0.25, 0.6, 0.85));
  composer.addPass(new OutputPass());
  addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));
  return { render: () => composer.render() };
}
```

- [ ] **Step 2: Use it in src/main.ts**

Add `import { createPost } from './render/post';`, after `createScene`: `const post = createPost(ctx);`, and replace `ctx.renderer.render(ctx.scene, ctx.camera);` with `post.render();`.

- [ ] **Step 3: Tune scene.ts for the composer**

In `src/render/scene.ts` change `renderer.toneMappingExposure = 0.9;` to `renderer.toneMappingExposure = 1.0;` (OutputPass applies tone mapping; bloom adds a little energy). Nothing else changes.

- [ ] **Step 4: Verify visuals**

Run: `pnpm build && pnpm dev`
Expected: same scene with slightly glowing bright surfaces (sun-lit whites, the yellow marker/arrow), edges anti-aliased, no darkening/washing out compared to Task 10. If the picture is much brighter, lower the bloom strength (2nd `UnrealBloomPass` arg) to 0.15.

- [ ] **Step 5: Write README.md**

```markdown
# Kurir MBG

Game 3D browser bergaya GTA: kemudikan truk MBG (Makan Bergizi Gratis), ambil paket di Dapur SPPG, antar ke 3 SD sebelum waktu habis.

## Jalankan

    pnpm install
    pnpm dev        # http://localhost:5173
    pnpm test       # unit test logika (vitest)
    pnpm build      # tsc + vite build -> dist/

Kontrol: W/A/S/D atau panah, Spasi rem, R ulang ronde.

## Deploy ke Vercel

Push repo ke GitHub, lalu di Vercel **Add New → Project → Import**. Vercel mendeteksi Vite otomatis
(Build Command `pnpm build`, Output Directory `dist`, install via `pnpm` karena ada `pnpm-lock.yaml`). Tidak perlu `vercel.json`.
Alternatif CLI: `npx vercel --prod`.

## Aset

Model 3D dari [Kenney](https://kenney.nl) (CC0) — City Kit Roads/Commercial/Suburban, Car Kit. Ambil ulang dengan `scripts/fetch-assets.sh`.
```

- [ ] **Step 6: Final verification (deploy readiness)**

Run: `pnpm test && pnpm build && pnpm preview`
Expected: all tests pass; `dist/index.html`, `dist/assets/*.js` and `dist/models/<pack>/*.glb` (four pack folders, each with `Textures/colormap.png`) exist; http://localhost:4173 plays the full loop (pickup → 3 deliveries → done → R → round 2). Console has no errors. `git status` shows `pnpm-lock.yaml` and `public/models` tracked.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: bloom/MSAA post-processing, README with Vercel deploy steps"
```

---

## Self-review notes

- Spec coverage: chase cam (T7), Kenney visuals + lighting/sky/fog/bloom (T1, T2, T4, T11), core loop with timer/score/rounds (T8), markers + minimap (T9), traffic AI on the left (T10), collisions (T6), Indonesian UI (T8), WASD/Space/R (T5, T8), Vercel (T11). Non-goals untouched.
- Type consistency: `CarState`/`CarInput` (T5) used by T6–T10; `Poi.stop.{row,col,x,z}` (T3) used by T4, T8, T9; `Circle` (T6) used by T10; `SceneCtx.sunDir` (T1) used by T4/T5/T7.
- Known accepted simplifications (marked `ponytail:` in code): linear box scan in collision; traffic cars push through after 3 s to avoid deadlock; lateral slide when traffic turns corners; sidewalks drivable.
