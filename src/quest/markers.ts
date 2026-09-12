import * as THREE from 'three';
import type { Poi } from '../world/cityMap';
import type { CarState } from '../vehicle/carPhysics';
import { STOP_RADIUS } from './quest';

export function createMarkers(scene: THREE.Scene) {
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(STOP_RADIUS * 0.7, STOP_RADIUS * 0.7, 1.2, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.position.y = 0.6;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  beam.position.y = 30;
  const target = new THREE.Group();
  target.add(ring, beam);
  scene.add(target);

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.4, 4),
    new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xffa500, emissiveIntensity: 0.6 }),
  );
  arrow.rotation.x = Math.PI / 2; // cone points along +z (heading 0)
  const arrowPivot = new THREE.Group();
  arrowPivot.add(arrow);
  scene.add(arrowPivot);

  return {
    update(poi: Poi | null, car: CarState, t: number) {
      target.visible = arrowPivot.visible = !!poi;
      if (!poi) return;
      target.position.set(poi.stop.x, 0, poi.stop.z);
      ring.rotation.y = t;
      arrowPivot.position.set(car.x, 4 + Math.sin(t * 4) * 0.2, car.z);
      arrowPivot.rotation.y = Math.atan2(poi.stop.x - car.x, poi.stop.z - car.z);
    },
  };
}
