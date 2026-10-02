import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class Renderer {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  renderPass: RenderPass | null = null;
  bloom: UnrealBloomPass | null = null;
  quality: 'high' | 'low';
  w = 1;
  h = 1;
  envTex: THREE.Texture;
  private dpr = 1;

  constructor(public canvas: HTMLCanvasElement, quality: 'high' | 'low') {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.setupComposer();
  }

  private setupComposer() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.quality === 'high') {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 2.1);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  setQuality(q: 'high' | 'low') {
    if (q === this.quality) return;
    this.quality = q;
    this.setupComposer();
    this.resize(this.w, this.h);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.dpr);
      this.composer.setSize(w, h);
      this.bloom?.resolution.set(w * this.dpr * 0.5, h * this.dpr * 0.5);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }
}

// ------------------------------------------------------------------ sky backdrop
export interface SkyColors {
  horizon: string;
  mid: string;
  top: string;
  space: string;
  /** altitude where it turns to space (m) */
  spaceAlt: number;
}

export function createSky(colors: SkyColors) {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    fog: false,
    uniforms: {
      camY: { value: 0 },
      cH: { value: new THREE.Color(colors.horizon) },
      cM: { value: new THREE.Color(colors.mid) },
      cT: { value: new THREE.Color(colors.top) },
      cS: { value: new THREE.Color(colors.space) },
      spaceAlt: { value: colors.spaceAlt },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position,1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float camY; uniform vec3 cH; uniform vec3 cM; uniform vec3 cT; uniform vec3 cS; uniform float spaceAlt; uniform float time;
      varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      void main(){
        float alt = camY + (vW.y - camY) * 0.35;
        float t1 = smoothstep(-25.0, 45.0, alt);
        float t2 = smoothstep(60.0, spaceAlt*0.8, alt);
        float t3 = smoothstep(spaceAlt*0.7, spaceAlt*1.2, alt);
        vec3 c = mix(cH, cM, t1);
        c = mix(c, cT, t2);
        c = mix(c, cS, t3);
        // paper grain
        float n = noise(vW.xy * 0.35) * 0.5 + noise(vW.xy * 1.7) * 0.5;
        c *= 0.97 + n * 0.05;
        // stars at altitude
        vec2 g = vW.xy * 0.22;
        vec2 sp = floor(g);
        vec2 fr = fract(g) - 0.5;
        float h = hash(sp);
        vec2 off = vec2(hash(sp + 7.1), hash(sp + 3.3)) - 0.5;
        float dd = length(fr - off * 0.6);
        float star = step(0.93, h) * smoothstep(0.09, 0.02, dd) * t3;
        float tw = 0.6 + 0.4 * sin(time * 3.0 + h * 30.0);
        c += vec3(1.0, 0.95, 0.8) * star * tw;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return { mesh: m, mat };
}

// ------------------------------------------------------------------ lights
export function createLights(scene: THREE.Scene, quality: 'high' | 'low') {
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x6a5440, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffeccc, 2.4);
  sun.castShadow = true;
  const ms = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(ms, ms);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 0.6);
  rim.position.set(20, 10, -30);
  scene.add(rim);
  return {
    hemi,
    sun,
    follow(x: number, y: number) {
      sun.position.set(x - 14, y + 26, 34);
      sun.target.position.set(x, y, 0);
    },
  };
}
