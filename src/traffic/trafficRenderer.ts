import * as THREE from 'three';
import { loadModel } from '../assets';
import type { TrafficCar } from './traffic';
import { FLAT, type Ground } from '../world/terrain';

const WHEEL_RADIUS = 0.3;
const SMOOTH = 10; // visual lerp hides the lane-offset jump when a car turns a corner

const lerpAngle = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export async function createTrafficRenderer(scene: THREE.Scene, cars: TrafficCar[], ground: Ground = FLAT) {
  const meshes = await Promise.all(
    cars.map(async (c) => {
      const m = await loadModel(c.model);
      m.position.set(c.x, ground.y(c.x, c.z), c.z);
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
        const target = new THREE.Vector3(c.x, ground.y(c.x, c.z), c.z);
        if (m.position.distanceTo(target) > 20) m.position.copy(target); // respawn teleport: don't streak across the map
        m.position.lerp(target, k);
        m.rotation.y = lerpAngle(m.rotation.y, c.heading, k);
        for (const w of wheels) w.rotation.x += (c.speed * dt) / WHEEL_RADIUS;
      });
    },
  };
}
