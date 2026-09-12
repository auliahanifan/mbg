import * as THREE from 'three';
import { loadModel } from '../assets';
import { MAP, TILE, LANDMARKS, tileCenter, roadSides, pickRoadModel, findPois, type Poi } from './cityMap';

const COMMERCIAL = 'abcdefghijklmn'.split('').map((c) => `building-${c}`);
const HOUSES = 'abcdef'.split('').map((c) => `building-type-${c}`);
const POI_BUILDING: Record<string, string> = { K: 'building-k', '1': 'building-d', '2': 'building-d', '3': 'building-d' };
const BUILDING_SCALE = 8; // Kenney buildings are ~0.9 units wide → 7 units, leaving pavement inside a 12-unit tile
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
  const w = g.measureText(text).width;
  if (w > 940) g.font = `bold ${Math.floor((96 * 940) / w)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  s.scale.set(16, 3, 1);
  return s;
}

const WHITE = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });

/** Lotus tower: slim stem, viewing deck, bulb. ~30 units tall so it reads as the city's landmark from anywhere. */
function menaraTeratai(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 26, 12), WHITE);
  stem.position.y = 13;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.6, 16), WHITE);
  deck.position.y = 25;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), WHITE);
  bulb.position.y = 28.5;
  g.add(stem, deck, bulb);
  g.traverse((o) => { o.castShadow = true; });
  g.position.set(x, 0, z);
  return g;
}

/** Gunung Slamet silhouette on the northern horizon; fog off so it stays a hazy blue shape instead of vanishing. */
function gunungSlamet(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(500, 160, 9),
    new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 1, flatShading: true, fog: false }),
  );
  m.position.set(8 * TILE, 80, -700);
  return m;
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
        case 'X':
          jobs.push(place(city, 'tile-low', x, z, TILE), place(city, pick(COMMERCIAL, row, col), x, z, BUILDING_SCALE, rot));
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
          const lm = LANDMARKS[ch];
          const poi = pois.find((p) => p.id === ch);
          const name = lm?.name ?? poi?.name;
          if (!name) return;
          const label = makeLabel(name);
          label.position.set(x, ch === 'M' ? 36 : 12, z);
          city.add(label);
          if (ch === 'A') return; // open lawn in the middle of the square
          if (ch === 'M') city.add(menaraTeratai(x, z));
          const model = lm?.model ?? POI_BUILDING[ch];
          jobs.push(place(city, 'tile-low', x, z, TILE));
          if (model) jobs.push(place(city, model, x, z, BUILDING_SCALE, rot));
        }
      }
    }),
  );

  city.add(gunungSlamet());

  await Promise.all(jobs);
  return { pois };
}
