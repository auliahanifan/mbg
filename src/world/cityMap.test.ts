import { describe, it, expect } from 'vitest';
import {
  MAP, TILE, BLOCK_HALF, rotateDir, opposite, leftOf, headingOf, tileAt, isRoad, tileCenter, worldToTile,
  roadSides, pickRoadModel, collisionBoxes, findPois, roadTiles,
} from './cityMap';

const small = [
  'XXXX',
  'XRRX',
  'XR.X',
  'XXXX',
];

describe('directions', () => {
  it('quarter turn cycles E→N→W→S→E', () => {
    expect(rotateDir('E', 1)).toBe('N');
    expect(rotateDir('N', 1)).toBe('W');
    expect(rotateDir('W', 1)).toBe('S');
    expect(rotateDir('S', 1)).toBe('E');
    expect(rotateDir('E', 4)).toBe('E');
    expect(rotateDir('E', -1)).toBe('S');
  });
  it('opposite/left/heading', () => {
    expect(opposite('N')).toBe('S');
    expect(leftOf('E')).toBe('N');
    expect(headingOf('S')).toBeCloseTo(0);
    expect(headingOf('E')).toBeCloseTo(Math.PI / 2);
    expect(headingOf('N')).toBeCloseTo(Math.PI);
  });
});

describe('tiles', () => {
  it('reads tiles and treats out-of-bounds as solid X', () => {
    expect(tileAt(small, 1, 1)).toBe('R');
    expect(tileAt(small, -1, 0)).toBe('X');
    expect(tileAt(small, 0, 99)).toBe('X');
    expect(isRoad(small, 1, 2)).toBe(true);
    expect(isRoad(small, 2, 2)).toBe(false);
  });
  it('converts tile <-> world', () => {
    expect(TILE).toBe(12);
    expect(BLOCK_HALF).toBe(4.5);
    expect(tileCenter(2, 3)).toEqual({ x: 36, z: 24 });
    expect(worldToTile(36, 24)).toEqual({ row: 2, col: 3 });
    expect(worldToTile(41.9, 18.1)).toEqual({ row: 2, col: 3 });
  });
  it('lists road neighbours', () => {
    expect(roadSides(small, 1, 1)).toEqual(['E', 'S']);
    expect(roadSides(small, 1, 2)).toEqual(['W']);
  });
  it('MAP is 17x17 and every road tile has a road neighbour', () => {
    expect(MAP.length).toBe(17);
    for (const row of MAP) expect(row.length).toBe(17);
    for (const { row, col } of roadTiles(MAP)) expect(roadSides(MAP, row, col).length).toBeGreaterThan(0);
  });
});

describe('pickRoadModel', () => {
  it('straight W-E has rotation 0, N-S is a quarter turn', () => {
    expect(pickRoadModel(['E', 'W'])).toEqual({ name: 'road-straight', rotationY: 0 });
    expect(pickRoadModel(['N', 'S'])).toEqual({ name: 'road-straight', rotationY: Math.PI / 2 });
  });
  it('bend: model opens W,S; N,E needs a half turn', () => {
    expect(pickRoadModel(['S', 'W'])).toEqual({ name: 'road-bend', rotationY: 0 });
    expect(pickRoadModel(['N', 'E'])).toEqual({ name: 'road-bend', rotationY: Math.PI });
  });
  it('T, crossroad, end', () => {
    expect(pickRoadModel(['E', 'S', 'W'])).toEqual({ name: 'road-intersection', rotationY: 0 });
    expect(pickRoadModel(['N', 'E', 'S', 'W']).name).toBe('road-crossroad');
    expect(pickRoadModel(['E'])).toEqual({ name: 'road-end', rotationY: 0 });
    expect(pickRoadModel(['N'])).toEqual({ name: 'road-end', rotationY: Math.PI / 2 });
  });
  it('falls back to straight for isolated tiles', () => {
    expect(pickRoadModel([]).name).toBe('road-straight');
  });
});

describe('collisionBoxes', () => {
  it('makes one 8x8 box per non-road tile', () => {
    const boxes = collisionBoxes(small);
    expect(boxes.length).toBe(16 - 3);
    expect(boxes).toContainEqual({ minX: 2 * TILE - BLOCK_HALF, maxX: 2 * TILE + BLOCK_HALF, minZ: 2 * TILE - BLOCK_HALF, maxZ: 2 * TILE + BLOCK_HALF });
  });
});

describe('findPois', () => {
  it('finds kitchen + 3 schools in MAP with a road stop next to each', () => {
    const pois = findPois(MAP);
    expect(pois.map((p) => p.id)).toEqual(['K', '1', '2', '3']);
    const k = pois[0];
    expect(k.kind).toBe('kitchen');
    expect(k.name).toBe('Dapur SPPG');
    expect(k).toMatchObject({ row: 3, col: 3, stop: { row: 2, col: 3, x: 36, z: 24 } });
    for (const p of pois) expect(isRoad(MAP, p.stop.row, p.stop.col)).toBe(true);
  });
  it('throws when a POI has no adjacent road', () => {
    expect(() => findPois(['XXX', 'XKX', 'XXX'])).toThrow();
  });
});
