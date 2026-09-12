import { describe, expect, it } from 'vitest';
import { engineMix, engineParams, questEvent } from './sound';
import { createQuest, type Quest } from '../quest/quest';
import { MAX_SPEED } from '../vehicle/carPhysics';

describe('engineParams', () => {
  it('idles at low rpm and revs within a gear', () => {
    expect(engineParams(0, 0).rpm).toBeCloseTo(0.2);
    expect(engineParams(3, 1).rpm).toBeGreaterThan(engineParams(1, 1).rpm);
  });
  it('drops rpm on a gear shift', () => {
    expect(engineParams(0.13 * MAX_SPEED, 1).rpm).toBeLessThan(engineParams(0.12 * MAX_SPEED, 1).rpm);
  });
  it('stays in range at top speed and in reverse', () => {
    expect(engineParams(MAX_SPEED, 1).rpm).toBeLessThanOrEqual(1);
    expect(engineParams(-8, -1)).toMatchObject({ load: 0.7 });
  });
});

describe('engineMix', () => {
  it('is idle-only at low rpm, high-only at redline, constant power in between', () => {
    expect(engineMix(0.2)).toEqual({ idle: 1, cruise: 0, high: 0 });
    expect(engineMix(1).high).toBeCloseTo(1);
    for (const rpm of [0.3, 0.4, 0.5, 0.6, 0.8, 0.9]) {
      const m = engineMix(rpm);
      expect(m.idle ** 2 + m.cruise ** 2 + m.high ** 2).toBeCloseTo(1);
    }
  });
});

describe('questEvent', () => {
  const poi = { id: 1, name: 'x', kind: 'school', x: 0, z: 0, stop: { x: 0, z: 0, node: 0 } } as unknown as Quest['kitchen'];
  const base = createQuest(poi, [poi, poi]);
  it('detects pickup, deliver, done, fail, tick', () => {
    const delivering: Quest = { ...base, phase: 'delivering', timeLeft: 20 };
    expect(questEvent(base, delivering)).toBe('pickup');
    expect(questEvent(delivering, { ...delivering, next: 1 })).toBe('deliver');
    expect(questEvent(delivering, { ...delivering, next: 2, phase: 'done' })).toBe('done');
    expect(questEvent(delivering, { ...delivering, phase: 'failed' })).toBe('fail');
    expect(questEvent({ ...delivering, timeLeft: 9.1 }, { ...delivering, timeLeft: 8.9 })).toBe('tick');
    expect(questEvent({ ...delivering, timeLeft: 9.1 }, { ...delivering, timeLeft: 9.05 })).toBeNull();
    expect(questEvent(delivering, delivering)).toBeNull();
  });
});
