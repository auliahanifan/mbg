import { describe, it, expect } from 'vitest';
import { daylight, clockText } from './daylight';

describe('daylight', () => {
  it('rises in the east, peaks at midday, sets in the west', () => {
    const dawn = daylight(6), noon = daylight(12), dusk = daylight(18);
    expect(dawn.dir[1]).toBeCloseTo(0, 6);
    expect(dusk.dir[1]).toBeCloseTo(0, 6);
    expect(noon.dir[1]).toBeGreaterThan(0.9);
    expect(Math.sign(dawn.dir[0])).toBe(-Math.sign(dusk.dir[0])); // opposite horizons
    expect(Math.hypot(...noon.dir)).toBeCloseTo(1, 3);
  });

  it('goes dark below the horizon and bright above it', () => {
    expect(daylight(0).intensity).toBe(0);
    expect(daylight(12).intensity).toBeGreaterThan(3);
    expect(daylight(0).dir[1]).toBeLessThan(0);
  });

  it('stops the camera down when the sun is high', () => {
    expect(daylight(12).exposure).toBeLessThan(daylight(7).exposure);
    expect(daylight(7).exposure).toBe(1);
  });

  it('formats the clock', () => {
    expect(clockText(7.5)).toBe('07:30');
    expect(clockText(24.25)).toBe('00:15');
  });
});
