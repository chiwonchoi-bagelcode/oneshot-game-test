import * as planck from 'planck';
import * as THREE from 'three';
import { CAT, Ent, GameWorld, RocketLike } from './world';
import { FUEL_MASS, GRAVITY, Loadout, RocketStats, computeStats, partById } from '../data/parts';
import { buildRocket, RocketModel } from '../render/models/rocket';
import { flameGradient } from '../render/textures';
import { clamp, damp, len, rand, grand, wrapAngle } from '../core/math';
import { audio } from '../core/audio';

const Vec2 = planck.Vec2;

export interface DamageInfo {
  mat?: string;
  speed?: number;
}

export interface ControlInput {
  active: boolean;
  /** desired thrust (acceleration) direction in world space */
  dx: number;
  dy: number;
  throttle: number;
}

const NOSE_EXT: Record<string, number> = { hat: 0.42, pot: 0.3, glove: 0.75, drill: 0.85 };

export class Rocket implements RocketLike {
  ent: Ent;
  stats: RocketStats;
  model: RocketModel;
  fuel: number;
  hull: number;
  throttle = 0;
  invuln = 0;
  dead = false;
  boosting = 0;
  boostDir = { x: 0, y: 1 };
  private omega = 0;
  private massT = 0;
  private sputter = 0;
  private idleT = 1;
  /** time spent commanding thrust while wedged (C-038 anti-wedge) */
  private stuckT = 0;
  private safe = { x: 0, y: 0, a: 0 };
  /** number of anti-wedge hops (diagnostics) */
  unsticks = 0;
  /** set when the engine just kicked in (for FX) */
  kicked = 0;
  private lastDamageT = -9;
  hurtFlash = 0;
  glide = 0;
  rollAngle = 0;
  outOfFuelWarned = false;
  onDamage?: (amount: number, kind: string, info?: DamageInfo) => void;
  /** what last hurt us (for the failure explanation) */
  lastHit: { kind: string; mat?: string; speed?: number; amount: number; t: number } | null = null;
  onDeath?: () => void;
  onEmpty?: () => void;
  private flameCone: THREE.Mesh;
  private flameCore: THREE.Mesh;
  halfLen: number;

  constructor(public world: GameWorld, public loadout: Loadout, x: number, y: number, angle = 0) {
    this.stats = computeStats(loadout);
    this.fuel = this.stats.fuel;
    this.hull = this.stats.hull;
    this.model = buildRocket(loadout);
    const st = this.stats;
    const R = st.radius;
    const L = st.length;
    const ext = NOSE_EXT[loadout.nose] ?? 0.3;
    this.halfLen = L / 2;
    const body = world.pw.createBody({ type: 'dynamic', position: Vec2(x, y), angle, bullet: true, angularDamping: 2.5, linearDamping: 0 });
    const filt = { filterCategoryBits: CAT.ROCKET, filterMaskBits: CAT.STATIC | CAT.DYN };
    const fr = 0.35;
    body.createFixture({ shape: new planck.Box(R * 0.92, L / 2 - R * 0.5, Vec2(0, 0)), density: 1, friction: fr, restitution: 0.2, ...filt });
    body.createFixture({ shape: new planck.Circle(Vec2(0, L / 2 - R * 0.5 + ext * 0.5), Math.max(R * 0.75, 0.22)), density: 1, friction: fr, restitution: partById(loadout.nose).bounce ?? 0.22, ...filt });
    body.createFixture({ shape: new planck.Circle(Vec2(0, -L / 2 + R * 0.45), R * 0.85), density: 1, friction: fr, restitution: 0.2, ...filt });
    this.ent = {
      id: -1, kind: 'rocket', body, obj: this.model.root, mat: 'metal', w: R * 2, h: L, depth: R * 2, hp: 1, maxHp: 1, breakable: false, alive: true,
      isStatic: false, flammable: false, heat: 0, burning: false, burnT: 0, soak: 0, soakMax: 0, px: x, py: y, pa: angle,
    };
    body.setUserData(this.ent);
    this.updateMass(true);
    world.register(this.ent);
    world.rocket = this;

    // flame visuals attached to nozzle
    const grad = flameGradient();
    const glowMat = new THREE.MeshBasicMaterial({ color: this.flameColor(), map: grad, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.flameCone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1, 14, 1, true), glowMat);
    this.flameCone.rotation.x = Math.PI; // point down
    this.flameCone.position.y = -0.5;
    this.model.flame.add(this.flameCone);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0, map: grad, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1, 10, 1, true), coreMat);
    this.flameCore.rotation.x = Math.PI;
    this.flameCore.position.y = -0.3;
    this.model.flame.add(this.flameCore);
    this.model.flame.visible = false;
  }

  private flameColor() {
    return this.stats.exhaust === 'torch' ? 0x5ab0ff : this.stats.exhaust === 'powder' ? 0xffffff : 0xffa030;
  }

  get body() {
    return this.ent.body!;
  }

  mass() {
    return this.stats.dryMass + this.fuel * FUEL_MASS;
  }

  updateMass(force = false) {
    const m = this.mass();
    const L = this.stats.length;
    this.body.setMassData({ mass: m, center: Vec2(0, 0), I: (m * L * L) / 10 });
    void force;
  }

  facing() {
    const a = this.body.getAngle();
    return { x: -Math.sin(a), y: Math.cos(a) };
  }

  nozzleWorld() {
    const p = this.body.getPosition();
    const f = this.facing();
    const ny = this.model.nozzleY;
    return { x: p.x + f.x * ny, y: p.y + f.y * ny, dx: -f.x, dy: -f.y };
  }

  damage(amount: number, x: number, y: number, kind: string, info?: DamageInfo) {
    if (this.dead) return;
    if (this.invuln > 0) return;
    if (amount <= 0) return;
    this.hull -= amount;
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / 25);
    this.lastDamageT = this.world.time;
    this.lastHit = { kind, mat: info?.mat, speed: info?.speed, amount, t: this.world.time };
    this.onDamage?.(amount, kind, info);
    if (amount > 4) audio.hurt();
    if (this.hull <= 0) this.explode();
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.hull = 0;
    const p = this.body.getPosition();
    this.world.rocket = null;
    this.world.explode(p.x, p.y, 3.5 + this.stats.dryMass * 0.4, 30 + this.mass() * 8, 'boom');
    // scatter the junk parts
    for (let i = 0; i < 6; i++) {
      this.world.spawnDebris(p.x + grand(-0.4, 0.4), p.y + grand(-0.5, 0.5), grand(0.2, 0.4), grand(0.2, 0.5), grand(0, 6), i % 2 ? 'metal' : 'cardboard', grand(-8, 8), grand(2, 12), 0.5);
    }
    this.world.removeEnt(this.ent);
    this.model.root.visible = false;
    this.onDeath?.();
  }

  /** Physics-rate update. */
  step(dt: number, input: ControlInput) {
    if (this.dead) return;
    const body = this.body;
    // C-038: a non-finite state is never kept; fall back to the last good transform
    const p0 = body.getPosition();
    const v0 = body.getLinearVelocity();
    if (!Number.isFinite(p0.x + p0.y + v0.x + v0.y + body.getAngle())) {
      body.setTransform(Vec2(this.safe.x, this.safe.y), this.safe.a);
      body.setLinearVelocity(Vec2(0, 0));
      body.setAngularVelocity(0);
      console.warn('[rocket] non-finite state recovered');
    } else {
      this.safe.x = p0.x;
      this.safe.y = p0.y;
      this.safe.a = body.getAngle();
    }
    const st = this.stats;
    const v = body.getLinearVelocity();
    const speed = len(v.x, v.y);
    const ang = body.getAngle();
    const fx = -Math.sin(ang);
    const fy = Math.cos(ang);
    this.invuln = Math.max(0, this.invuln - dt);

    // ---- desired thrust
    let want = 0;
    let dx = 0;
    let dy = 1;
    if (this.boosting > 0) {
      this.boosting -= dt;
      want = 1;
      if (input.active && input.throttle > 0.05) {
        // steer during boost, still full power
        const l = len(input.dx, input.dy) || 1;
        this.boostDir.x = damp(this.boostDir.x, input.dx / l, 6, dt);
        this.boostDir.y = damp(this.boostDir.y, input.dy / l, 6, dt);
      }
      dx = this.boostDir.x;
      dy = this.boostDir.y;
      if (this.boosting <= 0 && !(input.active && input.throttle > 0.05)) want = 0;
    } else if (input.active && input.throttle > 0.01) {
      want = input.throttle;
      dx = input.dx;
      dy = input.dy;
    }
    const hasFuel = this.fuel > 0 || this.boosting > 0;
    if (!hasFuel) {
      if (want > 0 && grand() < 0.2) this.sputter = 0.15;
      want = 0;
      if (!this.outOfFuelWarned) {
        this.outOfFuelWarned = true;
        this.onEmpty?.();
      }
    }

    // ---- rotation: heavy, springy steering toward the thrust direction
    if (want > 0) {
      const targetAng = Math.atan2(-dx, dy);
      const err = wrapAngle(targetAng - ang);
      const desired = clamp(err * 8.5, -st.turn, st.turn);
      const maxDelta = st.turnAccel * dt;
      this.omega = body.getAngularVelocity();
      this.omega += clamp(desired - this.omega, -maxDelta, maxDelta);
      body.setAngularVelocity(this.omega);
    } else {
      // weathervane: nose drifts toward the velocity like a dart
      if (speed > 4) {
        const velAng = Math.atan2(-v.x, v.y);
        const err = wrapAngle(velAng - ang);
        const k = (st.glide ? 0.6 : 1.6) * clamp((speed - 4) / 12, 0, 1);
        body.setAngularVelocity(body.getAngularVelocity() + err * k * dt * 6);
      }
    }

    // ---- ignition kick: a little shove when you re-light the engine (tactile "chewiness")
    if (want > 0) {
      if (this.idleT > 0.25 && this.boosting <= 0) {
        const k = st.thrust * 0.05 * Math.min(1, want + 0.3);
        body.applyLinearImpulse(Vec2(fx * k, fy * k), body.getWorldCenter(), true);
        this.kicked = 1;
      }
      this.idleT = 0;
    } else this.idleT += dt;

    // ---- throttle spool (engine lag = weight)
    const rate = want > this.throttle ? st.spool : 9;
    this.throttle += clamp(want - this.throttle, -rate * dt, rate * dt);
    if (this.sputter > 0) {
      this.sputter -= dt;
      this.throttle *= 0.5;
    }

    // ---- anti-wedge (C-038): lying against a floor and a crate, the nose can be unable to turn
    // toward the stick and misaligned thrust is too weak to push off. If the player keeps asking
    // and nothing moves, give a small hop toward the stick so control is never lost.
    if (want > 0 && hasFuel && this.boosting <= 0) {
      const tA = Math.atan2(-dx, dy);
      const err = Math.abs(wrapAngle(tA - ang));
      // misaligned and unable to turn: react fast; aligned but pressed into something: give it longer
      if (speed < 0.45 && Math.abs(body.getAngularVelocity()) < 0.4 && this.throttle > 0.6) this.stuckT += err > 0.55 ? dt : dt * 0.45;
      else this.stuckT = Math.max(0, this.stuckT - dt * 2);
      if (this.stuckT > 0.35) {
        this.stuckT = 0;
        this.unsticks++;
        const m = body.getMass();
        const l = len(dx, dy) || 1;
        body.applyLinearImpulse(Vec2((dx / l) * m * 2.6, (dy / l) * m * 2.6 + m * 1.2), body.getWorldCenter(), true);
        body.setAngularVelocity(clamp(wrapAngle(tA - ang) * 3, -st.turn, st.turn));
      }
    } else this.stuckT = 0;

    // ---- thrust along the facing (not the stick!)
    if (this.throttle > 0.001) {
      let align = 1;
      if (want > 0) {
        const tA = Math.atan2(-dx, dy);
        align = clamp(0.3 + 0.7 * Math.cos(wrapAngle(tA - ang)), 0.15, 1);
      }
      const boostMul = this.boosting > 0 ? 1.05 : 1;
      const F = st.thrust * this.throttle * align * boostMul;
      body.applyForceToCenter(Vec2(fx * F, fy * F), true);
      if (this.boosting <= 0) this.fuel = Math.max(0, this.fuel - st.burn * this.throttle * dt);
    }

    // ---- aerodynamics
    const m = body.getMass();
    const c = st.drag;
    let ax = -c * speed * v.x;
    let ay = -c * speed * v.y;
    // lateral grip (fins bite the air → carving turns)
    const vAlong = v.x * fx + v.y * fy;
    const latX = v.x - fx * vAlong;
    const latY = v.y - fy * vAlong;
    const grip = 0.55 * st.grip * clamp(speed / 8, 0, 1);
    ax += -latX * grip * m;
    ay += -latY * grip * m;
    // umbrella glide
    const gliding = st.glide && want === 0 && v.y < 0;
    this.glide = damp(this.glide, gliding ? 1 : 0, 6, dt);
    if (this.glide > 0.01) {
      ay += -v.y * 2.4 * m * this.glide;
      // convert some fall into forward glide
      ax += Math.sign(v.x || fx) * Math.min(4, -v.y) * 0.6 * m * this.glide;
    }
    body.applyForceToCenter(Vec2(ax, ay), true);

    // ---- mass changes as fuel burns
    this.massT += dt;
    if (this.massT > 0.2) {
      this.massT = 0;
      this.updateMass();
    }
  }

  /** Render-rate update of the model & exhaust FX. */
  updateVisual(dt: number, alpha: number, fx: import('../render/effects').Effects) {
    const root = this.model.root;
    if (this.dead) return;
    const body = this.body;
    const e = this.ent;
    const p = body.getPosition();
    const a = body.getAngle();
    root.position.set(e.px + (p.x - e.px) * alpha, e.py + (p.y - e.py) * alpha, 0);
    root.rotation.z = e.pa + wrapAngle(a - e.pa) * alpha;
    const v = body.getLinearVelocity();
    const speed = len(v.x, v.y);
    // roll around the long axis for that chunky 3D feel
    this.rollAngle += dt * (0.6 + speed * 0.08 + this.throttle * 2.5);
    this.model.roll.rotation.y = this.rollAngle;
    // shake when thrusting hard
    const sh = this.throttle * 0.02;
    this.model.roll.position.set(rand(-sh, sh), rand(-sh, sh), 0);
    if (this.model.drillBit) this.model.drillBit.rotation.y += dt * (8 + this.throttle * 40);
    if (this.model.spinners) for (const s of this.model.spinners) s.rotation.y += dt * (10 + speed);
    if (this.model.umbrella) {
      const open = 0.45 + this.glide * 0.55;
      this.model.umbrella.scale.set(open, 1, open);
    }
    // flame mesh
    const th = this.throttle;
    const fl = this.model.flame;
    fl.visible = th > 0.02;
    if (fl.visible) {
      const flick = 0.85 + Math.random() * 0.3;
      const L = (0.6 + th * 1.6) * flick * (this.stats.exhaust === 'powder' ? 1.3 : 1);
      this.flameCone.scale.set(0.8 + th * 0.6, L, 0.8 + th * 0.6);
      this.flameCone.position.y = -L / 2;
      this.flameCore.scale.set(0.8 + th * 0.4, L * 0.6, 0.8 + th * 0.4);
      this.flameCore.position.y = -L * 0.3;
    }
    if (this.kicked > 0) {
      this.kicked = 0;
      const nz = this.nozzleWorld();
      fx.ring(nz.x, nz.y, 0.2, 1.3, 0.25, this.stats.exhaust === 'torch' ? 0xa0d8ff : 0xffe0a0);
      for (let i = 0; i < 6; i++)
        fx.smoke.spawn({ x: nz.x, y: nz.y, z: rand(-0.3, 0.3), vx: nz.dx * rand(4, 8) + rand(-2, 2), vy: nz.dy * rand(4, 8) + rand(-2, 2), life: rand(0.4, 0.7), s0: 0.15, s1: rand(0.4, 0.7), c0: 0xffffff, c1: 0xf0e8dc, drag: 4, puff: true });
    }
    // exhaust particles
    if (th > 0.02) {
      const nz = this.nozzleWorld();
      const n = Math.ceil(th * 3 * (dt * 60));
      const st = this.stats;
      for (let i = 0; i < n; i++) {
        const sp = rand(8, 14) * (0.4 + th * 0.6);
        const ang = Math.atan2(nz.dy, nz.dx) + rand(-0.18, 0.18);
        const vx = Math.cos(ang) * sp + v.x * 0.6;
        const vy = Math.sin(ang) * sp + v.y * 0.6;
        if (st.exhaust === 'foam') {
          fx.flames.spawn({ x: nz.x, y: nz.y, z: rand(-0.1, 0.1), vx, vy, life: rand(0.12, 0.25), s0: 0.7 * th + 0.2, s1: 0.1, c0: 0xffe8a0, c1: 0xff5010, drag: 3 });
          if (Math.random() < 0.6)
            fx.smoke.spawn({ x: nz.x, y: nz.y, z: rand(-0.3, 0.3), vx: vx * 0.5, vy: vy * 0.5, life: rand(0.5, 1.0), s0: 0.08, s1: rand(0.25, 0.45), c0: 0xc8925a, c1: 0xfff4e0, drag: 3, grav: 3, puff: true });
        } else if (st.exhaust === 'torch') {
          fx.flames.spawn({ x: nz.x, y: nz.y, z: rand(-0.1, 0.1), vx: vx * 1.1, vy: vy * 1.1, life: rand(0.15, 0.3), s0: 0.8 * th + 0.25, s1: 0.2, c0: 0xa0d8ff, c1: 0xff6020, drag: 2.5 });
          if (Math.random() < 0.3) fx.sparks.spawn({ x: nz.x, y: nz.y, vx: vx * 1.2, vy: vy * 1.2, life: 0.3, s0: 0.2, s1: 0.05, c0: 0xffd080, c1: 0xff4010, stretch: 0.05, drag: 1 });
        } else {
          fx.smoke.spawn({ x: nz.x, y: nz.y, z: rand(-0.3, 0.3), vx: vx * 1.3, vy: vy * 1.3, life: rand(0.5, 0.9), s0: 0.15, s1: rand(0.6, 1.1), c0: 0xffffff, c1: 0xe8eef4, drag: 3.5, puff: true });
          if (Math.random() < 0.4) fx.flames.spawn({ x: nz.x, y: nz.y, vx, vy, life: 0.12, s0: 0.6, s1: 0.1, c0: 0xffffff, c1: 0x80c0ff, drag: 3 });
        }
      }
    } else if (!this.dead && this.fuel <= 0 && Math.random() < 0.05) {
      const nz = this.nozzleWorld();
      fx.smoke.spawn({ x: nz.x, y: nz.y, vx: rand(-0.5, 0.5), vy: 1, life: 1, s0: 0.05, s1: 0.3, c0: 0x777777, c1: 0xaaaaaa, puff: true });
    }
    // damage smoke
    const hp = this.hull / this.stats.hull;
    if (hp < 0.45 && Math.random() < (0.45 - hp) * 1.5) {
      fx.smoke.spawn({ x: p.x + rand(-0.2, 0.2), y: p.y, z: 0.3, vx: rand(-0.5, 0.5), vy: rand(0.5, 1.5), life: rand(0.8, 1.4), s0: 0.1, s1: rand(0.4, 0.7), c0: 0x3a3330, c1: 0x8a8580, drag: 1, puff: true });
      if (hp < 0.2 && Math.random() < 0.3) fx.fire(p.x, p.y, 0.3, 0.4);
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    void GRAVITY;
  }

  speed() {
    const v = this.body.getLinearVelocity();
    return len(v.x, v.y);
  }
}
