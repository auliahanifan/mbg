import type { CityData } from './osm';

export interface Edge { a: number; b: number; w: number; len: number; way: number }
export interface City { data: CityData; edges: Edge[]; adj: number[][] }

export function loadCity(data: CityData): City {
  const edges: Edge[] = [];
  const adj: number[][] = data.nodes.map(() => []);
  data.ways.forEach((way, wi) => {
    for (let i = 0; i + 1 < way.n.length; i++) {
      const a = way.n[i];
      const b = way.n[i + 1];
      const len = Math.hypot(data.nodes[b][0] - data.nodes[a][0], data.nodes[b][1] - data.nodes[a][1]);
      if (len < 0.01) continue;
      const idx = edges.push({ a, b, w: way.w, len, way: wi }) - 1;
      adj[a].push(idx);
      adj[b].push(idx);
    }
  });
  return { data, edges, adj };
}

export const edgesFrom = (city: City, node: number): number[] => city.adj[node];

export function pointOnEdge(city: City, edge: number, t: number): { x: number; z: number; heading: number } {
  const e = city.edges[edge];
  const [ax, az] = city.data.nodes[e.a];
  const [bx, bz] = city.data.nodes[e.b];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
}

/** Closest edge to (x, z) by point-segment distance. ponytail: linear scan over ~10k edges (~0.3 ms); grid-bucket it if profiling says so. */
export function nearestEdge(city: City, x: number, z: number): { edge: number; t: number; dist: number } {
  let best = { edge: -1, t: 0, dist: Infinity };
  city.edges.forEach((e, i) => {
    const [ax, az] = city.data.nodes[e.a];
    const [bx, bz] = city.data.nodes[e.b];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const dist = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (dist < best.dist) best = { edge: i, t, dist };
  });
  return best;
}

export function nearestNode(city: City, x: number, z: number): number {
  const { edge, t } = nearestEdge(city, x, z);
  const e = city.edges[edge];
  return t < 0.5 ? e.a : e.b;
}
