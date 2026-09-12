import { describe, it, expect } from 'vitest';
import { loadCity } from './city';
import { routeField, pathFrom, routeLength } from './routing';
import type { CityData } from './osm';

// square 0-1-2-3 with a diagonal shortcut 0-2 of length 100 (shorter than 0-1-2 = 200); node 4 isolated
const data: CityData = {
  nodes: [[0, 0], [100, 0], [100, 100], [0, 100], [500, 500]],
  ways: [{ n: [0, 1, 2, 3, 0], w: 6 }, { n: [0, 2], w: 6 }],
  buildings: [],
  pois: [],
};
const city = loadCity(data);
// force the diagonal to 100 m so it beats the two sides
city.edges[4].len = 100;

describe('routing', () => {
  it('finds shortest paths to the target from every node', () => {
    const f = routeField(city, 2);
    expect(f.dist[2]).toBe(0);
    expect(f.dist[0]).toBe(100);
    expect(f.dist[1]).toBe(100);
    expect(f.dist[3]).toBe(100);
    expect(pathFrom(f, 0)).toEqual([0, 2]);
    expect(pathFrom(f, 3)).toEqual([3, 2]);
    expect(pathFrom(f, 4)).toEqual([]);
    expect(f.dist[4]).toBe(Infinity);
  });
  it('sums leg lengths for a multi-stop route', () => {
    expect(routeLength(city, [0, 2, 3])).toBe(200);
    expect(routeLength(city, [0, 4])).toBe(0);
  });
});
