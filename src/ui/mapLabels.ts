import type { CityData } from '../world/osm';

const ABBR: [RegExp, string][] = [
  [/^Jalan /, 'Jl. '], [/^Gang /, 'Gg. '],
  [/\bLetnan Jenderal\b/, 'Letjen'], [/\bMayor Jenderal\b/, 'Mayjen'], [/\bBrigadir Jenderal\b/, 'Brigjen'], [/\bPanglima Besar\b/, 'Pangsar'],
  [/\bJenderal\b/, 'Jend.'], [/\bProfesor\b/, 'Prof.'], [/\bDokter\b/, 'Dr.'], [/\bDoktor\b/, 'Dr.'], [/\bKolonel\b/, 'Kol.'], [/\bKomisaris\b/, 'Kom.'],
  [/\bKapten\b/, 'Kapt.'], [/\bKyai Haji\b/, 'KH.'],
];
export const shortName = (name: string): string => ABBR.reduce((s, [re, to]) => s.replace(re, to), name);

export interface LabelSpot { text: string; x: number; z: number; angle: number; len: number }

/** One label per distinct name inside the window (cx ± half, cz ± half). Length is accumulated across every way sharing that name; the position comes from the midpoint of the longest contributing way's in-window length, rotated along the road and kept upright. */
export function labelSpots(data: Pick<CityData, 'nodes' | 'ways'>, cx: number, cz: number, half: number): LabelSpot[] {
  const inside = (p: [number, number]) => Math.abs(p[0] - cx) <= half && Math.abs(p[1] - cz) <= half;
  const best = new Map<string, LabelSpot & { best: number }>();
  for (const w of data.ways) {
    if (!w.name) continue;
    // ponytail: only segments with both ends in the window count; clip segments if long sparse roads lose labels
    const segs: { a: [number, number]; b: [number, number]; len: number }[] = [];
    let total = 0;
    for (let i = 0; i + 1 < w.n.length; i++) {
      const a = data.nodes[w.n[i]];
      const b = data.nodes[w.n[i + 1]];
      if (!inside(a) || !inside(b)) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len === 0) continue;
      segs.push({ a, b, len });
      total += len;
    }
    if (!total) continue;
    const prev = best.get(w.name);
    if (prev && prev.best >= total) { prev.len += total; continue; }
    let d = total / 2;
    let s = segs[0];
    for (s of segs) {
      if (d <= s.len) break;
      d -= s.len;
    }
    const t = d / s.len;
    let angle = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle <= -Math.PI / 2) angle += Math.PI;
    best.set(w.name, { text: shortName(w.name), x: s.a[0] + (s.b[0] - s.a[0]) * t, z: s.a[1] + (s.b[1] - s.a[1]) * t, angle, len: (prev?.len ?? 0) + total, best: total });
  }
  return [...best.values()].map(({ best: _best, ...spot }) => spot);
}
