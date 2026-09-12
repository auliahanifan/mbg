import * as THREE from 'three';
import { createScene } from './render/scene';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
document.getElementById('loading')!.remove();

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: 0xffaa00 }),
);
cube.position.y = 1;
cube.castShadow = true;
ctx.scene.add(cube);
ctx.camera.lookAt(0, 1, 0);

ctx.renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01;
  ctx.renderer.render(ctx.scene, ctx.camera);
});
