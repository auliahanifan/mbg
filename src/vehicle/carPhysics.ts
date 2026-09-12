export interface CarState { x: number; z: number; heading: number; speed: number }
export interface CarInput { throttle: number; steer: number; brake: boolean }

export const MAX_SPEED = 28;
const REVERSE_MAX = 8;
const ACCEL = 14;
const BRAKE = 30;
const ROLLING = 3;
const DRAG = 0.35; // per second, proportional
const TURN_RATE = 2.2; // rad/s at full grip

const moveToward = (v: number, target: number, maxDelta: number) =>
  Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta;

/** Arcade car model: scalar speed along heading, steering scaled by speed; `slope` is the road grade ahead (rise/run) times GRAVITY. Pure. */
export function stepCar(s: CarState, input: CarInput, dt: number, slope = 0): CarState {
  let speed = s.speed - slope * dt;
  if (input.brake) speed = moveToward(speed, 0, BRAKE * dt);
  else if (input.throttle > 0) speed = moveToward(speed, MAX_SPEED, ACCEL * input.throttle * dt);
  else if (input.throttle < 0) speed = moveToward(speed, -REVERSE_MAX, ACCEL * -input.throttle * dt);
  else speed = moveToward(speed, 0, ROLLING * dt);
  speed -= speed * DRAG * dt;

  const a = Math.abs(speed);
  const grip = Math.min(a / 8, 1) * (1 - 0.35 * Math.min(a / MAX_SPEED, 1));
  const heading = s.heading + input.steer * TURN_RATE * grip * Math.sign(speed) * dt;
  return {
    x: s.x + Math.sin(heading) * speed * dt,
    z: s.z + Math.cos(heading) * speed * dt,
    heading,
    speed,
  };
}
