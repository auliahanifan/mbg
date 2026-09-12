import * as THREE from 'three';
import { hash, type CityData } from '../world/osm';
import { ribbon, merge, type Geo } from './roads';
import { flatCap } from './buildings';

const AREA: Record<NonNullable<CityData['areas']>[number]['k'], number> = {
  grass: 0x6f9a3f, wood: 0x4f7a34, farm: 0x9bb457, water: 0x5b8a8c, sand: 0xc9b98a, paved: 0x8d8d88,
};
const Y = { area: 0.01, water: 0.012, ballast: 0.03, rail: 0.065 };
const GAUGE = 1.067; // Indonesian narrow gauge

function mat(color: number, offset: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset });
}

/** Two rails: the edges of a GAUGE-wide strip, each re-ribboned as a thin bar. */
export function rails(pts: [number, number][], y: number): Geo[] {
  const strip = ribbon(pts, GAUGE, y).positions;
  const side = (k: 0 | 1): [number, number][] => Array.from({ length: strip.length / 6 }, (_, i) => [strip[(2 * i + k) * 3], strip[(2 * i + k) * 3 + 2]]);
  return [ribbon(side(0), 0.12, y), ribbon(side(1), 0.12, y)];
}

/** Flat landuse polygons, waterway / railway ribbons and instanced trees, all from OSM. */
export function buildTerrain(data: CityData): THREE.Group {
  const g = new THREE.Group();
  const areas = new Map<number, Geo[]>();
  for (const a of data.areas ?? []) {
    if (a.p.length < 3) continue;
    const color = AREA[a.k];
    areas.set(color, [...(areas.get(color) ?? []), flatCap(a.p, a.k === 'water' ? Y.water : Y.area)]);
  }
  for (const [color, parts] of areas) {
    const m = new THREE.Mesh(merge(parts), mat(color, 0.5));
    m.receiveShadow = true;
    g.add(m);
  }
  const water: Geo[] = [];
  const ballast: Geo[] = [];
  const rail: Geo[] = [];
  for (const l of data.lines ?? []) {
    if (l.k === 'rail') { ballast.push(ribbon(l.p, 3.6, Y.ballast)); rail.push(...rails(l.p, Y.rail)); }
    else water.push(ribbon(l.p, l.k === 'river' ? 10 : 3, Y.water));
  }
  for (const [parts, color, offset] of [[water, AREA.water, 0.5], [ballast, 0x6b655c, 1.5], [rail, 0x9a9a96, 3]] as const) {
    if (!parts.length) continue;
    const m = new THREE.Mesh(merge(parts), mat(color, offset));
    m.receiveShadow = true;
    g.add(m);
  }
  const trees = data.trees ?? [];
  if (trees.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5b4634, roughness: 1 }), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.9, flatShading: true }), trees.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    trees.forEach(([x, z], i) => {
      const h = hash(x, z);
      const height = 4 + (h % 100) / 25; // 4–8 m
      const r = height * 0.42;
      o.position.set(x, 0, z); o.scale.set(1, height - r * 0.6, 1); o.rotation.set(0, 0, 0); o.updateMatrix();
      trunk.setMatrixAt(i, o.matrix);
      o.position.set(x, height - r * 0.5, z); o.scale.set(r, r * 0.85, r); o.rotation.set(0, (h % 628) / 100, 0); o.updateMatrix();
      crown.setMatrixAt(i, o.matrix);
      crown.setColorAt(i, c.setHSL(0.27 + ((h >>> 8) % 20) / 200, 0.45, 0.22 + ((h >>> 16) % 20) / 100));
    });
    trunk.castShadow = crown.castShadow = true;
    g.add(trunk, crown);
  }
  return g;
}
