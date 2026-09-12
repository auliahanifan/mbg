import { MAX_SPEED, type CarState } from '../vehicle/carPhysics';

const BASE_DIST = 9;
const SPEED_PULLBACK = 3;
const HEIGHT = 4.2;
const LOOK_AHEAD = 3;
const LOOK_HEIGHT = 1.6;

/** Desired camera position/look-at for a third-person chase cam. Pure. */
export function chaseTarget(car: CarState): { pos: [number, number, number]; look: [number, number, number] } {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const dist = BASE_DIST + (Math.min(Math.abs(car.speed), MAX_SPEED) / MAX_SPEED) * SPEED_PULLBACK;
  return {
    pos: [car.x - fx * dist, HEIGHT, car.z - fz * dist],
    look: [car.x + fx * LOOK_AHEAD, LOOK_HEIGHT, car.z + fz * LOOK_AHEAD],
  };
}
