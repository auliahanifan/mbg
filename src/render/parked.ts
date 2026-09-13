import * as THREE from 'three';
import type { City } from '../world/city';
import { hash } from '../world/osm';
import { FLAT, type Ground } from '../world/terrain';
import { buildVehicle, BODY } from '../vehicle/vehicles';
import { polePoints } from './roads';

const EVERY = 4; // candidate spot spacing along the kerb
const KERB = 0.9; // metres past the asphalt: on the sidewalk, tail at the kerb, nose up to the shutter
const SHARE = 0.45; // of candidate spots that get a bike: ruko streets are lined with them, never solid

/**
 * Motor parkir: scooters nosed in along the sidewalks of every road ≥ 8 m, wherever `shopfront` says a building stands
 * right behind the kerb and `blocked` says the spot is not another carriageway. One InstancedMesh per material bucket
 * of a riderless BeAT, coloured per instance.
 */
export function buildParkedBikes(city: City, ground: Ground = FLAT, blocked: (x: number, z: number) => boolean = () => false, shopfront: (x: number, z: number) => boolean = () => true): THREE.Group {
  const { nodes, ways } = city.data;
  const spots: [number, number, number][] = [];
  for (const way of ways) {
    if (way.w < 8) continue;
    const pts = way.n.map((i) => nodes[i]);
    for (const side of [1, -1] as const) {
      const run = side === 1 ? pts : [...pts].reverse(); // polePoints walks the left kerb: reverse the way for the other side
      for (const [x, z] of polePoints(run, way.w / 2, EVERY, KERB)) {
        const h = hash(x, z);
        if (h % 100 >= SHARE * 100 || blocked(x, z) || !shopfront(x, z)) continue;
        let best = 0, bd = Infinity;
        for (let i = 0; i + 1 < run.length; i++) {
          const mx = (run[i][0] + run[i + 1][0]) / 2, mz = (run[i][1] + run[i + 1][1]) / 2;
          const d = Math.hypot(mx - x, mz - z);
          if (d < bd) { bd = d; best = Math.atan2(run[i + 1][0] - run[i][0], run[i + 1][1] - run[i][1]); }
        }
        spots.push([x, z, best + Math.PI / 2 + 0.35 - ((h >>> 8) % 100) / 400]); // nose away from the road, a little skewed each
      }
    }
  }
  const g = new THREE.Group();
  if (!spots.length) return g;
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  buildVehicle('beat', () => 0.5, true).children.forEach((part, k) => {
    if (!(part instanceof THREE.Mesh)) return;
    const geo = part.geometry.clone().translate(part.position.x, part.position.y, part.position.z);
    const mesh = new THREE.InstancedMesh(geo, part.material, spots.length);
    spots.forEach(([x, z, heading], i) => {
      o.position.set(x, ground.y(x, z), z); o.rotation.set(0, heading, 0); o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (k === 0) mesh.setColorAt(i, c.set(BODY[hash(x, z) % BODY.length])); // the paint bucket comes first; the rest keep their vertex colours
    });
    mesh.castShadow = true;
    g.add(mesh);
  });
  return g;
}
