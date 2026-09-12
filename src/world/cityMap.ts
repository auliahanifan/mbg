export const TILE = 8;
export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_VEC: Record<Dir, { dx: number; dz: number }> = {
  N: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 },
};
// One quarter turn of Object3D.rotation.y (+PI/2) maps E->N->W->S->E.
const TURN: Record<Dir, Dir> = { E: 'N', N: 'W', W: 'S', S: 'E' };

export function rotateDir(d: Dir, quarterTurns: number): Dir {
  let r = d;
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) r = TURN[r];
  return r;
}
export const opposite = (d: Dir): Dir => rotateDir(d, 2);
export const leftOf = (d: Dir): Dir => rotateDir(d, 1);
/** Heading such that forward = (sin h, cos h) points along d. */
export const headingOf = (d: Dir): number => Math.atan2(DIR_VEC[d].dx, DIR_VEC[d].dz);

// R road, . commercial, X skyscraper ring, H house, T park, K SPPG kitchen, 1-3 schools
export const MAP: string[] = [
  'XXXXXXXXXXXXXXXXX',
  'X...............X',
  'X.RRRRRRRRRRRRR.X',
  'X.RK..R.1.RHHHR.X',
  'X.R...R...RHHHR.X',
  'X.R...R...RHHHR.X',
  'X.RRRRRRRRRRRRR.X',
  'X.R...RTTTR...R.X',
  'X.R...RTTTR..2R.X',
  'X.R...RTTTR...R.X',
  'X.RRRRRRRRRRRRR.X',
  'X.RHHHR...RHHHR.X',
  'X.RHHHR...RHHHR.X',
  'X.RHHHR.3.RHHHR.X',
  'X.RRRRRRRRRRRRR.X',
  'X...............X',
  'XXXXXXXXXXXXXXXXX',
];

export const tileAt = (map: string[], row: number, col: number): string => map[row]?.[col] ?? 'X';
export const isRoad = (map: string[], row: number, col: number): boolean => tileAt(map, row, col) === 'R';
export const tileCenter = (row: number, col: number) => ({ x: col * TILE, z: row * TILE });
export const worldToTile = (x: number, z: number) => ({ row: Math.round(z / TILE), col: Math.round(x / TILE) });

export function roadSides(map: string[], row: number, col: number): Dir[] {
  return DIRS.filter((d) => isRoad(map, row + DIR_VEC[d].dz, col + DIR_VEC[d].dx));
}

export function roadTiles(map: string[]): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  map.forEach((line, row) => [...line].forEach((ch, col) => ch === 'R' && out.push({ row, col })));
  return out;
}

// Open sides of each Kenney road model in its native orientation (measured from the glb).
const ROAD_MODELS: { name: string; open: Dir[] }[] = [
  { name: 'road-crossroad', open: ['N', 'E', 'S', 'W'] },
  { name: 'road-intersection', open: ['W', 'E', 'S'] },
  { name: 'road-straight', open: ['W', 'E'] },
  { name: 'road-bend', open: ['W', 'S'] },
  { name: 'road-end', open: ['E'] },
];
const key = (ds: Dir[]) => [...ds].sort().join('');

export function pickRoadModel(sides: Dir[]): { name: string; rotationY: number } {
  const want = key(sides);
  for (const m of ROAD_MODELS) {
    for (let k = 0; k < 4; k++) {
      if (key(m.open.map((d) => rotateDir(d, k))) === want) return { name: m.name, rotationY: (k * Math.PI) / 2 };
    }
  }
  return { name: 'road-straight', rotationY: 0 };
}

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

export function collisionBoxes(map: string[]): Box[] {
  const out: Box[] = [];
  map.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      if (ch === 'R') return;
      const { x, z } = tileCenter(row, col);
      out.push({ minX: x - TILE / 2, maxX: x + TILE / 2, minZ: z - TILE / 2, maxZ: z + TILE / 2 });
    }),
  );
  return out;
}

export interface Poi {
  id: string;
  name: string;
  kind: 'kitchen' | 'school';
  row: number;
  col: number;
  stop: { row: number; col: number; x: number; z: number };
}

const POI_INFO: Record<string, { kind: Poi['kind']; name: string }> = {
  K: { kind: 'kitchen', name: 'Dapur SPPG' },
  '1': { kind: 'school', name: 'SDN 1 Merdeka' },
  '2': { kind: 'school', name: 'SDN 2 Harapan' },
  '3': { kind: 'school', name: 'SDN 3 Nusantara' },
};

export function findPois(map: string[]): Poi[] {
  const out: Poi[] = [];
  map.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      const info = POI_INFO[ch];
      if (!info) return;
      const side = roadSides(map, row, col)[0];
      if (!side) throw new Error(`POI ${ch} at ${row},${col} has no adjacent road`);
      const srow = row + DIR_VEC[side].dz;
      const scol = col + DIR_VEC[side].dx;
      out.push({ id: ch, ...info, row, col, stop: { row: srow, col: scol, ...tileCenter(srow, scol) } });
    }),
  );
  return out; // scan order in MAP is already K, 1, 2, 3
}
