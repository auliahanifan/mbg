import type { City } from './city';

export interface RouteField { target: number; dist: Float64Array; prev: Int32Array }

/** Binary min-heap of [dist, node]. */
class Heap {
  private h: [number, number][] = [];
  get size() { return this.h.length; }
  push(d: number, n: number) {
    const h = this.h;
    h.push([d, n]);
    for (let i = h.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const h = this.h;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Dijkstra from `target`; the graph is undirected so dist[n] is the length of the shortest n→target route. */
export function routeField(city: City, target: number): RouteField {
  const n = city.data.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new Heap();
  dist[target] = 0;
  heap.push(0, target);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    for (const ei of city.adj[u]) {
      const e = city.edges[ei];
      const v = e.a === u ? e.b : e.a;
      const nd = d + e.len;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(nd, v);
      }
    }
  }
  return { target, dist, prev };
}

export function pathFrom(field: RouteField, node: number): number[] {
  if (field.dist[node] === Infinity) return [];
  const out = [node];
  for (let u = node; u !== field.target; ) {
    u = field.prev[u];
    out.push(u);
  }
  return out;
}

export function routeLength(city: City, nodes: number[]): number {
  let total = 0;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const d = routeField(city, nodes[i + 1]).dist[nodes[i]];
    if (d !== Infinity) total += d;
  }
  return total;
}
