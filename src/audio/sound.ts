import { Vector3, type Camera } from 'three';
import { MAX_SPEED, type CarInput, type CarState } from '../vehicle/carPhysics';
import type { Quest } from '../quest/quest';

const GEARS = [0.12, 0.3, 0.55, 1.001]; // top of each gear as fraction of MAX_SPEED
const HIT_COOLDOWN = 0.25;
const TICK_FROM = 10; // seconds left when the timer starts ticking
const LAYER_F0 = { idle: 46, cruise: 67, high: 85 }; // measured fundamental (Hz) of each engine loop
const firingHz = (rpm: number) => 28 + rpm * 120; // 4-cyl firing frequency: ~840 → 4400 rpm
const TRAFFIC_VOICES = 6;
const LOOPS = ['engine_idle', 'engine_cruise', 'engine_high', 'horn', 'skid', 'city'] as const;
const SHOTS = ['ignition', 'crash', 'bump0', 'bump1', 'bump2', 'bump3', 'pickup', 'deliver', 'done', 'fail', 'tick'] as const;
type Name = (typeof LOOPS)[number] | (typeof SHOTS)[number];

export interface EngineParams { rpm: number; load: number; v: number }

/** Pure: 4-speed gearbox → rpm 0..1 (drops on every shift), load 0..1, v = |speed|/max. */
export function engineParams(speed: number, throttle: number): EngineParams {
  const v = Math.min(Math.abs(speed) / MAX_SPEED, 1);
  let gear = 0;
  while (v > GEARS[gear]) gear++;
  const lo = gear ? GEARS[gear - 1] : 0;
  const rpm = 0.2 + 0.8 * ((v - lo) / (GEARS[gear] - lo));
  const load = throttle > 0 ? 1 : throttle < 0 ? 0.7 : 0.15;
  return { rpm, load, v };
}

const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));

/** Pure: equal-power crossfade of the three engine loops by rpm (idle → cruise → high). */
export function engineMix(rpm: number): { idle: number; cruise: number; high: number } {
  const a = ramp(rpm, 0.3, 0.55) * (Math.PI / 2);
  const b = ramp(rpm, 0.7, 0.95) * (Math.PI / 2);
  return { idle: Math.cos(a), cruise: Math.sin(a) * Math.cos(b), high: Math.sin(b) };
}

/** Quest transitions that deserve a sound. Pure. */
export function questEvent(prev: Quest, q: Quest): 'pickup' | 'deliver' | 'done' | 'fail' | 'tick' | null {
  if (prev.phase === 'toKitchen' && q.phase === 'delivering') return 'pickup';
  if (q.phase === 'done' && prev.phase !== 'done') return 'done';
  if (q.phase === 'failed' && prev.phase !== 'failed') return 'fail';
  if (q.next > prev.next) return 'deliver';
  if (q.phase === 'delivering' && q.timeLeft <= TICK_FROM && Math.ceil(q.timeLeft) !== Math.ceil(prev.timeLeft)) return 'tick';
  return null;
}

export interface Mover { x: number; z: number; speed: number }

/** Sample-based Web Audio: 3-layer engine, positional traffic, tyres, horn, impacts, jingles, city ambience. Starts on first key/pointer (autoplay policy). */
export function createSound() {
  let ctx: AudioContext | null = null;
  let g: Awaited<ReturnType<typeof buildGraph>> | null = null;
  let muted = false;
  let lastHit = -1;
  let prev: Quest | null = null;

  const start = () => {
    if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
    ctx = new AudioContext();
    void buildGraph(ctx).then((built) => {
      g = built;
      g.master.gain.value = muted ? 0 : 1;
      shot(ctx!, g, 'ignition', 0.8);
      g.engine.gain.setValueAtTime(0, ctx!.currentTime);
      g.engine.gain.linearRampToValueAtTime(1, ctx!.currentTime + 1.2);
    });
  };
  addEventListener('pointerdown', start);
  addEventListener('keydown', (e) => {
    start();
    if (e.code === 'KeyM') { muted = !muted; if (g) g.master.gain.value = muted ? 0 : 1; }
  });

  return {
    hit(impact: number) {
      if (!ctx || !g || impact < 2 || ctx.currentTime - lastHit < HIT_COOLDOWN) return;
      lastHit = ctx.currentTime;
      const vol = Math.min(impact / 15, 1);
      if (impact > 9) shot(ctx, g, 'crash', vol);
      else shot(ctx, g, `bump${Math.floor(Math.random() * 4)}` as Name, 0.4 + vol, 0.9 + Math.random() * 0.2);
    },
    update(car: CarState, input: CarInput, quest: Quest, horn: boolean, traffic: Mover[], camera: Camera) {
      if (!ctx || !g) return;
      const t = ctx.currentTime;
      const set = (p: AudioParam, val: number, tc = 0.06) => p.setTargetAtTime(val, t, tc);

      const { rpm, load, v } = engineParams(car.speed, input.throttle);
      const hz = firingHz(rpm);
      const mix = engineMix(rpm);
      for (const k of ['idle', 'cruise', 'high'] as const) {
        set(g.layers[k].src.playbackRate, hz / LAYER_F0[k], 0.08);
        set(g.layers[k].gain.gain, mix[k] * (0.45 + 0.55 * load));
      }
      set(g.engineFilter.frequency, 900 + load * 3500 + rpm * 2500);
      set(g.road.gain, 0.35 * v);
      const cornering = Math.abs(input.steer) > 0 && Math.abs(car.speed) > 0.6 * MAX_SPEED;
      set(g.loops.skid.gain.gain, input.brake && Math.abs(car.speed) > 6 ? 0.7 : cornering ? 0.3 : 0, 0.04);
      set(g.loops.horn.gain.gain, horn ? 0.8 : 0, 0.01);

      // listener follows the chase camera; the nearest traffic cars get a positional cruise loop each
      const l = ctx.listener;
      const fwd = camera.getWorldDirection(g.tmp);
      if (l.positionX) {
        l.positionX.value = camera.position.x; l.positionY.value = camera.position.y; l.positionZ.value = camera.position.z;
        l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      }
      const near = traffic
        .map((c) => ({ c, d: Math.hypot(c.x - car.x, c.z - car.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, TRAFFIC_VOICES);
      g.voices.forEach((vc, i) => {
        const n = near[i];
        if (!n || n.d > 90) { set(vc.gain.gain, 0); return; }
        vc.panner.positionX.value = n.c.x; vc.panner.positionY.value = 1; vc.panner.positionZ.value = n.c.z;
        set(vc.src.playbackRate, firingHz(0.25 + 0.5 * Math.min(Math.abs(n.c.speed) / 14, 1)) / LAYER_F0.cruise, 0.15);
        set(vc.gain.gain, 0.6);
      });

      const ev = prev && questEvent(prev, quest);
      prev = quest;
      if (ev) shot(ctx, g, ev, ev === 'tick' ? 0.5 : 0.9);
    },
  };
}

function shot(ctx: AudioContext, g: { bufs: Record<Name, AudioBuffer>; master: GainNode }, name: Name, vol: number, rate = 1) {
  const s = new AudioBufferSourceNode(ctx, { buffer: g.bufs[name], playbackRate: rate });
  s.connect(new GainNode(ctx, { gain: vol })).connect(g.master);
  s.start();
}

async function buildGraph(ctx: AudioContext) {
  const names: Name[] = [...LOOPS, ...SHOTS];
  const decoded = await Promise.all(names.map((n) => fetch(`/audio/${n}.ogg`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))));
  const bufs = Object.fromEntries(names.map((n, i) => [n, decoded[i]])) as Record<Name, AudioBuffer>;
  const master = new GainNode(ctx, { gain: 1 });
  master.connect(new DynamicsCompressorNode(ctx, { threshold: -10, ratio: 8 })).connect(ctx.destination); // limiter: layers sum past 0 dBFS

  const loop = (name: Name, gain: number, out: AudioNode) => {
    const src = new AudioBufferSourceNode(ctx, { buffer: bufs[name], loop: true });
    const gn = new GainNode(ctx, { gain });
    src.connect(gn).connect(out);
    src.start();
    return { src, gain: gn };
  };

  const engine = new GainNode(ctx, { gain: 0 });
  const engineFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2000, Q: 0.5 });
  engineFilter.connect(engine).connect(master);
  const layers = { idle: loop('engine_idle', 1, engineFilter), cruise: loop('engine_cruise', 0, engineFilter), high: loop('engine_high', 0, engineFilter) };

  const loops = { horn: loop('horn', 0, master), skid: loop('skid', 0, master), city: loop('city', 0.5, master) };

  // tyre/road rumble: filtered noise, scales with speed
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const road = new GainNode(ctx, { gain: 0 });
  const ns = new AudioBufferSourceNode(ctx, { buffer: nb, loop: true });
  ns.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500, Q: 0.5 })).connect(road).connect(master);
  ns.start();

  const voices = Array.from({ length: TRAFFIC_VOICES }, () => {
    const panner = new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 6, maxDistance: 120, rolloffFactor: 1.2 });
    panner.connect(master);
    const { src, gain } = loop('engine_cruise', 0, panner);
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    return { src, gain, panner };
  });

  return { bufs, master, engine, engineFilter, layers, loops, road, voices, tmp: new Vector3() };
}
