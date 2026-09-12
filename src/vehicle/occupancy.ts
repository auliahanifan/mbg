import { HALF_SIZE } from '../world/osm';
import type { Box } from './collision';

export interface Occupancy { size: number; origin: number; cells: Uint8Array }
const WALL = 50;

export function gridFromImage(rgba: Uint8ClampedArray, size: number, origin: number): Occupancy {
  const cells = new Uint8Array(size * size);
  for (let i = 0; i < cells.length; i++) cells[i] = rgba[i * 4 + 3] > 0 ? 1 : 0;
  return { size, origin, cells };
}

/** Rasterises building footprints at 1 m/cell by filling them on an offscreen canvas (canvas x = world x, canvas y = world z). */
export function rasterize(buildings: { p: [number, number][] }[], size = HALF_SIZE * 2, origin = -HALF_SIZE): Occupancy {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.translate(-origin, -origin);
  g.fillStyle = '#000';
  for (const b of buildings) {
    g.beginPath();
    b.p.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.closePath();
    g.fill();
  }
  return gridFromImage(g.getImageData(0, 0, size, size).data, size, origin);
}

/** 1x1 boxes for occupied cells within r of (x, z), plus four walls hemming in the whole grid. */
export function boxesAround(o: Occupancy, x: number, z: number, r = 3): Box[] {
  const lo = o.origin;
  const hi = o.origin + o.size;
  const out: Box[] = [
    { minX: hi, maxX: hi + WALL, minZ: lo - WALL, maxZ: hi + WALL },
    { minX: lo - WALL, maxX: lo, minZ: lo - WALL, maxZ: hi + WALL },
    { minX: lo - WALL, maxX: hi + WALL, minZ: hi, maxZ: hi + WALL },
    { minX: lo - WALL, maxX: hi + WALL, minZ: lo - WALL, maxZ: lo },
  ];
  const i0 = Math.max(0, Math.floor(x - r - lo));
  const i1 = Math.min(o.size - 1, Math.floor(x + r - lo));
  const j0 = Math.max(0, Math.floor(z - r - lo));
  const j1 = Math.min(o.size - 1, Math.floor(z + r - lo));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (o.cells[j * o.size + i]) out.push({ minX: lo + i, maxX: lo + i + 1, minZ: lo + j, maxZ: lo + j + 1 });
    }
  }
  return out;
}
