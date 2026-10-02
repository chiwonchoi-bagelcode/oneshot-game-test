import * as THREE from 'three';
import * as planck from 'planck';
import { Cause, Ent, GameWorld, WorldEvents } from './world';
import { LevelBuilder, StageDef } from './level';
import { Rocket, ControlInput, DamageInfo } from './rocket';
import { Effects } from '../render/effects';
import { createLights, createSky, Renderer } from '../render/renderer';
import { Kid, Face } from '../render/models/kid';
import * as P from '../render/models/props';
import { FlightInput } from '../core/input';
import { audio } from '../core/audio';
import { Loadout } from '../data/parts';
import { clamp, damp, easeInOutCubic, len, lerp, rand } from '../core/math';
import { save, persist, stageProg } from '../core/save';
import { track } from '../core/telemetry';
import { disposeTree } from '../render/geom';
import type { UI } from '../ui/ui';

const Vec2 = planck.Vec2;
const FIXED = 1 / 60;

/** Launch timing contract (R-02): the ring turns green exactly where a press becomes "perfect". */
export const JUMP = { crouch: 0.32, air: 1.05, ringFrom: 0.35, perfectFrom: 0.75 };
/** Ending contract (docs/spec-core.md §종료). */
export const END = { failGrace: 1.0, failHold: 2.4, escapeTime: 7, escapeDist: 16, successHoldNoRocket: 3.0, settleAfterEscape: 1.2 };

/** Names for causes a stage doesn't list as an official method (e.g. a kamikaze explosion). */
export const GENERIC_METHOD: Record<string, string> = {
  ram: '💥 정면 돌파', topple: '🪵 무너뜨리기', boom: '💣 자폭 돌격', water: '💦 물바다', fire: '🔥 불장난', device: '⚙️ 장치 활용', precision: '🎯 정밀 저격',
};

const MAT_NAME: Record<string, string> = {
  wood: '나무', darkwood: '나무', cardboard: '골판지', glass: '유리', brick: '벽돌', metal: '쇠', redmetal: '쇠', stone: '돌', concrete: '콘크리트',
  ceramic: '도자기', rubber: '고무', soft: '케이크', fabric: '천', grass: '땅', soil: '땅', darksoil: '땅', roof: '지붕', bluetile: '지붕', plaster: '벽',
  schoolwall: '벽', cloud: '구름', feltblue: '펠트', feltpink: '펠트', feltpurple: '펠트',
};

/**
 * intro → ready → jump → boost → fly ─┬─ target wrecked ─→ escape (bonus play) ─→ done
 *                                     └─ fail candidate (grace) ─→ fail confirmed ─→ done
 * `done` = settled: physics stopped, economy locked, only result actions remain.
 */
export type Phase = 'intro' | 'ready' | 'jump' | 'boost' | 'fly' | 'escape' | 'fail' | 'done';

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
  escapeBonus: number;
  escaped: boolean;
  total: number;
  gears: string[];
  gearsAgain: number;
  broken: number;
  maxAlt: number;
  reason: string;
  tip: string;
  firstClear: boolean;
  paid: boolean;
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
  attempt: number;
  private acc = 0;
  private hitStop = 0;
  private slowmo = 0;
  private shake = 0;
  private cam = { x: 0, y: 0, vh: 16, tx: 0, ty: 0 };
  private sky: ReturnType<typeof createSky>;
  private lights: ReturnType<typeof createLights>;
  private seesaw = P.seesaw();
  private boardAng = 0.344;
  private boardTarget = 0.344;
  perfect = false;
  tappedEarly = false;
  private launchX = 0;
  private launchY = 0;
  runCoins = 0;
  mischief = 0;
  gearsGot: string[] = [];
  gearsAgain = 0;
  private maxAlt = 0;
  private settleT = 0;
  private emptyT = 0;
  private endReason = '';
  private endTip = '';
  result: RunResult | null = null;
  targetCause: Cause | null = null;
  private targetPos = { x: 0, y: 0 };
  private elapsed = 0;
  private boundsWarnT = 0;
  private controlHinted = false;
  private kidMood = 0;
  private failConfirmed = false;
  private escaped = false;
  private escapeEndT = -1;
  private pendingTarget: { e: Ent; cause: Cause } | null = null;
  private pendingDeath = false;
  // onboarding coach (stage 1 first flights)
  private coachStep: string | null = null;
  private thrustT = 0;
  private coastT = 0;
  private brakeT = 0;
  // HUD portrait: a second little kid rendered live in a corner viewport
  private pScene = new THREE.Scene();
  private pCam = new THREE.PerspectiveCamera(26, 1, 0.1, 10);
  private pKid = new Kid();
  private pShake = 0;
  private sayCd = 0;
  private lastSay = '';
  private warnedFuel = false;
  private warnedHull = false;
  private saidNear = false;
  private coinStreak = 0;
  private coinStreakT = 0;
  private introFrom = { x: 0, y: 0 };
  private hits = { count: 0, big: 0 };

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
      onTarget: (e, c) => {
        // decided after the physics step together with any rocket death (C-170)
        if (!this.pendingTarget) this.pendingTarget = { e, cause: c };
      },
      onCoin: (v, x, y) => {
        this.runCoins += v;
        this.coinStreak++;
        this.coinStreakT = 1.2;
        if (this.coinStreak === 5) this.say('짤랑짤랑~ 부자다!', 'grin');
        this.ui.popWorld(this.toScreen(x, y), `+${v}`, 'coin');
      },
      onGear: (id, x, y, owned) => this.onGear(id, x, y, owned),
      onFuel: (a, x, y) => {
        this.rocket.fuel = Math.min(this.rocket.stats.fuel, this.rocket.fuel + a);
        this.rocket.outOfFuelWarned = false;
        // R-03: a refuel gives a brand new chance — empty/settle timers restart
        this.emptyT = 0;
        this.settleT = 0;
        this.warnedFuel = false;
        this.ui.popWorld(this.toScreen(x, y), '연료 충전!', 'fuel');
      },
      onText: (x, y, t, s) => this.ui.popWorld(this.toScreen(x, y), t, s ?? 'pop'),
      onShake: (a) => this.addShake(a),
      onHitStop: (s) => {
        if (!save.settings.reduceMotion) this.hitStop = Math.max(this.hitStop, s);
      },
      onRocketHit: (p) => {
        this.hits.count++;
        if (p > 0.5) this.hits.big++;
        if (save.settings.flash) this.ui.flashHurt(p);
        if (save.settings.vibration && navigator.vibrate) navigator.vibrate(Math.round(20 + p * 50));
      },
    };
    this.world = new GameWorld(levelGroup, this.fx, events);
    this.builder = new LevelBuilder(this.world, levelGroup);
    stage.build(this.builder);
    this.builder.finalize();
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

    // --- HUD portrait scene; a disc backdrop keeps the portrait round
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#ffe3a8', toneMapped: false }));
    this.pScene.add(disc);
    this.pScene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a50, 1.6));
    const pl = new THREE.DirectionalLight(0xffffff, 2.2);
    pl.position.set(1, 2, 3);
    this.pScene.add(pl);
    this.pScene.environment = renderer.envTex;
    this.pScene.environmentIntensity = 0.4;
    this.pScene.add(this.pKid.root);
    this.pKid.play('remote');
    this.pKid.remote.visible = false;
    this.pCam.position.set(0, 1.12, 1.75);
    this.pCam.lookAt(0, 1.06, 0);
    {
      const dir = new THREE.Vector3(0, -0.06, -1.75).normalize();
      const dist = 2.9;
      disc.position.copy(this.pCam.position).addScaledVector(dir, dist);
      disc.lookAt(this.pCam.position);
      disc.scale.setScalar(dist * Math.tan(THREE.MathUtils.degToRad(13)) * 1.02);
    }

    // --- rocket on the board
    this.rocket = new Rocket(this.world, loadout, L.x - 2, L.y + 3, 0);
    this.rocket.body.setActive(false);
    this.rocket.onDamage = (a, k, info) => this.onRocketDamage(a, k, info);
    this.rocket.onDeath = () => (this.pendingDeath = true);
    this.rocket.onEmpty = () => {
      this.ui.banner('연료 바닥!', '관성으로 날아가자… 연료통을 주우면 다시 살아나요', 'warn');
      this.say('어어어…?!', 'worried', true);
    };
    this.placeRocketOnBoard();

    // --- attempt bookkeeping (idempotent settlement)
    save.attempts++;
    this.attempt = save.attempts;
    save.lastStage = stage.id;
    persist();
    track('flight_start', { attempt: this.attempt, level: stage.id, body: loadout.body, engine: loadout.engine, tank: loadout.tank, nose: loadout.nose, fins: loadout.fins, retry: skipIntro });

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

  /** Pause is a gameplay tool only: never over a confirmed ending or the results (R-01). */
  canPause() {
    return this.phase === 'intro' || this.phase === 'ready' || this.phase === 'jump' || this.phase === 'boost' || this.phase === 'fly' || this.phase === 'escape';
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

  private addShake(a: number) {
    const m = save.settings.reduceMotion ? 0 : save.settings.shake === 'off' ? 0 : save.settings.shake === 'reduced' ? 0.4 : 1;
    this.shake = Math.min(1.2, this.shake + a * m);
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
    if (this.world.ledgerOpen) this.mischief += e.isTarget ? 0 : Math.max(2, Math.round(e.maxHp / 10));
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
    if (!e.isTarget && cause === 'ram' && Math.random() < 0.25) this.say(['히히, 와장창~', '뚫었다!', '이 정도쯤이야!'][Math.floor(Math.random() * 3)], 'grin');
    if (!e.isTarget && e.kind !== 'balloon' && e.kind !== 'fireworks' && Math.random() < 0.7) {
      const w = words[e.mat] ?? ['쾅!'];
      this.ui.popWorld(s, w[Math.floor(Math.random() * w.length)], 'smash');
    }
  }

  private onGear(id: string, x: number, y: number, owned: boolean) {
    if (owned) {
      // R-09: already collected in an earlier run — no new currency, no "found" fanfare
      this.gearsAgain++;
      this.ui.popWorld(this.toScreen(x, y), '이미 찾은 톱니', 'warn');
      return;
    }
    if (!save.gearsFound[id]) {
      save.gearsFound[id] = true;
      persist();
      track('currency_source', { currency: 'gear', amount: 1, reason: 'collect', id, attempt: this.attempt });
    }
    this.gearsGot.push(id);
    this.ui.banner('톱니바퀴 발견!', '차고에서 새 부품을 연구할 수 있어요', 'gear');
    this.say('보물이다!!', 'grin', true);
    this.ui.popWorld(this.toScreen(x, y), '⚙️', 'gear');
  }

  private onRocketDamage(a: number, kind: string, info?: DamageInfo) {
    void info;
    if (a > 6) {
      this.kid.setFace('o');
      this.kidMood = 1.2;
      this.pShake = Math.min(1.5, this.pShake + a / 20);
      if (a > 14) this.say(kind === 'boom' ? '으아아 뜨거!' : kind === 'fire' ? '앗 뜨거!' : ['으악!', '아야야!', '쿵! 괜찮아…?'][Math.floor(Math.random() * 3)]);
    }
  }

  // ================================================================== ending rules (one decision per physics step)
  private resolveEnd() {
    const tgt = this.pendingTarget;
    const died = this.pendingDeath;
    this.pendingTarget = null;
    this.pendingDeath = false;
    // target wrecked (also wins a same-step tie with the rocket blowing up — C-170)
    if (tgt && (this.phase === 'boost' || this.phase === 'fly' || (this.phase === 'fail' && !this.failConfirmed))) {
      this.confirmSuccess(tgt.e, tgt.cause);
      return;
    }
    if (died) {
      if (this.phase === 'escape') {
        // rocket lost during the escape: success stands, no escape bonus
        this.escapeEndT = this.phaseT;
        this.ui.banner('탈출 실패…', '그래도 장난은 성공!', 'warn');
        return;
      }
      if (this.phase === 'boost' || this.phase === 'fly') {
        this.failCandidate(this.describeDeath(), '로켓 대파!');
      }
    }
  }

  private describeDeath(): [string, string] {
    const h = this.rocket.lastHit;
    if (!h) return ['로켓이 부서졌어요', '천천히 접근하거나 튼튼한 부품을 써보자.'];
    if (h.kind === 'boom') return ['폭발에 휘말려 대파', '폭발물은 멀리서 터뜨리거나, 터지기 전에 빠져나오자.'];
    if (h.kind === 'fire') return ['불길 속에 너무 오래 있었어요', '불붙은 물건 근처에서 오래 머무르지 말자.'];
    const mat = MAT_NAME[h.mat ?? ''] ?? '단단한 것';
    const sp = h.speed ? `${Math.round(h.speed)}m/s로 ` : '';
    return [`${mat}에 ${sp}부딪혀 대파`, '날아가는 반대쪽으로 분사해 감속하거나, 냄비 투구·튼튼한 동체를 써보자.'];
  }

  private failCandidate(reason: [string, string], banner: string) {
    this.endReason = reason[0];
    this.endTip = reason[1];
    this.failConfirmed = false;
    this.ui.banner(banner, reason[0], 'lose');
    this.say(banner === '로켓 대파!' ? '내 로켓이…!' : '어라라…', 'worried', true);
    this.pKid.play('sad');
    this.kid.play('sad');
    this.kid.setFace('worried');
    audio.sad();
    this.setPhase('fail');
  }

  private confirmSuccess(e: Ent, cause: Cause) {
    this.targetCause = cause;
    const p = e.obj?.position ?? new THREE.Vector3(this.targetPos.x, this.targetPos.y, 0);
    this.targetPos = { x: p.x, y: p.y };
    this.fx.confettiBurst(p.x, p.y, 160, 16);
    this.fx.celebrate(p.x, p.y);
    audio.fanfare();
    if (!save.settings.reduceMotion) this.slowmo = 1.4;
    this.addShake(1);
    const m = this.stage.methods.find((mm) => mm.id === cause);
    const alive = !this.rocket.dead;
    this.ui.banner('장난 대성공!', (m ? `${m.icon} ${m.name}` : GENERIC_METHOD[cause] ?? '') + (alive ? ' — 이제 유유히 빠져나가자!' : ''), 'win');
    this.kid.play('cheer');
    this.kid.setFace('grin');
    this.pKid.play('cheer');
    this.say(alive ? '해냈다! 튀자~!' : '해냈다아아!!', 'grin', true);
    this.ui.coach(null);
    this.escapeEndT = alive ? -1 : 0;
    this.setPhase('escape');
  }

  // ================================================================== update
  update(rawDt: number) {
    const inp = this.input;
    this.elapsed += rawDt;
    let scale = 1;
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      scale = 0.06;
    } else if (this.slowmo > 0) {
      this.slowmo -= rawDt;
      scale = this.slowmo > 0.6 ? 0.3 : lerp(1, 0.3, this.slowmo / 0.6);
    }
    const dt = rawDt * scale;
    this.phaseT += rawDt;

    switch (this.phase) {
      case 'intro':
        this.updateIntro();
        break;
      case 'ready':
        if (inp.actionPressed()) this.startJump();
        break;
      case 'jump':
        this.updateJump();
        break;
    }

    // ---- control input (also during the escape — the player keeps the rocket)
    const ctrl: ControlInput = { active: false, dx: 0, dy: 1, throttle: 0 };
    const controllable = this.phase === 'boost' || this.phase === 'fly' || this.phase === 'escape';
    if (controllable) {
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
        this.world.after(1.5, () => this.say('내 실력을 보여주지!', 'determined'));
      }
    }

    // ---- fixed physics. Settled runs never simulate again (R-04).
    const rocketLive = this.phase === 'boost' || this.phase === 'fly' || this.phase === 'escape' || this.phase === 'fail';
    if (this.phase !== 'done') {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED && steps < 5) {
        this.acc -= FIXED;
        steps++;
        if (rocketLive) {
          if (!this.rocket.dead) this.rocket.step(FIXED, controllable ? ctrl : { active: false, dx: 0, dy: 1, throttle: 0 });
          this.world.exhaust(FIXED);
          this.softBounds();
        }
        this.world.step(FIXED);
        this.resolveEnd();
      }
      if (steps === 5) this.acc = 0;
    }
    const alpha = this.acc / FIXED;
    this.world.syncVisuals(alpha, dt);
    if (!this.rocket.dead) {
      if (rocketLive) this.rocket.updateVisual(dt, alpha, this.fx);
      else {
        this.rocket.model.root.position.set(this.rocket.body.getPosition().x, this.rocket.body.getPosition().y, 0);
        this.rocket.model.root.rotation.z = this.rocket.body.getAngle();
      }
    }
    if (this.phase !== 'done') {
      this.fx.update(dt);
      for (const f of this.builder.animated) f(dt, this.elapsed);
    }

    // seesaw board
    this.boardAng = damp(this.boardAng, this.boardTarget, this.phase === 'jump' ? 4 : 40, rawDt);
    this.seesaw.board.rotation.z = this.boardAng;
    if (this.phase === 'ready' || this.phase === 'intro' || this.phase === 'jump') this.placeRocketOnBoard();

    // kid
    if (this.phase !== 'jump') this.kid.spin.rotation.z = damp(this.kid.spin.rotation.z, 0, 10, rawDt);
    if (this.kidMood > 0) {
      this.kidMood -= rawDt;
      if (this.kidMood <= 0 && this.phase === 'fly') this.kid.setFace('determined');
    }
    this.kid.update(rawDt, 0.5);
    this.pKid.update(rawDt, 0.4);
    this.pShake = Math.max(0, this.pShake - rawDt * 3);
    this.sayCd -= rawDt;
    this.coinStreakT -= rawDt;
    if (this.coinStreakT <= 0) this.coinStreak = 0;
    this.chatter();

    // ---- ending timeline
    if (this.phase === 'fly' || this.phase === 'boost') this.flightChecks(rawDt);
    if (this.phase === 'fly') this.coach(rawDt);
    if (this.phase === 'escape') this.updateEscape();
    if (this.phase === 'fail') {
      if (!this.failConfirmed && this.phaseT >= END.failGrace) {
        // fail confirmed: nothing that happens now changes the outcome or the ledger
        this.failConfirmed = true;
        this.world.ledgerOpen = false;
      }
      if (this.phaseT > END.failHold) this.finish(false);
    }

    this.updateCamera(rawDt, false);
    this.updateHud();
    inp.endFrame();
  }

  private updateEscape() {
    const r = this.rocket;
    const zone = this.stage.escapeZone;
    if (this.escapeEndT < 0 && !r.dead && !this.escaped) {
      const p = r.body.getPosition();
      const far = len(p.x - this.targetPos.x, p.y - this.targetPos.y) > (zone ? 6 : END.escapeDist);
      const outside = !zone || p.x < zone.minX || p.x > zone.maxX || p.y < zone.minY || p.y > zone.maxY;
      const left = Math.max(0, END.escapeTime - this.phaseT);
      this.ui.prompt(`🏃 유유히 빠져나가자! ${left.toFixed(1)}초`, false);
      if (far && outside) {
        this.escaped = true;
        this.escapeEndT = this.phaseT;
        audio.perfect();
        this.ui.prompt(null);
        this.ui.banner('유유히 퇴장!', '탈출 보너스 획득', 'perfect');
        this.say('메롱~ 안녕히 계세요!', 'grin', true);
      } else if (left <= 0) {
        this.escapeEndT = this.phaseT;
        this.ui.prompt(null);
      }
    }
    const hold = r.dead && !this.escaped && this.escapeEndT === 0 ? END.successHoldNoRocket : END.settleAfterEscape;
    if (this.escapeEndT >= 0 && this.phaseT - this.escapeEndT > hold) {
      this.ui.prompt(null);
      this.finish(true);
    }
  }

  // ---- onboarding: show only the next thing to do, confirm it by doing it (C-113/114, Q-IN-09)
  private coach(dt: number) {
    if (this.stage.index !== 0 || !save.settings.tutorial || save.tutorialDone || this.rocket.dead) {
      if (this.coachStep) {
        this.coachStep = null;
        this.ui.coach(null);
      }
      return;
    }
    const steps: [string, string][] = [
      ['thrust', '손가락을 대고 끌어보세요 — 끈 쪽으로 불을 뿜고, 반대쪽으로 날아가요'],
      ['coast', '이제 손을 떼 보세요 — 연료 없이 관성으로 계속 날아가요'],
      ['brake', '빠르게 날 때, 날아가는 쪽으로 끌면 반대로 분사 → 브레이크!'],
      ['target', '빨간 과녁 표시를 따라 목표로 가요'],
    ];
    const next = steps.find(([id]) => !save.learned[id]);
    if (!next) {
      save.tutorialDone = true;
      persist();
      this.ui.coach(null);
      this.coachStep = null;
      return;
    }
    if (this.coachStep !== next[0]) {
      this.coachStep = next[0];
      this.ui.coach(next[1]);
    }
    const r = this.rocket;
    const v = r.body.getLinearVelocity();
    const sp = len(v.x, v.y);
    const thrusting = r.throttle > 0.2;
    let done = false;
    if (next[0] === 'thrust') {
      if (thrusting) this.thrustT += dt;
      done = this.thrustT > 0.5;
    } else if (next[0] === 'coast') {
      if (!thrusting && sp > 2.5) this.coastT += dt;
      done = this.coastT > 0.8;
    } else if (next[0] === 'brake') {
      const f = r.facing();
      if (thrusting && sp > 6 && (f.x * v.x + f.y * v.y) / sp < -0.5) this.brakeT += dt;
      done = this.brakeT > 0.45;
    } else if (next[0] === 'target') {
      const T = this.world.targetEnt;
      if (T?.body) {
        const tp = T.body.getPosition();
        const p = r.body.getPosition();
        done = len(tp.x - p.x, tp.y - p.y) < 22;
      }
    }
    if (done) {
      save.learned[next[0]] = true;
      persist();
      track('onboarding_step_complete', { step: next[0], attempt: this.attempt, t: Math.round(this.phaseT * 10) / 10 });
      this.ui.coach('잘했어요! 👍', true);
      this.coachStep = 'ok';
      audio.perfect();
    }
  }

  private chatter() {
    const r = this.rocket;
    if (this.phase !== 'fly' || r.dead) return;
    const fuelPct = r.fuel / r.stats.fuel;
    const hullPct = r.hull / r.stats.hull;
    if (!this.warnedFuel && fuelPct < 0.25 && fuelPct > 0) {
      this.warnedFuel = true;
      this.say('연료가 얼마 없어…!', 'worried', true);
    }
    if (!this.warnedHull && hullPct < 0.3) {
      this.warnedHull = true;
      this.say('조금만 버텨줘!', 'worried', true);
    }
    const T = this.world.targetEnt;
    if (!this.saidNear && T && T.alive && T.body) {
      const tp = T.body.getPosition();
      const p = r.body.getPosition();
      if (len(tp.x - p.x, tp.y - p.y) < 14) {
        this.saidNear = true;
        this.say('저기다!! 간다!', 'determined', true);
      }
    }
  }

  private updateIntro() {
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
    if (t > hold + 1.9 || (t > 0.4 && this.input.actionPressed())) this.setPhase('ready');
  }

  private startJump() {
    this.setPhase('jump');
    this.ui.prompt(null);
    this.kid.play('crouch');
    this.kid.setFace('determined');
    audio.unlock();
  }

  /** Air progress 0..1 of the jump, or -1 outside the air time. */
  jumpProgress() {
    const t = this.phaseT - JUMP.crouch;
    return this.phase === 'jump' && t >= 0 && t < JUMP.air ? t / JUMP.air : -1;
  }

  private updateJump() {
    const L = this.builder.launch;
    const t = this.phaseT;
    const k = this.kid;
    const x0 = L.x + 5.6;
    const y0 = L.y + 4.3;
    const x1 = L.x + 2.15;
    const y1 = L.y + 0.88 + Math.sin(0.344) * 2.15 + 0.12;
    const tLand = JUMP.crouch + JUMP.air;
    if (t < JUMP.crouch) {
      k.root.position.set(x0, y0, 0);
    } else if (t < tLand) {
      if (k.anim === 'crouch') {
        k.play('jump');
        audio.whoosh(true);
      }
      const s = (t - JUMP.crouch) / JUMP.air;
      const H = 6.5;
      k.root.position.x = lerp(x0, x1, s);
      k.root.position.y = lerp(y0, y1, s) + 4 * H * s * (1 - s);
      const flip = easeInOutCubic(clamp((s - 0.12) / 0.7, 0, 1));
      k.spin.rotation.z = flip * Math.PI * 2;
      if (s > 0.18 && s < 0.78) k.play('tuck');
      else if (s >= 0.78) k.play('stomp');
      // timing ring: green == perfect window, the same constant the judge uses (R-02)
      const hot = s >= JUMP.perfectFrom;
      const ringT = clamp((s - JUMP.ringFrom) / (1 - JUMP.ringFrom), 0, 1);
      const sc = this.toScreen(x1, y1);
      this.ui.timingRing(sc.x, sc.y, ringT, s > JUMP.ringFrom, hot);
      if (this.input.actionPressed() && !this.perfect && !this.tappedEarly) {
        if (hot) {
          this.perfect = true;
          audio.perfect();
          this.ui.banner('완벽한 내려찍기!', '발사 속도 UP +30', 'perfect');
        } else if (s > JUMP.ringFrom) {
          this.tappedEarly = true;
          this.ui.popWorld(sc, '조금 빨랐어!', 'warn');
        }
      }
    } else {
      // IMPACT → launch
      this.ui.timingRing(0, 0, 0, false, false);
      k.root.position.set(x1, L.y + 0.88 - Math.sin(0.344) * 2.15 + 0.12, 0);
      k.spin.rotation.z = 0;
      k.play('crouch');
      this.boardTarget = -0.344;
      this.launch();
    }
  }

  private launch() {
    const L = this.builder.launch;
    const r = this.rocket;
    const body = r.body;
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
    this.fx.ring(L.x + 2.1, L.y + 0.2, 0.4, 3.5, 0.4, 0xfff4d0, true);
    this.fx.impactPuff(L.x + 2.1, L.y + 0.3, 0, 1, 1, 0xd8cfc0);
    this.fx.impactPuff(px, py - 1, 0, -1, 1, 0xffffff);
    this.fx.ring(px, py - 0.8, 0.5, 4, 0.5, 0xffd080, true);
    if (save.settings.flash) this.fx.flash(px, py - 1, 0.5);
    for (let i = 0; i < 14; i++) this.fx.smoke.spawn({ x: px + rand(-0.5, 0.5), y: py - 1, z: rand(-0.6, 0.6), vx: rand(-7, 7), vy: rand(-0.5, 2), life: rand(1, 1.8), s0: 0.3, s1: rand(1, 1.8), c0: 0xffffff, c1: 0xe8e0d0, drag: 2.5, puff: true });
    audio.boing(this.perfect ? 1.3 : 1);
    audio.ignite();
    this.addShake(this.perfect ? 0.9 : 0.6);
    this.ui.popWorld(this.toScreen(L.x + 2.1, L.y + 1.2), '쿵!', 'smash');
    this.ui.popWorld(this.toScreen(px, py), this.perfect ? '슈우우웅!!' : '발사!', 'launch');
    if (this.perfect) this.runCoins += 30;
    this.say(this.perfect ? '완벽해! 간다아아!' : '간다아아아!', 'grin', true);
    this.ui.showJoyHint(!save.tutorialDone);
    this.world.after(4.2, () => this.ui.showJoyHint(false));
    this.world.after(0.4, () => {
      if (this.phase !== 'done') {
        this.kid.play('remote');
        this.kid.setFace('determined');
      }
    });
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
        this.ui.banner('더 가면 엄마한테 혼나!', '무대 끝이에요', 'warn');
      }
    }
  }

  private flightChecks(dt: number) {
    const r = this.rocket;
    if (r.dead) return;
    const p = r.body.getPosition();
    this.maxAlt = Math.max(this.maxAlt, p.y - this.launchY);
    if (p.y < this.world.bounds.minY - 5) {
      this.failCandidate(['무대 아래로 떨어졌어요', '아래로 내려갈 땐 위쪽으로 분사해 낙하 속도를 줄이자.'], '추락!');
      return;
    }
    // C-093: fuel 0 is not a failure by itself — only once the rocket has truly come to rest
    if (r.fuel <= 0 && r.boosting <= 0) {
      this.emptyT += dt;
      if (r.speed() < 0.8) this.settleT += dt;
      else this.settleT = Math.max(0, this.settleT - dt * 0.5);
      if (this.settleT > 1.4 || this.emptyT > 20) {
        const T = this.world.targetEnt;
        const d = T?.body ? Math.round(len(T.body.getPosition().x - p.x, T.body.getPosition().y - p.y)) : 0;
        this.failCandidate([`연료가 바닥났어요 (목표까지 ${d}m)`, '손을 떼고 관성으로 날면 연료를 아낄 수 있어요. 연료통을 줍거나 큰 연료통을 연구해보자.'], '연료 바닥!');
      }
    }
  }

  /** Quit from the pause menu: settle what was earned so far, no result screen. */
  abandon() {
    if (this.phase === 'done') return;
    this.endReason = '중도 포기';
    this.finish(false, true);
  }

  private finish(success: boolean, abandoned = false) {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.world.ledgerOpen = false;
    const prog = stageProg(this.stage.id);
    const cause = success ? this.targetCause : null;
    const method = cause ? this.stage.methods.find((m) => m.id === cause) ?? null : null;
    const newMethod = !!(cause && method && !prog.methods[cause]);
    const firstClear = success && !prog.cleared;
    const reward = success ? this.stage.reward + (firstClear ? this.stage.reward : 0) + (newMethod && !firstClear ? Math.round(this.stage.reward * 0.5) : 0) : 0;
    const escapeBonus = success && this.escaped ? Math.max(50, Math.round(this.stage.reward * 0.25)) : 0;
    const total = this.runCoins + this.mischief + reward + escapeBonus;
    // idempotent settlement: an attempt is paid at most once (C-097, Q-QA-04)
    const paid = save.lastSettled < this.attempt;
    if (paid) {
      prog.runs++;
      if (success) {
        prog.cleared = true;
        if (cause && method) prog.methods[cause] = true;
        if (this.escaped) prog.escapes++;
      }
      prog.bestCoins = Math.max(prog.bestCoins, total);
      save.coins += total;
      save.lastSettled = this.attempt;
      persist();
      track('currency_source', { currency: 'cap', amount: total, reason: success ? 'success' : abandoned ? 'abandon' : 'fail', attempt: this.attempt });
    }
    track('flight_end', {
      attempt: this.attempt, level: this.stage.id, result: success ? 'success' : abandoned ? 'abandon' : 'fail', cause: cause ?? null, reason: this.endReason || null,
      escaped: this.escaped, fuel_left: Math.round(this.rocket.fuel), hull_left: Math.round(this.rocket.hull), hits: this.hits.count, big_hits: this.hits.big,
      broken: this.world.stats.broken, max_alt: Math.round(this.maxAlt), time: Math.round(this.elapsed),
    }, 'flight_end:' + this.attempt);
    this.result = {
      success, stage: this.stage, cause,
      methodName: method ? `${method.icon} ${method.name}` : cause ? GENERIC_METHOD[cause] ?? null : null,
      newMethod, coins: this.runCoins, mischief: this.mischief, reward, perfect: this.perfect ? 30 : 0, escapeBonus, escaped: this.escaped,
      total, gears: this.gearsGot, gearsAgain: this.gearsAgain, broken: this.world.stats.broken, maxAlt: Math.round(this.maxAlt),
      reason: success ? '' : this.endReason, tip: success ? '' : this.endTip, firstClear, paid,
    };
    this.ui.showJoystick(null);
    this.ui.coach(null);
    this.ui.prompt(null);
    this.input.reset();
    if (!abandoned) this.ui.showResult(this.result);
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
    } else if ((this.phase === 'boost' || this.phase === 'fly' || this.phase === 'fail' || this.phase === 'escape') && !r.dead) {
      const p = r.model.root.position;
      const v = r.body.getLinearVelocity();
      const sp = len(v.x, v.y);
      const look = 0.3;
      c.tx = p.x + clamp(v.x * look, -4.5, 4.5);
      c.ty = p.y + clamp(v.y * look, -5.5, 5.5) + 1.0;
      const widthWanted = 10.5 + clamp(sp - 6, 0, 24) * 0.16;
      c.vh = clamp(widthWanted / Math.max(0.3, aspect), 17, 30);
      if (this.phase === 'boost') c.vh = Math.max(c.vh, 22);
      // just after the target falls, frame it together with the rocket briefly
      if (this.phase === 'escape' && this.phaseT < 1.2) {
        c.tx = lerp(c.tx, this.targetPos.x, 0.35);
        c.ty = lerp(c.ty, this.targetPos.y, 0.35);
        c.vh = Math.max(c.vh, 24);
      }
    } else if (this.phase === 'escape' || (this.phase === 'fail' && r.dead)) {
      c.tx = this.targetPos.x;
      c.ty = this.targetPos.y;
      c.vh = 24;
    }
    const lam = this.phase === 'intro' ? 3 : this.phase === 'fly' || this.phase === 'boost' || this.phase === 'escape' ? 6 : 4;
    if (snap) {
      c.x = c.tx;
      c.y = c.ty;
    } else if (this.phase !== 'done') {
      c.x = damp(c.x, c.tx, lam, dt);
      c.y = damp(c.y, c.ty, lam, dt);
    }
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = 38;
    const dist = c.vh / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const curDist = snap ? dist : damp(cam.position.z || dist, dist, 2.2, dt);
    this.shake = this.phase === 'done' ? 0 : Math.max(0, this.shake - dt * 1.8);
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
      thrust: r.throttle,
      empty: !r.dead && r.fuel <= 0 && r.boosting <= 0,
    });
    if (this.phase === 'fly' || this.phase === 'boost') {
      const T = this.world.targetEnt;
      if (T && T.alive && T.body) {
        const tp = T.body.getPosition();
        const sc = this.toScreen(tp.x, tp.y + T.h * 0.5 + 0.6);
        const d = r.dead ? 0 : len(tp.x - p.x, tp.y - p.y);
        this.ui.setTarget({ x: sc.x, y: sc.y, dist: Math.round(d), name: this.stage.targetName });
      } else this.ui.setTarget(null);
    } else this.ui.setTarget(null);
    const inp = this.input;
    const live = this.phase === 'fly' || this.phase === 'boost' || this.phase === 'escape';
    if (live && inp.active) this.ui.showJoystick({ ax: inp.ax, ay: inp.ay, px: inp.px, py: inp.py, t: inp.throttle, max: inp.maxDrag, dry: r.fuel <= 0 && r.boosting <= 0 });
    else this.ui.showJoystick(null);
  }

  /** Kid shouts something in the HUD bubble. */
  private say(text: string, face?: Face, force = false) {
    if (!force && (this.sayCd > 0 || text === this.lastSay)) return;
    this.sayCd = 1.6;
    this.lastSay = text;
    this.ui.kidSay(text);
    if (face) {
      this.kid.setFace(face);
      this.kidMood = 1.4;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    if (this.phase === 'intro' || this.phase === 'done') return;
    const r = this.renderer.renderer;
    const rect = this.ui.portraitRect();
    if (!rect) return;
    const H = this.renderer.h;
    const k = this.pKid;
    k.setFace(this.kid.face);
    const sh = this.pShake > 0 ? (Math.random() - 0.5) * this.pShake * 0.08 : 0;
    k.root.position.x = sh;
    r.setScissorTest(true);
    r.setViewport(rect.x, H - rect.y - rect.s, rect.s, rect.s);
    r.setScissor(rect.x, H - rect.y - rect.s, rect.s, rect.s);
    r.autoClear = false;
    r.clearDepth();
    r.render(this.pScene, this.pCam);
    r.autoClear = true;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.renderer.w, H);
  }

  /** Release everything this run owns (R-07). Shared caches are left alone. */
  dispose() {
    this.ui.showHud(false);
    this.ui.setTarget(null);
    this.ui.showJoystick(null);
    this.ui.coach(null);
    this.ui.prompt(null);
    this.world.ledgerOpen = false;
    this.world.dispose();
    this.fx.clear();
    disposeTree(this.scene);
    disposeTree(this.pScene);
    this.scene.clear();
    this.pScene.clear();
  }
}
