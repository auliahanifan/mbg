import { describe, it, expect } from 'vitest';
import { rungs, startQuality, watchQuality } from './quality';

// no `location` under vitest, so nothing is pinned: the ladder starts at the top and is free to step
const slow = 0.04; // 40 ms frames — well past the 24 ms verdict
const fast = 0.008;
const feed = (step: (dt: number) => void, dt: number, n: number) => { for (let i = 0; i < n; i++) step(dt); };

describe('watchQuality', () => {
  it('starts at the full look', () => {
    expect(startQuality).toBe(rungs[0]);
    expect(startQuality.ao).toBe(true);
  });

  it('holds the rung while frames are quick', () => {
    const seen: unknown[] = [];
    feed(watchQuality((q) => seen.push(q)), fast, 500);
    expect(seen).toEqual([]);
  });

  it('steps down one rung per slow window, then stops at the bottom', () => {
    const seen: unknown[] = [];
    const step = watchQuality((q) => seen.push(q));
    feed(step, slow, 90);
    expect(seen).toEqual([rungs[1]]);
    feed(step, slow, 90 * (rungs.length - 2));
    expect(seen).toEqual(rungs.slice(1));
    feed(step, slow, 900); // nothing below the last rung
    expect(seen).toEqual(rungs.slice(1));
  });

  it('needs a full window before it judges', () => {
    const seen: unknown[] = [];
    feed(watchQuality((q) => seen.push(q)), slow, 89);
    expect(seen).toEqual([]);
  });

  it('ignores a slow minority inside a window', () => {
    const seen: unknown[] = [];
    const step = watchQuality((q) => seen.push(q));
    for (let i = 0; i < 90; i++) step(i < 40 ? slow : fast); // median stays quick
    expect(seen).toEqual([]);
  });

  it('every rung is cheaper than the one above it', () => {
    const cost = (q: typeof rungs[number]) => [q.pixelRatio, q.shadowMapSize, q.shadows, q.ao, q.bloom, q.smaa];
    for (let i = 1; i < rungs.length; i++) {
      const a = cost(rungs[i - 1]), b = cost(rungs[i]);
      expect(a.some((v, k) => v > b[k])).toBe(true);
      expect(a.every((v, k) => v >= b[k])).toBe(true);
    }
  });
});
