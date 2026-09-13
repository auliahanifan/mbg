import type { City } from '../world/city';

// A Purwokerto cycle: ~20 s green each way, amber, then a couple of seconds all-red while the
// junction clears. Two phases — one per axis of the crossing — like every APILL in town.
const GREEN = 20;
const AMBER = 3;
const CLEAR = 2;
const PHASE = GREEN + AMBER + CLEAR;
export const CYCLE = PHASE * 2;

const MIN_ARM = 8;     // tertiary and up: a signal needs real roads crossing, not a driveway
const MIN_ARMS = 3;
const MERGE = 40;      // metres: one junction gets one cycle, not a light per corner of a split carriageway
const STOP_BACK = 2.5; // stop line this far back from the far kerb line
const KERB = 1.6;      // pole this far outside the asphalt edge, on the sidewalk
const OVER = 0.05;     // slack so a car held exactly on the line doesn't float over it on rounding

export type Aspect = 'green' | 'amber' | 'red';

/** One signal head: the lamps facing traffic arriving at `node` along `edge`. */
export interface Approach {
  node: number;
  edge: number;
  group: 0 | 1;    // which of the junction's two phases turns this head green
  offset: number;  // seconds its junction's cycle is shifted, so the city isn't in lockstep
  x: number;
  z: number;
  heading: number; // faces back down the road, at the drivers it stops
  line: number;    // metres back from the node centre where the stop line sits
}

export interface Signals { approaches: Approach[]; byEdge: Map<number, Approach>; time: number }

/** An approach is one *end* of an edge: `toB` = arriving at the edge's b node. */
const key = (edge: number, toB: boolean) => edge * 2 + (toB ? 1 : 0);

export const approachAt = (s: Signals, edge: number, toB: boolean): Approach | undefined => s.byEdge.get(key(edge, toB));

/** Signalises junctions where at least three tertiary-or-wider arms meet, one per 40 m. Pure. */
export function buildSignals(city: City): Signals {
  const { nodes } = city.data;
  const junctions: number[] = [];
  city.adj
    .map((_, i) => i)
    .filter((i) => city.adj[i].filter((e) => city.edges[e].w >= MIN_ARM).length >= MIN_ARMS)
    .sort((a, b) => city.adj[b].length - city.adj[a].length) // busiest crossing of a cluster wins the light
    .forEach((n) => {
      if (junctions.some((k) => Math.hypot(nodes[k][0] - nodes[n][0], nodes[k][1] - nodes[n][1]) < MERGE)) return;
      junctions.push(n);
    });
  const approaches: Approach[] = [];
  junctions.forEach((n, ji) => {
    const offset = (ji * 7.3) % CYCLE; // deterministic spread: neighbouring junctions never flip together
    const arms = city.adj[n].map((ei) => {
      const e = city.edges[ei];
      const other = e.a === n ? e.b : e.a;
      return { ei, e, ux: (nodes[other][0] - nodes[n][0]) / e.len, uz: (nodes[other][1] - nodes[n][1]) / e.len };
    });
    const ref = arms.reduce((a, b) => (b.e.w > a.e.w ? b : a)); // the widest arm defines the main axis
    for (const { ei, e, ux, uz } of arms) {
      const line = e.w / 2 + STOP_BACK;
      const off = e.w / 2 + KERB;
      approaches.push({
        node: n,
        edge: ei,
        group: Math.abs(ux * ref.ux + uz * ref.uz) >= 0.5 ? 0 : 1, // within 60° of the main axis = same phase
        offset,
        x: nodes[n][0] + ux * line - uz * off, // left kerb of the approaching lane (left-hand traffic)
        z: nodes[n][1] + uz * line + ux * off,
        heading: Math.atan2(ux, uz),
        line,
      });
    }
  });
  return { approaches, byEdge: new Map(approaches.map((a) => [key(a.edge, city.edges[a.edge].b === a.node), a])), time: 0 };
}

export function aspect(s: Signals, a: Approach): Aspect {
  const t = (s.time + a.offset) % CYCLE;
  const local = (t + CYCLE - (a.group ? PHASE : 0)) % CYCLE;
  return local < GREEN ? 'green' : local < GREEN + AMBER ? 'amber' : 'red';
}

/**
 * Speed cap for a car `remaining` metres from the node ahead: Infinity if the light lets it go,
 * otherwise the braking profile that puts it on the stop line with nothing left.
 */
export function signalSpeed(s: Signals, a: Approach, remaining: number, speed: number, accel: number): number {
  const gap = remaining - a.line;
  if (gap < -OVER) return Infinity; // already over the line: clear the junction, don't stop in it
  const light = aspect(s, a);
  if (light === 'green') return Infinity;
  if (light === 'amber' && gap < (speed * speed) / (2 * accel)) return Infinity; // too late to pull up
  return Math.sqrt(2 * accel * Math.max(0, gap));
}
