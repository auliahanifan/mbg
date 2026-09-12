#!/usr/bin/env node
// Samples SRTM 30 m elevation (m above sea level) on a DEM_STEP-metre grid over the map and writes public/dem.json. Needs Node >= 23.6.
import { writeFileSync } from 'node:fs';
import { HALF_SIZE, unproject } from '../src/world/osm.ts';

const DEM_STEP = 40; // keep in sync with src/world/terrain.ts
const n = Math.round((2 * HALF_SIZE) / DEM_STEP) + 1;
const pts = [];
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const { lat, lon } = unproject(-HALF_SIZE + i * DEM_STEP, -HALF_SIZE + j * DEM_STEP);
  pts.push(`${lat.toFixed(6)},${lon.toFixed(6)}`);
}
const h = [];
for (let k = 0; k < pts.length; k += 100) { // opentopodata: ≤ 100 locations per call, 1 call/s
  const res = await fetch(`https://api.opentopodata.org/v1/srtm30m?interpolation=bilinear&locations=${pts.slice(k, k + 100).join('|')}`);
  if (!res.ok) throw new Error(`opentopodata ${res.status}`);
  for (const r of (await res.json()).results) h.push(Math.round(r.elevation * 10) / 10);
  if (k % 2000 === 0) console.log(`${h.length}/${pts.length}`);
  await new Promise((r) => setTimeout(r, 1100));
}
writeFileSync('public/dem.json', JSON.stringify({ step: DEM_STEP, n, h }));
console.log(`min ${Math.min(...h)} max ${Math.max(...h)} mdpl`);
