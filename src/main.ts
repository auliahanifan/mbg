import * as THREE from 'three';
import { createScene } from './render/scene';
import { buildCity } from './world/cityBuilder';
import { tileCenter } from './world/cityMap';
import { stepCar, type CarState } from './vehicle/carPhysics';
import { createPlayerCar } from './vehicle/playerCar';
import { readCarInput } from './input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const { pois } = await buildCity(ctx.scene);
const player = await createPlayerCar(ctx.scene);
document.getElementById('loading')!.remove();
console.log('POIs', pois);

const start = tileCenter(2, 5);
let car: CarState = { x: start.x, z: start.z, heading: Math.PI / 2, speed: 0 }; // facing east along the top road

const clock = new THREE.Clock();
ctx.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const input = readCarInput();
  car = stepCar(car, input, dt);
  player.sync(car, input, dt);

  ctx.camera.position.set(car.x - Math.sin(car.heading) * 10, 5, car.z - Math.cos(car.heading) * 10);
  ctx.camera.lookAt(car.x, 1.5, car.z);
  ctx.sun.position.set(car.x, 0, car.z).add(new THREE.Vector3().copy(ctx.sunDir).multiplyScalar(80));
  ctx.sun.target.position.set(car.x, 0, car.z);
  ctx.renderer.render(ctx.scene, ctx.camera);
});
