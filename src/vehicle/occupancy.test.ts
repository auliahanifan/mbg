import { describe, it, expect } from 'vitest';
import { gridFromImage, boxesAround } from './occupancy';

// 4x4 grid, origin -2: only cell (2,1) (x∈[0,1), z∈[-1,0)) is filled
const rgba = new Uint8ClampedArray(4 * 4 * 4);
rgba[(1 * 4 + 2) * 4 + 3] = 255;
const occ = gridFromImage(rgba, 4, -2);

describe('occupancy', () => {
  it('reads alpha into cells', () => {
    expect(occ.cells[1 * 4 + 2]).toBe(1);
    expect(Array.from(occ.cells).reduce((a, b) => a + b, 0)).toBe(1);
  });
  it('returns the filled cell as a 1x1 box when in range, plus 4 walls', () => {
    const boxes = boxesAround(occ, 0.5, -0.5, 1);
    expect(boxes).toContainEqual({ minX: 0, maxX: 1, minZ: -1, maxZ: 0 });
    expect(boxes).toHaveLength(5);
    expect(boxesAround(occ, 1.5, 1.5, 0.4)).toHaveLength(4); // walls only
  });
  it('walls sit just outside the grid', () => {
    const walls = boxesAround(occ, 100, 100, 1);
    expect(walls).toContainEqual({ minX: 2, maxX: 52, minZ: -52, maxZ: 52 });   // east
    expect(walls).toContainEqual({ minX: -52, maxX: -2, minZ: -52, maxZ: 52 }); // west
  });
});
