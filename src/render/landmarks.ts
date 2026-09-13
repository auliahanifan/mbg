import * as THREE from 'three';
import type { CityData, CityPoi } from '../world/osm';
import { HALF_SIZE } from '../world/osm';
import { FLAT, type Ground } from '../world/terrain';
import { offsetRing } from './buildings';
import { disc, lift, merge, ribbon } from './roads';

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
 * Menara Pandang Teratai: 117 m to the top of the mahkota teratai, five levels — the podium carrying the meeting rooms
 * and the let commercial floors, then the observation floors whose glass-floored bridge sits at 70–80 m, and the lotus
 * crown of 8 petals opening above them (id.wikipedia.org/wiki/Menara_Pandang_Teratai_Purwokerto).
 */
function menaraTeratai(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 14, 16), WHITE); // the podium: ground floor + levels 1–2
  base.position.y = 7;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.0, 56, 12), WHITE);
  shaft.position.y = 14 + 28;
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 6.0, 14, 20), GLASS); // levels 3–4: the observation floors
  pod.position.y = 70 + 7;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(9.0, 9.0, 0.8, 20), WHITE); // the glass-floored bridge ringing them
  deck.position.y = 75;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 22, 10), WHITE);
  neck.position.y = 84 + 11;
  g.add(base, shaft, pod, deck, neck);
  const petal = new THREE.SphereGeometry(1, 10, 8).scale(3.0, 11, 1.0); // a flat elongated petal
  for (let i = 0; i < 8; i++) { // mahkota teratai, apex at 117 m
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(petal, WHITE);
    m.position.set(Math.cos(a) * 5.5, 106, Math.sin(a) * 5.5);
    m.rotation.set(0, -a, 0);
    m.rotateZ(-0.35); // lean outward like an opening flower
    g.add(m);
  }
  g.traverse((o) => { o.castShadow = true; });
  g.position.set(x, y, z);
  return g;
}

/**
 * Stadion Satria on its real OSM `leisure=stadium` outline (149 × 205 m): seating raked from the touchline 16 m inside
 * the ring up to an 11 m back wall on the ring itself. No invented box — the plan is whatever the map says it is.
 */
function stadium(ring: [number, number][], ground: Ground): THREE.Group {
  const g = new THREE.Group();
  const positions: number[] = [];
  const indices: number[] = [];
  const inner = offsetRing(ring, -16); // the OSM ring is the stadium's outer edge, so the seating rakes inward to the touchline
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const [ax, az] = inner[i];
    const [bx, bz] = inner[j];
    const [cx, cz] = ring[j];
    const [dx, dz] = ring[i];
    const base = positions.length / 3;
    // the raked seating plane, from pitch level at the touchline up to 11 m at the back
    positions.push(ax, ground.y(ax, az) + 0.4, az, bx, ground.y(bx, bz) + 0.4, bz, cx, ground.y(cx, cz) + 11, cz, dx, ground.y(dx, dz) + 11, dz);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    const w = positions.length / 3; // and the back wall dropping to the ground behind it
    positions.push(dx, ground.y(dx, dz) + 11, dz, cx, ground.y(cx, cz) + 11, cz, cx, ground.y(cx, cz), cz, dx, ground.y(dx, dz), dz);
    indices.push(w, w + 1, w + 2, w, w + 2, w + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd8d3c6, roughness: 0.9, side: THREE.DoubleSide }));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

const PAVING = new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const BERINGIN = { trunk: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), crown: new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 0.9, flatShading: true }) };

/** "ALUN-ALUN PURWOKERTO" in white block letters on a low plinth, facing +z. */
function letters(text: string, w: number): THREE.Group {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.font = 'bold 190px system-ui, sans-serif';
  const tw = g.measureText(text).width;
  if (tw > 2000) g.font = `bold ${Math.floor((190 * 2000) / tw)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f4f2ec';
  g.fillText(text, 1024, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x8c8880, roughness: 1 }));
  plinth.position.y = 0.3;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
  sign.position.set(0, 0.6 + w / 16, 0);
  grp.add(plinth, sign);
  grp.traverse((o) => { o.castShadow = true; });
  return grp;
}

/**
 * Alun-alun Purwokerto after its 2022 makeover: a paved circular plaza in the middle of the lawn with four walkways to
 * the streets, the big old beringin trees at the corners and the ALUN-ALUN PURWOKERTO letters on the south side facing
 * Jl. Jenderal Sudirman. `long`/`short` are the lawn's extents (metres), the walkways run along its axes.
 */
function alunAlun(x: number, z: number, ground: Ground, long = 124, short = 110): THREE.Group {
  const g = new THREE.Group();
  const y = lift(ground, 0.05);
  const L = long / 2 - 8;
  const S = short / 2 - 8;
  const paths = [
    disc(x, z, 22, y, 32),
    ribbon([[x - S, z], [x + S, z]], 4, y),
    ribbon([[x, z - L], [x, z + L]], 4, y),
    ...[[-S, -L], [S, -L], [-S, L], [S, L]].map(([dx, dz]): ReturnType<typeof ribbon> => ribbon([[x, z], [x + dx, z + dz]], 3, y)), // diagonals to the corners
  ];
  const plaza = new THREE.Mesh(merge(paths), PAVING);
  plaza.receiveShadow = true;
  g.add(plaza);
  const gazebo = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 1 }));
  gazebo.position.set(x, ground.y(x, z) + 0.5, z);
  g.add(gazebo);
  for (const [dx, dz] of [[-S, -L], [S, -L], [-S, L], [S, L], [-S, 0], [S, 0]]) { // beringin: 14 m tall, 9 m crown
    const tx = x + dx * 0.9;
    const tz = z + dz * 0.9;
    const ty = ground.y(tx, tz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 7, 8), BERINGIN.trunk);
    trunk.position.set(tx, ty + 3.5, tz);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), BERINGIN.crown);
    crown.position.set(tx, ty + 10, tz);
    crown.scale.set(1, 0.7, 1);
    trunk.castShadow = crown.castShadow = true;
    g.add(trunk, crown);
  }
  const sign = letters('ALUN-ALUN PURWOKERTO', 20);
  sign.position.set(x, ground.y(x, z + L - 2), z + L - 2);
  sign.rotation.y = -0.23; // along the lawn's south edge, which runs with Jl. Jenderal Sudirman
  g.add(sign);
  return g;
}

/**
 * Gunung Slamet as it is actually seen from the city. OSM puts the summit at −7.2414693, 109.2149699, ele 3428 — that
 * is 19.6 km away on a bearing of 353°, and 3348 m above the town. The far plane is 5000 m, so the whole mountain is
 * drawn at 4200 m along that true bearing and scaled by the same 4200/19627, which leaves its angular size and
 * direction exactly right; only the cone's 3:1 base-to-height silhouette is a drawing choice. Fog off: a hazy shape.
 */
const SLAMET = { x: -502, z: -4170, h: 716, r: 2149 };
function gunungSlamet(y: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(SLAMET.r, SLAMET.h, 9),
    new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 1, flatShading: true, fog: false }),
  );
  m.position.set(SLAMET.x, y + SLAMET.h / 2, SLAMET.z);
  return m;
}

export function buildLandmarks(pois: CityPoi[], ground: Ground = FLAT, areas: NonNullable<CityData['areas']> = []): THREE.Group {
  const g = new THREE.Group();
  for (const p of pois) {
    const label = makeLabel(p.name);
    const y = ground.y(p.x, p.z);
    label.position.set(p.x, y + (p.id === 'M' ? 124 : p.id === 'G' ? 30 : 14), p.z);
    g.add(label);
    if (p.id === 'M') g.add(menaraTeratai(p.x, y, p.z));
    if (p.id === 'G') for (const a of areas.filter((a) => a.k === 'stadium')) g.add(stadium(a.p, ground)); // Stadion Satria on its own OSM outline
    if (p.id === 'A') g.add(alunAlun(-672, 745, ground, 112)); // the lawn polygon (x −726…−617, z 688…~800); the POI pin sits a little off centre
  }
  g.add(gunungSlamet(ground.y(0, -HALF_SIZE)));
  return g;
}
