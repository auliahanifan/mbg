import * as THREE from 'three';
import { loadModel } from '../assets';
import type { CarInput, CarState } from './carPhysics';
import { paintWhite } from './livery';

const WHEEL_RADIUS = 0.3;

export interface PlayerCar {
  group: THREE.Group;
  sync(state: CarState, input: CarInput, dt: number): void;
}

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

function decal(mat: THREE.Material, w: number, h: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

export async function createPlayerCar(scene: THREE.Scene): Promise<PlayerCar> {
  const group = await loadModel('delivery');
  paintWhite(group);
  scene.add(group);

  const tex = await liveryTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  // cargo box sides: x ±0.65, y 0.3..1.55, z -1.6..0.45 (measured from delivery.glb)
  for (const side of [1, -1]) {
    const d = decal(mat, 1.9, 1.04);
    d.position.set(side * 0.66, 0.93, -0.57);
    d.rotation.y = side * (Math.PI / 2);
    group.add(d);
  }
  // rear door faces the chase camera all game
  const rear = decal(mat, 1.0, 0.55);
  rear.position.set(0, 1.05, -1.6);
  rear.rotation.y = Math.PI;
  group.add(rear);

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
