import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { daylight } from './daylight';
import type { Quality } from './quality';

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  setTime: (hour: number) => void;
  applyQuality: (q: Quality) => void;
}

export const START_HOUR = 10; // the clock starts here and runs from there
const HAZE = 0xb9c4cf; // horizon haze; fog colour, matches the sky at the horizon under tone mapping

export function createScene(canvas: HTMLCanvasElement, quality: Quality): SceneCtx {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(HAZE);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, 0.0028); // GTA IV haze: thick, everything past ~400 m dissolves

  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 5000);
  camera.position.set(0, 6, -12);

  const sunDir = new THREE.Vector3(...daylight(START_HOUR).dir);
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.sunPosition.value.copy(sunDir);
  u.turbidity.value = 5;
  u.rayleigh.value = 1.0;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.85;
  u.cloudCoverage.value = 0.5;
  u.cloudDensity.value = 0.55;
  u.cloudElevation.value = 0.35;
  sky.onBeforeRender = () => { u.time.value = performance.now() / 1000; }; // clouds drift
  // the sun disc is ~1e5 linear: dim the sky to sit under the tone-mapper's shoulder, then cap it.
  // 2.2 is just above the brightest clear sky, so only the disc and the aureole around it clip —
  // driving into the low sun no longer whites out the road, and the half-float post chain never sees inf.
  // post.ts keeps the bloom threshold above this cap, so the sky can never bleed over the road.
  sky.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min( texColor * 0.45, vec3( 2.2 ) ), 1.0 );'); };
  scene.add(sky);

  // sky-coloured env map (LDR equirect gradient: zenith blue → horizon haze → ground) lights the world and gives car paint its reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  const W = 64, H = 32;
  const px = new Uint8Array(W * H * 4);
  const zenith = new THREE.Color(0x4d78b8), horizon = new THREE.Color(HAZE), ground = new THREE.Color(0x5a5648);
  const c = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const t = j / (H - 1); // 0 = up, 1 = down
    t < 0.5 ? c.lerpColors(zenith, horizon, Math.pow(t * 2, 0.6)) : c.lerpColors(horizon, ground, Math.min(1, (t - 0.5) * 6));
    for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; px[k] = c.r * 255; px[k + 1] = c.g * 255; px[k + 2] = c.b * 255; px[k + 3] = 255; }
  }
  const equirect = new THREE.DataTexture(px, W, H);
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.needsUpdate = true;
  scene.environment = pmrem.fromEquirectangular(equirect).texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();
  equirect.dispose();

  const hemi = new THREE.HemisphereLight(0x9fb6d6, 0x5a5340, 0.45);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9a8, 3.2);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  // the one place the render budget touches the scene: buffer resolution and how much shadow detail the sun carries
  const applyQuality = (q: Quality) => {
    renderer.shadowMap.enabled = q.shadows;
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    sun.shadow.mapSize.setScalar(q.shadowMapSize);
    sun.shadow.map?.dispose(); // three only reads mapSize when it allocates, so drop the old target
    sun.shadow.map = null;
    const c = sun.shadow.camera;
    c.left = -q.shadowBox;
    c.right = q.shadowBox;
    c.top = q.shadowBox;
    c.bottom = -q.shadowBox;
    c.updateProjectionMatrix();
  };
  applyQuality(quality);

  // the whole sky/light rig follows the clock; the chase camera keeps the shadow box on the car
  const setTime = (hour: number) => {
    const d = daylight(hour);
    sunDir.set(...d.dir);
    u.sunPosition.value.copy(sunDir);
    sun.intensity = d.intensity;
    sun.color.setHex(d.color);
    hemi.intensity = d.ambient;
    scene.environmentIntensity = d.env;
    (scene.fog as THREE.FogExp2).color.setHex(d.haze);
    renderer.setClearColor(d.haze);
    renderer.toneMappingExposure = d.exposure;
  };
  setTime(START_HOUR);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera, sun, sunDir, setTime, applyQuality };
}
