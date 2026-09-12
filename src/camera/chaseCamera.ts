import * as THREE from 'three';
import type { SceneCtx } from '../render/scene';
import type { CarState } from '../vehicle/carPhysics';
import { chaseTarget } from './chaseMath';
import { FLAT, type Ground } from '../world/terrain';

const FOLLOW_SHARPNESS = 5;
const SUN_DISTANCE = 80;

export function createChaseCamera(ctx: SceneCtx, ground: Ground = FLAT) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const sunOffset = ctx.sunDir.clone().multiplyScalar(SUN_DISTANCE);
  let first = true;
  return {
    reset() {
      first = true;
    },
    update(car: CarState, dt: number) {
      const groundY = ground.y(car.x, car.z);
      const t = chaseTarget(car, groundY);
      pos.set(...t.pos);
      pos.y = Math.max(pos.y, ground.y(pos.x, pos.z) + 1.5); // never dip into a rising slope behind the car
      look.set(...t.look);
      if (first) {
        ctx.camera.position.copy(pos);
        first = false;
      } else {
        ctx.camera.position.lerp(pos, 1 - Math.exp(-FOLLOW_SHARPNESS * dt));
      }
      ctx.camera.lookAt(look);
      ctx.sun.target.position.set(car.x, groundY, car.z);
      ctx.sun.position.copy(ctx.sun.target.position).add(sunOffset);
    },
  };
}
