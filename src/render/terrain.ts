import * as THREE from 'three';
import { hash, HALF_SIZE, type CityData } from '../world/osm';
import { densify, type Ground } from '../world/terrain';
import { ribbon, merge, lift, grimeTexture, type Geo } from './roads';

const AREA: Record<NonNullable<CityData['areas']>[number]['k'], string> = {
  grass: '#647f3a', wood: '#46612e', farm: '#8c9a4c', water: '#4f6f72', sand: '#b3a47c', paved: '#7d7c78',
};
const SOIL = '#6a6b44';
const Y = { water: 0.015, ballast: 0.045, rail: 0.09 };
const GAUGE = 1.067; // Indonesian narrow gauge
const TEX_PX = 1700; // 2 m per texel over the ±HALF_SIZE map
const SKIRT = 3900; // ground mesh half-width; heights clamp to the map edge beyond the walls

function mat(color: number, offset: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset });
}

/** Land-use polygons painted over mottled soil, 2 m per texel; the ground mesh wears it so areas follow the terrain. */
function groundTexture(areas: NonNullable<CityData['areas']>): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = TEX_PX;
  const g = c.getContext('2d')!;
  g.fillStyle = SOIL;
  g.fillRect(0, 0, TEX_PX, TEX_PX);
  g.scale(TEX_PX / (2 * HALF_SIZE), TEX_PX / (2 * HALF_SIZE));
  g.translate(HALF_SIZE, HALF_SIZE);
  for (const a of areas) {
    g.fillStyle = AREA[a.k];
    g.beginPath();
    a.p.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.fill();
  }
  g.globalAlpha = 0.14; // mottle so the soil and grass are not flat colour
  for (let i = 0; i < 160000; i++) {
    const h = hash(i, 7);
    g.fillStyle = h & 1 ? '#1a1a10' : h & 2 ? '#d8d0a0' : '#fff';
    const s = 2 + (h >>> 24) % 9;
    g.fillRect(((h >>> 1) % 3400) - HALF_SIZE, ((h >>> 13) % 3400) - HALF_SIZE, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // canvas row 0 is z = -HALF_SIZE (north) = v 0
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

/** Heightfield on the DEM grid (cells split along the (i, j)→(i+1, j+1) diagonal like mdplAt) extended flat past the map edge. */
export function buildGround(ground: Ground, areas: NonNullable<CityData['areas']>): THREE.Mesh {
  const step = ground.dem.step;
  const n = Math.round((2 * SKIRT) / step) + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -SKIRT + i * step;
      const z = -SKIRT + j * step;
      positions.push(x, ground.y(x, z), z);
      uvs.push((x + HALF_SIZE) / (2 * HALF_SIZE), (z + HALF_SIZE) / (2 * HALF_SIZE));
      if (i && j) {
        const d = j * n + i; // this vertex is the (i+1, j+1) corner of the cell
        indices.push(d - n - 1, d - 1, d, d - n - 1, d, d - n); // ccw seen from +y
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const detail = grimeTexture();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTexture(areas), roughness: 1 }));
  // ponytail: second UV set + aoMap as a cheap close-range detail layer; a real detail-map shader chunk if it ever needs to be stronger
  geo.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(Array.from({ length: positions.length / 3 }, (_, i) => [positions[3 * i] / 9, positions[3 * i + 2] / 9]).flat()), 2));
  (m.material as THREE.MeshStandardMaterial).aoMap = detail;
  (m.material as THREE.MeshStandardMaterial).aoMapIntensity = 0.8;
  m.receiveShadow = true;
  return m;
}

/** Two rails: the edges of a GAUGE-wide strip, each re-ribboned as a thin bar. */
export function rails(pts: [number, number][], y: number | ((x: number, z: number) => number)): Geo[] {
  const strip = ribbon(pts, GAUGE, y).positions;
  const side = (k: 0 | 1): [number, number][] => Array.from({ length: strip.length / 6 }, (_, i) => [strip[(2 * i + k) * 3], strip[(2 * i + k) * 3 + 2]]);
  return [ribbon(side(0), 0.12, y), ribbon(side(1), 0.12, y)];
}

/** Waterway / railway ribbons and instanced trees on the ground. */
export function buildTerrain(data: CityData, ground: Ground): THREE.Group {
  const g = new THREE.Group();
  const water: Geo[] = [];
  const ballast: Geo[] = [];
  const rail: Geo[] = [];
  for (const l of data.lines ?? []) {
    const p = densify(l.p, 10);
    if (l.k === 'rail') { ballast.push(ribbon(p, 3.6, lift(ground, Y.ballast))); rail.push(...rails(p, lift(ground, Y.rail))); }
    else water.push(ribbon(p, l.k === 'river' ? 10 : 3, lift(ground, Y.water)));
  }
  for (const [parts, color, offset] of [[water, 0x5b8a8c, 0.5], [ballast, 0x6b655c, 1.5], [rail, 0x9a9a96, 3]] as const) {
    if (!parts.length) continue;
    const m = new THREE.Mesh(merge(parts), mat(color, offset));
    m.receiveShadow = true;
    g.add(m);
  }
  const trees = data.trees ?? [];
  if (trees.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5b4634, roughness: 1 }), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), trees.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    trees.forEach(([x, z], i) => {
      const h = hash(x, z);
      const y = ground.y(x, z);
      const height = 4 + (h % 100) / 25; // 4–8 m
      const r = height * 0.42;
      o.position.set(x, y, z); o.scale.set(1, height - r * 0.6, 1); o.rotation.set(0, 0, 0); o.updateMatrix();
      trunk.setMatrixAt(i, o.matrix);
      o.position.set(x, y + height - r * 0.5, z); o.scale.set(r, r * 0.85, r); o.rotation.set(0, (h % 628) / 100, 0); o.updateMatrix();
      crown.setMatrixAt(i, o.matrix);
      crown.setColorAt(i, c.setHSL(0.24 + ((h >>> 8) % 20) / 200, 0.32, 0.18 + ((h >>> 16) % 20) / 120));
    });
    trunk.castShadow = crown.castShadow = true;
    g.add(trunk, crown);
  }
  return g;
}
