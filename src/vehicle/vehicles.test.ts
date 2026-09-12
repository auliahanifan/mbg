import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildVehicle, pickVehicle, vehicleSpec } from './vehicles';

const NAMES = ['avanza', 'xpander', 'brio', 'agya', 'innova', 'rush', 'hrv', 'angkot', 'pickup', 'canter', 'mbg', 'beat', 'nmax', 'supra'];

describe('vehicles', () => {
  it('keeps every spec at its real-world size and in the right order (profile front-to-back)', () => {
    for (const n of NAMES) {
      const s = vehicleSpec(n);
      expect(s.L, n).toBeGreaterThan(1.5);
      expect(s.L, n).toBeLessThan(7);
      expect(s.W, n).toBeGreaterThan(0.6);
      expect(s.H, n).toBeLessThan(2.6);
      expect(s.wb, n).toBeLessThan(s.L);
      expect(s.wheelR * 2, n).toBeLessThan(s.H);
      if ('bike' in s) continue;
      expect(s.nose, n).toBeGreaterThan(s.roofF);  // windscreen leans back
      expect(s.roofF, n).toBeGreaterThan(s.roofR);
      expect(s.roofR, n).toBeGreaterThan(s.tail);  // backlight leans forward
      expect(s.belt, n).toBeLessThan(s.H);
    }
  });

  it('builds a mesh with named spinning wheels at their own radius', () => {
    const bikeAndCar = ['avanza', 'beat'];
    for (const n of bikeAndCar) {
      const g = buildVehicle(n, () => 0.5);
      const wheels = g.children.filter((o) => o.name.startsWith('wheel'));
      expect(wheels.length, n).toBe(n === 'beat' ? 2 : 4);
      for (const w of wheels) expect(w.position.y).toBeCloseTo(vehicleSpec(n).wheelR);
      expect(g.children.length, n).toBeGreaterThan(wheels.length); // body meshes too
    }
  });

  it('builds each car at its spec size, wheels on the ground, length along +z', () => {
    for (const n of NAMES) {
      const s = vehicleSpec(n);
      if ('bike' in s) continue;
      const b = new THREE.Box3().setFromObject(buildVehicle(n, () => 0.5));
      const d = b.getSize(new THREE.Vector3());
      expect(b.min.y, n).toBeCloseTo(0, 1);        // sits on the road, not through it
      expect(d.z, n).toBeCloseTo(s.L, 0);          // bumpers add a few cm
      expect(d.x, n).toBeCloseTo(s.W + 0.18, 1);   // mirrors stick out
      expect(d.y, n).toBeGreaterThanOrEqual(s.H - 0.01);
    }
  });

  it('draws mostly motorbikes, as on a real street here', () => {
    let bikes = 0;
    for (let i = 0; i < 1000; i++) if ('bike' in vehicleSpec(pickVehicle(() => i / 1000))) bikes++;
    expect(bikes).toBeGreaterThan(400);
  });
});
