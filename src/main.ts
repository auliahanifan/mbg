import * as THREE from 'three';
import { createScene } from './render/scene';
import { createPost } from './render/post';
import { buildCity } from './world/cityBuilder';
import { MAP, tileCenter, collisionBoxes } from './world/cityMap';
import { stepCar, type CarState } from './vehicle/carPhysics';
import { resolveCar } from './vehicle/collision';
import { createPlayerCar } from './vehicle/playerCar';
import { readCarInput, consumeKey } from './input';
import { createChaseCamera } from './camera/chaseCamera';
import { createQuest, stepQuest, questTarget, type Quest } from './quest/quest';
import { createHud } from './ui/hud';
import { createMarkers } from './quest/markers';
import { spawnTraffic, stepTraffic, trafficCircles } from './traffic/traffic';
import { createTrafficRenderer } from './traffic/trafficRenderer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const post = createPost(ctx);
const { pois } = await buildCity(ctx.scene);
const player = await createPlayerCar(ctx.scene);
const chase = createChaseCamera(ctx);
const boxes = collisionBoxes(MAP);

const start = tileCenter(2, 5);
const kitchen = pois.find((p) => p.kind === 'kitchen')!;
const schools = pois.filter((p) => p.kind === 'school');
let quest: Quest = createQuest(kitchen, schools);
const hud = createHud();
const markers = createMarkers(ctx.scene);
const resetCar = () => ({ x: start.x, z: start.z, heading: Math.PI / 2, speed: 0 });
let car: CarState = resetCar(); // facing east along the top road
const traffic = spawnTraffic(MAP, 16, Math.random, { x: start.x, z: start.z, radius: 12 });
const trafficView = await createTrafficRenderer(ctx.scene, traffic);
document.getElementById('loading')!.remove();

const clock = new THREE.Clock();
ctx.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const input = readCarInput();
  car = stepCar(car, input, dt);
  stepTraffic(traffic, [car], dt, Math.random, MAP);
  car = resolveCar(car, boxes, trafficCircles(traffic));
  trafficView.update(dt);
  player.sync(car, input, dt);
  quest = stepQuest(quest, car, dt);
  if (consumeKey('KeyR') && (quest.phase === 'done' || quest.phase === 'failed')) {
    quest = createQuest(kitchen, schools, quest.phase === 'done' ? quest.round + 1 : 1);
    car = resetCar();
    chase.reset();
  }
  markers.update(questTarget(quest), car, clock.elapsedTime);
  hud.update(quest, car);

  chase.update(car, dt);
  post.render();
});
