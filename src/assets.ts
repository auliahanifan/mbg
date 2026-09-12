import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

/** Loads /models/<name>.glb once; every call returns a fresh clone (geometry/materials shared). */
export async function loadModel(name: string): Promise<THREE.Group> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`/models/${name}.glb`).then((gltf) => {
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
