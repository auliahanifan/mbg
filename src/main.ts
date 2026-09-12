import { createScene } from './render/scene';
import { loadModel } from './assets';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);

const road = await loadModel('road-straight');
road.scale.setScalar(8);
ctx.scene.add(road);
const truck = await loadModel('delivery');
truck.position.set(0, 0, 0);
ctx.scene.add(truck);
document.getElementById('loading')!.remove();

ctx.camera.position.set(6, 5, -10);
ctx.camera.lookAt(0, 1, 0);
ctx.renderer.setAnimationLoop(() => {
  truck.rotation.y += 0.01;
  ctx.renderer.render(ctx.scene, ctx.camera);
});
