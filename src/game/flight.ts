import * as THREE from 'three';
import * as planck from 'planck';
import { Cause, Ent, GameWorld, WorldEvents } from './world';
import { LevelBuilder, StageDef } from './level';
import { Rocket, ControlInput } from './rocket';
import { Effects } from '../render/effects';
import { createLights, createSky, Renderer } from '../render/renderer';
import { Kid } from '../render/models/kid';
import * as P from '../render/models/props';
import { FlightInput } from '../core/input';
import { audio } from '../core/audio';
import { Loadout } from '../data/parts';
import { clamp, damp, easeInOutCubic, easeOutCubic, len, lerp, rand } from '../core/math';
import { save, persist, stageProg } from '../core/save';
import type { UI } from '../ui/ui';

const Vec2 = planck.Vec2;
const FIXED = 1 / 60;

type Phase = 'intro' | 'ready' | 'jump' | 'boost' | 'fly' | 'success' | 'fail' | 'done';

export interface RunResult {
  success: boolean;
  stage: StageDef;
  cause: Cause | null;
  methodName: string | null;
  newMethod: boolean;
  coins: number;
  mischief: number;
  reward: number;
  perfect: number;
  total: number;
  gears: string[];
  broken: number;
  maxAlt: number;
  reason: string;
  firstClear: boolean;
}

export class Flight {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: GameWorld;
  builder: LevelBuilder;
  rocket: Rocket;
  kid = new Kid();
  fx = new Effects();
  phase: Phase = 'intro';
  phaseT = 0;
  private acc = 0;
  private timeScale = 1;
  private hitStop = 0;
  private slowmo = 0;
  private shake = 0;
  private cam = { x: 0, y: 0, vh: 16, tx: 0, ty: 0 };
  private sky: ReturnType<typeof createSky>;
  private lights: ReturnType<typeof createLights>;
  private seesaw = P.seesaw();
  private boardAng = 0.344;
  private boardTarget = 0.344;
  private perfect = false;
  private tappedEarly = false;
  private launchX = 0;
  private launchY = 0;
  private runCoins = 0;
  private mischief = 0;
  private gearsGot: string[] = [];
  private maxAlt = 0;
  private settleT = 0;
  private emptyT = 0;
  private endReason = '';
  private result: RunResult | null = null;
  private targetCause: Cause | null = null;
  private targetPos = { x: 0, y: 0 };
  private elapsed = 0;
  private boundsWarnT = 0;
  private controlHinted = false;
  private kidMood = 0;
  private lastHullPct = 1;
  private introFrom = { x: 0, y: 0 };

  constructor(public renderer: Renderer, public stage: StageDef, public loadout: Loadout, public input: FlightInput, public ui: UI, skipIntro = false) {
    const sc = this.scene;
    sc.environment = renderer.envTex;
    sc.environmentIntensity = 0.45;
    sc.fog = new THREE.Fog(stage.fog[0], stage.fog[1], stage.fog[2]);
    this.camera = new THREE.PerspectiveCamera(38, 0.5, 0.5, 700);
    this.sky = createSky(stage.sky);
    sc.add(this.sky.mesh);
    this.lights = createLights(sc, renderer.quality);
    sc.add(this.fx.group);
    const levelGroup = new THREE.Group();
    sc.add(levelGroup);
    const events: WorldEvents = {
      onBreak: (e, c) => this.onBreak(e, c),
      onTarget: (e, c) => this.onTarget(e, c),
      onCoin: (v, x, y) => {
        this.runCoins += v;
        this.ui.popWorld(this.toScreen(x, y), `+${v}`, 'coin');
      },
      onGear: (id, x, y) => this.onGear(id, x, y),
      onFuel: (a, x, y) => {
        this.rocket.fuel = Math.min(this.rocket.stats.fuel, this.rocket.fuel + a);
        this.rocket.outOfFuelWarned = false;
        this.ui.popWorld(this.toScreen(x, y), '연료 충전!', 'fuel');
      },
      onText: (x, y, t, s) => this.ui.popWorld(this.toScreen(x, y), t, s ?? 'pop'),
      onShake: (a) => (this.shake = Math.min(1.2, this.shake + a)),
      onHitStop: (s) => (this.hitStop = Math.max(this.hitStop, s)),
      onRocketHit: (p) => {
        this.ui.flashHurt(p);
        if (navigator.vibrate) navigator.vibrate(Math.round(20 + p * 50));
      },
    };
    this.world = new GameWorld(levelGroup, this.fx, events);
    this.builder = new LevelBuilder(this.world, levelGroup);
    stage.build(this.builder);
    this.world.bounds = stage.bounds;
    const T = this.world.targetEnt!;
    const tp = T.body!.getPosition();
    this.targetPos = { x: tp.x, y: tp.y };

    // --- launch pad: seesaw, crates, kid
    const L = this.builder.launch;
    this.launchX = L.x;
    this.launchY = L.y;
    this.seesaw.group.position.set(L.x, L.y, 0);
    this.seesaw.group.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
    sc.add(this.seesaw.group);
    const crates = P.crateStack();
    crates.position.set(L.x + 5.6, L.y, 0);
    crates.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
    sc.add(crates);
    this.world.addCircle({ x: L.x, y: L.y + 0.42, r: 0.42, mat: 'fabric', static: true, breakable: false, obj: null });
    this.world.addBox({ x: L.x + 5.6, y: L.y + 2.1, w: 1.5, h: 4.2, mat: 'cardboard', static: true, breakable: false, obj: null });
    this.kid.root.position.set(L.x + 5.6, L.y + 4.3, 0);
    this.kid.hips.rotation.y = -0.9;
    sc.add(this.kid.root);
    this.kid.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));

    // --- rocket on the board
    this.rocket = new Rocket(this.world, loadout, L.x - 2, L.y + 3, 0);
    this.rocket.body.setActive(false);
    this.rocket.onDamage = (a, k) => this.onRocketDamage(a, k);
    this.rocket.onDeath = () => this.onRocketDeath();
    this.rocket.onEmpty = () => {
      this.ui.banner('연료 바닥!', '관성으로 날아가자…', 'warn');
      this.kid.setFace('worried');
    };
    this.placeRocketOnBoard();

    this.ui.showHud(true);
    this.ui.setHud({ fuel: 1, hull: 1, coins: 0, gears: 0, alt: 0 });
    this.ui.setTarget(null);
    audio.musicMood = 'flight';

    if (skipIntro || save.seenIntro[stage.id]) {
      this.setPhase('ready');
      this.cam.x = this.cam.tx = L.x + 2;
      this.cam.y = this.cam.ty = L.y + 4;
      this.cam.vh = 15;
    } else {
      this.setPhase('intro');
      this.cam.x = this.targetPos.x;
      this.cam.y = this.targetPos.y + 2;
      this.cam.vh = 14;
      this.introFrom = { x: this.targetPos.x, y: this.targetPos.y + 2 };
      this.ui.showIntro(stage);
    }
    this.updateCamera(0, true);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    if (p === 'ready') {
      this.ui.hideIntro();
      this.ui.prompt('화면을 탭해서 점프!', true);
      this.kid.play('wave');
      this.kid.setFace('grin');
      save.seenIntro[this.stage.id] = true;
      persist();
    }
  }

  private placeRocketOnBoard() {
    const L = this.builder.launch;
    const a = this.boardAng;
    const lx = -2.0;
    const ly = 0.1 + -this.rocket.model.nozzleY;
    const px = L.x + lx * Math.cos(a) - ly * Math.sin(a);
    const py = L.y + 0.88 + lx * Math.sin(a) + ly * Math.cos(a);
    this.rocket.body.setTransform(Vec2(px, py), 0);
    this.rocket.ent.px = px;
    this.rocket.ent.py = py;
    this.rocket.ent.pa = 0;
  }

  toScreen(x: number, y: number) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.renderer.w, y: (-v.y * 0.5 + 0.5) * this.renderer.h, behind: v.z > 1 };
  }

  // ================================================================== events
  private onBreak(e: Ent, cause: Cause) {
    if (e.kind === 'debris' || e.kind === 'water') return;
    this.mischief += e.isTarget ? 0 : Math.max(2, Math.round(e.maxHp / 10));
    const p = e.obj ? e.obj.position : new THREE.Vector3();
    const s = this.toScreen(p.x, p.y);
    const words: Record<string, string[]> = {
      glass: ['와장창!', '쨍그랑!'],
      wood: ['우지끈!', '빠직!'],
      cardboard: ['푹!', '와작!'],
      brick: ['쾅!', '와르르!'],
      metal: ['쾅!!', '찌그덕!'],
      ceramic: ['쨍!', '와장창!'],
    };
    if (!e.isTarget && e.kind !== 'balloon' && e.kind !== 'fireworks' && Math.random() < 0.7) {
      const w = words[e.mat] ?? ['쾅!'];
      this.ui.popWorld(s, w[Math.floor(Math.random() * w.length)], 'smash');
    }
    void cause;
  }

  private onTarget(e: Ent, cause: Cause) {
    if (this.phase === 'done') return;
    // a kamikaze finish still counts if it happens right as the rocket dies
    if (this.phase === 'fail' && this.phaseT > 1.2) return;
    this.targetCause = cause;
    const p = e.obj?.position ?? new THREE.Vector3(this.targetPos.x, this.targetPos.y, 0);
    this.targetPos = { x: p.x, y: p.y };
    this.fx.confettiBurst(p.x, p.y, 160, 16);
    this.fx.celebrate(p.x, p.y);
    audio.fanfare();
    this.slowmo = 1.6;
    this.shake = 1;
    const m = this.stage.methods.find((mm) => mm.id === cause);
    this.ui.banner('장난 대성공!', m ? `${m.icon} ${m.name}` : '', 'win');
    this.kid.play('cheer');
    this.kid.setFace('grin');
    this.setPhase('success');
  }

  private onGear(id: string, x: number, y: number) {
    if (!save.gearsFound[id]) {
      save.gearsFound[id] = true;
      persist();
    }
    this.gearsGot.push(id);
    this.ui.banner('톱니바퀴 발견!', '차고에서 새 부품을 연구할 수 있어요', 'gear');
    this.ui.popWorld(this.toScreen(x, y), '⚙️', 'gear');
  }

  private onRocketDamage(a: number, kind: string) {
    if (a > 6) {
      this.kid.setFace('o');
      this.kidMood = 1.2;
    }
    void kind;
  }

  private onRocketDeath() {
    if (this.phase === 'success') return;
    this.endReason = '로켓 대파!';
    this.ui.banner('로켓 대파!', '다른 길이나 부품을 시험해보자', 'lose');
    this.kid.play('sad');
    this.kid.setFace('worried');
    audio.sad();
    this.setPhase('fail');
  }

  // ================================================================== update
  update(rawDt: number) {
    const inp = this.input;
    this.elapsed += rawDt;
    // pause/time-scale
    let scale = 1;
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      scale = 0.06;
    } else if (this.slowmo > 0) {
      this.slowmo -= rawDt;
      scale = this.slowmo > 0.6 ? 0.25 : lerp(1, 0.25, this.slowmo / 0.6);
    }
    this.timeScale = scale;
    const dt = rawDt * scale;
    this.phaseT += rawDt;

    switch (this.phase) {
      case 'intro':
        this.updateIntro(rawDt);
        break;
      case 'ready':
        if (inp.pressed || inp.tapped || inp.isKey('Space')) this.startJump();
        break;
      case 'jump':
        this.updateJump(rawDt);
        break;
    }

    // ---- control input
    const ctrl: ControlInput = { active: false, dx: 0, dy: 1, throttle: 0 };
    if (this.phase === 'boost' || this.phase === 'fly' || this.phase === 'success') {
      if (inp.active && inp.throttle > 0) {
        ctrl.active = true;
        ctrl.dx = -inp.jetX;
        ctrl.dy = inp.jetY;
        ctrl.throttle = inp.throttle;
      } else if (inp.pollKeys()) {
        ctrl.active = true;
        ctrl.dx = -inp.jetX;
        ctrl.dy = inp.jetY;
        ctrl.throttle = 1;
      }
    }
    if (this.phase === 'boost' && this.rocket.boosting <= 0) {
      this.setPhase('fly');
      if (!this.controlHinted) {
        this.controlHinted = true;
        this.ui.banner('조종 시작!', '끌어당긴 방향으로 연료 분사 → 반대로 가속', 'info');
      }
    }

    // ---- fixed physics
    const active = this.phase === 'boost' || this.phase === 'fly' || this.phase === 'success' || this.phase === 'fail';
    if (active) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED && steps < 5) {
        this.acc -= FIXED;
        steps++;
        if (!this.rocket.dead) this.rocket.step(FIXED, ctrl);
        this.world.exhaust(FIXED);
        this.softBounds();
        this.world.step(FIXED);
      }
      if (steps === 5) this.acc = 0;
    } else {
      // keep world asleep but animate fx
    }
    const alpha = active ? this.acc / FIXED : 1;
    this.world.syncVisuals(alpha, dt);
    if (!this.rocket.dead) {
      if (active) this.rocket.updateVisual(dt, alpha, this.fx);
      else {
        this.rocket.model.root.position.set(this.rocket.body.getPosition().x, this.rocket.body.getPosition().y, 0);
        this.rocket.model.root.rotation.z = this.rocket.body.getAngle();
      }
    }
    this.fx.update(dt);
    for (const f of this.builder.animated) f(dt, this.elapsed);

    // seesaw board
    this.boardAng = damp(this.boardAng, this.boardTarget, this.phase === 'jump' ? 4 : 40, rawDt);
    this.seesaw.board.rotation.z = this.boardAng;
    if (this.phase === 'ready' || this.phase === 'intro' || this.phase === 'jump') this.placeRocketOnBoard();

    // kid
    if (this.phase !== 'jump') {
      this.kid.spin.rotation.z = damp(this.kid.spin.rotation.z, 0, 10, rawDt);
    }
    if (this.kidMood > 0) {
      this.kidMood -= rawDt;
      if (this.kidMood <= 0 && this.phase === 'fly') this.kid.setFace('determined');
    }
    this.kid.update(rawDt, 0.5);

    // flight bookkeeping
    if (this.phase === 'fly' || this.phase === 'boost') this.flightChecks(rawDt);
    if (this.phase === 'success' && this.phaseT > 3.6) this.finish(true);
    if (this.phase === 'fail' && this.phaseT > 2.4) this.finish(false);

    this.updateCamera(rawDt, false);
    this.updateHud();
    inp.endFrame();
  }

  private updateIntro(dt: number) {
    const L = this.builder.launch;
    const t = this.phaseT;
    const hold = 2.0;
    if (t < hold) {
      this.cam.tx = this.introFrom.x;
      this.cam.ty = this.introFrom.y;
      this.cam.vh = 13;
    } else {
      const k = easeInOutCubic(clamp((t - hold) / 1.8, 0, 1));
      this.cam.tx = lerp(this.introFrom.x, L.x + 2, k);
      this.cam.ty = lerp(this.introFrom.y, L.y + 4, k);
      this.cam.vh = lerp(13, 15, k) + Math.sin(k * Math.PI) * 30;
    }
    if (t > hold + 1.9 || (t > 0.4 && (this.input.tapped || this.input.pressed))) {
      this.setPhase('ready');
    }
    void dt;
  }

  private startJump() {
    this.setPhase('jump');
    this.ui.prompt(null);
    this.kid.play('crouch');
    this.kid.setFace('determined');
    audio.unlock();
  }

  private updateJump(dt: number) {
    const L = this.builder.launch;
    const t = this.phaseT;
    const k = this.kid;
    const x0 = L.x + 5.6;
    const y0 = L.y + 4.3;
    const x1 = L.x + 2.15;
    const y1 = L.y + 0.88 + Math.sin(0.344) * 2.15 + 0.12;
    const tCrouch = 0.32;
    const tAir = 1.05;
    const tLand = tCrouch + tAir;
    if (t < tCrouch) {
      k.root.position.set(x0, y0, 0);
    } else if (t < tLand) {
      if (k.anim === 'crouch') {
        k.play('jump');
        audio.whoosh(true);
      }
      const s = (t - tCrouch) / tAir;
      const H = 6.5;
      k.root.position.x = lerp(x0, x1, s);
      k.root.position.y = lerp(y0, y1, s) + 4 * H * s * (1 - s);
      const flip = easeInOutCubic(clamp((s - 0.12) / 0.7, 0, 1));
      k.spin.rotation.z = flip * Math.PI * 2;
      if (s > 0.18 && s < 0.78) k.play('tuck');
      else if (s >= 0.78) k.play('stomp');
      // timing ring
      const ringT = clamp((s - 0.35) / 0.65, 0, 1);
      const sc = this.toScreen(x1, y1);
      this.ui.timingRing(sc.x, sc.y, ringT, s > 0.35);
      if (this.input.tapped || this.input.pressed || this.input.isKey('Space')) {
        if (s > 0.8 && !this.tappedEarly) {
          if (!this.perfect) {
            this.perfect = true;
            audio.perfect();
            this.ui.banner('완벽한 내려찍기!', '발사 속도 UP +30', 'perfect');
          }
        } else if (s > 0.35 && !this.perfect) this.tappedEarly = true;
      }
    } else {
      // IMPACT → launch
      this.ui.timingRing(0, 0, 0, false);
      k.root.position.set(x1, L.y + 0.88 - Math.sin(0.344) * 2.15 + 0.12, 0);
      k.spin.rotation.z = 0;
      k.play('crouch');
      this.boardTarget = -0.344;
      this.launch();
    }
    void dt;
  }

  private launch() {
    const L = this.builder.launch;
    const r = this.rocket;
    const body = r.body;
    // final pose on the flipped board end
    this.boardAng = -0.344;
    const lx = -2.0;
    const ly = 0.1 + -r.model.nozzleY;
    const a = this.boardAng;
    const px = L.x + lx * Math.cos(a) - ly * Math.sin(a);
    const py = L.y + 0.88 + lx * Math.sin(a) + ly * Math.cos(a) + 0.3;
    body.setActive(true);
    body.setTransform(Vec2(px, py), 0);
    body.setLinearVelocity(Vec2(0.4, this.perfect ? 18 : 13));
    body.setAngularVelocity(0);
    r.boosting = 2.2;
    r.invuln = 2.8;
    r.throttle = 1;
    this.setPhase('boost');
    // juice!
    this.fx.ring(L.x + 2.1, L.y + 0.2, 0.4, 3.5, 0.4, 0xfff4d0, true);
    this.fx.impactPuff(L.x + 2.1, L.y + 0.3, 0, 1, 1, 0xd8cfc0);
    this.fx.impactPuff(px, py - 1, 0, -1, 1, 0xffffff);
    this.fx.ring(px, py - 0.8, 0.5, 4, 0.5, 0xffd080, true);
    this.fx.flash(px, py - 1, 0.5);
    for (let i = 0; i < 14; i++) this.fx.smoke.spawn({ x: px + rand(-0.5, 0.5), y: py - 1, z: rand(-0.6, 0.6), vx: rand(-7, 7), vy: rand(-0.5, 2), life: rand(1, 1.8), s0: 0.3, s1: rand(1, 1.8), c0: 0xffffff, c1: 0xe8e0d0, drag: 2.5, puff: true });
    audio.boing(this.perfect ? 1.3 : 1);
    audio.ignite();
    this.shake = this.perfect ? 0.9 : 0.6;
    this.ui.popWorld(this.toScreen(L.x + 2.1, L.y + 1.2), '쿵!', 'smash');
    this.ui.popWorld(this.toScreen(px, py), this.perfect ? '슈우우웅!!' : '발사!', 'launch');
    if (this.perfect) this.runCoins += 30;
    this.ui.showJoyHint(true);
    setTimeout(() => this.ui.showJoyHint(false), 4200);
    setTimeout(() => {
      if (this.phase !== 'done') {
        this.kid.play('remote');
        this.kid.setFace('determined');
      }
    }, 400);
  }

  private softBounds() {
    const r = this.rocket;
    if (r.dead) return;
    const b = this.world.bounds;
    const p = r.body.getPosition();
    let fx = 0;
    let fy = 0;
    if (p.x < b.minX) fx = (b.minX - p.x) * 6;
    if (p.x > b.maxX) fx = (b.maxX - p.x) * 6;
    if (p.y > b.maxY) fy = (b.maxY - p.y) * 6;
    if (fx || fy) {
      const m = r.body.getMass();
      r.body.applyForceToCenter(Vec2(fx * m, fy * m), true);
      if (this.world.time - this.boundsWarnT > 3) {
        this.boundsWarnT = this.world.time;
        this.ui.banner('더 가면 엄마한테 혼나!', '', 'warn');
      }
    }
  }

  private flightChecks(dt: number) {
    const r = this.rocket;
    if (r.dead) return;
    const p = r.body.getPosition();
    this.maxAlt = Math.max(this.maxAlt, p.y - this.launchY);
    if (p.y < this.world.bounds.minY - 5) {
      this.endReason = '저 멀리 떨어졌다…';
      this.ui.banner('추락!', '', 'lose');
      this.setPhase('fail');
      return;
    }
    if (r.fuel <= 0 && r.boosting <= 0) {
      this.emptyT += dt;
      if (r.speed() < 0.8) this.settleT += dt;
      else this.settleT = Math.max(0, this.settleT - dt * 0.5);
      if (this.settleT > 1.4 || this.emptyT > 16) {
        this.endReason = '연료가 바닥났어요';
        this.ui.banner('연료 바닥!', '다른 길이나 부품을 시험해보자', 'lose');
        this.kid.play('sad');
        this.kid.setFace('worried');
        audio.sad();
        this.setPhase('fail');
      }
    }
  }

  private finish(success: boolean) {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const prog = stageProg(this.stage.id);
    const cause = success ? this.targetCause : null;
    const method = cause ? this.stage.methods.find((m) => m.id === cause) ?? null : null;
    const newMethod = !!(cause && !prog.methods[cause]);
    const firstClear = success && !prog.cleared;
    const reward = success ? this.stage.reward + (firstClear ? this.stage.reward : 0) + (newMethod && !firstClear ? Math.round(this.stage.reward * 0.5) : 0) : 0;
    const total = this.runCoins + this.mischief + reward;
    prog.runs++;
    if (success) {
      prog.cleared = true;
      if (cause) prog.methods[cause] = true;
    }
    prog.bestCoins = Math.max(prog.bestCoins, total);
    save.coins += total;
    persist();
    this.result = {
      success,
      stage: this.stage,
      cause,
      methodName: method ? `${method.icon} ${method.name}` : null,
      newMethod,
      coins: this.runCoins,
      mischief: this.mischief,
      reward,
      perfect: this.perfect ? 30 : 0,
      total,
      gears: this.gearsGot,
      broken: this.world.stats.broken,
      maxAlt: Math.round(this.maxAlt),
      reason: success ? '' : this.endReason,
      firstClear,
    };
    this.ui.showJoystick(null);
    this.ui.showResult(this.result);
  }

  // ================================================================== camera & hud
  private updateCamera(dt: number, snap: boolean) {
    const r = this.rocket;
    const c = this.cam;
    const aspect = this.renderer.w / this.renderer.h;
    if (this.phase === 'ready' || this.phase === 'jump') {
      const L = this.builder.launch;
      c.tx = L.x + 2;
      c.ty = L.y + (this.phase === 'jump' ? 5 : 4.2);
      c.vh = this.phase === 'jump' ? 17 : 15;
    } else if ((this.phase === 'boost' || this.phase === 'fly' || this.phase === 'fail') && !r.dead) {
      const p = r.model.root.position;
      const v = r.body.getLinearVelocity();
      const sp = len(v.x, v.y);
      const look = 0.3;
      c.tx = p.x + clamp(v.x * look, -4.5, 4.5);
      c.ty = p.y + clamp(v.y * look, -5.5, 5.5) + 1.0;
      const widthWanted = 12 + clamp(sp - 5, 0, 22) * 0.24;
      c.vh = clamp(widthWanted / Math.max(0.3, aspect), 19, 40);
      if (this.phase === 'boost') c.vh = Math.max(c.vh, 24);
    } else if (this.phase === 'success') {
      const k = clamp(this.phaseT / 0.6, 0, 1);
      const p = r.dead ? new THREE.Vector3(this.targetPos.x, this.targetPos.y, 0) : r.model.root.position;
      c.tx = lerp(p.x, this.targetPos.x, 0.65 * k);
      c.ty = lerp(p.y, this.targetPos.y, 0.65 * k);
      c.vh = 24;
    }
    const lam = this.phase === 'intro' ? 3 : this.phase === 'fly' || this.phase === 'boost' ? 6 : 4;
    if (snap) {
      c.x = c.tx;
      c.y = c.ty;
    } else {
      c.x = damp(c.x, c.tx, lam, dt);
      c.y = damp(c.y, c.ty, lam, dt);
    }
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = 38;
    const dist = c.vh / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const curDist = snap ? dist : damp(cam.position.z || dist, dist, 2.2, dt);
    // shake
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const s = this.shake * this.shake;
    const t = this.elapsed;
    const sx = (Math.sin(t * 61) + Math.sin(t * 37.3)) * 0.5 * s * 0.9;
    const sy = (Math.sin(t * 53.7) + Math.sin(t * 29.1)) * 0.5 * s * 0.9;
    const tilt = curDist * 0.1;
    cam.position.set(c.x + sx, c.y + tilt + sy, curDist);
    cam.lookAt(c.x + sx * 0.5, c.y + sy * 0.5, 0);
    cam.rotation.z += s * 0.02 * Math.sin(t * 43);
    cam.near = Math.max(0.5, curDist * 0.05);
    cam.far = curDist + 600;
    cam.updateProjectionMatrix();
    this.lights.follow(c.x, c.y);
    // sky follows the camera
    this.sky.mesh.position.set(c.x, c.y, -260);
    this.sky.mat.uniforms.camY.value = c.y;
    this.sky.mat.uniforms.time.value = this.elapsed;
  }

  private updateHud() {
    const r = this.rocket;
    if (this.phase === 'done') return;
    const fuelPct = r.stats.fuel > 0 ? r.fuel / r.stats.fuel : 0;
    const hullPct = clamp(r.hull / r.stats.hull, 0, 1);
    const p = r.dead ? { x: 0, y: 0 } : r.body.getPosition();
    this.ui.setHud({
      fuel: r.boosting > 0 ? 1 : fuelPct,
      hull: hullPct,
      coins: this.runCoins + this.mischief,
      gears: this.gearsGot.length,
      alt: Math.max(0, Math.round(p.y - this.launchY)),
      boosting: r.boosting > 0,
    });
    if (hullPct < this.lastHullPct - 0.001) this.lastHullPct = hullPct;
    // target indicator
    if (this.phase === 'fly' || this.phase === 'boost') {
      const T = this.world.targetEnt;
      if (T && T.alive && T.body) {
        const tp = T.body.getPosition();
        const sc = this.toScreen(tp.x, tp.y + T.h * 0.5 + 0.6);
        const d = r.dead ? 0 : len(tp.x - p.x, tp.y - p.y);
        this.ui.setTarget({ x: sc.x, y: sc.y, dist: Math.round(d), name: this.stage.targetName });
      } else this.ui.setTarget(null);
    } else this.ui.setTarget(null);
    // joystick visual
    const inp = this.input;
    if ((this.phase === 'fly' || this.phase === 'boost') && inp.active) this.ui.showJoystick({ ax: inp.ax, ay: inp.ay, px: inp.px, py: inp.py, t: inp.throttle, max: inp.maxDrag });
    else this.ui.showJoystick(null);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ui.showHud(false);
    this.ui.setTarget(null);
    this.ui.showJoystick(null);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && !(m.geometry as any).__shared) {
        // geometries are cheap to rebuild; free GPU memory
        m.geometry.dispose();
      }
    });
    this.fx.clear();
  }
}
