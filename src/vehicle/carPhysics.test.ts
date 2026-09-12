import { describe, it, expect } from 'vitest';
import { stepCar, MAX_SPEED, type CarState } from './carPhysics';

const rest: CarState = { x: 0, z: 0, heading: 0, speed: 0 };
const idle = { throttle: 0, steer: 0, brake: false };
const run = (s: CarState, input: typeof idle, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) s = stepCar(s, input, 1 / 60);
  return s;
};

describe('stepCar', () => {
  it('accelerates forward along +z at heading 0', () => {
    const s = run(rest, { ...idle, throttle: 1 }, 1);
    expect(s.speed).toBeGreaterThan(5);
    expect(s.z).toBeGreaterThan(1);
    expect(s.x).toBeCloseTo(0);
  });
  it('never exceeds MAX_SPEED', () => {
    const s = run(rest, { ...idle, throttle: 1 }, 20);
    expect(s.speed).toBeLessThanOrEqual(MAX_SPEED);
    expect(s.speed).toBeGreaterThan(MAX_SPEED * 0.6);
  });
  it('reverse is slow and capped', () => {
    const s = run(rest, { ...idle, throttle: -1 }, 10);
    expect(s.speed).toBeLessThan(0);
    expect(s.speed).toBeGreaterThanOrEqual(-8);
  });
  it('does not steer when stationary, steers left (heading up) when moving', () => {
    expect(stepCar(rest, { ...idle, steer: 1 }, 0.1).heading).toBe(0);
    const moving = { ...rest, speed: 10 };
    expect(stepCar(moving, { ...idle, steer: 1 }, 0.1).heading).toBeGreaterThan(0);
    expect(stepCar(moving, { ...idle, steer: -1 }, 0.1).heading).toBeLessThan(0);
  });
  it('slope: uphill accelerates slower, a steep descent keeps a coasting car rolling', () => {
    const flat = run(rest, { ...idle, throttle: 1 }, 1);
    let up = rest;
    for (let t = 0; t < 1; t += 1 / 60) up = stepCar(up, { ...idle, throttle: 1 }, 1 / 60, 25 * 0.1);
    expect(up.speed).toBeLessThan(flat.speed);
    let down = { ...rest, speed: 10 };
    for (let t = 0; t < 3; t += 1 / 60) down = stepCar(down, idle, 1 / 60, -25 * 0.2);
    expect(down.speed).toBeGreaterThan(5);
    expect(run({ ...rest, speed: 10 }, idle, 3).speed).toBeLessThan(2);
  });
  it('steering is mirrored in reverse', () => {
    expect(stepCar({ ...rest, speed: -5 }, { ...idle, steer: 1 }, 0.1).heading).toBeLessThan(0);
  });
  it('coasts to a stop and brake stops faster', () => {
    const coast = run({ ...rest, speed: 20 }, idle, 3);
    const braked = run({ ...rest, speed: 20 }, { ...idle, brake: true }, 3);
    expect(coast.speed).toBeLessThan(20);
    expect(braked.speed).toBeCloseTo(0, 1);
    expect(braked.speed).toBeLessThan(coast.speed);
  });
});
