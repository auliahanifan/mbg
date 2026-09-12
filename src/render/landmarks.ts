import * as THREE from 'three';
import type { CityPoi } from '../world/osm';
import { HALF_SIZE } from '../world/osm';
import { FLAT, type Ground } from '../world/terrain';

const WHITE = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });

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
  s.scale.set(24, 4.5, 1);
  return s;
}

/** Lotus tower: slim stem, viewing deck, bulb. ~30 m tall so it reads as the city's landmark from anywhere. */
function menaraTeratai(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 26, 12), WHITE);
  stem.position.y = 13;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.6, 16), WHITE);
  deck.position.y = 25;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), WHITE);
  bulb.position.y = 28.5;
  g.add(stem, deck, bulb);
  g.traverse((o) => { o.castShadow = true; });
  g.position.set(x, y, z);
  return g;
}

/** Gunung Slamet silhouette beyond the north edge of the map; fog off so it stays a hazy blue shape. */
function gunungSlamet(y: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(900, 300, 9),
    new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 1, flatShading: true, fog: false }),
  );
  m.position.set(0, y + 150, -2600);
  return m;
}

export function buildLandmarks(pois: CityPoi[], ground: Ground = FLAT): THREE.Group {
  const g = new THREE.Group();
  for (const p of pois) {
    const label = makeLabel(p.name);
    const y = ground.y(p.x, p.z);
    label.position.set(p.x, y + (p.id === 'M' ? 36 : 14), p.z);
    g.add(label);
    if (p.id === 'M') g.add(menaraTeratai(p.x, y, p.z));
  }
  g.add(gunungSlamet(ground.y(0, -HALF_SIZE)));
  return g;
}
