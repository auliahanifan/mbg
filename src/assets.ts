import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

const PACK_PREFIXES: [string, string][] = [
  ['road-', 'roads'], ['tile-', 'roads'], ['light-', 'roads'],
  ['building-type-', 'suburban'], ['tree-', 'suburban'],
  ['building-', 'commercial'],
];
/** Kenney pack folder for a model name (each pack ships its own Textures/colormap.png). */
export const packOf = (name: string): string => PACK_PREFIXES.find(([p]) => name.startsWith(p))?.[1] ?? 'cars';

/** Loads /models/<pack>/<name>.glb once; every call returns a fresh clone (geometry/materials shared). */
export async function loadModel(name: string): Promise<THREE.Group> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`/models/${packOf(name)}/${name}.glb`).then((gltf) => {
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        return gltf.scene;
      }),
    );
  }
  return (await cache.get(name)!).clone();
}
