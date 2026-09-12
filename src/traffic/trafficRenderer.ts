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
