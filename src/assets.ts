import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

/** Loads /models/cars/<name>.glb once; every call returns a fresh clone (geometry/materials shared). */
export async function loadModel(name: string): Promise<THREE.Group> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`/models/cars/${name}.glb`).then((gltf) => {
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (m.isMeshStandardMaterial) { m.roughness = 0.38; m.metalness = 0.2; m.envMapIntensity = 1.3; } // car paint: picks up the sky
          }
        });
        return gltf.scene;
      }),
    );
  }
  return (await cache.get(name)!).clone();
}
