import * as THREE from 'three';
import { Cause, Ent, GameWorld, Rope } from './world';
import { extrudePoly, roundedBox } from '../render/geom';
import { feltMat, getMaterial, matInfo, plastic } from '../render/materials';
import * as P from '../render/models/props';
import { SkyColors } from '../render/renderer';
import { mulberry32, rand } from '../core/math';
import { audio } from '../core/audio';

export interface MethodDef {
  id: Cause;
  name: string;
  hint: string;
  icon: string;
}

export interface StageDef {
  id: string;
  index: number;
  name: string;
  targetName: string;
  brief: string;
  methods: MethodDef[];
  gearIds: string[];
  sky: SkyColors;
  fog: [string, number, number];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  reward: number;
  build(b: LevelBuilder): void;
}

type Pt = { x: number; y: number };

function signedArea(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Friendly API for authoring stages. */
export class LevelBuilder {
  launch = { x: 0, y: 0 };
  targetEnt: Ent | null = null;
  targetFocus = { x: 0, y: 0 };
  deco = new THREE.Group();
  rnd = mulberry32(42);
  named = new Map<string, Ent>();
  animated: ((dt: number, t: number) => void)[] = [];

  constructor(public w: GameWorld, public scene: THREE.Group) {
    scene.add(this.deco);
  }

  // ---------------------------------------------------------------- terrain
  /** Solid ground polygon (CCW or CW) with a felt grass cap on top edges. */
  ground(pts: Pt[], o: { fill?: string; top?: string | null; depth?: number; z?: number; flowers?: boolean } = {}) {
    if (signedArea(pts) < 0) pts = pts.slice().reverse();
    const fill = o.fill ?? 'soil';
    const depth = o.depth ?? 6;
    const geo = extrudePoly(pts, depth, 0.25, matInfo(fill).uv);
    const mesh = new THREE.Mesh(geo, getMaterial(fill));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.position.z = o.z ?? 0;
    const g = new THREE.Group();
    g.add(mesh);
    const top = o.top === undefined ? 'grass' : o.top;
    if (top) {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy);
        if (L < 0.2) continue;
        const nx = dy / L;
        const ny = -dx / L;
        if (ny < 0.55) continue;
        const strip = new THREE.Mesh(roundedBox(L + 0.35, 0.45, depth + 0.35, 0.18, matInfo(top).uv), getMaterial(top));
        strip.position.set((a.x + b.x) / 2 + nx * 0.08, (a.y + b.y) / 2 + ny * 0.08, o.z ?? 0);
        strip.rotation.z = Math.atan2(dy, dx) + Math.PI;
        strip.receiveShadow = true;
        strip.castShadow = true;
        g.add(strip);
        if (o.flowers !== false && top === 'grass') {
          const n = Math.floor(L / 4);
          for (let k = 0; k < n; k++) {
            if (this.rnd() < 0.5) continue;
            const t = (k + this.rnd()) / Math.max(1, n);
            const f = P.flowerPatch(Math.floor(this.rnd() * 1000));
            f.position.set(a.x + dx * t, a.y + dy * t + 0.15, depth / 2 - 0.4 - this.rnd() * 0.5);
            f.scale.setScalar(0.7);
            g.add(f);
          }
        }
      }
    }
    this.w.addTerrain(pts, fill, g);
    return g;
  }

  /** Static solid box (walls, floors, ledges). */
  slab(x: number, y: number, w: number, h: number, mat = 'concrete', o: { angle?: number; depth?: number; top?: string; name?: string; breakable?: boolean; hp?: number } = {}) {
    const depth = o.depth ?? 4;
    const g = new THREE.Group();
    const m = new THREE.Mesh(roundedBox(w, h, depth, Math.min(0.2, Math.min(w, h) * 0.2), matInfo(mat).uv), getMaterial(mat));
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (o.top) {
      const strip = new THREE.Mesh(roundedBox(w + 0.25, 0.35, depth + 0.25, 0.14, matInfo(o.top).uv), getMaterial(o.top));
      strip.position.y = h / 2 + 0.05;
      strip.castShadow = strip.receiveShadow = true;
      g.add(strip);
    }
    const e = this.w.addBox({ x, y, w, h, angle: o.angle, mat, static: true, depth, obj: g, breakable: o.breakable ?? false, hp: o.hp, name: o.name });
    if (o.name) this.named.set(o.name, e);
    return e;
  }

  /** Dynamic (or static) breakable box. */
  block(x: number, y: number, w: number, h: number, mat = 'wood', o: Partial<Parameters<GameWorld['addBox']>[0]> = {}) {
    const e = this.w.addBox({ x, y, w, h, mat, ...o });
    if (o.name) this.named.set(o.name, e);
    return e;
  }

  /** A pile/wall of blocks laid out in a grid. */
  wall(x: number, y: number, cols: number, rows: number, bw: number, bh: number, mat = 'brick', o: Partial<Parameters<GameWorld['addBox']>[0]> = {}) {
    const out: Ent[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) out.push(this.block(x + (c - (cols - 1) / 2) * bw, y + bh / 2 + r * bh, bw * 0.98, bh * 0.98, mat, o));
    return out;
  }

  // ---------------------------------------------------------------- targets
  target(o: { x: number; y: number; w: number; h: number; model: THREE.Object3D; modelOffsetY?: number; hp: number; mat?: string; sound?: string; static?: boolean; soakMax?: number; flammable?: boolean; density?: number; buoyancy?: number; round?: boolean }) {
    const holder = new THREE.Group();
    o.model.position.y = o.modelOffsetY ?? -o.h / 2;
    holder.add(o.model);
    o.model.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = true;
    });
    const base = { x: o.x, y: o.y, mat: o.mat ?? 'ceramic', static: o.static, hp: o.hp, obj: holder, kind: 'target', density: o.density, flammable: o.flammable ?? false };
    const e = o.round ? this.w.addCircle({ ...base, r: o.w / 2 }) : this.w.addBox({ ...base, w: o.w, h: o.h, depth: 1.4 });
    e.isTarget = true;
    e.noDebris = false;
    e.soakMax = o.soakMax ?? 0;
    e.buoyancy = o.buoyancy;
    e.data = { ...(e.data || {}), sound: o.sound ?? 'ceramic' };
    this.targetEnt = e;
    this.w.targetEnt = e;
    this.targetFocus = { x: o.x, y: o.y };
    return e;
  }

  // ---------------------------------------------------------------- props
  waterTank(x: number, y: number, w = 1.6, h = 2.0, amount = 60, o: { static?: boolean; name?: string } = {}) {
    const vis = P.waterTank(w, h);
    const e = this.w.addBox({ x, y, w, h, mat: 'ceramic', hp: 14, obj: vis, kind: 'tank', density: 1.2, static: o.static, noDebris: true, name: o.name });
    e.data = { sound: 'soft' };
    e.onBreak = (_c, en) => {
      // burst wherever the tank ended up
      const p = (en as any)._lastPos ?? { x, y };
      this.w.waterBurst(p.x, p.y, amount, 0, 2, 4);
      this.w.fx.chipsBurst(p.x, p.y, 16, 0x3a8be0, 8, 0.25);
    };
    this.trackPos(e);
    if (o.name) this.named.set(o.name, e);
    return e;
  }

  barrel(x: number, y: number, amount = 30) {
    const vis = P.barrel(1.2, 1.5);
    const e = this.w.addBox({ x, y, w: 1.2, h: 1.5, mat: 'wood', hp: 16, obj: vis, kind: 'tank', density: 1.0 });
    e.onBreak = (_c, en) => {
      const p = (en as any)._lastPos ?? { x, y };
      this.w.waterBurst(p.x, p.y, amount, 0, 2, 3.5);
    };
    this.trackPos(e);
    return e;
  }

  private trackPos(e: Ent) {
    this.animated.push(() => {
      if (e.body) (e as any)._lastPos = { x: e.body.getPosition().x, y: e.body.getPosition().y };
    });
  }

  hydrant(x: number, y: number, power = 30, seconds = 9) {
    const vis = P.hydrant();
    const holder = new THREE.Group();
    vis.position.y = -0.7;
    holder.add(vis);
    const e = this.w.addBox({ x, y: y + 0.7, w: 0.7, h: 1.4, mat: 'redmetal', static: true, hp: 22, breakable: true, obj: holder, kind: 'hydrant', noDebris: true });
    e.onBreak = () => {
      const wind = this.w.addWind({ x, y: y + 0.5, ang: Math.PI / 2, len: 16, wid: 2.4, power, active: true, water: true });
      this.w.addEmitter({ x, y: y + 0.9, dx: 0, dy: 1, rate: 18, speed: 17, time: seconds, spread: 0.12, wind });
      this.w.events.onText(x, y + 3, '콸콸콸!', 'water');
      audio.splash();
      // stump
      const stump = P.hydrant();
      stump.scale.set(1, 0.35, 1);
      stump.position.set(x, y, 0);
      this.scene.add(stump);
    };
    return e;
  }

  fireworks(x: number, y: number, w = 1.4, h = 1.0, o: { radius?: number; power?: number; cause?: Cause } = {}) {
    const vis = P.fireworksCrate(w, h);
    const e = this.w.addBox({ x, y, w, h, mat: 'wood', hp: 10, obj: vis, kind: 'fireworks', density: 2.0, flammable: true, noDebris: true });
    e.onBreak = (_c, en) => {
      const p = (en as any)._lastPos ?? { x, y };
      const R = o.radius ?? 6;
      this.w.explode(p.x, p.y, R, o.power ?? 70, o.cause ?? 'boom');
      audio.firework();
      // pretty fireworks bursts
      for (let i = 0; i < 4; i++) {
        const fx = this.w.fx;
        const bx = p.x + rand(-4, 4);
        const by = p.y + rand(3, 8);
        setTimeout(() => {
          fx.sparkBurst(bx, by, 26, [0xff4d6d, 0x4dd2ff, 0xffd23f, 0x7dff6a][i], 12);
          fx.flash(bx, by, 0.5, [0xff4d6d, 0x4dd2ff, 0xffd23f, 0x7dff6a][i]);
        }, 120 + i * 140);
      }
    };
    this.trackPos(e);
    return e;
  }

  balloon(x: number, y: number, color: string, attach?: { ent: Ent; x: number; y: number }, o: { lift?: number; coins?: number; len?: number } = {}) {
    const vis = P.balloon(color);
    const e = this.w.addCircle({ x, y, r: 0.55, mat: 'rubber', hp: 1, breakable: true, obj: vis, kind: 'balloon', density: 0.08, noDebris: true, coins: o.coins ?? 1, linearDamping: 0.6, angularDamping: 2 });
    e.buoyancy = o.lift ?? 1.6;
    e.flammable = true;
    e.onBreak = (_c, en) => {
      const p = (en as any)._lastPos ?? { x, y };
      audio.pop();
      this.w.fx.confettiBurst(p.x, p.y, 20, 6);
      this.w.events.onText(p.x, p.y, '펑!', 'pop');
    };
    this.trackPos(e);
    if (attach) {
      this.w.addRope({ ax: attach.x, ay: attach.y, aEnt: attach.ent, b: e, bx: x, by: y - 0.6, len: o.len, color: '#ffffff' });
    }
    return e;
  }

  /** Balloon tied to a static anchor point. */
  balloonAnchored(x: number, y: number, ax: number, ay: number, color: string, coins = 2) {
    const vis = P.balloon(color);
    const e = this.w.addCircle({ x, y, r: 0.55, mat: 'rubber', hp: 1, breakable: true, obj: vis, kind: 'balloon', density: 0.08, noDebris: true, coins, linearDamping: 0.8, angularDamping: 2 });
    e.buoyancy = 1.6;
    e.flammable = true;
    e.onBreak = (_c, en) => {
      const p = (en as any)._lastPos ?? { x, y };
      audio.pop();
      this.w.fx.confettiBurst(p.x, p.y, 20, 6);
    };
    this.trackPos(e);
    this.w.addRope({ ax, ay, b: e, bx: x, by: y - 0.6, color: '#ffffff' });
    return e;
  }

  fan(x: number, y: number, ang: number, power = 22, length = 14, size = 2.6) {
    const { group, blades } = P.fan(size);
    // The fan's face normal is local +z. Tilt it so it mostly blows along local +y
    // (the wind direction) while still showing its face to the camera.
    group.rotation.set(-(Math.PI / 2 - 0.75), 0, 0);
    const holder = new THREE.Group();
    holder.add(group);
    holder.position.set(x, y, 0);
    holder.rotation.z = ang - Math.PI / 2;
    // stand
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), plastic('#f2f2f2', 0.4));
    stand.position.y = -0.9;
    holder.add(stand);
    this.deco.add(holder);
    // static collider for the fan housing
    this.w.addBox({ x, y, w: size * 0.9, h: 0.6, angle: ang - Math.PI / 2, mat: 'metal', static: true, breakable: false, obj: null });
    return this.w.addWind({ x, y, ang, len: length, wid: size * 1.1, power, blades, active: true });
  }

  spring(x: number, y: number, w = 2.4, ang = 0, power = 26) {
    const vis = P.springPad(w);
    const holder = new THREE.Group();
    holder.add(vis);
    const e = this.w.addBox({ x, y, w, h: 0.5, angle: ang, mat: 'rubber', static: true, breakable: false, obj: holder, kind: 'spring', restitution: 0.6 });
    e.data = { power, squash: 0 };
    return e;
  }

  vending(x: number, y: number) {
    const vis = P.vendingMachine();
    const e = this.w.addBox({ x, y: y + 1.3, w: 1.6, h: 2.6, mat: 'redmetal', hp: 55, obj: vis, kind: 'vending', density: 1.4, coins: 12 });
    e.onHit = (J) => {
      if (J > 10 && e.alive && this.w.time - (e.hitCd ?? -9) > 0.6) {
        e.hitCd = this.w.time;
        const p = e.body!.getPosition();
        for (let i = 0; i < 2; i++) this.w.addCoin(p.x + 0.4, p.y - 0.6, 10, true, rand(2, 5), rand(2, 6));
        audio.coin();
        this.w.events.onText(p.x, p.y + 1.5, '덜컹! 짤랑~', 'coin');
      }
    };
    return e;
  }

  bell(x: number, y: number, coinsPerDing = 3, maxDings = 4) {
    const vis = P.bell();
    const holder = new THREE.Group();
    vis.position.y = 0.45;
    holder.add(vis);
    const e = this.w.addBox({ x, y: y - 0.45, w: 1.4, h: 1.0, mat: 'metal', breakable: false, obj: holder, kind: 'bell', density: 2 });
    this.w.addHinge(null, e, x, y + 0.1);
    let dings = 0;
    e.onHit = (J, other) => {
      if (J > 3 && this.w.time - (e.hitCd ?? -9) > 0.5) {
        e.hitCd = this.w.time;
        audio.ding();
        const p = e.body!.getPosition();
        this.w.fx.ring(p.x, p.y, 0.5, 4, 0.6, 0xfff0a0);
        this.w.events.onText(p.x, p.y + 1.5, '댕~!', 'coin');
        if (dings < maxDings && other?.kind === 'rocket') {
          dings++;
          for (let i = 0; i < coinsPerDing; i++) this.w.addCoin(p.x, p.y - 1, 10, true, rand(-6, 6), rand(-2, 5));
        }
      }
    };
    return e;
  }

  fire(x: number, y: number, w = 1.2, kind: 'grill' | 'bonfire' | 'none' = 'bonfire') {
    const obj = kind === 'grill' ? P.grill() : kind === 'bonfire' ? P.bonfire() : undefined;
    const f = this.w.addFire(x, kind === 'grill' ? y + 1.0 : y, w, obj);
    if (obj) obj.position.set(x, y, 0);
    return f;
  }

  /** Hang an entity from a world point. */
  hang(ax: number, ay: number, e: Ent, o: { strength?: number; color?: string; flammable?: boolean; cause?: Cause; bx?: number; by?: number } = {}): Rope {
    const p = e.body!.getPosition();
    return this.w.addRope({ ax, ay, b: e, bx: o.bx ?? p.x, by: o.by ?? p.y + e.h / 2, strength: o.strength, color: o.color, flammable: o.flammable, cause: o.cause });
  }

  coin(x: number, y: number) {
    this.w.addCoin(x, y);
  }
  coinLine(x1: number, y1: number, x2: number, y2: number, n: number) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.w.addCoin(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    }
  }
  coinArc(cx: number, cy: number, r: number, a0: number, a1: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1);
      this.w.addCoin(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  coinGrid(x: number, y: number, cols: number, rows: number, sp = 1.1) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.w.addCoin(x + (c - (cols - 1) / 2) * sp, y + r * sp);
  }
  gear(id: string, x: number, y: number) {
    return this.w.addGear(id, x, y);
  }
  fuel(x: number, y: number, amount = 35) {
    return this.w.addFuel(x, y, amount);
  }

  // ---------------------------------------------------------------- decoration
  put(obj: THREE.Object3D, x: number, y: number, z = -4, s = 1, rotY = 0) {
    obj.position.set(x, y, z);
    obj.scale.multiplyScalar(s);
    obj.rotation.y = rotY;
    obj.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.receiveShadow = true;
        if (z > -14) m.castShadow = true;
        else m.castShadow = false;
      }
    });
    this.deco.add(obj);
    return obj;
  }

  sign(x: number, y: number, text: string, z = -1.2, w = 2.6, h = 1.2) {
    return this.put(P.signPost(text, w, h), x, y, z);
  }

  backdropHills(minX: number, maxX: number, y: number, colors: string[], zs: number[]) {
    zs.forEach((z, i) => {
      const step = 70 + i * 40;
      for (let x = minX - 60; x < maxX + 60; x += step) {
        const h = P.hill(step * 1.7, 5 + this.rnd() * 8 + i * 9, colors[i % colors.length], Math.floor(this.rnd() * 999));
        h.position.set(x + this.rnd() * 20, y - 2, z);
        this.deco.add(h);
      }
    });
  }

  clouds(minX: number, maxX: number, minY: number, maxY: number, n: number, zMin = -40, zMax = -18) {
    for (let i = 0; i < n; i++) {
      const c = P.cloud(Math.floor(this.rnd() * 9999), 1 + this.rnd() * 1.6);
      c.position.set(minX + this.rnd() * (maxX - minX), minY + this.rnd() * (maxY - minY), zMin + this.rnd() * (zMax - zMin));
      this.deco.add(c);
      const sp = 0.2 + this.rnd() * 0.4;
      const x0 = c.position.x;
      const ph = this.rnd() * 10;
      this.animated.push((_dt, t) => {
        c.position.x = x0 + Math.sin(t * 0.05 * sp + ph) * 6;
      });
    }
  }

  /** Big flat back wall panel (LBP-style back layer). */
  backPanel(x: number, y: number, w: number, h: number, mat: string, z = -5) {
    const m = new THREE.Mesh(roundedBox(w, h, 0.6, 0.2, matInfo(mat).uv), getMaterial(mat));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.deco.add(m);
    return m;
  }

  feltPanel(x: number, y: number, w: number, h: number, color: string, z = -5, d = 0.4) {
    const m = new THREE.Mesh(roundedBox(w, h, d, 0.15, 0.4), feltMat(color));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.deco.add(m);
    return m;
  }
}
