/**
 * Render budget. Measured on an Apple M2 at 1200x593, the full look costs ~29 ms of GPU per frame and
 * GTAO alone is ~17 of those, so a weaker GPU never gets close to 60 fps. Rather than guess at the
 * hardware from a driver string, start at the top of the ladder and step down a rung whenever the
 * measured median frame time says the machine cannot hold the one it is on.
 *
 * Measured GPU cost per rung on that M2: 27.8 / 10.8 / 7.8 / 6.6 ms. The ratio widens as the GPU gets
 * more stressed — at 2400x648, where the top rung costs 54 ms, rung 1 is 10.4 ms, so 5.2x rather than
 * 2.6x. Passes come off in order of cost per pixel of look: GTAO first (more than half the frame), then
 * bloom, then resolution, then SMAA, and only on the last rung the shadows.
 */
export interface Quality {
  pixelRatio: number; // capped against devicePixelRatio, so this only ever lowers it
  shadowMapSize: number;
  shadowBox: number; // half-width of the sun's ortho box, in metres
  shadows: boolean;
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
}

const LADDER: Quality[] = [
  { pixelRatio: 1.5, shadowMapSize: 4096, shadowBox: 60, shadows: true, ao: true, bloom: true, smaa: true },
  { pixelRatio: 1.0, shadowMapSize: 1024, shadowBox: 45, shadows: true, ao: false, bloom: false, smaa: true },
  { pixelRatio: 0.75, shadowMapSize: 1024, shadowBox: 45, shadows: true, ao: false, bloom: false, smaa: false },
  { pixelRatio: 0.6, shadowMapSize: 512, shadowBox: 40, shadows: false, ao: false, bloom: false, smaa: false },
];

// ?q=high | low, or ?q=0..3 for an exact rung
const param = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('q');
const named: Record<string, number> = { high: 0, low: 1 };
const rung = param === null ? -1 : (named[param] ?? Number(param));
const forced = Number.isInteger(rung) && rung >= 0 && rung < LADDER.length ? rung : -1;
const start = forced < 0 ? 0 : forced;

export const startQuality: Quality = LADDER[start];
export const rungs: readonly Quality[] = LADDER;

const SLOW_MS = 24; // a median frame this long is ~42 fps: the rung is not holding
const WINDOW = 90; // frames per verdict, ~1.5 s — long enough that shader-compile hitches do not move the median

/**
 * Feeds frame times to the ladder and applies the next rung down when one stops holding. One-way:
 * stepping back up on a lucky window would oscillate, and the cheaper rung is the safe place to sit.
 */
export function watchQuality(apply: (q: Quality) => void): (dt: number) => void {
  let rung = start;
  const frames: number[] = [];
  return (dt: number) => {
    if (forced >= 0 || rung >= LADDER.length - 1) return;
    frames.push(dt * 1000);
    if (frames.length < WINDOW) return;
    const median = frames.slice().sort((a, b) => a - b)[WINDOW >> 1];
    frames.length = 0;
    if (median > SLOW_MS) apply(LADDER[++rung]);
  };
}
