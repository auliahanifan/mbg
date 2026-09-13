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

const GLASS = new THREE.MeshStandardMaterial({ color: 0x5a7d99, roughness: 0.25, metalness: 0.4 });

/**
 * Menara Pandang Teratai (117 m): base pavilion, tapering white shaft to 92 m, the 5-storey glass "bud" at 92–110 m
 * ringed by 8 lotus petals opening outward, the glass-floor deck at 110 m and a spire to 117 m.
 */
function menaraTeratai(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 6, 16), WHITE);
  base.position.y = 3;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 86, 12), WHITE);
  shaft.position.y = 6 + 43;
  const bud = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 5.5, 18, 20), GLASS);
  bud.position.y = 92 + 9;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.8, 20), WHITE);
  deck.position.y = 110;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 7, 6), WHITE);
  spire.position.y = 110 + 3.5;
  g.add(base, shaft, bud, deck, spire);
  const petal = new THREE.SphereGeometry(1, 10, 8).scale(2.6, 10, 0.9); // a flat elongated petal
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(petal, WHITE);
    m.position.set(Math.cos(a) * 8.5, 100, Math.sin(a) * 8.5);
    m.rotation.set(0, -a, 0);
    m.rotateZ(-0.35); // lean outward like an opening flower
    g.add(m);
  }
  g.traverse((o) => { o.castShadow = true; });
  g.position.set(x, y, z);
  return g;
}

/** GOR Satria: ~100 × 70 m indoor arena under a low barrel-vault roof (OSM has no footprint for it). */
function gorSatria(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(100, 10, 70), new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.8 }));
  walls.position.y = 5;
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(36, 36, 102, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.4, 1),
    new THREE.MeshStandardMaterial({ color: 0x4f8a6a, roughness: 0.6, side: THREE.DoubleSide }),
  );
  vault.position.y = 10;
  g.add(walls, vault);
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
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
    label.position.set(p.x, y + (p.id === 'M' ? 124 : p.id === 'G' ? 30 : 14), p.z);
    g.add(label);
    if (p.id === 'M') g.add(menaraTeratai(p.x, y, p.z));
    if (p.id === 'G') g.add(gorSatria(p.x, y, p.z));
  }
  g.add(gunungSlamet(ground.y(0, -HALF_SIZE)));
  return g;
}
