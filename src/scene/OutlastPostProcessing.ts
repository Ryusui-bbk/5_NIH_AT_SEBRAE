import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const OutlastCamcorderShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uNightVision: { value: 0 },
    uDanger: { value: 0 },
    uGrainAmount: { value: 0.055 },
    uAspect: { value: 1.777 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNightVision;
    uniform float uDanger;
    uniform float uGrainAmount;
    uniform float uAspect;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      // Leve distorção óptica de lente grande-angular de filmadora (estilo Outlast)
      float r2 = dot(centered * vec2(uAspect * 0.62, 1.0), centered * vec2(uAspect * 0.62, 1.0));
      float barrel = 1.0 + r2 * (0.035 + uNightVision * 0.045);
      vec2 uv = clamp(0.5 + centered * barrel, 0.001, 0.999);

      // Aberração cromática radial nas bordas da lente
      float caStrength = (0.0016 + uNightVision * 0.0024 + uDanger * 0.0032) * (0.25 + r2 * 2.4);
      vec2 caOffset = centered * caStrength;

      float cr = texture2D(tDiffuse, clamp(uv + caOffset, 0.001, 0.999)).r;
      float cg = texture2D(tDiffuse, uv).g;
      float cb = texture2D(tDiffuse, clamp(uv - caOffset, 0.001, 0.999)).b;
      vec3 col = vec3(cr, cg, cb);

      // ==================== GRADING NORMAL: OUTLAST 2 COLD SLATE-CYAN CHIAROSCURO ====================
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Preserva vermelhos intensos (sangue, extintor, Diário) enquanto esfria os tons médios para azul-ardósia
      float redDominance = clamp((col.r - max(col.g, col.b)) * 2.8, 0.0, 1.0);
      vec3 desat = mix(vec3(lum), col, mix(0.62, 0.92, redDominance));

      // Sombras azul-petróleo profundas + meios-tons ciano-acinzentados gelados (referência Outlast 2)
      vec3 coldTint = vec3(0.84, 0.95, 1.06);
      vec3 shadowFloor = vec3(0.008, 0.015, 0.022);
      vec3 graded = max(vec3(0.0), (desat * coldTint - 0.012) * 1.06) + shadowFloor * (1.0 - smoothstep(0.0, 0.25, lum));

      // Curva S sutil para contraste cinematográfico
      graded = mix(graded, smoothstep(0.0, 1.0, graded), 0.18);

      // ==================== MODO VISÃO NOTURNA INFRAVERMELHA (OUTLAST NVG) ====================
      if (uNightVision > 0.001) {
        // Ganho IR não-linear levantando áreas escuras
        float irLum = dot(col, vec3(0.28, 0.62, 0.10));
        float boosted = pow(clamp(irLum * 1.85 + 0.018, 0.0, 1.6), 0.66);

        // Scanlines finas horizontais do sensor CMOS
        float scan = 0.955 + 0.045 * sin(uv.y * 820.0 + uTime * 18.0);
        boosted *= scan;

        // Curva de fósforo esmeralda-jade clássica do Outlast, estourando para branco-menta nas altas luzes / olhos IR
        vec3 nvgDark = vec3(0.006, 0.045, 0.020);
        vec3 nvgMid = vec3(0.08, 0.88, 0.40);
        vec3 nvgHigh = vec3(0.76, 1.00, 0.85);

        vec3 nvgCol = mix(nvgDark, nvgMid, clamp(boosted, 0.0, 1.0));
        nvgCol = mix(nvgCol, nvgHigh, smoothstep(0.68, 1.32, boosted));

        // Ruído extra de sensor IR nas sombras escuras
        float irNoise = (hash12(uv * vec2(960.0, 540.0) + fract(uTime * 37.0) * 100.0) - 0.5);
        nvgCol += irNoise * (0.095 * (1.0 - clamp(irLum * 2.0, 0.0, 0.75))) * vec3(0.35, 1.0, 0.55);

        graded = mix(graded, nvgCol, uNightVision);
      }

      // Grão de filme / sensor CMOS
      if (uGrainAmount > 0.001) {
        float g = hash12(uv * vec2(1120.0, 680.0) + fract(uTime * 29.3) * 73.0) - 0.5;
        graded += g * uGrainAmount * (1.0 - smoothstep(0.65, 1.0, lum) * 0.5);
      }

      // Vinheta pesada de lente de filmadora + pulsação rubra sob perigo
      float vigRadius = smoothstep(0.18, 0.86 - uNightVision * 0.10, r2 * 1.55);
      graded *= (1.0 - vigRadius * (0.58 + uNightVision * 0.24));

      if (uDanger > 0.01) {
        float pulse = 0.65 + 0.35 * sin(uTime * 6.5);
        graded = mix(graded, vec3(0.36, 0.02, 0.03), vigRadius * uDanger * 0.42 * pulse);
      }

      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), 1.0);
    }
  `,
};

export class OutlastPostProcessing {
  readonly composer: EffectComposer;
  readonly bloomPass: UnrealBloomPass;
  readonly camcorderPass: ShaderPass;
  private nightVisionBlend = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();

    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(size.x * pr)),
      Math.max(1, Math.floor(size.y * pr)),
      {
        type: THREE.HalfFloatType,
        samples: 2,
      }
    );

    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Halo suave nas luminárias fluorescentes frias, olhos IR e poste de vapor de sódio
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.34, // strength
      0.58, // radius
      0.76  // threshold
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    this.camcorderPass = new ShaderPass(OutlastCamcorderShader);
    this.camcorderPass.uniforms.uAspect.value = size.x / Math.max(1, size.y);
    this.composer.addPass(this.camcorderPass);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    this.camcorderPass.uniforms.uAspect.value = width / Math.max(1, height);
  }

  render(
    dt: number,
    time: number,
    opts: {
      nightVisionOn: boolean;
      dangerLevel: number;
      filmGrain: boolean;
    }
  ): void {
    const targetNv = opts.nightVisionOn ? 1 : 0;
    // Rampa rápida de capacitor óptico ao ligar/desligar o IR
    this.nightVisionBlend += (targetNv - this.nightVisionBlend) * Math.min(1, dt * 11.0);

    this.camcorderPass.uniforms.uTime.value = time;
    this.camcorderPass.uniforms.uNightVision.value = this.nightVisionBlend;
    this.camcorderPass.uniforms.uDanger.value = opts.dangerLevel;
    this.camcorderPass.uniforms.uGrainAmount.value = opts.filmGrain ? 0.048 : 0.008;

    // Aumenta o halo de bloom quando a Visão Noturna está ativa (olhos retrorrefletivos + luzes estouradas)
    this.bloomPass.strength = 0.32 + this.nightVisionBlend * 0.28;
    this.bloomPass.threshold = 0.76 - this.nightVisionBlend * 0.22;

    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
