import * as THREE from 'three';
import { createScene, START_HOUR } from './render/scene';
import { createPost } from './render/post';
import { buildPoles, buildRoads, buildStalls } from './render/roads';
import { buildBuildings } from './render/buildings';
import { buildLandmarks } from './render/landmarks';
import { buildTerrain, buildGround } from './render/terrain';
import { makeGround, grade, GRAVITY, type Dem } from './world/terrain';
import { loadCity, nearestEdge, pointOnEdge } from './world/city';
import { clearRoads, corridorEscape, project, SPAWN, type CityData } from './world/osm';
import { routeLength } from './world/routing';
import { rasterize, boxesAround } from './vehicle/occupancy';
import { stepCar, type CarState } from './vehicle/carPhysics';
import { resolveCar } from './vehicle/collision';
import { createPlayerCar } from './vehicle/playerCar';
import { readCarInput, consumeKey, isDown } from './input';
import { createSound } from './audio/sound';
import { createChaseCamera } from './camera/chaseCamera';
import { createQuest, stepQuest, questTarget, questPois, type Quest } from './quest/quest';
import { createHud } from './ui/hud';
import { createMarkers } from './quest/markers';
import { spawnTraffic, stepTraffic, trafficCircles, launch } from './traffic/traffic';
import { createTrafficRenderer } from './traffic/trafficRenderer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = createScene(canvas);
const post = createPost(ctx);
const [data, dem]: [CityData, Dem] = await Promise.all([fetch('/purwokerto.json').then((r) => r.json()), fetch('/dem.json').then((r) => r.json())]);
const city = loadCity(data);
data.buildings = clearRoads(data); // footprints off the asphalt, before anything renders or collides with them
const ground = makeGround(dem);
const probe = corridorEscape(data);
const roadEscape = (x: number, z: number) => probe(x, z, -5); // road within 5 m of the probe → pagar in front of the house
ctx.scene.add(buildGround(ground, data.areas ?? []), buildTerrain(data, ground), buildRoads(city, ground), buildPoles(city, ground, (x, z) => probe(x, z) !== null), buildBuildings(data.buildings, ground, roadEscape), buildLandmarks(data.pois, ground));
const occupancy = rasterize(data.buildings, data.trees);
ctx.scene.add(buildStalls(city, ground, (x, z) => probe(x, z) !== null || boxesAround(occupancy, x, z, 0.5).length > 4)); // off other carriageways and not against a wall (4 = the grid's own border boxes)
const player = await createPlayerCar(ctx.scene);
const chase = createChaseCamera(ctx, ground);

const pois = questPois(city, data.pois);
const kitchen = pois.find((p) => p.kind === 'kitchen')!;
const schools = pois.filter((p) => p.kind === 'school');
const routeLen = routeLength(city, [kitchen, ...schools].map((p) => p.stop.node));
const [sx, sz] = project(SPAWN.lat, SPAWN.lon);
const spawnEdge = nearestEdge(city, sx, sz);
const spawn = pointOnEdge(city, spawnEdge.edge, spawnEdge.t);
const resetCar = (): CarState => ({ x: spawn.x, z: spawn.z, heading: spawn.heading, speed: 0 });
let car = resetCar();
const traffic = spawnTraffic(city, 30, Math.random, car);
const trafficView = createTrafficRenderer(ctx.scene, traffic, ground);
let quest: Quest = createQuest(kitchen, schools, 1, routeLen);
const hud = createHud(city, ground);
const markers = createMarkers(ctx.scene, ground);
const sound = createSound();
document.getElementById('loading')!.remove();

const HOURS_PER_SECOND = 1 / 300; // 1 game minute per 5 real seconds: a full day in 2 real hours
let hour = START_HOUR;

const clock = new THREE.Clock();
ctx.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  hour += dt * HOURS_PER_SECOND;
  ctx.setTime(hour);
  const input = readCarInput();
  car = stepCar(car, input, dt, GRAVITY * grade(ground, car.x, car.z, car.heading));
  stepTraffic(city, traffic, [car], dt, Math.random, car);
  const { car: resolved, hits } = resolveCar(car, boxesAround(occupancy, car.x, car.z), trafficCircles(traffic));
  for (const h of hits) if (h.index >= 0) launch(traffic[h.index], h.nx, h.nz, h.dv);
  if (hits.length) sound.hit(Math.max(...hits.map((h) => h.impact)));
  car = resolved;
  trafficView.update(dt);
  player.sync(car, input, dt, ground);
  quest = stepQuest(quest, car, dt);
  if (consumeKey('KeyR') && (quest.phase === 'done' || quest.phase === 'failed')) {
    quest = createQuest(kitchen, schools, quest.phase === 'done' ? quest.round + 1 : 1, routeLen);
    car = resetCar();
    chase.reset();
  }
  markers.update(questTarget(quest), car, clock.elapsedTime);
  hud.update(quest, car, hour);
  sound.update(car, input, quest, isDown('KeyH'), traffic, ctx.camera);
  chase.update(car, dt);
  post.render();
});
