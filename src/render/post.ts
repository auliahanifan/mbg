import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { SceneCtx } from './scene';
import type { Quality } from './quality';

/** GTA IV grade: crushed blacks, slightly desaturated, cool shadows / warm highlights, vignette, film grain, faint chromatic aberration. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec2 d = (vUv - 0.5) * 0.0025;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d).b;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.86);                       // desaturate
      c = (c - 0.5) * 1.08 + 0.5;                      // contrast
      c += (l - 0.5) * vec3(0.05, 0.02, -0.06);        // warm highs, cool lows
      float v = smoothstep(0.95, 0.25, length(vUv - 0.5));
      c *= mix(0.72, 1.0, v);                          // vignette
      c += (hash(vUv) - 0.5) * 0.035;                  // grain
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(ctx: SceneCtx, quality: Quality) {
  const bufferSize = () => ctx.renderer.getDrawingBufferSize(new THREE.Vector2()); // device pixels: what the passes actually shade

  // GTAO costs more than the rest of the frame put together and bloom allocates a mip chain, so on the
  // lean rungs they are left out of the chain rather than merely disabled — nothing to allocate, nothing to skip.
  const build = (q: Quality) => {
    const size = bufferSize();
    // HDR so the sky tone-maps instead of clamping to flat white; the Sky sun disc is clamped in scene.ts so it cannot overflow half-float into a NaN blob
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    const composer = new EffectComposer(ctx.renderer, target);
    composer.addPass(new RenderPass(ctx.scene, ctx.camera));
    if (q.ao) {
      const gtao = new GTAOPass(ctx.scene, ctx.camera, size.x, size.y);
      gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 1.4, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.blendIntensity = 0.75;
      composer.addPass(gtao);
    }
    if (q.bloom) composer.addPass(new UnrealBloomPass(size, 0.3, 0.7, 3.0)); // threshold above scene.ts's sky cap (2.2): facing the sun used to bloom the whole sky over the road
    const grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    if (q.smaa) composer.addPass(new SMAAPass());
    return { composer, grade };
  };

  let chain = build(quality);
  // setSize takes device pixels; innerWidth is CSS pixels, so passing it straight through used to drop
  // the whole post chain to 1x on the first resize while the renderer kept shading at the pixel ratio
  const resize = () => { const s = bufferSize(); chain.composer.setSize(s.x, s.y); };
  addEventListener('resize', resize);

  return {
    render: () => {
      chain.grade.uniforms.time.value = performance.now() / 1000;
      chain.composer.render();
    },
    /** Swaps in a chain for the new rung; EffectComposer.dispose() leaves its passes alone, so they go by hand. */
    apply: (q: Quality) => {
      for (const pass of chain.composer.passes) pass.dispose?.();
      chain.composer.dispose();
      chain = build(q);
    },
  };
}
