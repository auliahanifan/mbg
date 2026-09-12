import * as THREE from 'three';
import { buildVehicle } from '../vehicle/vehicles';
import type { TrafficCar } from './traffic';
import { FLAT, grade, type Ground } from '../world/terrain';

const WHEEL_RADIUS = 0.3;
const SMOOTH = 10; // visual lerp hides the lane-offset jump when a car turns a corner

const lerpAngle = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export function createTrafficRenderer(scene: THREE.Scene, cars: TrafficCar[], ground: Ground = FLAT) {
  const meshes = cars.map((c) => {
    const m = buildVehicle(c.model);
    m.position.set(c.x, ground.y(c.x, c.z), c.z);
    m.rotation.y = c.heading;
    scene.add(m);
    const wheels = m.children.filter((o) => o.name.startsWith('wheel'));
    return { m, wheels };
  });
  return {
    update(dt: number) {
      const k = 1 - Math.exp(-SMOOTH * dt);
      cars.forEach((c, i) => {
        const { m, wheels } = meshes[i];
        if (c.crash) { // off the road graph: put it exactly where the ballistic step says, no smoothing
          m.position.set(c.x, ground.y(c.x, c.z) + c.crash.y, c.z);
          m.rotation.set(0, c.heading, c.crash.roll, 'YXZ');
          for (const w of wheels) w.rotation.x += c.crash.rollRate * dt;
          return;
        }
        const target = new THREE.Vector3(c.x, ground.y(c.x, c.z), c.z);
        if (m.position.distanceTo(target) > 20) m.position.copy(target); // respawn teleport: don't streak across the map
        m.position.lerp(target, k);
        m.rotation.set(-Math.atan(grade(ground, c.x, c.z, c.heading)), lerpAngle(m.rotation.y, c.heading, k), 0, 'YXZ');
        for (const w of wheels) w.rotation.x += (c.speed * dt) / (w.position.y || WHEEL_RADIUS); // wheel sits at its own radius
      });
    },
  };
}
