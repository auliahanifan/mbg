import * as THREE from 'three';
import { createScene } from './render/scene';
import { buildCity } from './world/cityBuilder';
import { tileCenter } from './world/cityMap';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const { pois } = await buildCity(ctx.scene);
document.getElementById('loading')!.remove();
console.log('POIs', pois);

// temporary orbit-ish overview until the player car exists (Task 5)
const center = tileCenter(8, 8);
let t = 0;
ctx.renderer.setAnimationLoop(() => {
  t += 0.003;
  ctx.camera.position.set(center.x + Math.sin(t) * 90, 45, center.z + Math.cos(t) * 90);
  ctx.camera.lookAt(center.x, 0, center.z);
  ctx.sun.position.set(center.x, 0, center.z).add(new THREE.Vector3().copy(ctx.sunDir).multiplyScalar(80));
  ctx.sun.target.position.set(center.x, 0, center.z);
  ctx.renderer.render(ctx.scene, ctx.camera);
});
