import * as THREE from 'three';
import { glowSprite } from './textures';
import { rand } from '../core/math';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  c0: THREE.Color; c1: THREE.Color;
  drag: number; grav: number;
  rot: number; vr: number;
  rx: number; vrx: number;
  stretch: number;
  grow: number; // 0 = linear s0->s1, >0 = puff (fast grow then shrink)
}

export interface SpawnOpts {
  x: number; y: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  life?: number;
  s0?: number; s1?: number;
  c0?: THREE.ColorRepresentation; c1?: THREE.ColorRepresentation;
  drag?: number; grav?: number;
  rot?: number; vr?: number;
  stretch?: number;
  puff?: boolean;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export class Particles {
  /** live pools (a disposed Effects removes its pools) — Q-PF-03 global budget */
  static live = new Set<Particles>();
  /** global cap; low quality halves it (decoration is cut before anything that matters) */
  static budget = 1600;
  static alive() {
    let n = 0;
    for (const p of Particles.live) n += p.ps.length;
    return n;
  }
  mesh: THREE.InstancedMesh;
  ps: P[] = [];
  private pool: P[] = [];
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, public cap: number, public kind: 'additive' | 'solid' | 'confetti') {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    Particles.live.add(this);
    if (kind !== 'additive') {
      this.mesh.castShadow = kind === 'solid';
      this.mesh.receiveShadow = true;
    }
  }

  spawn(o: SpawnOpts) {
    const over = this.ps.length >= this.cap || Particles.alive() >= Particles.budget;
    if (over) {
      if (!this.ps.length) return;
      // recycle oldest
      const old = this.ps.shift()!;
      this.pool.push(old);
    }
    const p: P = this.pool.pop() ?? ({ c0: new THREE.Color(), c1: new THREE.Color() } as P);
    p.x = o.x; p.y = o.y; p.z = o.z ?? 0;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.life = 0; p.max = o.life ?? 1;
    p.s0 = o.s0 ?? 0.3; p.s1 = o.s1 ?? 0;
    p.c0.set(o.c0 ?? 0xffffff);
    p.c1.set(o.c1 ?? o.c0 ?? 0xffffff);
    p.drag = o.drag ?? 0; p.grav = o.grav ?? 0;
    p.rot = o.rot ?? rand(0, Math.PI * 2); p.vr = o.vr ?? 0;
    p.rx = rand(0, 6); p.vrx = this.kind === 'confetti' ? rand(-12, 12) : 0;
    p.stretch = o.stretch ?? 0;
    p.grow = o.puff ? 1 : 0;
    this.ps.push(p);
  }

  update(dt: number) {
    const ps = this.ps;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.pool.push(p);
        continue;
      }
      ps[n++] = p;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      p.rx += p.vrx * dt;
    }
    ps.length = n;
    const col = this.mesh.instanceColor!;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      const t = p.life / p.max;
      let s: number;
      if (p.grow) {
        const g = Math.min(1, t * 6);
        s = p.s0 + (p.s1 - p.s0) * (1 - (1 - g) * (1 - g));
        s *= 1 - Math.pow(t, 2.5);
      } else s = p.s0 + (p.s1 - p.s0) * t;
      tmpC.copy(p.c0).lerp(p.c1, t);
      if (this.kind === 'additive') tmpC.multiplyScalar(Math.pow(1 - t, 1.2));
      col.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
      if (p.stretch > 0) {
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const ang = Math.atan2(p.vy, p.vx);
        tmpE.set(0, 0, ang);
        tmpQ.setFromEuler(tmpE);
        tmpS.set(s * (1 + sp * p.stretch), s, s);
      } else if (this.kind === 'confetti') {
        tmpE.set(p.rx, p.rot, p.rx * 0.5);
        tmpQ.setFromEuler(tmpE);
        tmpS.set(s, s, s);
      } else {
        tmpE.set(this.kind === 'solid' ? p.rx : 0, this.kind === 'solid' ? p.rot * 0.5 : 0, p.rot);
        tmpQ.setFromEuler(tmpE);
        tmpS.set(s, s, s);
      }
      tmpV.set(p.x, p.y, p.z);
      tmpM.compose(tmpV, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
  }

  clear() {
    for (const p of this.ps) this.pool.push(p);
    this.ps.length = 0;
    this.mesh.count = 0;
  }
}

interface Ring {
  m: THREE.Mesh;
  life: number;
  max: number;
  r0: number;
  r1: number;
}

/** All transient visual effects in one place. */
export class Effects {
  /** release this owner's pools from the global particle budget (flight disposal) */
  dispose() {
    for (const p of [this.flames, this.smoke, this.sparks, this.chips, this.confetti, this.drops]) {
      p.clear();
      Particles.live.delete(p);
    }
  }
  particleCount() {
    return this.flames.ps.length + this.smoke.ps.length + this.sparks.ps.length + this.chips.ps.length + this.confetti.ps.length + this.drops.ps.length;
  }
  group = new THREE.Group();
  flames: Particles;
  smoke: Particles;
  sparks: Particles;
  chips: Particles;
  confetti: Particles;
  drops: Particles;
  private rings: Ring[] = [];
  private ringPool: THREE.Mesh[] = [];
  private ringMat: THREE.MeshBasicMaterial;
  flashLight: THREE.PointLight;
  private flashT = 0;

  constructor() {
    const glow = glowSprite();
    const addMat = new THREE.MeshBasicMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, vertexColors: false, toneMapped: false });
    this.flames = new Particles(new THREE.PlaneGeometry(1, 1), addMat, 700, 'additive');
    const smokeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    this.smoke = new Particles(new THREE.IcosahedronGeometry(0.5, 1), smokeMat, 500, 'solid');
    this.smoke.mesh.castShadow = false;
    const sparkMat = new THREE.MeshBasicMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.sparks = new Particles(new THREE.PlaneGeometry(1, 0.35), sparkMat, 500, 'additive');
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    this.chips = new Particles(new THREE.BoxGeometry(1, 0.6, 0.4), chipMat, 400, 'solid');
    const confMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
    this.confetti = new Particles(new THREE.PlaneGeometry(1, 0.6), confMat, 500, 'confetti');
    const dropMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.1 });
    this.drops = new Particles(new THREE.SphereGeometry(0.5, 8, 6), dropMat, 400, 'solid');
    this.drops.mesh.castShadow = false;
    for (const p of [this.smoke, this.chips, this.confetti, this.drops, this.flames, this.sparks]) this.group.add(p.mesh);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.flashLight = new THREE.PointLight(0xffa040, 0, 30, 1.5);
    this.group.add(this.flashLight);
  }

  update(dt: number) {
    this.flames.update(dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.chips.update(dt);
    this.confetti.update(dt);
    this.drops.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const t = r.life / r.max;
      if (t >= 1) {
        r.m.visible = false;
        this.ringPool.push(r.m);
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.m.scale.set(s, s, s);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - t);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashLight.intensity = Math.max(0, this.flashT) * 400;
    } else this.flashLight.intensity = 0;
  }

  clear() {
    for (const p of [this.smoke, this.chips, this.confetti, this.drops, this.flames, this.sparks]) p.clear();
    for (const r of this.rings) {
      r.m.visible = false;
      this.ringPool.push(r.m);
    }
    this.rings.length = 0;
  }

  ring(x: number, y: number, r0: number, r1: number, life: number, color: THREE.ColorRepresentation = 0xffffff, flat = false) {
    // Q-PF: each ring is a draw call — at most 8 at once, the oldest makes way
    if (this.rings.length >= 8) {
      const old = this.rings.shift()!;
      old.m.visible = false;
      this.ringPool.push(old.m);
    }
    let m = this.ringPool.pop();
    if (!m) {
      m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), this.ringMat.clone());
      this.group.add(m);
    }
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    m.visible = true;
    m.position.set(x, y, 0.5);
    m.rotation.set(flat ? Math.PI / 2 : 0, 0, 0);
    m.scale.setScalar(r0);
    this.rings.push({ m, life: 0, max: life, r0, r1 });
  }

  flash(x: number, y: number, power = 1, color: THREE.ColorRepresentation = 0xffa040) {
    this.flashLight.position.set(x, y, 3);
    this.flashLight.color.set(color);
    this.flashT = 0.25 * power;
  }

  // -------------------------------------------------------------- recipes
  explosion(x: number, y: number, size = 1) {
    this.flash(x, y, size * 1.4);
    for (let i = 0; i < 28 * size; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(3, 14) * size;
      this.flames.spawn({ x, y, z: rand(-0.5, 0.5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), s0: rand(1.5, 3) * size, s1: 0.5, c0: 0xfff2b0, c1: 0xff3a10, drag: 4 });
    }
    for (let i = 0; i < 16 * size; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(1, 7) * size;
      this.smoke.spawn({ x: x + Math.cos(a) * 0.5, y: y + Math.sin(a) * 0.5, z: rand(-1, 1), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1.5, life: rand(1.2, 2.2), s0: 0.3, s1: rand(1.6, 2.6) * size, c0: 0x6a5a50, c1: 0xb0aaa0, drag: 2.5, grav: -1.5, puff: true, vr: rand(-1, 1) });
    }
    for (let i = 0; i < 30 * size; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(8, 22) * size;
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.8), s0: 0.35, s1: 0.1, c0: 0xffe080, c1: 0xff5010, drag: 2, grav: 10, stretch: 0.08 });
    }
    this.ring(x, y, 0.5, 6 * size, 0.45, 0xfff0c0);
  }

  impactPuff(x: number, y: number, nx: number, ny: number, power: number, color: THREE.ColorRepresentation = 0xf0e8dc) {
    const n = Math.min(14, 3 + power * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(ny, nx) + rand(-1.3, 1.3);
      const sp = rand(1, 4) * (0.5 + power);
      this.smoke.spawn({ x, y, z: rand(-0.4, 0.4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 1.0), s0: 0.15, s1: rand(0.5, 1.0) * (0.6 + power * 0.5), c0: color, c1: 0xf0ece4, drag: 4, puff: true });
    }
  }

  sparkBurst(x: number, y: number, n: number, color: THREE.ColorRepresentation = 0xffd070, speed = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.3, 1) * speed;
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.2, 0.5), s0: 0.3, s1: 0.05, c0: color, c1: 0xff6010, drag: 3, grav: 6, stretch: 0.06 });
    }
  }

  chipsBurst(x: number, y: number, n: number, color: THREE.ColorRepresentation, speed = 6, size = 0.2) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.3, 1) * speed;
      this.chips.spawn({ x, y, z: rand(-0.4, 0.4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, vz: rand(-2, 2), life: rand(0.6, 1.3), s0: size * rand(0.6, 1.4), s1: 0, c0: color, grav: 18, vr: rand(-10, 10), drag: 0.5 });
    }
  }

  confettiBurst(x: number, y: number, n = 80, speed = 12) {
    const cols = [0xff4d6d, 0xffd23f, 0x3ec46d, 0x3b8cff, 0xa35bff, 0xff8a2a, 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.3, 1) * speed;
      this.confetti.spawn({ x, y, z: rand(-1, 1.5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 6, vz: rand(-3, 3), life: rand(2, 3.5), s0: rand(0.18, 0.3), s1: rand(0.15, 0.25), c0: cols[i % cols.length], grav: 7, drag: 2.2, vr: rand(-6, 6) });
    }
  }

  splash(x: number, y: number, n = 10, speed = 5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0.2, Math.PI - 0.2);
      const sp = rand(0.4, 1) * speed;
      this.drops.spawn({ x, y, z: rand(-0.5, 0.5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 0.8), s0: rand(0.12, 0.22), s1: 0.02, c0: 0x6ec8ff, grav: 20 });
    }
  }

  fire(x: number, y: number, w: number, intensity = 1) {
    this.flames.spawn({ x: x + rand(-w, w) * 0.5, y, z: rand(-0.4, 0.6), vx: rand(-0.4, 0.4), vy: rand(2, 4) * intensity, life: rand(0.35, 0.7), s0: rand(0.6, 1.1) * intensity, s1: 0.15, c0: 0xffe070, c1: 0xff3000, drag: 1 });
    if (Math.random() < 0.15 * intensity)
      this.smoke.spawn({ x: x + rand(-w, w) * 0.4, y: y + 1, z: rand(-0.4, 0.4), vx: rand(-0.3, 0.3), vy: rand(1.5, 2.5), life: rand(1.2, 2), s0: 0.1, s1: rand(0.5, 0.9), c0: 0x504540, c1: 0x9a948c, drag: 1, puff: true });
  }

  celebrate(x: number, y: number) {
    this.flash(x, y, 1, 0xffe080);
    this.ring(x, y, 0.5, 10, 0.7, 0xffe060);
    this.ring(x, y, 0.3, 6, 0.5, 0xffffff);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(6, 20);
      this.sparks.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 1.1), s0: 0.6, s1: 0.1, c0: 0xfff2a0, c1: 0xffa020, drag: 2.5, grav: 4, stretch: 0.06 });
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(2, 7);
      this.smoke.spawn({ x, y, z: rand(-1, 1), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1, life: rand(0.8, 1.4), s0: 0.3, s1: rand(1.0, 1.8), c0: 0xffffff, c1: 0xfff4e0, drag: 3, puff: true });
    }
  }

  sparkle(x: number, y: number, color: THREE.ColorRepresentation = 0xfff2a0) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.sparks.spawn({ x, y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, life: 0.4, s0: 0.4, s1: 0.05, c0: color, c1: color, drag: 5, stretch: 0.05 });
    }
  }
}
