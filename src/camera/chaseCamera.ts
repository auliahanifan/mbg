import * as THREE from 'three';
import type { SceneCtx } from '../render/scene';
import type { CarState } from '../vehicle/carPhysics';
import { chaseTarget } from './chaseMath';

const FOLLOW_SHARPNESS = 5;
const SUN_DISTANCE = 80;

export function createChaseCamera(ctx: SceneCtx) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const sunOffset = ctx.sunDir.clone().multiplyScalar(SUN_DISTANCE);
  let first = true;
  return {
    reset() {
      first = true;
    },
    update(car: CarState, dt: number) {
      const t = chaseTarget(car);
      pos.set(...t.pos);
      look.set(...t.look);
      if (first) {
        ctx.camera.position.copy(pos);
        first = false;
      } else {
        ctx.camera.position.lerp(pos, 1 - Math.exp(-FOLLOW_SHARPNESS * dt));
      }
      ctx.camera.lookAt(look);
      ctx.sun.target.position.set(car.x, 0, car.z);
      ctx.sun.position.copy(ctx.sun.target.position).add(sunOffset);
    },
  };
}
