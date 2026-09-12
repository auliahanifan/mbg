import * as THREE from 'three';
import { loadModel } from '../assets';
import { MAP, TILE, tileAt, tileCenter, roadSides, pickRoadModel, findPois, type Poi } from './cityMap';

const COMMERCIAL = 'abcdefghijklmn'.split('').map((c) => `building-${c}`);
const SKYSCRAPERS = 'abcde'.split('').map((c) => `building-skyscraper-${c}`);
const HOUSES = 'abcdef'.split('').map((c) => `building-type-${c}`);
const POI_BUILDING: Record<string, string> = { K: 'building-k', '1': 'building-d', '2': 'building-d', '3': 'building-d' };
const BUILDING_SCALE = 8; // Kenney buildings are ~0.9 units wide → 7 units, leaving pavement inside a 12-unit tile
const SKYSCRAPER_SCALE = 8;
const HOUSE_SCALE = 6;
const TREE_SCALE = 10;

const hash = (r: number, c: number) => ((r * 73856093) ^ (c * 19349663)) >>> 0;
const pick = (arr: string[], r: number, c: number) => arr[hash(r, c) % arr.length];

async function place(parent: THREE.Object3D, name: string, x: number, z: number, scale: number, rotY = 0) {
  const m = await loadModel(name);
  m.position.set(x, 0, z);
  m.scale.setScalar(scale);
  m.rotation.y = rotY;
  parent.add(m);
  return m;
}

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,20,40,0.75)';
  g.roundRect(8, 8, 1008, 176, 40);
  g.fill();
  g.font = 'bold 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(16, 3, 1);
  return s;
}

export async function buildCity(scene: THREE.Scene, map: string[] = MAP): Promise<{ pois: Poi[] }> {
  const city = new THREE.Group();
  scene.add(city);
  const pois = findPois(map);
  const stopKeys = new Set(pois.map((p) => `${p.stop.row},${p.stop.col}`));
  const jobs: Promise<unknown>[] = [];

  map.forEach((line, row) =>
    [...line].forEach((ch, col) => {
      const { x, z } = tileCenter(row, col);
      const rot = (hash(row, col) % 4) * (Math.PI / 2);
      switch (ch) {
        case 'R': {
          const sides = roadSides(map, row, col);
          let { name, rotationY } = pickRoadModel(sides);
          if (name === 'road-straight' && stopKeys.has(`${row},${col}`)) name = 'road-crossing';
          jobs.push(
            place(city, name, x, z, TILE, rotationY).then(async (tile) => {
              if (name === 'road-straight' && (row + col) % 3 === 0) {
                const lamp = await loadModel('light-curved'); // inherits tile scale; arm points to local -z = the road
                lamp.position.set(0.15, 0, 0.45);
                tile.add(lamp);
              }
            }),
          );
          break;
        }
        case '.':
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, pick(COMMERCIAL, row, col), x, z, BUILDING_SCALE, rot));
          break;
        case 'X':
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, pick(SKYSCRAPERS, row, col), x, z, SKYSCRAPER_SCALE, rot));
          break;
        case 'H':
          jobs.push(place(city, pick(HOUSES, row, col), x, z, HOUSE_SCALE, rot), place(city, 'tree-small', x + 4, z + 4, TREE_SCALE));
          break;
        case 'T':
          jobs.push(
            place(city, 'tree-large', x - 3, z - 3, TREE_SCALE),
            place(city, 'tree-large', x + 3, z + 3, TREE_SCALE),
            place(city, 'tree-small', x + 3, z - 3, TREE_SCALE),
          );
          break;
        default: {
          const poi = pois.find((p) => p.id === ch);
          if (!poi) return;
          const label = makeLabel(poi.name);
          label.position.set(x, 12, z);
          city.add(label);
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, POI_BUILDING[ch], x, z, BUILDING_SCALE, rot));
        }
      }
    }),
  );

  await Promise.all(jobs);
  return { pois };
}
