import { describe, it, expect } from 'vitest';
import { loadCity } from '../world/city';
import { spawnPeople, stepPeople, peopleCircles, hitPerson, PERSON_RADIUS, type Person } from './people';

// 0 --100-- 1 --100-- 2 ; 1 --100-- 3 (south). Node 2 and 3 are dead ends.
const city = loadCity({ nodes: [[0, 0], [100, 0], [200, 0], [100, 100]], ways: [{ n: [0, 1, 2], w: 6 }, { n: [1, 3], w: 4 }], buildings: [], pois: [] });
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const still = { x: 50, z: 0, heading: 0, speed: 0 }; // a parked player that never scares or respawns anyone
const person = (edge: number, dir: 1 | -1, t: number, side: 1 | -1 = 1, pace = 1.2): Person =>
  ({ edge, dir, t, side, speed: pace, pace, x: 0, z: 0, heading: 0, phase: 0, look: 0 });

describe('people', () => {
  it('walks on the sidewalk, 3.8 m from the centre line of a 6 m road', () => {
    const p = person(0, 1, 0);
    stepPeople(city, [p], 1, seq(0), still);
    expect(p.x).toBeCloseTo(1.2);
    expect(p.z).toBeCloseTo(-3.8); // left of eastbound = north = -z: w/2 + 0.8 kerb
    expect(p.heading).toBeCloseTo(Math.PI / 2);
  });
  it('turns onto a random exit at a junction and round at a dead end, staying on the same kerb', () => {
    const p = person(0, 1, 0.99);
    stepPeople(city, [p], 1, seq(0.99), still);
    expect(p.edge).toBe(2); // rng picks the last exit: the side street
    const d = person(1, 1, 0.995, 1);
    stepPeople(city, [d], 1, seq(0), still);
    expect(d.dir).toBe(-1);
    expect(d.side).toBe(-1);
    expect(d.z).toBeCloseTo(-3.8); // still the north kerb
  });
  it('spawns everyone standing or strolling, near the player', () => {
    const rng = seq(0.1, 0.3, 0.7, 0.5, 0.9);
    const people = spawnPeople(city, 5, rng, { x: 100, z: 0 });
    expect(people).toHaveLength(5);
    for (const p of people) expect(Math.hypot(p.x - 100, p.z)).toBeLessThan(170);
    expect(people.some((p) => p.pace === 0)).toBe(true);
    expect(people.some((p) => p.pace > 1)).toBe(true);
  });
  it('crosses to the other kerb at a junction when its own side is another carriageway', () => {
    const p = person(0, 1, 0.99, -1); // south kerb of the main road
    stepPeople(city, [p], 1, seq(0.99), still, (x, z) => z > 2 && z < 8); // the main road's south kerb is a median past the junction
    expect(p.edge).toBe(2); // only the side street is open on that side
    const q = person(0, 1, 0.99, -1);
    stepPeople(city, [q], 1, seq(0), still, (x, z) => x > 100 && x < 110); // side street's start blocked on both sides
    expect(q.edge).toBe(1);
    expect(q.side).toBe(-1);
    const r = person(0, 1, 0.99, -1);
    stepPeople(city, [r], 1, seq(0), still, (x, z) => (x > 100 && x < 110) || z > 2); // and the main road's south kerb too
    expect(r.edge).toBe(1);
    expect(r.side).toBe(1); // crossed over
  });
  it('runs from a car bearing down on it', () => {
    const p = person(0, 1, 0.5);
    stepPeople(city, [p], 0.01, seq(0), still);
    stepPeople(city, [p], 0.01, seq(0), { x: p.x - 4, z: p.z, heading: Math.PI / 2, speed: 10 }); // right behind, closing fast
    expect(p.speed).toBeGreaterThan(3);
  });
  it('is solid until hit, then flies, lies still and is recycled', () => {
    const p = person(0, 1, 0.5);
    stepPeople(city, [p], 0.01, seq(0), still);
    expect(peopleCircles([p])[0].r).toBe(PERSON_RADIUS);
    hitPerson(p, 1, 0, 30);
    expect(peopleCircles([p])[0].r).toBe(0);
    expect(p.crash!.vy).toBeGreaterThan(0);
    const x0 = p.x;
    for (let i = 0; i < 60; i++) stepPeople(city, [p], 1 / 60, seq(0.5), still);
    expect(p.x).toBeGreaterThan(x0 + 5);
    for (let i = 0; i < 60 * 6; i++) stepPeople(city, [p], 1 / 60, seq(0.5), still);
    expect(p.crash).toBeNull(); // back on a kerb somewhere
  });
});
