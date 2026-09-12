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
