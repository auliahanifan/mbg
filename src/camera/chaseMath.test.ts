import { describe, it, expect } from 'vitest';
import { chaseTarget } from './chaseMath';
import { MAX_SPEED } from '../vehicle/carPhysics';

describe('chaseTarget', () => {
  it('sits behind and above the car, looking slightly ahead', () => {
    const { pos, look } = chaseTarget({ x: 0, z: 0, heading: 0, speed: 0 });
    expect(pos[0]).toBeCloseTo(0);
    expect(pos[1]).toBeCloseTo(4.2);
    expect(pos[2]).toBeCloseTo(-9);
    expect(look).toEqual([0, 1.6, 3]);
  });
  it('rotates with heading', () => {
    const { pos } = chaseTarget({ x: 10, z: 10, heading: Math.PI / 2, speed: 0 }); // facing +x
    expect(pos[0]).toBeCloseTo(1);
    expect(pos[2]).toBeCloseTo(10);
  });
  it('pulls back at speed', () => {
    const slow = chaseTarget({ x: 0, z: 0, heading: 0, speed: 0 });
    const fast = chaseTarget({ x: 0, z: 0, heading: 0, speed: MAX_SPEED });
    expect(fast.pos[2]).toBeCloseTo(-12);
    expect(fast.pos[2]).toBeLessThan(slow.pos[2]);
  });
});
