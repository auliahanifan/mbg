import * as THREE from 'three';
import type { Person } from './people';
import { FLAT, type Ground } from '../world/terrain';

const SMOOTH = 10; // hides the kerb-to-kerb jump when someone turns a corner
const SHIRTS = [0xf2f0ea, 0x1f2430, 0x2b4a8a, 0xb8322c, 0x2e7d4f, 0x8a8f96, 0xe8b23a, 0x6b3f8a, 0xd77a3b, 0x3a3a3a]; // kaos, kemeja batik-ish darks, seragam
const HIJABS = [0x1f2430, 0xf2f0ea, 0x6b3f8a, 0x2b4a8a, 0xb26a7c, 0x8a6a3a, 0x3f7d6f];
const PANTS = [0x2a3550, 0x1c1c1c, 0x4a4a4a, 0x6b5a48, 0x2b2b3a];
const SKINS = [0xc98e6a, 0xb97a55, 0xa5673f, 0x8f5a3a];
const HIJAB_SHARE = 0.4;

type Part = { geo: THREE.BufferGeometry; local: (p: Person, hijab: boolean) => THREE.Matrix4 };

const lerpAngle = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/** ~1.65 m person facing +z: head, torso, two swinging legs from the hip, two counter-swinging arms from the shoulder. */
function parts(): Part[] {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const limb = (x: number, pivotY: number, len: number, swing: (p: Person) => number) => (p: Person) => {
    // rotate about the pivot, then hang the limb's centre len/2 below it
    q.setFromEuler(e.set(swing(p), 0, 0));
    m.compose(pos.set(x, pivotY, 0), q, one);
    return m.multiply(new THREE.Matrix4().makeTranslation(0, -len / 2, 0));
  };
  const swing = (p: Person) => (p.pace ? Math.sin(p.phase) * 0.55 : 0);
  return [
    { geo: new THREE.SphereGeometry(0.11, 10, 8), local: (p, hijab) => m.compose(pos.set(0, hijab ? 1.5 : 1.55, 0), q.identity(), hijab ? pos.clone().set(1.45, 1.6, 1.45) : one) },
    { geo: new THREE.BoxGeometry(0.36, 0.55, 0.22), local: () => m.compose(pos.set(0, 1.15, 0), q.identity(), one) },
    { geo: new THREE.BoxGeometry(0.15, 0.8, 0.15), local: limb(-0.09, 0.86, 0.8, (p) => swing(p)) },
    { geo: new THREE.BoxGeometry(0.15, 0.8, 0.15), local: limb(0.09, 0.86, 0.8, (p) => -swing(p)) },
    { geo: new THREE.BoxGeometry(0.1, 0.6, 0.1), local: limb(-0.23, 1.4, 0.6, (p) => -swing(p) * 0.7) },
    { geo: new THREE.BoxGeometry(0.1, 0.6, 0.1), local: limb(0.23, 1.4, 0.6, (p) => swing(p) * 0.7) },
  ];
}

export function createPeopleRenderer(scene: THREE.Scene, people: Person[], ground: Ground = FLAT) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const meshes = parts().map((part) => {
    const mesh = new THREE.InstancedMesh(part.geo, mat, people.length);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, part };
  });
  const hijab = people.map((p) => (p.look % 100) / 100 < HIJAB_SHARE);
  const c = new THREE.Color();
  people.forEach((p, i) => {
    const skin = SKINS[p.look % SKINS.length];
    const [head, torso, legs, arms] = [hijab[i] ? HIJABS[(p.look >>> 3) % HIJABS.length] : skin, SHIRTS[(p.look >>> 6) % SHIRTS.length], PANTS[(p.look >>> 9) % PANTS.length], hijab[i] ? SHIRTS[(p.look >>> 6) % SHIRTS.length] : skin];
    for (const [k, hex] of [[0, head], [1, torso], [2, legs], [3, legs], [4, arms], [5, arms]] as const) meshes[k].mesh.setColorAt(i, c.setHex(hex));
  });
  for (const { mesh } of meshes) mesh.instanceColor!.needsUpdate = true;
  const body = people.map((p) => new THREE.Object3D().translateX(p.x).translateZ(p.z)); // smoothed root per person
  const world = new THREE.Matrix4();
  return {
    update(dt: number) {
      const k = 1 - Math.exp(-SMOOTH * dt);
      people.forEach((p, i) => {
        const o = body[i];
        const y = ground.y(p.x, p.z);
        if (p.crash) { // ballistic: exactly where the sim says; tumbling in the air, flat on the ground
          o.position.set(p.x, y + p.crash.y + (p.crash.y > 0 ? 0.6 : 0.12), p.z);
          o.rotation.set(p.crash.y > 0 ? p.crash.roll : Math.PI / 2, p.heading, 0, 'YXZ');
        } else {
          const target = new THREE.Vector3(p.x, y, p.z);
          if (o.position.distanceTo(target) > 15) o.position.copy(target); // respawn: no streak across the block
          o.position.lerp(target, k);
          o.rotation.set(0, lerpAngle(o.rotation.y, p.heading, k), 0, 'YXZ');
        }
        o.updateMatrix();
        for (const { mesh, part } of meshes) mesh.setMatrixAt(i, world.multiplyMatrices(o.matrix, part.local(p, hijab[i])));
      });
      for (const { mesh } of meshes) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
