export interface CarState { x: number; z: number; heading: number; speed: number }
export interface CarInput { throttle: number; steer: number; brake: boolean }

export const MAX_SPEED = 200 / 3.6; // 200 km/h flat out
const REVERSE_MAX = 8;
const ACCEL = 14;
const BRAKE = 30;
const ROLLING = 3;
const DRAG = 0.18; // per second, proportional; ACCEL must beat MAX_SPEED * DRAG or the cap is unreachable
const TURN_RATE = 2.2; // rad/s at full grip

const moveToward = (v: number, target: number, maxDelta: number) =>
  Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta;

/** Arcade car model: scalar speed along heading, steering scaled by speed; `slope` is the road grade ahead (rise/run) times GRAVITY. Pure. */
export function stepCar(s: CarState, input: CarInput, dt: number, slope = 0): CarState {
  let speed = s.speed - slope * dt;
  speed -= speed * DRAG * dt; // drag first, so full throttle settles on exactly MAX_SPEED
  if (input.brake) speed = moveToward(speed, 0, BRAKE * dt);
  else if (input.throttle > 0) speed = moveToward(speed, MAX_SPEED, ACCEL * input.throttle * dt);
  else if (input.throttle < 0) speed = moveToward(speed, -REVERSE_MAX, ACCEL * -input.throttle * dt);
  else speed = moveToward(speed, 0, ROLLING * dt);

  const a = Math.abs(speed);
  const grip = Math.min(a / 8, 1) * (1 - 0.6 * Math.min(a / MAX_SPEED, 1)); // steering washes out hard near 200
  const heading = s.heading + input.steer * TURN_RATE * grip * Math.sign(speed) * dt;
  return {
    x: s.x + Math.sin(heading) * speed * dt,
    z: s.z + Math.cos(heading) * speed * dt,
    heading,
    speed,
  };
}
