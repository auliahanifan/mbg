import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { SceneCtx } from './scene';

export function createPost(ctx: SceneCtx) {
  const size = ctx.renderer.getDrawingBufferSize(new THREE.Vector2());
  // LDR target: the Sky sun disc overflows half-float and becomes a NaN blob in the bloom blur
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, samples: 4 });
  const composer = new EffectComposer(ctx.renderer, target);
  composer.addPass(new RenderPass(ctx.scene, ctx.camera));
  composer.addPass(new UnrealBloomPass(size, 0.15, 0.4, 0.9));
  composer.addPass(new OutputPass());
  addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));
  return { render: () => composer.render() };
}
