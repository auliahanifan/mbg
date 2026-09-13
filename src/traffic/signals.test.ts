import { describe, it, expect } from 'vitest';
import { loadCity } from '../world/city';
import { buildSignals, approachAt, aspect, signalSpeed, CYCLE } from './signals';
import { stepTraffic, type TrafficCar } from './traffic';

// A 4-way cross of 8 m roads at the origin, arms 100 m long. Node 0 is the junction.
const city = loadCity({
  nodes: [[0, 0], [100, 0], [-100, 0], [0, 100], [0, -100]],
  ways: [{ n: [2, 0, 1], w: 8 }, { n: [4, 0, 3], w: 8 }],
  buildings: [],
  pois: [],
});
// edge 1 = node 0 → node 1 (east arm): a car driving west towards the junction runs it b→a.
const eastbound = () => approachAt(signals, 1, false)!;
const signals = buildSignals(city);
const car = (t: number, speed = 10): TrafficCar =>
  ({ edge: 1, dir: -1, t, speed, cruise: 10, model: 'avanza', x: 0, z: 0, heading: 0, stuck: 0 });
const far = { x: 0, z: 0 };

describe('signals', () => {
  it('signalises the crossing once, with a head on every arm', () => {
    expect(signals.approaches).toHaveLength(4);
    expect(new Set(signals.approaches.map((a) => a.node))).toEqual(new Set([0]));
  });
  it('gives opposite arms the same phase and the side road the other one', () => {
    const group = (edge: number, toB: boolean) => approachAt(signals, edge, toB)!.group;
    expect(group(0, true)).toBe(group(1, false)); // both halves of the east-west road
    expect(group(2, true)).not.toBe(group(1, false)); // the north-south road waits its turn
  });
  it('puts the head on the left kerb, facing the drivers it stops', () => {
    const a = eastbound();
    expect(a.x).toBeCloseTo(6.5); // stop line 4 + 2.5 m back from the centre
    expect(a.z).toBeCloseTo(5.6); // left of a westbound driver: kerb 4 + 1.6 m out
    expect(a.heading).toBeCloseTo(Math.PI / 2);
  });
  it('runs green → amber → red and hands the junction to the other axis', () => {
    const a = eastbound();
    const at = (time: number) => aspect({ ...signals, time }, a);
    const flip = a.group === 0 ? 0 : CYCLE / 2; // whichever half of the cycle is this arm's
    expect(at(flip + 1)).toBe('green');
    expect(at(flip + 21)).toBe('amber');
    expect(at(flip + 24)).toBe('red');
    expect(at((flip + CYCLE / 2 + 1) % CYCLE)).toBe('red'); // the other axis has it now
  });
  it('brakes to nothing at the stop line on red, and ignores a green', () => {
    const a = eastbound();
    const red = { ...signals, time: aspect(signals, a) === 'red' ? 0 : CYCLE / 2 };
    expect(aspect(red, a)).toBe('red');
    expect(signalSpeed(red, a, a.line, 10, 6)).toBe(0); // on the line: stop
    expect(signalSpeed(red, a, a.line - 0.1, 10, 6)).toBe(Infinity); // over it already: clear the junction
    expect(signalSpeed({ ...red, time: red.time + CYCLE / 2 }, a, 30, 10, 6)).toBe(Infinity);
  });
  it('holds a car short of the stop line through a whole red', () => {
    const a = eastbound();
    const s = { ...signals, time: aspect(signals, a) === 'red' ? 0 : CYCLE / 2 };
    const c = car(0.7); // 30 m out, closing at 10 m/s
    for (let i = 0; i < 200; i++) stepTraffic(city, [c], [], 0.05, () => 0, far, s);
    expect(c.edge).toBe(1); // never crossed the junction
    expect(c.speed).toBeCloseTo(0, 1);
    expect((1 - c.t) * city.edges[1].len).toBeGreaterThanOrEqual(a.line - 0.01);
  });
  it('lets the same car go once the light turns green', () => {
    const a = eastbound();
    const s = { ...signals, time: aspect(signals, a) === 'red' ? 0 : CYCLE / 2 };
    const c = car(0.9);
    for (let i = 0; i < 200; i++) stepTraffic(city, [c], [], 0.05, () => 0, far, s);
    s.time += CYCLE / 2; // the other axis's red is our green
    for (let i = 0; i < 100; i++) stepTraffic(city, [c], [], 0.05, () => 0, far, s);
    expect(c.edge).not.toBe(1);
  });
});
