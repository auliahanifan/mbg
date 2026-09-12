import { describe, it, expect } from 'vitest';
import { createQuest, stepQuest, questTarget, questText, roundTime, STOP_RADIUS } from './quest';
import type { Poi } from '../world/cityMap';

const poi = (id: string, name: string, kind: Poi['kind'], x: number): Poi => ({
  id, name, kind, row: 0, col: 0, stop: { row: 0, col: 0, x, z: 0 },
});
const kitchen = poi('K', 'Dapur SPPG', 'kitchen', 0);
const schools = [poi('1', 'SDN 1', 'school', 50), poi('2', 'SDN 2', 'school', 100)];
const stopped = (x: number) => ({ x, z: 0, speed: 0 });
const away = { x: 999, z: 999, speed: 0 };

describe('quest', () => {
  it('starts heading to the kitchen with the timer paused', () => {
    const q = createQuest(kitchen, schools);
    expect(q.phase).toBe('toKitchen');
    expect(questTarget(q)).toBe(kitchen);
    expect(questText(q)).toBe('Ambil paket MBG di Dapur SPPG');
    expect(stepQuest(q, away, 10).timeLeft).toBe(roundTime(1));
  });
  it('loads at the kitchen only when stopped inside the radius', () => {
    const q = createQuest(kitchen, schools);
    expect(stepQuest(q, { x: 2, z: 0, speed: 5 }, 0.1).phase).toBe('toKitchen');
    expect(stepQuest(q, stopped(STOP_RADIUS + 0.1), 0.1).phase).toBe('toKitchen');
    const loaded = stepQuest(q, stopped(2), 0.1);
    expect(loaded.phase).toBe('delivering');
    expect(questTarget(loaded)).toBe(schools[0]);
    expect(questText(loaded)).toBe('Antar ke SDN 1 (1/2)');
    expect(loaded.toast).toContain('dimuat');
  });
  it('delivers in order, scores, and finishes with a time bonus', () => {
    let q = stepQuest(createQuest(kitchen, schools), stopped(2), 0.1);
    q = stepQuest(q, away, 10);
    expect(q.timeLeft).toBeCloseTo(roundTime(1) - 10);
    q = stepQuest(q, stopped(50), 0.1);
    expect(q.next).toBe(1);
    expect(q.score).toBe(100);
    expect(questText(q)).toBe('Antar ke SDN 2 (2/2)');
    q = stepQuest(q, stopped(100), 0.1);
    expect(q.phase).toBe('done');
    expect(q.score).toBe(200 + Math.round(q.timeLeft));
    expect(questTarget(q)).toBeNull();
    expect(questText(q)).toContain('tekan R');
  });
  it('fails when the timer runs out', () => {
    let q = stepQuest(createQuest(kitchen, schools), stopped(2), 0.1);
    q = stepQuest(q, away, roundTime(1) + 1);
    expect(q.phase).toBe('failed');
    expect(q.timeLeft).toBe(0);
  });
  it('rounds get shorter down to 60s and toasts expire', () => {
    expect(roundTime(1)).toBe(150);
    expect(roundTime(3)).toBe(110);
    expect(roundTime(9)).toBe(60);
    const q = stepQuest(createQuest(kitchen, schools), stopped(2), 0.1);
    expect(q.toastTtl).toBeGreaterThan(0);
    expect(stepQuest(q, away, 5).toastTtl).toBe(0);
  });
});
