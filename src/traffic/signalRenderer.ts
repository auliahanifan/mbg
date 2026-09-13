import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aspect, type Signals } from './signals';
import { FLAT, type Ground } from '../world/terrain';

const POLE_H = 3.4;
const LENS_R = 0.13;
const LENS_Y = [3.22, 2.9, 2.58]; // red on top, then amber, then green
const FACE = 0.115;               // lens sits just proud of the housing front

// Raw linear colours. Kept just over 1 so the ACES grade reads them as a lit lamp without
// rolling them off to white — push them to 4 and the red comes out salmon. Unlit lenses are
// near-black glass with only a hint of their own tint.
const LIT = [new THREE.Color(2.0, 0.06, 0.04), new THREE.Color(2.2, 0.85, 0.03), new THREE.Color(0.05, 1.8, 0.35)];
const DARK = LIT.map((c) => c.clone().multiplyScalar(0.015));
const ORDER = { red: 0, amber: 1, green: 2 } as const;

/** One signal head in local space: kerb pole, housing, and a visor hooding each lens. */
function headGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.06, 0.085, POLE_H, 8).translate(0, POLE_H / 2, 0),
    new THREE.BoxGeometry(0.36, 1.06, 0.2).translate(0, 2.9, 0),
    new THREE.BoxGeometry(0.5, 1.2, 0.05).translate(0, 2.9, -0.12), // backboard: the black plate that makes the lamps readable against the sky
  ];
  for (const y of LENS_Y) {
    // half-cylinder hood: length along +z, open side swung up to sit over the lens. Shallow, or
    // each hood juts far enough forward to eat the lens below it from the driver's angle.
    parts.push(new THREE.CylinderGeometry(LENS_R + 0.02, LENS_R + 0.02, 0.09, 10, 1, true, 0, Math.PI)
      .rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, y, 0.15));
  }
  return mergeGeometries(parts, false);
}

export function createSignalRenderer(scene: THREE.Scene, signals: Signals, ground: Ground = FLAT) {
  const { approaches } = signals;
  const head = headGeometry();
  const poles = new THREE.Mesh(
    mergeGeometries(approaches.map((a) => head.clone().applyMatrix4(
      new THREE.Matrix4().makeRotationY(a.heading).setPosition(a.x, ground.y(a.x, a.z), a.z))), false),
    new THREE.MeshStandardMaterial({ color: 0x33383c, roughness: 0.55, metalness: 0.35 }),
  );
  poles.castShadow = true;
  scene.add(poles);

  const lens = new THREE.InstancedMesh(new THREE.CircleGeometry(LENS_R, 14), new THREE.MeshBasicMaterial(), approaches.length * 3);
  const m = new THREE.Matrix4();
  approaches.forEach((a, i) => {
    const fx = Math.sin(a.heading);
    const fz = Math.cos(a.heading);
    LENS_Y.forEach((y, k) => {
      m.makeRotationY(a.heading).setPosition(a.x + fx * FACE, ground.y(a.x, a.z) + y, a.z + fz * FACE);
      lens.setMatrixAt(i * 3 + k, m);
      lens.setColorAt(i * 3 + k, DARK[k]);
    });
  });
  scene.add(lens);

  const shown: string[] = approaches.map(() => '');
  return {
    /** Repaints only the heads whose aspect actually changed this frame. */
    update() {
      let dirty = false;
      approaches.forEach((a, i) => {
        const now = aspect(signals, a);
        if (now === shown[i]) return;
        shown[i] = now;
        dirty = true;
        for (let k = 0; k < 3; k++) lens.setColorAt(i * 3 + k, k === ORDER[now] ? LIT[k] : DARK[k]);
      });
      if (dirty) lens.instanceColor!.needsUpdate = true;
    },
  };
}
