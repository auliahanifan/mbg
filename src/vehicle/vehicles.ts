import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural stand-ins for the vehicles actually on a Purwokerto street in 2025 — every
// dimension below is the real model's spec sheet in metres (L/W/H/wheelbase).

export interface CarSpec {
  L: number; W: number; H: number; wb: number;
  belt: number;  // beltline: bottom of the side glass, top of the rear body
  hood: number;  // bonnet height at the front
  nose: number;  // z of the windscreen base
  tail: number;  // z of the backlight base
  roofF: number; // z of the roof front edge
  roofR: number; // z of the roof rear edge
  ride: number;  // underbody height
  wheelR: number;
  box?: { z0: number; z1: number; y: number; w: number }; // cargo body (box truck)
  bed?: [number, number];                                 // open pickup bed floor
  colors?: string[];
  radius: number; // collision circle
  speedK: number; // cruise multiplier
}

export interface BikeSpec {
  bike: true;
  L: number; W: number; H: number; wb: number; wheelR: number;
  radius: number; speedK: number;
}

const CARS: Record<string, CarSpec> = {
  // Toyota Avanza 2025 — the LMPV that is half of Java's traffic
  avanza:  { L: 4.40, W: 1.73, H: 1.70, wb: 2.75, belt: 1.12, hood: 1.02, nose: 0.80, tail: -1.95, roofF: 0.30, roofR: -1.70, ride: 0.38, wheelR: 0.32, radius: 1.15, speedK: 1 },
  // Mitsubishi Xpander
  xpander: { L: 4.60, W: 1.75, H: 1.75, wb: 2.78, belt: 1.15, hood: 1.05, nose: 0.85, tail: -2.00, roofF: 0.35, roofR: -1.75, ride: 0.40, wheelR: 0.33, radius: 1.20, speedK: 1 },
  // Honda Brio
  brio:    { L: 3.80, W: 1.68, H: 1.49, wb: 2.41, belt: 0.98, hood: 0.92, nose: 0.55, tail: -1.55, roofF: 0.15, roofR: -1.30, ride: 0.32, wheelR: 0.29, radius: 1.00, speedK: 1.05 },
  // Toyota Agya / Daihatsu Ayla
  agya:    { L: 3.76, W: 1.67, H: 1.51, wb: 2.43, belt: 1.00, hood: 0.94, nose: 0.52, tail: -1.55, roofF: 0.12, roofR: -1.32, ride: 0.32, wheelR: 0.29, radius: 1.00, speedK: 1.05 },
  // Toyota Kijang Innova Zenix
  innova:  { L: 4.76, W: 1.85, H: 1.80, wb: 2.85, belt: 1.20, hood: 1.10, nose: 0.90, tail: -2.10, roofF: 0.40, roofR: -1.85, ride: 0.42, wheelR: 0.34, radius: 1.25, speedK: 1 },
  // Toyota Rush / Daihatsu Terios
  rush:    { L: 4.44, W: 1.70, H: 1.71, wb: 2.69, belt: 1.15, hood: 1.08, nose: 0.75, tail: -1.90, roofF: 0.30, roofR: -1.70, ride: 0.44, wheelR: 0.34, radius: 1.15, speedK: 1 },
  // Honda HR-V
  hrv:     { L: 4.33, W: 1.79, H: 1.59, wb: 2.61, belt: 1.08, hood: 1.00, nose: 0.70, tail: -1.75, roofF: 0.25, roofR: -1.40, ride: 0.38, wheelR: 0.33, radius: 1.15, speedK: 1.05 },
  // Suzuki Carry angkot — cab-over minibus, Purwokerto's yellow/orange public transport
  angkot:  { L: 4.20, W: 1.68, H: 1.92, wb: 2.63, belt: 1.05, hood: 0.95, nose: 1.30, tail: -2.00, roofF: 1.05, roofR: -1.90, ride: 0.40, wheelR: 0.31, radius: 1.15, speedK: 0.85,
             colors: ['#e39a1b', '#efc033', '#2f6fb0', '#d6552c'] },
  // Daihatsu Gran Max pick-up
  pickup:  { L: 4.20, W: 1.67, H: 1.83, wb: 2.52, belt: 1.05, hood: 0.95, nose: 1.25, tail: -0.45, roofF: 1.00, roofR: -0.25, ride: 0.40, wheelR: 0.31, radius: 1.15, speedK: 0.9,
             bed: [-2.05, -0.55] },
  // Mitsubishi Fuso Canter — the light truck that does everything
  canter:  { L: 5.90, W: 1.90, H: 2.35, wb: 3.35, belt: 1.55, hood: 1.45, nose: 1.95, tail: 0.60, roofF: 1.70, roofR: 0.80, ride: 0.60, wheelR: 0.44, radius: 1.55, speedK: 0.75,
             box: { z0: -2.85, z1: 0.45, y: 2.45, w: 1.95 }, colors: ['#d8d9db', '#2f6fb0', '#c94a2c', '#e5b93c'] },
  // Daihatsu Gran Max box — the player's MBG delivery van
  mbg:     { L: 4.90, W: 1.70, H: 2.10, wb: 2.52, belt: 1.05, hood: 0.95, nose: 1.45, tail: -0.30, roofF: 1.20, roofR: -0.10, ride: 0.40, wheelR: 0.31, radius: 1.25, speedK: 0.9,
             box: { z0: -2.42, z1: -0.42, y: 2.10, w: 1.78 }, colors: ['#f0f1f2'] },
};

const BIKES: Record<string, BikeSpec> = {
  beat:  { bike: true, L: 1.88, W: 0.67, H: 1.07, wb: 1.26, wheelR: 0.24, radius: 0.55, speedK: 1.25 }, // Honda BeAT
  nmax:  { bike: true, L: 1.94, W: 0.74, H: 1.16, wb: 1.34, wheelR: 0.27, radius: 0.6, speedK: 1.3 },   // Yamaha NMAX
  supra: { bike: true, L: 1.92, W: 0.71, H: 1.10, wb: 1.24, wheelR: 0.26, radius: 0.55, speedK: 1.2 },  // Honda Supra X bebek
};

/** Share of the road, roughly as counted on a Purwokerto street: motorbikes half of it. */
const MIX: [string, number][] = [
  ['beat', 24], ['supra', 14], ['nmax', 10],
  ['avanza', 9], ['brio', 8], ['xpander', 5], ['agya', 5], ['innova', 4], ['rush', 4], ['hrv', 4],
  ['angkot', 5], ['pickup', 5], ['canter', 3],
];
const MIX_TOTAL = MIX.reduce((s, [, w]) => s + w, 0);

export const vehicleSpec = (name: string): CarSpec | BikeSpec => CARS[name] ?? BIKES[name] ?? CARS.avanza;

// Kerb mass in kg from the bounding box. 95 kg/m³ lands within ~10% of the real spec sheet
// across the whole fleet (BeAT 128, Avanza 1226, Innova 1506, Canter 2503), so no table needed.
export const vehicleMass = (name: string): number => {
  const s = vehicleSpec(name);
  return 95 * s.L * s.W * s.H;
};

export function pickVehicle(rng: () => number): string {
  let r = rng() * MIX_TOTAL;
  for (const [name, w] of MIX) if ((r -= w) < 0) return name;
  return MIX[0][0];
}

// Indonesian colour mix: white dominates, then silver/grey/black, a little red and blue.
export const BODY = ['#eceef0', '#eceef0', '#eceef0', '#e6e8e9', '#b9bec4', '#b9bec4', '#8d9297', '#5b6065', '#2b2e31', '#1a1b1d', '#9c2b24', '#26406e', '#3f5c4a', '#c2ae92'];
const CLOTH = ['#c8382f', '#25507f', '#2f2f33', '#d8d9db', '#3f7a4d', '#e0a02a'];
const HELMET = ['#1a1b1d', '#d8d9db', '#c8382f', '#25507f', '#e0a02a'];

const PAINT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 });
const MATTE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.9 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: 0x0c1116, roughness: 0.05, metalness: 0.25, envMapIntensity: 1.8 }); // dark film, like every car here
const TAIL = new THREE.MeshStandardMaterial({ color: 0x8e1410, emissive: 0x6b0f0c, emissiveIntensity: 0.5, roughness: 0.25 });
const WHEEL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.4 });

/** White-on-black-text Indonesian plates (2022 style); "R" is the Banyumas code. */
const PLATES: THREE.Material[] = typeof document === 'undefined' ? [] : Array.from({ length: 6 }, (_, i) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 88;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2ef'; g.fillRect(0, 0, 256, 88);
  g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 76);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.font = 'bold 52px system-ui, sans-serif';
  g.fillText(`R ${1234 + i * 1111} ${'AB CD EF GH JK LM'.split(' ')[i]}`, 128, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
});

const pick = <T>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

function tinted(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = flat(geo);
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Extrudes a side-view profile (x = length → +z, y = height) across the vehicle width, bevelled. */
function extrude(pts: [number, number][], width: number, bevel = 0.04): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 2 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - bevel, 0, 0);
  return g;
}

function wheelMesh(r: number, width: number, name: string, x: number, z: number): THREE.Mesh {
  const tyre = new THREE.CylinderGeometry(r, r, width, 16).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.012, 10).rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(mergeGeometries([tinted(tyre, '#151517'), tinted(rim, '#9ba1a7')]), WHEEL);
  m.name = name;
  m.position.set(x, r, z);
  m.castShadow = true;
  return m;
}

function assemble(group: THREE.Group, buckets: [THREE.BufferGeometry[], THREE.Material][]): void {
  for (const [geos, mat] of buckets) {
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos.map(flat)), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
}

function buildCar(s: CarSpec, rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const half = s.L / 2;
  const roofY = s.H - 0.09;
  const colour = pick(s.colors ?? BODY, rng);
  const paint: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const tail: THREE.BufferGeometry[] = [];

  paint.push(tinted(extrude([
    [-half + 0.1, s.ride], [half - 0.1, s.ride], [half, s.ride + 0.28], [half, s.hood - 0.1],
    [half - 0.3, s.hood], [s.nose, s.belt], [s.tail, s.belt], [-half, s.belt - 0.02], [-half, s.ride + 0.28],
  ], s.W), colour));
  paint.push(tinted(box(s.W - 0.05, 0.09, s.roofF - s.roofR, 0, roofY + 0.045, (s.roofF + s.roofR) / 2), colour)); // roof panel
  glass.push(extrude([[s.tail, s.belt - 0.04], [s.nose, s.belt - 0.04], [s.roofF, roofY], [s.roofR, roofY]], s.W - 0.09, 0.01)); // greenhouse: windscreen rake → side glass → backlight

  for (const side of [1, -1]) {
    paint.push(tinted(box(0.1, 0.08, 0.19, side * (s.W / 2 + 0.04), s.belt + 0.06, s.nose - 0.12), colour));           // mirrors
    glass.push(box(0.34, 0.15, 0.1, side * (s.W / 2 - 0.3), s.hood - 0.16, half - 0.02));                              // headlights
    tail.push(box(0.3, 0.18, 0.09, side * (s.W / 2 - 0.26), s.belt - 0.24, -half + 0.02));                             // tail lamps
  }
  paint.push(tinted(box(s.W * 0.55, 0.16, 0.08, 0, s.hood - 0.2, half - 0.01), '#232629'));                            // grille
  paint.push(tinted(box(s.W - 0.03, 0.26, 0.1, 0, s.ride + 0.18, half - 0.03), '#2a2d30'));                            // front bumper valance
  paint.push(tinted(box(s.W - 0.03, 0.26, 0.1, 0, s.ride + 0.18, -half + 0.03), '#2a2d30'));                           // rear bumper valance

  if (s.bed) {
    const [z0, z1] = s.bed;
    paint.push(tinted(box(s.W - 0.16, 0.06, z1 - z0, 0, s.belt - 0.24, (z0 + z1) / 2), '#3a3d40')); // open bed floor
  }
  if (s.box) {
    const b = s.box;
    paint.push(tinted(box(b.w, b.y - s.belt + 0.35, b.z1 - b.z0, 0, (b.y + s.belt - 0.35) / 2, (b.z0 + b.z1) / 2), pick(s.colors ?? BODY, rng)));
  }

  assemble(group, [[paint, PAINT], [glass, GLASS], [tail, TAIL]]);
  if (PLATES.length) {
    const plates = mergeGeometries([
      flat(new THREE.PlaneGeometry(0.38, 0.13).translate(0, s.ride + 0.34, half + 0.005)),
      flat(new THREE.PlaneGeometry(0.38, 0.13).rotateY(Math.PI).translate(0, s.ride + 0.34, -half - 0.005)),
    ]);
    group.add(new THREE.Mesh(plates, pick(PLATES, rng)));
  }
  const names = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];
  const x = s.W / 2 - 0.1;
  const tyreW = Math.min(0.24, s.W * 0.14);
  [[x, s.wb / 2], [-x, s.wb / 2], [x, -s.wb / 2], [-x, -s.wb / 2]].forEach(([wx, wz], i) => group.add(wheelMesh(s.wheelR, tyreW, names[i], wx, wz)));
  return group;
}

function buildBike(s: BikeSpec, rng: () => number, parked = false): THREE.Group {
  const group = new THREE.Group();
  const f = s.wb / 2;
  const colour = parked ? '#ffffff' : pick(BODY, rng); // parked bikes are instanced and take their colour per instance
  const paint: THREE.BufferGeometry[] = [];
  const matte: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const tail: THREE.BufferGeometry[] = [];

  paint.push(tinted(box(s.W - 0.12, 0.5, 0.16, 0, 0.62, f - 0.22), colour));            // leg shield
  paint.push(tinted(box(0.3, 0.28, 0.7, 0, 0.6, -0.3), colour));                        // rear body
  matte.push(tinted(box(0.34, 0.1, 0.52, 0, 0.36, 0.02), '#2a2c2e'));                   // floorboard
  matte.push(tinted(box(0.32, 0.12, 0.55, 0, 0.78, -0.22), '#1c1d1f'));                 // seat
  matte.push(tinted(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 6).rotateZ(Math.PI / 2).translate(0, 1.0, f - 0.16), '#3c4045')); // bar
  matte.push(tinted(box(0.06, 0.62, 0.06, 0, 0.68, f - 0.02), '#4a4e53'));              // fork
  matte.push(tinted(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6).rotateX(Math.PI / 2).translate(0.14, 0.34, -0.42), '#8f9499')); // exhaust
  glass.push(box(0.2, 0.14, 0.1, 0, 0.88, f - 0.2));                                    // headlight
  tail.push(box(0.14, 0.1, 0.07, 0, 0.8, -0.62));

  if (!parked) { // rider: leaning torso, helmet, legs on the board, arms to the bar
    const shirt = pick(CLOTH, rng);
    matte.push(tinted(box(0.36, 0.56, 0.26, 0, 1.12, -0.14).rotateX(-0.12), shirt));
    matte.push(tinted(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.52, -0.06), pick(HELMET, rng)));
    for (const side of [1, -1]) {
      matte.push(tinted(box(0.14, 0.14, 0.5, side * 0.12, 0.55, 0.1), '#33373b'));        // legs
      matte.push(tinted(box(0.09, 0.09, 0.5, side * 0.19, 1.06, 0.16).rotateX(0.35), shirt)); // arms
    }
  }

  assemble(group, [[paint, PAINT], [matte, MATTE], [glass, GLASS], [tail, TAIL]]);
  group.add(wheelMesh(s.wheelR, 0.1, 'wheel-front', 0, f), wheelMesh(s.wheelR, 0.12, 'wheel-back', 0, -f));
  return group;
}

/** A fresh vehicle mesh; forward is +z, origin on the road surface. `parked` (bikes): no rider, white paint for per-instance colour. */
export function buildVehicle(name: string, rng: () => number = Math.random, parked = false): THREE.Group {
  const s = vehicleSpec(name);
  return 'bike' in s ? buildBike(s, rng, parked) : buildCar(s, rng);
}
