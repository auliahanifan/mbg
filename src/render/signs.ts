import * as THREE from 'three';
import { hash, orientedBox, type CityData, type OrientedBox } from '../world/osm';
import { FLAT, type Ground } from '../world/terrain';
import { frontSide, type Front } from './buildings';

const CELL_W = 512;
const CELL_H = 64;
const COLS = 8;
const ROWS = 64; // 512 names per 4096² atlas: the map has ~280 once the POI nodes are named in
const SIGN_H = 1.2;
const SIGN_Y = 2.3; // bottom of the board: over the shutters, under the first-floor windows
const STANDOFF = 0.15;
/** Board colours [background, text]; real brand colours for the chains every Purwokerto street has, the rest by name hash. */
const BRANDS: [RegExp, [string, string]][] = [
  [/indomaret/i, ['#0b5cad', '#ffffff']], [/alfamart/i, ['#d71920', '#ffffff']], [/^bca\b/i, ['#0060af', '#ffffff']], [/^bri\b|bank rakyat/i, ['#00529c', '#ffffff']],
  [/mandiri/i, ['#003d79', '#ffc82c']], [/^bni\b/i, ['#f15a22', '#ffffff']], [/^btn\b/i, ['#00529c', '#ffd200']], [/danamon/i, ['#f7a600', '#1c3f94']],
  [/cimb/i, ['#7a1b1b', '#ffffff']], [/rita/i, ['#c8102e', '#ffffff']], [/^moro/i, ['#e2231a', '#ffffff']], [/grapari|telkomsel/i, ['#e2231a', '#ffffff']],
  [/^rs|rumah sakit|klinik|puskesmas/i, ['#ffffff', '#1a7f4b']], [/masjid|mushol/i, ['#0f6b3a', '#ffffff']], [/^sd|^smp|^sma|^tk\b|sekolah|unsoed|universitas|fakultas/i, ['#ffffff', '#1c3f94']],
];
const PALETTE: [string, string][] = [['#ffffff', '#1a1a1a'], ['#c8102e', '#ffffff'], ['#1c56a0', '#ffffff'], ['#1f7a3e', '#ffffff'], ['#f2c400', '#1a1a1a'], ['#1a1a1a', '#f2c400']];

export const signColors = (name: string): [string, string] => BRANDS.find(([re]) => re.test(name))?.[1] ?? PALETTE[hash(name.length, name.charCodeAt(0) + name.charCodeAt(name.length - 1)) % PALETTE.length];

/** One canvas with every name in a CELL_W × CELL_H cell, left-to-right, top-to-bottom. */
function atlas(names: string[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL_W * COLS;
  c.height = CELL_H * ROWS;
  const g = c.getContext('2d')!;
  names.forEach((name, i) => {
    const x = (i % COLS) * CELL_W;
    const y = Math.floor(i / COLS) * CELL_H;
    const [bg, fg] = signColors(name);
    g.fillStyle = bg;
    g.fillRect(x, y, CELL_W, CELL_H);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, CELL_W - 3, CELL_H - 3);
    g.font = 'bold 40px system-ui, sans-serif';
    const w = g.measureText(name).width;
    if (w > CELL_W - 24) g.font = `bold ${Math.floor((40 * (CELL_W - 24)) / w)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(name, x + CELL_W / 2, y + CELL_H / 2 + 2);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.flipY = false;
  return t;
}

/**
 * The footprint edge the board hangs on: the longest ring edge lying on the road-facing side of the oriented box
 * (within 1 m of it), or null when no edge there is long enough for a board. A recessed L-shape keeps its board on the
 * wing that actually meets the street.
 */
export function frontEdge(ring: [number, number][], box: OrientedBox, f: Front): [[number, number], [number, number]] | null {
  const d = f.nx * (f.fx - box.cx) + f.nz * (f.fz - box.cz) - f.off; // the box side's distance from the centre along the outward normal
  let best: [[number, number], [number, number]] | null = null;
  let bestLen = 2.5;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const mx = (a[0] + b[0]) / 2 - box.cx;
    const mz = (a[1] + b[1]) / 2 - box.cz;
    if (Math.abs(f.nx * mx + f.nz * mz - d) > 1) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs((b[0] - a[0]) * f.nx + (b[1] - a[1]) * f.nz) > 0.3 * len) continue; // not running along the street
    if (len > bestLen) { bestLen = len; best = [a, b]; }
  }
  return best;
}

/** Name boards on every named building that fronts a road: one merged mesh, every board a quad into the text atlas. */
export function buildSigns(buildings: CityData['buildings'], ground: Ground = FLAT, roadEscape: (x: number, z: number) => [number, number] | null = () => null): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const names: string[] = [];
  for (const b of buildings) {
    if (!b.name || b.r === 'hip' || b.r === 'gable' || b.p.length < 3 || names.length >= COLS * ROWS) continue;
    const box = orientedBox(b.p);
    const f = frontSide(box, roadEscape);
    if (!f) continue;
    const edge = frontEdge(b.p, box, f);
    if (!edge) continue;
    const [a, c] = edge;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const w = Math.min(len - 0.4, Math.max(3, 0.55 * b.name.length + 1));
    const t0 = 0.5 - w / (2 * len);
    const t1 = 0.5 + w / (2 * len);
    const at = (t: number): [number, number] => [a[0] + (c[0] - a[0]) * t + f.nx * STANDOFF, a[1] + (c[1] - a[1]) * t + f.nz * STANDOFF];
    // seen from the street (facing −n) the viewer's right is (nz, −nx): put the text's left end on the viewer's left
    const [pl, pr] = (c[0] - a[0]) * f.nz - (c[1] - a[1]) * f.nx > 0 ? [at(t0), at(t1)] : [at(t1), at(t0)];
    const y0 = Math.min(...b.p.map(([x, z]) => ground.y(x, z))) + SIGN_Y;
    const i = names.push(b.name) - 1;
    const u0 = (i % COLS) / COLS;
    const v0 = Math.floor(i / COLS) / ROWS;
    const base = positions.length / 3;
    positions.push(pl[0], y0, pl[1], pr[0], y0, pr[1], pr[0], y0 + SIGN_H, pr[1], pl[0], y0 + SIGN_H, pl[1]);
    uvs.push(u0, v0 + 1 / ROWS, u0 + 1 / COLS, v0 + 1 / ROWS, u0 + 1 / COLS, v0, u0, v0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: atlas(names), roughness: 0.5, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  return mesh;
}
