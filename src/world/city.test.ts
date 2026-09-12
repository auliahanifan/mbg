import { describe, it, expect } from 'vitest';
import { loadCity, edgesFrom, pointOnEdge, nearestEdge, nearestNode } from './city';
import type { CityData } from './osm';

// 0 --100-- 1 --100-- 2      node 3 is 100 m south (+z) of node 1
export const tiny: CityData = {
  nodes: [[0, 0], [100, 0], [200, 0], [100, 100]],
  ways: [{ n: [0, 1, 2], w: 6 }, { n: [1, 3], w: 4 }, { n: [3, 3], w: 4 }],
  buildings: [],
  pois: [],
};

describe('loadCity', () => {
  const city = loadCity(tiny);
  it('builds one edge per consecutive node pair, skipping zero-length', () => {
    expect(city.edges).toEqual([
      { a: 0, b: 1, w: 6, len: 100 },
      { a: 1, b: 2, w: 6, len: 100 },
      { a: 1, b: 3, w: 4, len: 100 },
    ]);
    expect(edgesFrom(city, 1)).toEqual([0, 1, 2]);
    expect(edgesFrom(city, 3)).toEqual([2]);
  });
  it('pointOnEdge interpolates a→b with the segment heading', () => {
    expect(pointOnEdge(city, 0, 0.25)).toEqual({ x: 25, z: 0, heading: Math.PI / 2 }); // east
    expect(pointOnEdge(city, 2, 1).heading).toBeCloseTo(0); // south = +z
  });
  it('nearestEdge projects onto the closest segment', () => {
    expect(nearestEdge(city, 150, 10)).toEqual({ edge: 1, t: 0.5, dist: 10 });
    expect(nearestEdge(city, 300, 0)).toEqual({ edge: 1, t: 1, dist: 100 });
    expect(nearestEdge(city, 95, 60).edge).toBe(2);
    expect(nearestNode(city, 160, 3)).toBe(2);
    expect(nearestNode(city, 140, 3)).toBe(1);
  });
});
