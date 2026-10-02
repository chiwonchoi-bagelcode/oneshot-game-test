import * as planck from 'planck';
import * as THREE from 'three';
import { Effects } from '../render/effects';
import { matInfo } from '../render/materials';
import { blockMesh, bottleCapGeometry, gearPickup, fuelCan } from '../render/models/props';
import { GRAVITY, RocketStats } from '../data/parts';
import { audio } from '../core/audio';
import { clamp, distPointSeg, len, rand, grand, wrapAngle } from '../core/math';
import { disposeTree } from '../render/geom';
import { windAccel } from './wind';
import { ContactRole, contactOutline, setCracks, terrainOutline, animateContact } from '../render/contact';
import { shiny } from '../render/materials';

const Vec2 = planck.Vec2;

export const CAT = { STATIC: 1, DYN: 2, ROCKET: 4, DEBRIS: 8, WATER: 16 };
const MASK_ALL = 0xffff;

export type Cause = 'ram' | 'topple' | 'device' | 'boom' | 'water' | 'fire' | 'precision';

export interface Ent {
  id: number;
  name?: string;
  kind: string;
  body: planck.Body | null;
  obj: THREE.Object3D | null;
  mat: string;
  w: number;
  h: number;
  depth: number;
  round?: boolean;
  hp: number;
  maxHp: number;
  breakable: boolean;
  alive: boolean;
  isStatic: boolean;
  flammable: boolean;
  heat: number;
  burning: boolean;
  burnT: number;
  isTarget?: boolean;
  soak: number;
  soakMax: number;
  device?: boolean;
  punched?: boolean;
  noDebris?: boolean;
  coins?: number; // coins dropped when broken
  score?: number;
  hitCoins?: number; // coins dropped on strong hits (vending)
  hitCd?: number;
  life?: number; // auto-remove timer (debris/water)
  maxLife?: number;
  buoyancy?: number;
  onBreak?: (cause: Cause, e: Ent) => void;
  onHit?: (J: number, other: Ent | null) => void;
  // interpolation
  px: number;
  py: number;
  pa: number;
  // misc
  data?: any;
  /** Q-CI role override (e.g. 'device' for valves/fireworks); default from breakable */
  role?: ContactRole;
  crackLv?: number;
  /** cause hint inherited from a chain reaction (explosion, device, water, fire) */
  hint?: Cause;
  hintT?: number;
}

export interface RocketLike {
  ent: Ent;
  stats: RocketStats;
  invuln: number;
  dead: boolean;
  throttle: number;
  facing(): { x: number; y: number };
  damage(amount: number, x: number, y: number, kind: string, info?: { mat?: string; speed?: number }): void;
  nozzleWorld(): { x: number; y: number; dx: number; dy: number };
}

export interface Rope {
  a: planck.Body;
  la: planck.Vec2;
  b: Ent;
  lb: planck.Vec2;
  joint: planck.Joint | null;
  alive: boolean;
  strength: number;
  heat: number;
  flammable: boolean;
  mesh: THREE.Mesh;
  color: string;
  cutCause: Cause;
}

export interface FireZone {
  x: number;
  y: number;
  w: number;
  lit: boolean;
  obj?: THREE.Object3D;
  t: number;
}

export interface WindZone {
  x: number;
  y: number;
  ang: number;
  len: number;
  wid: number;
  power: number;
  blades?: THREE.Object3D;
  active: boolean;
  t?: number;
  water?: boolean;
}

export interface Emitter {
  x: number;
  y: number;
  dx: number;
  dy: number;
  rate: number;
  speed: number;
  time: number;
  acc: number;
  spread: number;
  wind?: WindZone;
}

export interface Pickup {
  kind: 'coin' | 'gear' | 'fuel';
  id?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  taken: boolean;
  value: number;
  obj?: THREE.Object3D;
  idx?: number;
  t: number;
  loose?: boolean;
  delay?: number;
  /** a collectible the player already owns (shown as a ghost, no new reward) */
  owned?: boolean;
}

export interface WorldEvents {
  onBreak(e: Ent, cause: Cause): void;
  onTarget(e: Ent, cause: Cause): void;
  onCoin(value: number, x: number, y: number): void;
  onGear(id: string, x: number, y: number, alreadyOwned: boolean): void;
  onFuel(amount: number, x: number, y: number): void;
  onText(x: number, y: number, text: string, style?: string): void;
  onShake(amount: number): void;
  onHitStop(sec: number): void;
  onRocketHit(power: number): void;
}

const tmpV3 = new THREE.Vector3();

let nextId = 1;

export class GameWorld {
  pw: planck.World;
  ents: Ent[] = [];
  ground: planck.Body;
  ropes: Rope[] = [];
  fires: FireZone[] = [];
  winds: WindZone[] = [];
  emitters: Emitter[] = [];
  pickups: Pickup[] = [];
  rocket: RocketLike | null = null;
  scene: THREE.Group;
  fx: Effects;
  events: WorldEvents;
  private breakQ: { e: Ent; cause: Cause; vx?: number; vy?: number; hx?: number; hy?: number }[] = [];
  private actions: (() => void)[] = [];
  private water: Ent[] = [];
  private waterMesh: THREE.InstancedMesh;
  private debris: Ent[] = [];
  private coinMesh: THREE.InstancedMesh;
  private coinCount = 0;
  time = 0;
  private fireTick = 0;
  stats = { broken: 0, coins: 0 };
  bounds = { minX: -200, maxX: 200, minY: -60, maxY: 400 };
  targetEnt: Ent | null = null;
  targetDone = false;
  /** per-physics-step hooks (moving platforms etc.) */
  stepHooks: ((dt: number) => void)[] = [];
  /** game-time scheduled callbacks (never wall clock: pauses and hit-stops stay consistent) */
  private timers: { t: number; fn: () => void }[] = [];
  /** When false, pickups and the target no longer change the run's economy/outcome. */
  ledgerOpen = true;

  constructor(scene: THREE.Group, fx: Effects, events: WorldEvents) {
    this.scene = scene;
    this.fx = fx;
    this.events = events;
    this.pw = new planck.World({ gravity: Vec2(0, -GRAVITY) });
    this.ground = this.pw.createBody();
    this.pw.on('pre-solve', (c) => this.preSolve(c));
    this.pw.on('post-solve', (c, imp) => this.postSolve(c, imp));
    this.pw.on('begin-contact', (c) => this.beginContact(c));
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x4fb4ff, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85 });
    this.waterMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 1), waterMat, 260);
    this.waterMesh.count = 0;
    this.waterMesh.frustumCulled = false;
    this.waterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.waterMesh);
    this.coinMesh = new THREE.InstancedMesh(bottleCapGeometry(), new THREE.MeshStandardMaterial({ color: '#f2cf4a', roughness: 0.3, metalness: 0.35, emissive: '#5a4010', emissiveIntensity: 0.6 }), 600);
    this.coinMesh.count = 0;
    this.coinMesh.castShadow = true;
    this.coinMesh.frustumCulled = false;
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.coinMesh);
  }

  /** Drop everything that could still call back into a finished run (timers, hooks). */
  dispose() {
    this.timers.length = 0;
    this.stepHooks.length = 0;
    this.actions.length = 0;
    this.breakQ.length = 0;
    this.rocket = null;
  }

  // ================================================================== creation
  private baseEnt(kind: string, mat: string, w: number, h: number): Ent {
    return {
      id: nextId++, kind, body: null, obj: null, mat, w, h, depth: 1.2, hp: 9999, maxHp: 9999, breakable: false, alive: true, isStatic: true,
      flammable: false, heat: 0, burning: false, burnT: 0, soak: 0, soakMax: 0, px: 0, py: 0, pa: 0,
    };
  }

  register(e: Ent) {
    this.ents.push(e);
    this.attachContact(e);
    if (e.body) {
      const p = e.body.getPosition();
      e.px = p.x;
      e.py = p.y;
      e.pa = e.body.getAngle();
    }
    if (e.obj) this.scene.add(e.obj);
    return e;
  }

  /** Q-CI: everything the rocket can hit carries an outline drawn exactly on its collider. */
  private attachContact(e: Ent) {
    if (!e.obj || !e.body) return;
    if (e.kind === 'debris' || e.kind === 'water' || e.kind === 'rocket' || e.kind === 'terrain') return;
    const f = e.body.getFixtureList();
    if (!f || f.isSensor()) return;
    if (e.obj.getObjectByName('contact')) return;
    const role: ContactRole = e.role ?? (e.breakable ? 'breakable' : 'solid');
    e.obj.add(contactOutline({ w: e.w, h: e.h, round: e.round }, role, e.depth / 2 + 0.03));
  }

  /** Change an entity's role after creation (builder helpers mark devices). */
  setRole(e: Ent, role: ContactRole) {
    e.role = role;
    const old = e.obj?.getObjectByName('contact');
    if (old) old.parent!.remove(old);
    this.attachContact(e);
  }

  /** Static terrain polygon (any shape) as a chain loop. */
  addTerrain(pts: { x: number; y: number }[], mat: string, obj: THREE.Object3D | null, o: { depth?: number; z?: number } = {}) {
    const e = this.baseEnt('terrain', mat, 0, 0);
    const body = this.pw.createBody({ type: 'static' });
    const info = matInfo(mat);
    body.createFixture({
      shape: new planck.Chain(pts.map((p) => Vec2(p.x, p.y)), true),
      friction: info.friction,
      restitution: info.restitution,
      filterCategoryBits: CAT.STATIC,
      filterMaskBits: MASK_ALL,
    });
    body.setUserData(e);
    e.body = body;
    e.obj = obj;
    if (obj) obj.add(terrainOutline(pts, (o.z ?? 0) + (o.depth ?? 4) / 2 + 0.03));
    return this.register(e);
  }

  addBox(o: {
    x: number; y: number; w: number; h: number; angle?: number; mat: string; static?: boolean; hp?: number; breakable?: boolean;
    depth?: number; obj?: THREE.Object3D | null; kind?: string; density?: number; friction?: number; restitution?: number; name?: string;
    flammable?: boolean; noDebris?: boolean; coins?: number; bullet?: boolean; linearDamping?: number; angularDamping?: number; role?: ContactRole;
  }): Ent {
    const info = matInfo(o.mat);
    const e = this.baseEnt(o.kind ?? 'block', o.mat, o.w, o.h);
    e.role = o.role;
    e.name = o.name;
    e.depth = o.depth ?? Math.min(2.2, Math.max(1.0, Math.min(o.w, o.h) * 1.2 + 0.6));
    e.isStatic = !!o.static;
    e.breakable = o.breakable ?? info.strength < 5000;
    const hp = o.hp ?? Math.round(info.strength * Math.sqrt(o.w * o.h));
    e.hp = e.maxHp = hp;
    e.flammable = o.flammable ?? info.flammable;
    e.noDebris = o.noDebris;
    e.coins = o.coins;
    const body = this.pw.createBody({
      type: o.static ? 'static' : 'dynamic',
      position: Vec2(o.x, o.y),
      angle: o.angle ?? 0,
      bullet: o.bullet,
      linearDamping: o.linearDamping ?? 0.02,
      angularDamping: o.angularDamping ?? 0.05,
    });
    body.createFixture({
      shape: new planck.Box(o.w / 2, o.h / 2),
      density: o.density ?? info.density,
      friction: o.friction ?? info.friction,
      restitution: o.restitution ?? info.restitution,
      filterCategoryBits: o.static ? CAT.STATIC : CAT.DYN,
      filterMaskBits: MASK_ALL,
    });
    body.setUserData(e);
    e.body = body;
    e.obj = o.obj === undefined ? blockMesh(o.w, o.h, e.depth, o.mat) : o.obj;
    if (e.obj) {
      e.obj.position.set(o.x, o.y, 0);
      e.obj.rotation.z = o.angle ?? 0;
    }
    return this.register(e);
  }

  addCircle(o: {
    x: number; y: number; r: number; mat: string; static?: boolean; hp?: number; breakable?: boolean; obj?: THREE.Object3D | null; kind?: string;
    density?: number; friction?: number; restitution?: number; name?: string; flammable?: boolean; noDebris?: boolean; coins?: number;
    linearDamping?: number; angularDamping?: number; gravityScale?: number; sensor?: boolean; role?: ContactRole;
  }): Ent {
    const info = matInfo(o.mat);
    const e = this.baseEnt(o.kind ?? 'round', o.mat, o.r * 2, o.r * 2);
    e.role = o.role;
    e.name = o.name;
    e.round = true;
    e.isStatic = !!o.static;
    e.breakable = o.breakable ?? info.strength < 5000;
    e.hp = e.maxHp = o.hp ?? Math.round(info.strength * o.r * 1.8);
    e.flammable = o.flammable ?? info.flammable;
    e.noDebris = o.noDebris;
    e.coins = o.coins;
    const body = this.pw.createBody({
      type: o.static ? 'static' : 'dynamic',
      position: Vec2(o.x, o.y),
      linearDamping: o.linearDamping ?? 0.02,
      angularDamping: o.angularDamping ?? 0.1,
      gravityScale: o.gravityScale ?? 1,
    });
    body.createFixture({
      shape: new planck.Circle(o.r),
      density: o.density ?? info.density,
      friction: o.friction ?? info.friction,
      restitution: o.restitution ?? info.restitution,
      filterCategoryBits: o.static ? CAT.STATIC : CAT.DYN,
      filterMaskBits: MASK_ALL,
      isSensor: o.sensor,
    });
    body.setUserData(e);
    e.body = body;
    e.obj = o.obj === undefined ? null : o.obj;
    if (e.obj) e.obj.position.set(o.x, o.y, 0);
    return this.register(e);
  }

  /** Attach a rope between a world anchor (or entity) and an entity. */
  addRope(o: {
    ax: number; ay: number; aEnt?: Ent; b: Ent; bx?: number; by?: number; len?: number; strength?: number; color?: string; flammable?: boolean; cause?: Cause;
  }): Rope {
    const aBody = o.aEnt?.body ?? this.ground;
    const bBody = o.b.body!;
    const aw = Vec2(o.ax, o.ay);
    const bp = bBody.getPosition();
    const bw = Vec2(o.bx ?? bp.x, o.by ?? bp.y);
    const la = aBody.getLocalPoint(aw);
    const lb = bBody.getLocalPoint(bw);
    const maxLength = o.len ?? len(aw.x - bw.x, aw.y - bw.y);
    const joint = this.pw.createJoint(new planck.RopeJoint({ localAnchorA: la, localAnchorB: lb, maxLength, collideConnected: true } as any, aBody, bBody));
    const color = o.color ?? '#b8925a';
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    mesh.castShadow = true;
    this.scene.add(mesh);
    const r: Rope = {
      a: aBody, la: Vec2(la), b: o.b, lb: Vec2(lb), joint, alive: true, strength: o.strength ?? 0, heat: 0,
      flammable: o.flammable ?? true, mesh, color, cutCause: o.cause ?? 'device',
    };
    this.ropes.push(r);
    return r;
  }

  addHinge(a: Ent | null, b: Ent, x: number, y: number, opts: { lower?: number; upper?: number; motor?: number; torque?: number } = {}) {
    const def: any = {};
    if (opts.lower !== undefined) {
      def.enableLimit = true;
      def.lowerAngle = opts.lower;
      def.upperAngle = opts.upper;
    }
    if (opts.motor !== undefined) {
      def.enableMotor = true;
      def.motorSpeed = opts.motor;
      def.maxMotorTorque = opts.torque ?? 1000;
    }
    return this.pw.createJoint(new planck.RevoluteJoint(def, a?.body ?? this.ground, b.body!, Vec2(x, y)));
  }

  addCoin(x: number, y: number, value = 10, loose = false, vx = 0, vy = 0) {
    const p: Pickup = { kind: 'coin', x, y, vx, vy, taken: false, value, t: grand(0, 6), loose, delay: loose ? 0.35 : 0 };
    this.pickups.push(p);
    return p;
  }

  /** Schedule fn after `sec` of simulated game time. */
  after(sec: number, fn: () => void) {
    this.timers.push({ t: this.time + sec, fn });
  }

  addGear(id: string, x: number, y: number, owned = false) {
    const obj = gearPickup(owned);
    obj.position.set(x, y, 0);
    this.scene.add(obj);
    const p: Pickup = { kind: 'gear', id, x, y, vx: 0, vy: 0, taken: false, value: 1, obj, t: 0, owned };
    this.pickups.push(p);
    return p;
  }

  addFuel(x: number, y: number, amount = 35) {
    const obj = fuelCan();
    obj.position.set(x, y, 0);
    this.scene.add(obj);
    const p: Pickup = { kind: 'fuel', x, y, vx: 0, vy: 0, taken: false, value: amount, obj, t: grand(0, 3) };
    this.pickups.push(p);
    return p;
  }

  addFire(x: number, y: number, w: number, obj?: THREE.Object3D) {
    const f: FireZone = { x, y, w, lit: true, obj, t: 0 };
    if (obj) {
      obj.position.set(x, y, 0);
      this.scene.add(obj);
    }
    this.fires.push(f);
    return f;
  }

  addWind(z: WindZone) {
    this.winds.push(z);
    return z;
  }

  addEmitter(e: Omit<Emitter, 'acc'>) {
    const em = { ...e, acc: 0 };
    this.emitters.push(em);
    return em;
  }

  // ================================================================== water
  spawnWater(x: number, y: number, vx: number, vy: number) {
    if (this.water.length >= 240) {
      const old = this.water.shift()!;
      this.removeEnt(old);
    }
    const e = this.baseEnt('water', 'water', 0.32, 0.32);
    e.isStatic = false;
    e.life = 0;
    e.maxLife = grand(9, 13);
    const body = this.pw.createBody({ type: 'dynamic', position: Vec2(x, y), linearVelocity: Vec2(vx, vy), fixedRotation: true, linearDamping: 0.05 });
    body.createFixture({
      shape: new planck.Circle(0.17),
      density: 1.0,
      friction: 0.0,
      restitution: 0.05,
      filterCategoryBits: CAT.WATER,
      filterMaskBits: CAT.STATIC | CAT.DYN | CAT.WATER | CAT.DEBRIS,
    });
    body.setUserData(e);
    e.body = body;
    this.ents.push(e);
    this.water.push(e);
    return e;
  }

  waterBurst(x: number, y: number, n: number, vx = 0, vy = 0, spread = 5) {
    for (let i = 0; i < n; i++) {
      const a = grand(0, Math.PI * 2);
      const r = Math.sqrt(grand()) * 0.8;
      this.spawnWater(x + Math.cos(a) * r, y + Math.sin(a) * r, vx + grand(-spread, spread), vy + grand(-spread * 0.5, spread));
    }
    audio.splash();
    this.fx.splash(x, y, 16, 7);
  }

  // ================================================================== contacts
  private entOf(f: planck.Fixture): Ent | null {
    return (f.getBody().getUserData() as Ent) ?? null;
  }

  private isRocket(e: Ent | null) {
    return !!e && e.kind === 'rocket';
  }

  private preSolve(c: planck.Contact) {
    const fa = c.getFixtureA();
    const fb = c.getFixtureB();
    const a = this.entOf(fa);
    const b = this.entOf(fb);
    if (!a || !b) return;
    if (!a.alive || !b.alive) {
      c.setEnabled(false);
      return;
    }
    if (a.punched || b.punched) {
      c.setEnabled(false);
      return;
    }
    const rocketIsA = this.isRocket(a);
    const rocketIsB = this.isRocket(b);
    if (!(rocketIsA || rocketIsB) || !this.rocket) return;
    const other = rocketIsA ? b : a;
    if (other.kind === 'water') return;
    if (!other.breakable) return;
    const wm = c.getWorldManifold(null);
    if (!wm) return;
    const nAB = wm.normal;
    const nx = rocketIsA ? nAB.x : -nAB.x;
    const ny = rocketIsA ? nAB.y : -nAB.y;
    const rb = this.rocket.ent.body!;
    const ob = other.body!;
    const vr = rb.getLinearVelocity();
    const vo = ob.getLinearVelocity();
    const vn = (vr.x - vo.x) * nx + (vr.y - vo.y) * ny;
    if (vn < 1.0) return;
    const mR = rb.getMass();
    const mO = ob.isDynamic() ? ob.getMass() : Infinity;
    const mEff = mO === Infinity ? mR : (mR * mO) / (mR + mO);
    const f = this.rocket.facing();
    const noseHit = f.x * nx + f.y * ny > 0.72;
    const st = this.rocket.stats;
    const punch = noseHit ? st.punch : st.punch < 1 ? st.punch : 1;
    const J = vn * mEff * punch;
    if (J >= other.hp) {
      // ---- smash straight through!
      c.setEnabled(false);
      other.punched = true;
      const absorbed = Math.min(vn * 0.7, (other.hp / (mR * punch)) * 0.55);
      rb.setLinearVelocity(Vec2(vr.x - nx * absorbed, vr.y - ny * absorbed));
      const dmg = other.hp * matInfo(other.mat).hardness * (noseHit ? st.frontArmor : 1) * 0.3 / st.armor;
      const p = wm.points[0] ?? rb.getPosition();
      this.queueBreak(other, 'ram', vr.x * 0.6, vr.y * 0.6, p.x, p.y);
      this.actions.push(() => {
        this.rocket?.damage(dmg, p.x, p.y, 'smash', { mat: other.mat, speed: vn });
        const big = other.maxHp > 40;
        this.events.onHitStop(big ? 0.07 : 0.035);
        this.events.onShake(big ? 0.55 : 0.3);
        this.events.onRocketHit(big ? 0.6 : 0.3);
      });
    }
  }

  private postSolve(c: planck.Contact, imp: planck.ContactImpulse) {
    const a = this.entOf(c.getFixtureA());
    const b = this.entOf(c.getFixtureB());
    if (!a || !b) return;
    const ni = imp.normalImpulses;
    let J = 0;
    for (let i = 0; i < ni.length; i++) J += ni[i];
    if (J < 0.5) return;
    if (a.kind === 'water' || b.kind === 'water') return;
    const ra = this.isRocket(a);
    const rb = this.isRocket(b);
    if (ra || rb) {
      this.rocketImpact(c, ra ? b : a, J, ra);
      return;
    }
    // non-rocket impacts: falling stuff, debris, devices
    this.damageFrom(a, b, J);
    this.damageFrom(b, a, J);
  }

  /**
   * Cause contract (see docs/spec-core.md §판정):
   *  rocket contact → ram · a body flagged as a device (cut rope, cannon shell) → device ·
   *  otherwise the chain cause the moving body inherited (boom/device/fire/water/topple) while it is
   *  still in motion from that chain · otherwise topple (knocked/fell).
   */
  hintAlive(e?: Ent | null) {
    if (!e || !e.hint) return false;
    const age = this.time - (e.hintT ?? -99);
    if (age < 4) return true;
    // the chain stays attached while the body is still moving because of it
    return !!e.body && e.body.isAwake() && age < 30;
  }

  private causeFrom(other: Ent, self?: Ent): Cause {
    if (this.isRocket(other)) return 'ram';
    if (other.device) return 'device';
    if (this.hintAlive(self)) return self!.hint!;
    if (this.hintAlive(other)) return other.hint!;
    return 'topple';
  }

  /** Tag everything resting on/touching `seeds` (transitively) with a chain-reaction cause. */
  propagateHint(seeds: planck.Body[], cause: Cause) {
    // a direct smash of a support becomes "toppling" for whatever it was holding up
    if (cause === 'ram') cause = 'topple';
    const seen = new Set<planck.Body>();
    const queue: [planck.Body, number][] = seeds.map((b) => [b, 0]);
    while (queue.length) {
      const [b, depth] = queue.shift()!;
      if (seen.has(b)) continue;
      seen.add(b);
      // static structure (floors, walls) never moves: it neither carries a chain cause nor relays
      // it to everything else resting on it — only a seed (e.g. a support being destroyed) does
      if (depth > 0 && b.isStatic()) continue;
      const e = b.getUserData() as Ent;
      if (e && e.kind !== 'terrain' && e.kind !== 'rocket') {
        // the first chain to set something in motion owns it until it settles
        if (!this.hintAlive(e)) {
          e.hint = cause;
          e.hintT = this.time;
        }
      }
      if (depth >= 8) continue;
      for (let ce = b.getContactList(); ce; ce = ce.next) {
        const o = ce.other;
        if (!o || seen.has(o) || !ce.contact.isTouching()) continue;
        const oe = o.getUserData() as Ent;
        if (!oe || oe.kind === 'terrain' || oe.kind === 'water' || oe.kind === 'rocket') continue;
        queue.push([o, depth + 1]);
      }
    }
  }

  private damageFrom(e: Ent, other: Ent, J: number) {
    if (!e.alive || e.kind === 'debris') return;
    // let freshly spawned stacks settle without breaking
    if (this.time < 1.2) return;
    if (other.kind === 'debris') J *= 0.35;
    if (e.onHit) e.onHit(J, other);
    if (!e.breakable) return;
    const thr = e.maxHp * 0.22;
    if (J < thr) return;
    e.hp -= J;
    if (e.hp <= 0) {
      this.queueBreak(e, this.causeFrom(other, e));
      if (J > 30) this.events.onShake(0.15);
    } else if (J > 8) {
      const p = e.body!.getPosition();
      audio.impact(clamp(J / 60, 0.1, 1), matInfo(e.mat).sound);
      this.fx.impactPuff(p.x, p.y, 0, 1, 0.3, matInfo(e.mat).debris);
    }
  }

  private lastRocketHit = 0;

  private rocketImpact(c: planck.Contact, other: Ent, J: number, rocketIsA: boolean) {
    const R = this.rocket;
    if (!R || R.dead) return;
    const wm = c.getWorldManifold(null);
    if (!wm) return;
    const nx = rocketIsA ? wm.normal.x : -wm.normal.x;
    const ny = rocketIsA ? wm.normal.y : -wm.normal.y;
    const p = wm.points[0] ?? R.ent.body!.getPosition();
    const body = R.ent.body!;
    const mR = body.getMass();
    const dv = J / mR;
    const f = R.facing();
    const noseHit = f.x * nx + f.y * ny > 0.72;
    const st = R.stats;
    const info = matInfo(other.kind === 'terrain' ? other.mat : other.mat);
    // knockback for the glove / generic shove
    if (other.body && other.body.isDynamic() && noseHit && st.knock > 1.05 && this.time - (other.hitCd ?? -9) > 0.25) {
      other.hitCd = this.time;
      const k = J * (st.knock - 1);
      const ob = other.body;
      this.actions.push(() => {
        ob.applyLinearImpulse(Vec2(nx * k, ny * k + k * 0.15), ob.getWorldCenter(), true);
        this.fx.ring(p.x, p.y, 0.2, 1.4, 0.25, 0xffe0e0);
        this.events.onText(p.x, p.y + 0.5, '뾰옹!', 'pop');
        audio.impact(0.6, 'rubber');
      });
    }
    // rocket self damage
    const safe = 8;
    if (dv > safe) {
      const dmg = (dv - safe) * 4.6 * info.hardness * 2 * (noseHit ? st.frontArmor : 1) / st.armor;
      if (dmg > 0.5) {
        this.actions.push(() => R.damage(dmg, p.x, p.y, 'crash', { mat: other.kind === 'terrain' ? other.mat : other.mat, speed: dv }));
      }
    }
    // damage the other thing
    if (other.breakable) {
      const thr = other.maxHp * 0.22;
      const punch = noseHit ? st.punch : 1;
      const JJ = J * punch;
      if (JJ >= thr) {
        other.hp -= JJ;
        if (other.hp <= 0) this.queueBreak(other, 'ram', 0, 0, p.x, p.y);
      }
    }
    if (other.onHit) other.onHit(J, R.ent);
    // feedback
    if (this.time - this.lastRocketHit > 0.08 && dv > 2) {
      this.lastRocketHit = this.time;
      const power = clamp(dv / 25, 0.05, 1);
      audio.impact(power, info.sound);
      this.fx.impactPuff(p.x, p.y, -nx, -ny, power, info.debris);
      if (dv > 9) {
        this.fx.sparkBurst(p.x, p.y, Math.round(power * 14), 0xffd070, 8);
        this.events.onShake(power * 0.5);
        this.events.onRocketHit(power);
      }
      if (dv > 16) this.events.onHitStop(0.05);
    }
  }

  private beginContact(c: planck.Contact) {
    const fa = c.getFixtureA();
    const fb = c.getFixtureB();
    const a = this.entOf(fa);
    const b = this.entOf(fb);
    if (!a || !b) return;
    // weak points (e.g. the blimp valve) react to the rocket's touch
    if (fa.getUserData() === 'weak' && this.isRocket(b) && a.alive) this.actions.push(() => a.data?.onWeak?.());
    if (fb.getUserData() === 'weak' && this.isRocket(a) && b.alive) this.actions.push(() => b.data?.onWeak?.());
    if (a.kind === 'water' || b.kind === 'water') {
      const w = a.kind === 'water' ? a : b;
      const o = a.kind === 'water' ? b : a;
      if (o.kind === 'water') return;
      if (o.burning) {
        o.burning = false;
        o.heat = 0;
        audio.sizzle();
        this.fx.impactPuff(w.body!.getPosition().x, w.body!.getPosition().y, 0, 1, 0.4, 0xeeeeee);
      }
      // a loose object shoved by water keeps 'water' as its chain cause (R-06)
      if (o.alive && o.body?.isDynamic() && o.kind !== 'rocket' && !this.hintAlive(o)) {
        o.hint = 'water';
        o.hintT = this.time;
      }
      if (o.soakMax > 0 && !w.data?.soaked && o.alive) {
        w.data = { soaked: true };
        o.soak++;
        if (o.soak % 6 === 0) audio.drip();
        if (o.soak >= o.soakMax) this.queueBreak(o, 'water');
      }
      return;
    }
    if (a.kind === 'spring' || b.kind === 'spring') {
      const s = a.kind === 'spring' ? a : b;
      const o = a.kind === 'spring' ? b : a;
      if (o.body && o.body.isDynamic()) {
        const ang = s.body!.getAngle();
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        const ob = o.body;
        this.actions.push(() => {
          const v = ob.getLinearVelocity();
          const vn = v.x * nx + v.y * ny;
          const target = (s.data?.power ?? 26) * (this.isRocket(o) ? 1 : 0.7);
          const add = Math.max(0, target - vn);
          ob.setLinearVelocity(Vec2(v.x + nx * add, v.y + ny * add));
          const p = s.body!.getPosition();
          audio.boing(1.2);
          this.fx.ring(p.x, p.y + 0.4, 0.4, 2.5, 0.35, 0xfff0a0, true);
          if (s.obj) s.data.squash = 1;
          if (this.isRocket(o)) this.events.onText(p.x, p.y + 1.5, '뿅!', 'pop');
        });
      }
    }
  }

  // ================================================================== breaking
  /** Run something after the current physics step (safe to create/destroy bodies). */
  queueAction(fn: () => void) {
    this.actions.push(fn);
  }

  queueBreak(e: Ent, cause: Cause, vx = 0, vy = 0, hx?: number, hy?: number) {
    if (!e.alive || e.data?.queued) return;
    e.data = { ...(e.data || {}), queued: true };
    this.breakQ.push({ e, cause, vx, vy, hx, hy });
  }

  private processBreaks() {
    const q = this.breakQ;
    this.breakQ = [];
    for (const it of q) this.breakEnt(it.e, it.cause, it.vx ?? 0, it.vy ?? 0, it.hx, it.hy);
  }

  breakEnt(e: Ent, cause: Cause, ivx = 0, ivy = 0, hx?: number, hy?: number) {
    if (!e.alive) return;
    const body = e.body!;
    const p = body.getPosition();
    const ang = body.getAngle();
    const v = body.getLinearVelocity();
    const info = matInfo(e.mat);
    e.alive = false;
    // anything this was holding up inherits a special cause (boom/device/water/fire)
    this.propagateHint([body], cause === 'ram' && this.hintAlive(e) ? e.hint! : cause);
    // detach ropes attached to this ent
    for (const r of this.ropes) if (r.alive && (r.b === e || r.a === body)) this.cutRope(r, false);
    this.pw.destroyBody(body);
    e.body = null;
    if (e.obj) {
      this.scene.remove(e.obj);
      disposeTree(e.obj);
    }
    // ---- debris
    if (!e.noDebris) {
      const glass = e.mat === 'glass';
      const nx = clamp(Math.round(e.w / (glass ? 0.35 : 0.55)), 1, glass ? 5 : 4);
      const ny = clamp(Math.round(e.h / (glass ? 0.35 : 0.55)), 1, glass ? 5 : 4);
      const pw = e.w / nx;
      const ph = e.h / ny;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const total = nx * ny;
      const step = total > 12 ? 2 : 1;
      let k = 0;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          if (k++ % step) continue;
          const lx = -e.w / 2 + pw * (i + 0.5);
          const ly = -e.h / 2 + ph * (j + 0.5);
          const wx = p.x + lx * ca - ly * sa;
          const wy = p.y + lx * sa + ly * ca;
          let dvx = v.x + ivx + grand(-2, 2);
          let dvy = v.y + ivy + grand(-1, 3);
          if (hx !== undefined && hy !== undefined) {
            const dx = wx - hx;
            const dy = wy - hy;
            const d = Math.max(0.3, len(dx, dy));
            dvx += (dx / d) * 2.5;
            dvy += (dy / d) * 2.5;
          }
          this.spawnDebris(wx, wy, pw * grand(0.75, 0.95), ph * grand(0.75, 0.95), ang + grand(-0.3, 0.3), e.mat, dvx, dvy, Math.min(e.depth, 1.4));
        }
    }
    this.fx.chipsBurst(p.x, p.y, Math.min(24, 6 + Math.round(e.w * e.h * 3)), info.debris, 7, 0.18);
    this.fx.impactPuff(p.x, p.y, 0, 1, 0.7, info.debris);
    audio.crunch(e.kind === 'target' ? (e.data?.sound ?? info.sound) : info.sound, e.maxHp > 40);
    this.stats.broken++;
    // coins / score
    if (e.coins) {
      for (let i = 0; i < e.coins; i++) {
        const a = grand(0, Math.PI * 2);
        this.addCoin(p.x, p.y, 10, true, Math.cos(a) * grand(3, 8), Math.sin(a) * grand(3, 9) + 3);
      }
    }
    e.onBreak?.(cause, e);
    this.events.onBreak(e, cause);
    if (e.isTarget && !this.targetDone && this.ledgerOpen) {
      this.targetDone = true;
      this.events.onTarget(e, cause);
    }
  }

  spawnDebris(x: number, y: number, w: number, h: number, ang: number, mat: string, vx: number, vy: number, depth = 1) {
    if (this.debris.length > 140) {
      const old = this.debris.shift()!;
      this.removeEnt(old);
    }
    w = Math.max(0.12, w);
    h = Math.max(0.12, h);
    const info = matInfo(mat);
    const e = this.baseEnt('debris', mat, w, h);
    e.isStatic = false;
    e.life = 0;
    e.maxLife = mat === 'glass' ? grand(1.2, 2.2) : grand(4.5, 7);
    e.flammable = false;
    const body = this.pw.createBody({
      type: 'dynamic', position: Vec2(x, y), angle: ang, linearVelocity: Vec2(vx, vy), angularVelocity: grand(-8, 8), linearDamping: 0.05, angularDamping: 0.3,
    });
    body.createFixture({
      shape: new planck.Box(w / 2, h / 2),
      density: Math.max(0.3, info.density * 0.6),
      friction: 0.6,
      restitution: 0.15,
      filterCategoryBits: CAT.DEBRIS,
      filterMaskBits: CAT.STATIC | CAT.DYN | CAT.DEBRIS | CAT.WATER,
    });
    body.setUserData(e);
    e.body = body;
    e.obj = blockMesh(w, h, depth * grand(0.6, 1), mat);
    e.obj.position.set(x, y, grand(-0.3, 0.3));
    this.debris.push(e);
    this.register(e);
    return e;
  }

  removeEnt(e: Ent) {
    if (e.body) {
      this.pw.destroyBody(e.body);
      e.body = null;
    }
    e.alive = false;
    if (e.obj) {
      this.scene.remove(e.obj);
      disposeTree(e.obj);
    }
    const i = this.ents.indexOf(e);
    if (i >= 0) this.ents.splice(i, 1);
    if (e.kind === 'water') {
      const j = this.water.indexOf(e);
      if (j >= 0) this.water.splice(j, 1);
    }
    if (e.kind === 'debris') {
      const j = this.debris.indexOf(e);
      if (j >= 0) this.debris.splice(j, 1);
    }
  }

  cutRope(r: Rope, fx = true) {
    if (!r.alive) return;
    r.alive = false;
    if (r.joint) {
      this.pw.destroyJoint(r.joint);
      r.joint = null;
    }
    r.mesh.visible = false;
    if (r.b.alive) {
      if (r.cutCause === 'device') r.b.device = true;
      r.b.hint = r.cutCause;
      r.b.hintT = this.time;
      r.b.body?.setAwake(true);
    }
    if (fx) {
      const pa = r.a.getWorldPoint(r.la);
      const pb = r.b.body ? r.b.body.getWorldPoint(r.lb) : pa;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      this.fx.sparkBurst(mx, my, 10, 0xfff0c0, 6);
      audio.pop();
      this.events.onText(mx, my, '싹둑!', 'cut');
    }
  }

  // ================================================================== explosions
  explode(x: number, y: number, radius: number, power: number, cause: Cause = 'boom') {
    const hits: Ent[] = [];
    this.pw.queryAABB({ lowerBound: Vec2(x - radius, y - radius), upperBound: Vec2(x + radius, y + radius) } as any, (f) => {
      const e = this.entOf(f);
      if (e && e.alive && !hits.includes(e)) hits.push(e);
      return true;
    });
    for (const e of hits) {
      const b = e.body!;
      const c = b.getWorldCenter();
      // distance to the closest point of the body's bounds (tall poles count!)
      let d = Infinity;
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        const bb = f.getAABB(0);
        const qx = clamp(x, bb.lowerBound.x, bb.upperBound.x);
        const qy = clamp(y, bb.lowerBound.y, bb.upperBound.y);
        d = Math.min(d, len(qx - x, qy - y));
      }
      const dx = c.x - x;
      const dy = c.y - y;
      if (d > radius) continue;
      const fall = 1 - d / radius;
      const dc = len(dx, dy);
      const nx = dc > 0.01 ? dx / dc : 0;
      const ny = dc > 0.01 ? dy / dc : 1;
      if (b.isDynamic()) {
        const imp = power * fall * (e.kind === 'rocket' ? 0.35 : e.kind === 'water' ? 0.02 : 0.5);
        b.applyLinearImpulse(Vec2(nx * imp, ny * imp + imp * 0.2), c, true);
      }
      if (e.kind === 'rocket') {
        this.rocket?.damage(power * fall * 0.55, x, y, 'boom');
        continue;
      }
      if (b.isDynamic()) this.propagateHint([b], cause);
      if (e.breakable) {
        e.hp -= power * 2 * fall;
        if (e.hp <= 0) this.queueBreak(e, cause, nx * 6, ny * 6, x, y);
      }
      if (e.flammable) e.heat += fall * 0.8;
    }
    for (const r of this.ropes) {
      if (!r.alive) continue;
      const pa = r.a.getWorldPoint(r.la);
      const pb = r.b.body ? r.b.body.getWorldPoint(r.lb) : pa;
      if (distPointSeg(x, y, pa.x, pa.y, pb.x, pb.y).d < radius * 0.6 && r.strength < power) this.cutRope(r);
    }
    for (const f of this.fires) if (f.lit && len(f.x - x, f.y - y) < radius) f.lit = false;
    this.fx.explosion(x, y, radius / 5);
    audio.explosion(radius / 5);
    this.events.onShake(clamp(radius / 6, 0.4, 1));
    this.events.onHitStop(0.06);
  }

  // ================================================================== rocket exhaust
  exhaust(dt: number) {
    const R = this.rocket;
    if (!R || R.dead || R.throttle < 0.05) return;
    const nz = R.nozzleWorld();
    const st = R.stats;
    const reach = (st.exhaust === 'powder' ? 7.5 : st.exhaust === 'torch' ? 4.5 : 4) * (0.5 + 0.5 * R.throttle);
    const angs = [-0.16, 0, 0.16];
    const baseA = Math.atan2(nz.dy, nz.dx);
    for (const da of angs) {
      const a = baseA + da;
      const ex = nz.x + Math.cos(a) * reach;
      const ey = nz.y + Math.sin(a) * reach;
      let hitF: planck.Fixture | null = null;
      let hitP = Vec2(0, 0);
      let hitFrac = 1;
      this.pw.rayCast(Vec2(nz.x, nz.y), Vec2(ex, ey), (f, pt, _n, frac) => {
        const e = this.entOf(f);
        if (!e || e.kind === 'rocket' || f.isSensor()) return -1;
        hitF = f;
        hitP = Vec2(pt);
        hitFrac = frac;
        return frac;
      });
      if (!hitF) continue;
      const e = this.entOf(hitF)!;
      const strength = (1 - hitFrac) * R.throttle;
      const b = (hitF as planck.Fixture).getBody();
      if (b.isDynamic()) {
        const F = st.push * strength * (e.kind === 'water' ? 0.05 : 1) / angs.length;
        b.applyForce(Vec2(Math.cos(a) * F * 8, Math.sin(a) * F * 8), hitP, true);
      } else if (grand() < 0.35 * strength) {
        // ground effect dust
        const col = st.exhaust === 'powder' ? 0xffffff : 0xd8cfc0;
        this.fx.smoke.spawn({ x: hitP.x, y: hitP.y, z: grand(-0.5, 0.5), vx: -Math.sin(a) * grand(-6, 6), vy: grand(1, 3), life: grand(0.5, 1.0), s0: 0.2, s1: grand(0.7, 1.2), c0: col, c1: 0xf4f0e8, drag: 3, puff: true });
      }

      if (st.exhaust === 'powder' && (e.burning || e.heat > 0)) {
        if (e.burning) {
          audio.sizzle();
          this.events.onText(hitP.x, hitP.y + 0.5, '치익~', 'cool');
        }
        e.burning = false;
        e.heat = 0;
      }
    }
    // torch: heat anything flammable inside the flame cone
    if (st.exhaust === 'torch') {
      const seen = new Set<Ent>();
      for (const t of [0.6, 1.6, 2.8, 4.0, 5.2]) {
        const d = t * (0.55 + 0.45 * R.throttle);
        const px = nz.x + nz.dx * d;
        const py = nz.y + nz.dy * d;
        const rr = 0.5 + t * 0.15;
        this.pw.queryAABB({ lowerBound: Vec2(px - rr, py - rr), upperBound: Vec2(px + rr, py + rr) } as any, (f) => {
          const e = this.entOf(f);
          if (!e || !e.alive || !e.flammable || seen.has(e) || f.isSensor()) return true;
          seen.add(e);
          e.heat += dt * 2.6 * (0.35 + 0.65 * R.throttle);
          if (grand() < 0.3) this.fx.fire(px, py, 0.4, 0.5);
          return true;
        });
      }
    }
    // rope burning / fire zones
    for (const r of this.ropes) {
      if (!r.alive) continue;
      const pa = r.a.getWorldPoint(r.la);
      const pb = r.b.body ? r.b.body.getWorldPoint(r.lb) : pa;
      const mid = distPointSeg(nz.x + nz.dx * reach * 0.5, nz.y + nz.dy * reach * 0.5, pa.x, pa.y, pb.x, pb.y);
      if (mid.d < reach * 0.55 && st.exhaust === 'torch' && r.flammable) {
        r.heat += dt * 1.4 * R.throttle;
        if (grand() < 0.5) this.fx.fire(mid.cx, mid.cy, 0.2, 0.5);
        if (r.heat >= 1) this.cutRope(r);
      }
    }
    if (st.exhaust === 'powder') {
      for (const f of this.fires) {
        if (!f.lit) continue;
        const d = distPointSeg(f.x, f.y + 0.5, nz.x, nz.y, nz.x + nz.dx * reach, nz.y + nz.dy * reach);
        if (d.d < f.w * 0.5 + 1) {
          f.lit = false;
          audio.sizzle();
          this.events.onText(f.x, f.y + 1.5, '불 끄기!', 'cool');
        }
      }
    }
    if (st.exhaust === 'torch') {
      // torch can ignite unlit fire places too
      for (const f of this.fires) {
        if (f.lit) continue;
        const d = distPointSeg(f.x, f.y + 0.5, nz.x, nz.y, nz.x + nz.dx * reach, nz.y + nz.dy * reach);
        if (d.d < f.w * 0.5 + 0.6) f.lit = true;
      }
    }
  }

  // ================================================================== step
  step(dt: number) {
    this.time += dt;
    // store previous transforms
    for (const e of this.ents) {
      if (e.body && !e.isStatic) {
        const p = e.body.getPosition();
        e.px = p.x;
        e.py = p.y;
        e.pa = e.body.getAngle();
      }
    }
    // reset punch flags on things that were broken already (they're gone) – fine
    this.applyForces(dt);
    for (const h of this.stepHooks) h(dt);
    this.pw.step(dt, 8, 3);
    for (const a of this.actions) a();
    this.actions.length = 0;
    this.processBreaks();
    this.updateRopes();
    this.updateEmitters(dt);
    this.updateLifetimes(dt);
    this.updateFire(dt);
    this.updatePickups(dt);
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.t <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.t > this.time);
        for (const t of due) t.fn();
      }
    }
  }

  private applyForces(dt: number) {
    // buoyancy (balloons, blimps)
    for (const e of this.ents) {
      if (e.buoyancy && e.body && e.alive) {
        const m = e.body.getMass();
        e.body.applyForceToCenter(Vec2(0, m * GRAVITY * e.buoyancy), true);
      }
    }
    // wind zones (each zone tests every body it overlaps on its own — order never hides a zone)
    for (const z of this.winds) {
      if (!z.active) continue;
      const done = new Set<planck.Body>();
      const ca = Math.cos(z.ang);
      const sa = Math.sin(z.ang);
      const cx = z.x + ca * z.len * 0.5;
      const cy = z.y + sa * z.len * 0.5;
      const rad = Math.max(z.len, z.wid) * 0.6;
      this.pw.queryAABB({ lowerBound: Vec2(cx - rad, cy - rad), upperBound: Vec2(cx + rad, cy + rad) } as any, (f) => {
        const b = f.getBody();
        if (!b.isDynamic()) return true;
        const e = b.getUserData() as Ent;
        if (!e || done.has(b)) return true;
        const p = b.getWorldCenter();
        const a = windAccel(z, p.x, p.y, e.kind);
        if (!a) return true;
        done.add(b);
        const m = b.getMass();
        b.applyForceToCenter(Vec2(a.x * m, a.y * m), true);
        return true;
      });
    }
  }

  private updateRopes() {
    const R = this.rocket;
    for (const r of this.ropes) {
      if (!r.alive) continue;
      if (!r.b.alive || !r.b.body) {
        this.cutRope(r, false);
        continue;
      }
      const pa = r.a.getWorldPoint(r.la);
      const pb = r.b.body.getWorldPoint(r.lb);
      // rocket slicing through the rope
      if (R && !R.dead) {
        const rp = R.ent.body!.getPosition();
        const v = R.ent.body!.getLinearVelocity();
        const sp = len(v.x, v.y);
        const d = distPointSeg(rp.x, rp.y, pa.x, pa.y, pb.x, pb.y);
        if (d.d < R.stats.radius + 0.25 && d.t > 0.02 && d.t < 0.98) {
          const momentum = sp * R.ent.body!.getMass() * (R.stats.punch > 2 ? 2 : 1);
          if (sp > 3 && momentum >= r.strength) this.cutRope(r);
          else if (r.strength > 0 && (r as any)._clank !== Math.floor(this.time * 3)) {
            (r as any)._clank = Math.floor(this.time * 3);
            audio.impact(0.4, 'metal');
            this.fx.sparkBurst(d.cx, d.cy, 6, 0xffffff, 4);
            this.events.onText(d.cx, d.cy, '팅! (강철 케이블)', 'warn');
          }
        }
      }
    }
  }

  private updateEmitters(dt: number) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const em = this.emitters[i];
      em.time -= dt;
      if (em.time <= 0) {
        if (em.wind) em.wind.active = false;
        this.emitters.splice(i, 1);
        continue;
      }
      em.acc += em.rate * dt;
      while (em.acc >= 1) {
        em.acc -= 1;
        const a = Math.atan2(em.dy, em.dx) + grand(-em.spread, em.spread);
        const sp = em.speed * grand(0.85, 1.1);
        this.spawnWater(em.x + grand(-0.2, 0.2), em.y + grand(-0.2, 0.2), Math.cos(a) * sp, Math.sin(a) * sp);
      }
      if (grand() < 0.3) this.fx.splash(em.x, em.y, 2, em.speed * 0.4);
    }
  }

  private updateLifetimes(dt: number) {
    const dead: Ent[] = [];
    for (const e of this.ents) {
      if (e.maxLife === undefined) continue;
      e.life! += dt;
      if (e.life! >= e.maxLife) dead.push(e);
      else if (e.obj && e.maxLife - e.life! < 0.6) {
        const s = Math.max(0.01, (e.maxLife - e.life!) / 0.6);
        e.obj.scale.setScalar(s);
      }
      // kill stuff that fell out of the world
      if (e.body && e.body.getPosition().y < this.bounds.minY - 20) dead.push(e);
    }
    for (const e of dead) this.removeEnt(e);
  }

  private updateFire(dt: number) {
    this.fireTick += dt;
    // static fire zones
    for (const f of this.fires) {
      if (!f.lit) {
        if (f.obj) f.obj.userData.lit = false;
        continue;
      }
      f.t += dt;
      if (grand() < 0.9) this.fx.fire(f.x, f.y + 0.3, f.w, 1);
    }
    for (const e of this.ents) {
      if (!e.alive || !e.body) continue;
      if (e.burning) {
        const p = e.body.getPosition();
        if (grand() < 0.8) this.fx.fire(p.x, p.y + e.h * 0.3, e.w, 0.8);
      }
    }
    if (this.fireTick < 0.1) return;
    const tick = this.fireTick;
    this.fireTick = 0;
    const burning: Ent[] = [];
    for (const e of this.ents) {
      if (!e.alive || !e.body) continue;
      if (e.burning) {
        burning.push(e);
        e.burnT += tick;
        if (e.breakable) {
          e.hp -= tick * Math.max(4, e.maxHp * 0.12);
          if (e.hp <= 0) this.queueBreak(e, 'fire');
        }
        if (e.kind === 'fireworks' && e.burnT > 1.0) this.queueBreak(e, 'boom');
        if (e.data?.fuse && e.burnT > e.data.fuse) this.queueBreak(e, 'fire');
        if (e.kind === 'balloon') this.queueBreak(e, 'fire');
      } else if (e.flammable) {
        if (e.heat > 0.25 && grand() < e.heat) {
          const p = e.body.getPosition();
          this.fx.smoke.spawn({ x: p.x + grand(-e.w, e.w) * 0.4, y: p.y + e.h * 0.4, z: 0.4, vx: grand(-0.4, 0.4), vy: grand(1, 2), life: 1, s0: 0.1, s1: 0.5, c0: 0x777066, c1: 0xb0aaa0, drag: 1, puff: true });
        }
        if (e.heat >= 1) {
          e.burning = true;
          e.burnT = 0;
          const p = e.body.getPosition();
          this.events.onText(p.x, p.y + 0.6, '화르륵!', 'fire');
        } else e.heat = Math.max(0, e.heat - tick * 0.15);
      }
    }
    // spread heat from burning ents and fire zones to nearby flammables
    const sources: { x: number; y: number; r: number }[] = burning.map((e) => {
      const p = e.body!.getPosition();
      return { x: p.x, y: p.y, r: Math.max(e.w, e.h) * 0.5 + 0.9 };
    });
    for (const f of this.fires) if (f.lit) sources.push({ x: f.x, y: f.y + 0.6, r: f.w * 0.5 + 0.9 });
    if (sources.length) {
      for (const e of this.ents) {
        if (!e.alive || !e.body || !e.flammable || e.burning) continue;
        const p = e.body.getPosition();
        const ext = Math.max(e.w, e.h) * 0.5;
        for (const s of sources) {
          if (len(p.x - s.x, p.y - s.y) < s.r + ext) {
            e.heat += tick * 0.55;
            break;
          }
        }
      }
    }
    // rocket touching fire
    const R = this.rocket;
    if (R && !R.dead) {
      const rp = R.ent.body!.getPosition();
      for (const s of sources) {
        if (len(rp.x - s.x, rp.y - s.y) < s.r + R.stats.radius) {
          R.damage(14 * tick, rp.x, rp.y, 'fire');
          if (grand() < 0.3) audio.sizzle();
          break;
        }
      }
    }
    if (burning.length) audio.fireLoop();
  }

  private updatePickups(dt: number) {
    const R = this.rocket;
    const rp = R && !R.dead ? R.ent.body!.getPosition() : null;
    const pickR = R ? R.stats.radius + 0.75 : 1;
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.t += dt;
      if (p.loose) {
        p.delay = Math.max(0, (p.delay ?? 0) - dt);
        p.vx *= Math.exp(-2.2 * dt);
        p.vy *= Math.exp(-2.2 * dt);
        p.vy -= 2 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (!rp || !this.ledgerOpen) continue;
      const dx = rp.x - p.x;
      const dy = rp.y - p.y;
      const d = len(dx, dy);
      if (p.kind === 'coin' && d < 3.2 && !(p.delay! > 0)) {
        // magnet
        const k = (1 - d / 3.2) * 26 * dt;
        p.x += (dx / Math.max(d, 0.01)) * k;
        p.y += (dy / Math.max(d, 0.01)) * k;
      }
      if (d < pickR + (p.kind === 'gear' ? 0.4 : 0) && !(p.delay! > 0)) {
        p.taken = true;
        if (p.obj) this.scene.remove(p.obj);
        if (p.kind === 'coin') {
          this.stats.coins += p.value;
          audio.coin();
          this.fx.sparkle(p.x, p.y);
          this.events.onCoin(p.value, p.x, p.y);
        } else if (p.kind === 'gear') {
          if (p.owned) {
            audio.coin();
            this.fx.sparkle(p.x, p.y, 0xcfd8e0);
          } else {
            audio.gear();
            this.fx.sparkle(p.x, p.y, 0xffe060);
            this.fx.confettiBurst(p.x, p.y, 30, 8);
          }
          this.events.onGear(p.id!, p.x, p.y, !!p.owned);
        } else {
          audio.fuel();
          this.fx.sparkle(p.x, p.y, 0xffa040);
          this.events.onFuel(p.value, p.x, p.y);
        }
      }
    }
  }

  // ================================================================== visuals
  syncVisuals(alpha: number, dtFrame: number) {
    animateContact(this.time);
    for (const e of this.ents) {
      // damage states: cracks appear as a breakable loses hp (Q-CI-02)
      if (e.breakable && e.obj && e.alive && !e.round && e.maxHp < 9999) {
        const r = e.hp / e.maxHp;
        const lv = r < 0.34 ? 2 : r < 0.7 ? 1 : 0;
        if (lv !== (e.crackLv ?? 0)) {
          e.crackLv = lv;
          setCracks(e.obj, e.w, e.h, e.depth / 2 + 0.03, lv as 0 | 1 | 2);
        }
      }
      if (!e.body || !e.obj || e.isStatic) continue;
      const p = e.body.getPosition();
      const a = e.body.getAngle();
      e.obj.position.x = e.px + (p.x - e.px) * alpha;
      e.obj.position.y = e.py + (p.y - e.py) * alpha;
      e.obj.rotation.z = e.pa + wrapAngle(a - e.pa) * alpha;
    }
    // water instances
    const m = new THREE.Matrix4();
    let n = 0;
    for (const w of this.water) {
      if (!w.body) continue;
      const p = w.body.getPosition();
      const v = w.body.getLinearVelocity();
      const sp = Math.min(1.8, 1 + len(v.x, v.y) * 0.04);
      const ang = Math.atan2(v.y, v.x);
      const fade = w.maxLife! - w.life! < 1 ? Math.max(0.05, w.maxLife! - w.life!) : 1;
      m.makeRotationZ(ang);
      m.scale(tmpV3.set(sp * fade, fade / Math.sqrt(sp), fade));
      m.setPosition(p.x, p.y, 0);
      this.waterMesh.setMatrixAt(n++, m);
    }
    this.waterMesh.count = n;
    this.waterMesh.instanceMatrix.needsUpdate = true;
    // coins
    n = 0;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    for (const p of this.pickups) {
      if (p.kind === 'coin') {
        if (p.taken) continue;
        e.set(0.25, p.t * 3, 0);
        q.setFromEuler(e);
        tmpV3.set(p.x, p.y + Math.sin(p.t * 2.5) * 0.08, 0);
        m.compose(tmpV3, q, s);
        if (n < 600) this.coinMesh.setMatrixAt(n++, m);
      } else if (p.obj && !p.taken) {
        p.obj.rotation.y = p.t * 2;
        p.obj.position.y = p.y + Math.sin(p.t * 2) * 0.15;
      }
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    // ropes
    for (const r of this.ropes) {
      if (!r.alive || !r.b.body) continue;
      const pa = r.a.getWorldPoint(r.la);
      const pb = r.b.body.getWorldPoint(r.lb);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const l = len(dx, dy);
      r.mesh.position.set((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, 0);
      r.mesh.scale.set(1, l, 1);
      r.mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
      if (r.heat > 0) (r.mesh.material as THREE.MeshStandardMaterial).color.set(r.color).lerp(new THREE.Color('#401a08'), Math.min(1, r.heat));
    }
    // winds (fan blades)
    for (const z of this.winds) {
      if (z.blades) z.blades.rotation.z -= dtFrame * (z.active ? 22 : 1);
      if (z.active && z.water !== true && Math.random() < 0.5) {
        const ca = Math.cos(z.ang);
        const sa = Math.sin(z.ang);
        const off = rand(-z.wid / 2, z.wid / 2);
        const along = rand(0, z.len * (z.blades ? 0.3 : 1));
        this.fx.sparks.spawn({
          x: z.x + ca * along - sa * off, y: z.y + sa * along + ca * off, z: rand(-1, 1),
          vx: ca * z.power * 0.9, vy: sa * z.power * 0.9, life: rand(0.5, 1.0), s0: 0.25, s1: 0.1, c0: 0x9ad8ff, c1: 0xffffff, stretch: 0.15,
        });
      }
    }
    // spring squash
    for (const en of this.ents) {
      if (en.kind === 'spring' && en.obj && en.data?.squash) {
        en.data.squash = Math.max(0, en.data.squash - dtFrame * 4);
        const s = en.data.squash;
        en.obj.scale.y = 1 - Math.sin(s * Math.PI * 2) * 0.25 * s;
      }
    }
  }
}
