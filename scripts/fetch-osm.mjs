#!/usr/bin/env node
// Fetches Purwokerto roads + buildings from Overpass and writes public/purwokerto.json. Needs Node >= 23.6 (type stripping).
import { writeFileSync } from 'node:fs';
import { bbox, buildCityData } from '../src/world/osm.ts';

const { south, west, north, east } = bbox();
const box = `${south},${west},${north},${east}`;
const query = `[out:json][timeout:180];(way["highway"](${box});way["building"](${box}););out body;>;out skel qt;`;
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'User-Agent': 'kurir-mbg-fetch-osm/1.0' }, // overpass-api.de returns 406 to Node's default UA
  body: 'data=' + encodeURIComponent(query),
});
if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}`);
const { elements } = await res.json();
const data = buildCityData(elements);
writeFileSync('public/purwokerto.json', JSON.stringify(data));
console.log(`nodes ${data.nodes.length}, ways ${data.ways.length}, buildings ${data.buildings.length}, pois ${data.pois.length}`);
