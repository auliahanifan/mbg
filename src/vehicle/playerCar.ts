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
  return new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
}

export async function createPlayerCar(scene: THREE.Scene): Promise<PlayerCar> {
  const group = await loadModel('delivery');
  scene.add(group);

  // decals on both sides of the cargo box (body is 1.5 wide; box sits roughly y 1..2.5, z -1.6..0.4)
  for (const side of [1, -1]) {
    const d = mbgDecal();
    d.position.set(side * 0.76, 1.1, -0.7);
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
