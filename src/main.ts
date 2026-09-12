import * as THREE from 'three';
import { createScene } from './render/scene';
import { buildCity } from './world/cityBuilder';
import { MAP, tileCenter, collisionBoxes } from './world/cityMap';
import { stepCar, type CarState } from './vehicle/carPhysics';
import { resolveCar } from './vehicle/collision';
import { createPlayerCar } from './vehicle/playerCar';
import { readCarInput } from './input';
import { createChaseCamera } from './camera/chaseCamera';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const { pois } = await buildCity(ctx.scene);
const player = await createPlayerCar(ctx.scene);
const chase = createChaseCamera(ctx);
const boxes = collisionBoxes(MAP);
document.getElementById('loading')!.remove();
console.log('POIs', pois);

const start = tileCenter(2, 5);
let car: CarState = { x: start.x, z: start.z, heading: Math.PI / 2, speed: 0 }; // facing east along the top road

const clock = new THREE.Clock();
ctx.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const input = readCarInput();
  car = stepCar(car, input, dt);
  car = resolveCar(car, boxes, []);
  player.sync(car, input, dt);

  chase.update(car, dt);
  ctx.renderer.render(ctx.scene, ctx.camera);
});
