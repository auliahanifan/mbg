import * as THREE from 'three';
import type { CarInput, CarState } from './carPhysics';
import { buildVehicle, vehicleSpec, type CarSpec } from './vehicles';
import { FLAT, grade, type Ground } from '../world/terrain';

const MBG = vehicleSpec('mbg') as CarSpec; // Daihatsu Gran Max box — what SPPG kitchens actually deliver in
const WHEEL_RADIUS = MBG.wheelR;

export interface PlayerCar {
  group: THREE.Group;
  sync(state: CarState, input: CarInput, dt: number, ground?: Ground): void;
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
  const group = buildVehicle('mbg');
  scene.add(group);

  const tex = await liveryTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const b = MBG.box!;
  for (const side of [1, -1]) {
    const d = decal(mat, 1.85, 1.01);
    d.position.set(side * (b.w / 2 + 0.005), 1.45, (b.z0 + b.z1) / 2);
    d.rotation.y = side * (Math.PI / 2);
    group.add(d);
  }
  // rear door faces the chase camera all game
  const rear = decal(mat, 1.1, 0.6);
  rear.position.set(0, 1.45, b.z0 - 0.005);
  rear.rotation.y = Math.PI;
  group.add(rear);

  const wheels = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']
    .map((n) => group.getObjectByName(n))
    .filter((o): o is THREE.Object3D => !!o);
  const front = wheels.slice(0, 2);

  return {
    group,
    sync(state, input, dt, ground = FLAT) {
      const fx = Math.sin(state.heading);
      const fz = Math.cos(state.heading);
      const y = ground.y(state.x, state.z);
      // pitch from the ground 1.5 m ahead/behind, roll from 1 m left/right (local +x is left)
      const pitch = -Math.atan(grade(ground, state.x, state.z, state.heading));
      const roll = Math.atan2(ground.y(state.x + fz, state.z - fx) - ground.y(state.x - fz, state.z + fx), 2);
      group.position.set(state.x, y, state.z);
      group.rotation.set(pitch, state.heading, roll, 'YXZ');
      for (const w of wheels) w.rotation.x += (state.speed * dt) / WHEEL_RADIUS;
      for (const w of front) w.rotation.y = input.steer * 0.45;
    },
  };
}
