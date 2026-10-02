import * as THREE from 'three';
import { contactOutline } from '../render/contact';
import * as planck from 'planck';
import { LevelBuilder, StageDef } from '../game/level';
import { Ent } from '../game/world';
import * as P from '../render/models/props';
import { feltMat, plastic, woodMat, emissive, texMat, metalMat, stripeMat, shiny } from '../render/materials';
import { roundedBox } from '../render/geom';
import { signTexture } from '../render/textures';
import { audio } from '../core/audio';
import { rand, grand } from '../core/math';

const Vec2 = planck.Vec2;

/** Stage 3 — The mayor's advertising blimp over the festival. Big vertical sky stage. */
export const stage3: StageDef = {
  id: 's3',
  index: 2,
  name: '축제의 하늘',
  targetName: '시장님의 홍보 비행선',
  brief: '시끄러운 홍보 방송으로 축제를 망치는 비행선! 저 높이 떠 있는 비행선을 터뜨려 하늘을 되찾자.',
  reward: 520,
  gearIds: ['s3_wheel', 's3_tent', 's3_tower', 's3_blimp', 's3_candy', 's3_space', 's3_wagon'],
  methods: [
    { id: 'device', name: '축포 대포', hint: '축제 대포에 "절대 누르지 마시오" 버튼이 있다던데…', icon: '🎇' },
    { id: 'precision', name: '정밀 저격', hint: '비행선 꼭대기에 작은 공기 밸브가 있다.', icon: '🎯' },
    { id: 'fire', name: '불장난', hint: '비행선은 불에 아주 잘 탄다는데… 불꽃을 뿜는 엔진이 있다면?', icon: '🔥' },
    { id: 'ram', name: '정면 돌파', hint: '두꺼운 고무 풍선이다. 드릴이라면 뚫을 수 있을지도.', icon: '💥' },
  ],
  sky: { horizon: '#ffcf9a', mid: '#7cc0f0', top: '#2f6fd0', space: '#141b44', spaceAlt: 200 },
  fog: ['#c0d8ee', 100, 480],
  bounds: { minX: -95, maxX: 155, minY: -20, maxY: 290 },
  build(b: LevelBuilder) {
    b.launch = { x: 0, y: 0 };
    b.ground([{ x: -120, y: -25 }, { x: 175, y: -25 }, { x: 175, y: 0 }, { x: -120, y: 0 }]);
    b.sign(7, 0, '축제 한마당!\n비행선 ↑ 저 위', -1.7, 2.8, 1.2);

    // ------------------------------------------------------------ bouncy castle + balloon cart near launch
    b.spring(-12, 0.45, 5, 0, 24);
    b.put(bouncyCastle(), -12, 0, -2.4);
    const cols = ['#ff4d6d', '#ffd23f', '#4dd2ff', '#7dff6a', '#a35bff', '#ff8a2a'];
    for (let i = 0; i < 6; i++) b.balloonAnchored(11 + (i % 3) * 1.3, 6 + Math.floor(i / 3) * 1.6 + (i % 2) * 0.5, 12, 1.6, cols[i], 2);
    b.put(balloonCart(), 12, 0, -1.8);

    // ------------------------------------------------------------ ferris wheel (rotating spokes + moving gondolas)
    const WX = -42;
    const WY = 30;
    const WR = 22;
    const omega = 0.22;
    const wheelVis = ferrisWheel(WR);
    wheelVis.position.set(WX, WY, -1.5);
    wheelVis.userData.dynamic = true;
    // the spokes are solid (kinematic collider): in-plane, crisp, outlined like every collider (Q-CI)
    wheelVis.userData.inPlane = true;
    wheelVis.userData.noHaze = true;
    b.deco.add(wheelVis);
    const legs = new THREE.Group();
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(roundedBox(1.2, WY + 2, 1.2, 0.2, 0.5), metalMat('#e8e8f0', 0.4));
      leg.position.set(WX + s * 9, WY / 2, -3.2);
      leg.rotation.z = s * 0.3;
      legs.add(leg);
    }
    b.deco.add(legs);
    const spokeBody = b.w.pw.createBody({ type: 'kinematic', position: Vec2(WX, WY) });
    // 8 arms that leave the hub hollow: thread between them to reach the treasure
    const rIn = 3.6;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rm = (WR + rIn) / 2;
      spokeBody.createFixture({ shape: new planck.Box((WR - rIn) / 2, 0.25, Vec2(Math.cos(a) * rm, Math.sin(a) * rm), a), friction: 0.4, restitution: 0.3, filterCategoryBits: 1 });
    }
    spokeBody.setAngularVelocity(omega);
    const spinG = wheelVis.getObjectByName('spin')!;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rm = (WR + rIn) / 2;
      const o = contactOutline({ w: WR - rIn, h: 0.5 }, 'solid', 1.5 + 0.35);
      o.position.x = Math.cos(a) * rm;
      o.position.y = Math.sin(a) * rm;
      o.rotation.z = a;
      spinG.add(o);
    }
    const spokeEnt: Ent = {
      id: 9000, kind: 'wheel', body: spokeBody, obj: null, mat: 'metal', w: 1, h: 1, depth: 1, hp: 9999, maxHp: 9999, breakable: false, alive: true,
      isStatic: true, flammable: false, heat: 0, burning: false, burnT: 0, soak: 0, soakMax: 0, px: WX, py: WY, pa: 0,
    };
    spokeBody.setUserData(spokeEnt);
    b.w.ents.push(spokeEnt);
    const spin = wheelVis.getObjectByName('spin')!;
    const gondolas: { body: planck.Body; a0: number; obj: THREE.Object3D }[] = [];
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const gb = b.w.pw.createBody({ type: 'kinematic', position: Vec2(WX + Math.cos(a0) * WR, WY + Math.sin(a0) * WR - 1.6) });
      gb.createFixture({ shape: new planck.Box(1.3, 0.25, Vec2(0, -0.8), 0), friction: 0.8, filterCategoryBits: 1 });
      const ge: Ent = { ...spokeEnt, id: 9001 + i, body: gb };
      gb.setUserData(ge);
      b.w.ents.push(ge);
      const obj = gondola(cols[i % cols.length]);
      obj.userData.dynamic = true;
      obj.userData.inPlane = true;
      obj.userData.noHaze = true;
      const go = contactOutline({ w: 2.6, h: 0.5 }, 'solid', 0.9);
      go.position.y = -0.8;
      obj.add(go);
      b.deco.add(obj);
      gondolas.push({ body: gb, a0, obj });
    }
    let wt = 0;
    b.w.stepHooks.push((dt) => {
      wt += dt;
      for (const g of gondolas) {
        const a = g.a0 + omega * (wt + dt);
        const tx = WX + Math.cos(a) * WR;
        const ty = WY + Math.sin(a) * WR - 1.6;
        const p = g.body.getPosition();
        g.body.setLinearVelocity(Vec2((tx - p.x) / dt, (ty - p.y) / dt));
      }
    });
    b.animated.push(() => {
      spin.rotation.z = spokeBody.getAngle();
      for (const g of gondolas) {
        const p = g.body.getPosition();
        g.obj.position.set(p.x, p.y, 0);
      }
    });
    b.gear('s3_wheel', WX, WY);
    b.coinArc(WX, WY, 2.2, 0, Math.PI * 2 * 0.86, 7);
    b.sign(WX + 14, 0, '관람차\n(가운데에 보물!)', -1.7, 2.4, 1.1);

    // ------------------------------------------------------------ carnival tent with a gear
    // left wall stops above the door flap so breaking the flap really opens a way in (R-05)
    b.slab(26, 4.5, 0.4, 3.0, 'fabric', { depth: 4 });
    b.slab(38, 3, 0.4, 6, 'fabric', { depth: 4 });
    b.ground([{ x: 25, y: 6 }, { x: 39, y: 6 }, { x: 32, y: 11 }], { fill: 'feltpink', top: null, depth: 5 });
    b.block(26, 1.5, 0.5, 3.0, 'fabric', { static: true, hp: 6, breakable: true, name: 'tentFlap' });
    b.spring(32, 11.3, 3, 0, 22);
    b.gear('s3_tent', 32, 1.6);
    b.coinLine(28.5, 1.4, 35.5, 1.4, 4);
    b.put(tentStripes(), 32, 0, -2.4);

    // ------------------------------------------------------------ updraft vents (free climb!)
    b.fan(48, 1.2, Math.PI / 2, 20, 46, 3.2);
    b.sign(48, 0, '열기구 송풍구\n(위로 쭈욱)', -2.8, 2.4, 1.0);
    b.coinLine(48, 10, 48, 44, 8);
    b.slab(30, 62, 9, 0.8, 'feltblue', { depth: 3, top: 'cloud' });
    b.fan(30, 63.3, Math.PI / 2, 18, 40, 3);
    b.fuel(25, 64);
    b.coinLine(30, 70, 30, 100, 6);

    // ------------------------------------------------------------ TV tower + blimp
    const TX = 76;
    b.slab(TX, 50, 2.2, 100, 'redmetal', { depth: 2.2 });
    for (let y = 12; y < 100; y += 16) b.slab(TX, y, 6, 0.4, 'metal', { angle: 0.6, depth: 1 });
    b.slab(TX, 100.4, 9, 0.8, 'metal', { depth: 3 });
    b.put(antenna(), TX, 100.8, -1.8);
    b.gear('s3_tower', TX - 3, 102);
    b.fuel(TX + 3, 102.2);
    b.sign(TX + 5, 0, '방송탑 — 비행선 계류장', -1.7, 2.6, 1.0);

    const BX = TX;
    const BY = 132;
    const blimpBody = b.w.pw.createBody({ type: 'dynamic', position: Vec2(BX, BY), linearDamping: 0.6, angularDamping: 3 });
    const fopt = { density: 0.3, friction: 0.5, restitution: 0.35, filterCategoryBits: 2, filterMaskBits: 0xffff };
    blimpBody.createFixture({ shape: new planck.Box(3.4, 1.85), ...fopt });
    blimpBody.createFixture({ shape: new planck.Circle(Vec2(-3.3, 0), 1.9), ...fopt });
    blimpBody.createFixture({ shape: new planck.Circle(Vec2(3.3, 0), 1.9), ...fopt });
    blimpBody.createFixture({ shape: new planck.Box(1.0, 0.35, Vec2(0.3, -2.2), 0), ...fopt });
    blimpBody.createFixture({ shape: new planck.Circle(Vec2(0.5, 2.05), 0.38), ...fopt, density: 0.1, userData: 'weak' });
    const bvis = P.blimp();
    const holder = new THREE.Group();
    holder.add(bvis);
    holder.traverse((m) => ((m as THREE.Mesh).isMesh ? (m.castShadow = true) : 0));
    const blimp: Ent = {
      id: 8000, kind: 'target', body: blimpBody, obj: holder, mat: 'rubber', w: 10.4, h: 4, depth: 4, hp: 150, maxHp: 150, breakable: true, alive: true,
      isStatic: false, flammable: true, heat: 0, burning: false, burnT: 0, soak: 0, soakMax: 0, px: BX, py: BY, pa: 0,
      isTarget: true, buoyancy: 1.7, noDebris: true, data: { sound: 'soft', fuse: 2.6 },
    };
    blimpBody.setUserData(blimp);
    b.w.register(blimp);
    b.w.targetEnt = blimp;
    b.targetFocus = { x: BX, y: BY };
    // steel mooring cables (very hard to cut)
    b.w.addRope({ ax: TX - 1.2, ay: 100.8, b: blimp, bx: BX - 0.4, by: BY - 2.55, strength: 70, color: '#8a9098', flammable: false, cause: 'device' });
    b.w.addRope({ ax: TX + 1.2, ay: 100.8, b: blimp, bx: BX + 1.0, by: BY - 2.55, strength: 70, color: '#8a9098', flammable: false, cause: 'device' });
    // loudspeaker noise + banner sway
    let honk = 0;
    b.animated.push((dt) => {
      honk -= dt;
      if (blimp.alive && honk <= 0) {
        honk = 6 + grand(0, 3);
        const p = blimpBody.getPosition();
        b.w.events.onText(p.x - 2, p.y + 3, '♪ 시장님 최고~ 투표 2번~ ♪', 'warn');
      }
    });
    // deflating via the valve (precision)
    let deflating = false;
    blimp.data.onWeak = () => {
      if (deflating || !blimp.alive) return;
      deflating = true;
      audio.pop();
      b.w.events.onText(blimpBody.getPosition().x, blimpBody.getPosition().y + 3, '푸쉬이이익~!', 'pop');
      let t = 0;
      const hook = (dt: number) => {
        if (!blimp.alive) return;
        t += dt;
        const body = blimp.body!;
        const ang = body.getAngle();
        const thrust = 260;
        body.applyForceToCenter(Vec2(Math.cos(ang + t * 3) * thrust, Math.sin(ang + t * 3) * thrust + 80), true);
        body.applyTorque(Math.sin(t * 7) * 400, true);
        blimp.buoyancy = Math.max(0.6, 1.7 - t * 0.5);
        const s = Math.max(0.55, 1 - t * 0.17);
        holder.scale.set(s, s, s);
        if (Math.random() < 0.6) {
          const p = body.getWorldPoint(Vec2(0.5, 2.1));
          b.w.fx.smoke.spawn({ x: p.x, y: p.y, vx: rand(-4, 4), vy: rand(2, 6), life: 0.6, s0: 0.2, s1: 0.8, c0: 0xffffff, c1: 0xeeeeee, drag: 3, puff: true });
        }
        if (t > 2.6) b.w.queueBreak(blimp, 'precision');
      };
      b.w.stepHooks.push(hook);
    };
    blimp.onBreak = (_c, en) => {
      const p = (en as any)._lastPos ?? { x: BX, y: BY };
      b.w.fx.explosion(p.x, p.y, 2.2);
      b.w.fx.confettiBurst(p.x, p.y, 120, 18);
      audio.explosion(2);
      for (let i = 0; i < 10; i++) b.w.spawnDebris(p.x + grand(-4, 4), p.y + grand(-1.5, 1.5), grand(0.6, 1.6), grand(0.4, 1), grand(0, 6), i % 2 ? 'fabric' : 'rubber', grand(-10, 10), grand(-4, 10), 0.4);
      b.w.events.onShake(1);
    };
    b.animated.push(() => {
      if (blimp.body) (blimp as any)._lastPos = { x: blimpBody.getPosition().x, y: blimpBody.getPosition().y };
    });
    b.gear('s3_blimp', BX + 7.5, BY + 4.5);
    b.coinArc(BX, BY, 9, Math.PI * 0.1, Math.PI * 0.9, 9);

    // ------------------------------------------------------------ festival cannon (device)
    const CX = 116;
    const CY = 7.5;
    b.slab(CX, 3.2, 7, 6.4, 'wood', { depth: 4, top: 'feltblue' });
    const cannonVis = cannon();
    const aim = Math.atan2(BY - CY - 0.5, BX - CX);
    cannonVis.rotation.z = aim - Math.PI / 2;
    b.put(cannonVis, CX, CY, -1.8);
    const button = b.block(CX + 2.6, 7.0, 0.9, 0.5, 'redmetal', { static: true, hp: 1, breakable: true, noDebris: true, obj: bigButton(), role: 'device' });
    b.sign(CX - 1.2, 6.4, '절대 누르지\n마시오!!', -1.7, 2.2, 1.0);
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      const target = blimp.body ? blimp.body.getPosition() : Vec2(BX, BY);
      const dx = target.x - CX;
      const dy = target.y - CY;
      const l = Math.hypot(dx, dy);
      const sp = 42;
      const mx = CX + (dx / l) * 2.2;
      const my = CY + (dy / l) * 2.2;
      const shellVis = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), stripeMat(['#e8443a', '#ffd23f', '#e8443a', '#ffd23f'], true));
      shellVis.add(ball);
      const shell = b.w.addCircle({ x: mx, y: my, r: 0.5, mat: 'metal', breakable: false, obj: shellVis, kind: 'shell', density: 3, gravityScale: 0 });
      shell.device = true;
      shell.body!.setBullet(true);
      shell.body!.setLinearVelocity(Vec2((dx / l) * sp, (dy / l) * sp));
      let boomed = false;
      const boom = () => {
        if (boomed || !shell.alive) return;
        boomed = true;
        const p = shell.body!.getPosition();
        b.w.removeEnt(shell);
        b.w.explode(p.x, p.y, 7, 140, 'device');
        audio.firework();
        b.w.fx.confettiBurst(p.x, p.y, 80, 14);
      };
      shell.onHit = () => b.w.queueAction(boom);
      let life = 0;
      b.w.stepHooks.push((dt) => {
        if (boomed) return;
        life += dt;
        if (shell.body && Math.random() < 0.8) {
          const p = shell.body.getPosition();
          b.w.fx.flames.spawn({ x: p.x, y: p.y, vx: rand(-1, 1), vy: rand(-1, 1), life: 0.3, s0: 0.9, s1: 0.1, c0: 0xffe080, c1: 0xff4010 });
        }
        if (life > 5) boom();
      });
      b.w.fx.explosion(mx, my, 0.5);
      audio.explosion(0.6);
      b.w.events.onText(CX, CY + 3, '퍼어엉!!', 'launch');
      b.w.events.onShake(0.6);
    };
    button.onBreak = fire;

    // ------------------------------------------------------------ fortune teller wagon (gear inside)
    b.slab(128, 1.6, 0.4, 3.2, 'wood', { breakable: true, hp: 30, depth: 3 });
    b.slab(136, 2.4, 0.4, 1.6, 'wood', { breakable: true, hp: 30, depth: 3 });
    b.slab(132, 3.4, 8.4, 0.4, 'wood', { breakable: true, hp: 30, depth: 3 });
    b.gear('s3_wagon', 132, 1.2);
    b.put(new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), texMat('fortune', signTexture('🔮 점집', '#6a3aa8', '#ffe14d', 256, 70), 0.8)), 132, 4.3, 1.6);

    // ------------------------------------------------------------ high sky
    b.clouds(-100, 160, 40, 180, 22);
    // candy cloud with gear
    b.ground(cloudShape(-50, 165, 14, 2.6), { fill: 'feltpink', top: null, depth: 4 });
    b.gear('s3_candy', -50, 169.5);
    b.fuel(-55, 168.6);
    b.coinArc(-50, 166, 8, Math.PI * 0.1, Math.PI * 0.9, 7);
    // jet stream (pushes right)
    b.w.addWind({ x: -95, y: 196, ang: 0, len: 260, wid: 22, power: 7, active: true });
    b.sign(-48, 166.2, '→ 제트기류 →', -1.7, 2.4, 1.0);
    // floating lanterns as coin trail upwards
    for (let i = 0; i < 6; i++) {
      const lx = 100 + Math.sin(i) * 6;
      const ly = 60 + i * 16;
      b.put(lantern(), lx, ly, -1.8);
      b.coin(lx, ly - 1.5);
    }
    // space satellite with gear
    b.put(satellite(), 112, 258, -1.8);
    b.gear('s3_space', 108, 254);
    b.coinLine(100, 225, 110, 248, 5);
    // backdrop
    b.backdropHills(-200, 320, 0, ['#6fb84c', '#86c562', '#a3d27e'], [-70, -120, -180]);
    for (let i = 0; i < 6; i++) b.put(circusTent(i), -130 + i * 55, 0, -60 - (i % 2) * 18, 1.3);
    b.put(P.sun(), -60, 120, -170, 2.4);
  },
};

function cloudShape(cx: number, cy: number, w: number, h: number) {
  const pts: { x: number; y: number }[] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const bump = 1 + 0.12 * Math.sin(a * 5);
    pts.push({ x: cx + Math.cos(a) * w * 0.5 * bump, y: cy + Math.sin(a) * h * 0.5 * (a < Math.PI ? 1.3 : 0.8) * bump });
  }
  return pts;
}

function ferrisWheel(R: number) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.name = 'spin';
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 8, 64), metalMat('#f0f0f8', 0.35));
  spin.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.2, 6, 48), metalMat('#f0f0f8', 0.35));
  spin.add(rim2);
  const rIn = 3.6;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const s = new THREE.Mesh(new THREE.BoxGeometry(R - rIn, 0.5, 0.5), metalMat('#ffd23f', 0.4));
    s.position.set(Math.cos(a) * (R + rIn) / 2, Math.sin(a) * (R + rIn) / 2, 0);
    s.rotation.z = a;
    spin.add(s);
  }
  const inner = new THREE.Mesh(new THREE.TorusGeometry(rIn, 0.25, 6, 32), metalMat('#f0f0f8', 0.35));
  spin.add(inner);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), emissive(['#ff6a8a', '#ffe06a', '#6ad8ff'][i % 3], 2.2));
    bulb.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.4);
    spin.add(bulb);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.8, 20), plastic('#e8443a', 0.4));
  hub.rotation.x = Math.PI / 2;
  hub.position.z = -1.2;
  spin.add(hub);
  g.add(spin);
  return g;
}

function gondola(color: string) {
  const g = new THREE.Group();
  const cab = new THREE.Mesh(roundedBox(2.4, 1.6, 1.6, 0.3, 0.5), plastic(color, 0.4));
  cab.position.y = -0.1;
  g.add(cab);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 4), plastic('#ffffff', 0.4));
  roof.position.y = 1.05;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), plastic('#bfe6ff', 0.1));
  win.position.set(0, 0.15, 0.81);
  g.add(win);
  g.traverse((m) => ((m as THREE.Mesh).isMesh ? (m.castShadow = true) : 0));
  return g;
}

function bouncyCastle() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(roundedBox(6, 1.5, 4, 0.6, 0.5), feltMat('#ff6fa8'));
  base.position.y = 0.4;
  g.add(base);
  for (const x of [-2.6, 2.6]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 4, 12), feltMat('#ffd23f'));
    tower.position.set(x, 2, -1.2);
    g.add(tower);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 12), feltMat('#4dd2ff'));
    top.position.set(x, 4.6, -1.2);
    g.add(top);
  }
  const back = new THREE.Mesh(roundedBox(5, 3, 0.6, 0.4, 0.5), feltMat('#7dff6a'));
  back.position.set(0, 2, -1.6);
  g.add(back);
  return g;
}

function balloonCart() {
  const g = new THREE.Group();
  const cart = new THREE.Mesh(roundedBox(2.4, 1.2, 1.2, 0.15, 0.5), woodMat('#e8a050'));
  cart.position.y = 1.0;
  g.add(cart);
  for (const x of [-0.8, 0.8]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 6, 16), plastic('#333', 0.6));
    wheel.position.set(x, 0.35, 0.65);
    g.add(wheel);
  }
  return g;
}

function tentStripes() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(roundedBox(12, 6, 0.4, 0.2, 0.5), stripeMat(['#e8443a', '#ffffff', '#e8443a', '#ffffff', '#e8443a', '#ffffff'], true));
  wall.position.y = 3;
  g.add(wall);
  return g;
}

function antenna() {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 6, 8), metalMat('#ddd', 0.3));
  mast.position.y = 3;
  g.add(mast);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), emissive('#ff3030', 3));
  light.position.y = 6.2;
  g.add(light);
  for (let i = 0; i < 3; i++) {
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), plastic('#ffffff', 0.4));
    dish.position.set(i % 2 ? 0.6 : -0.6, 1.5 + i * 1.3, 0);
    dish.rotation.z = i % 2 ? -1.2 : 1.2;
    g.add(dish);
  }
  return g;
}

function cannon() {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 4.4, 18), stripeMat(['#3a6fe8', '#ffd23f', '#3a6fe8', '#ffd23f'], false));
  barrel.position.y = 1.6;
  g.add(barrel);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.15, 8, 20), shiny('#c9a24a', 0.3, 0.9));
  mouth.rotation.x = Math.PI / 2;
  mouth.position.y = 3.8;
  g.add(mouth);
  const base = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), plastic('#e8443a', 0.4));
  g.add(base);
  return g;
}

function bigButton() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.2, 18), plastic('#333', 0.5));
  base.position.y = -0.15;
  g.add(base);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.3, 18), plastic('#ff2a2a', 0.25));
  top.position.y = 0.05;
  g.add(top);
  return g;
}

function lantern() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 1.2, 12), emissive('#ffb050', 1.4));
  g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 0.2, 12), plastic('#8a3a1a', 0.6));
  top.position.y = 0.7;
  g.add(top);
  return g;
}

function satellite() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(1.6, 1.6, 1.6, 0.1, 0.5), shiny('#d8c070', 0.3, 0.9));
  g.add(body);
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(roundedBox(3, 1.2, 0.08, 0.02, 0.5), plastic('#2a4ab0', 0.3, 0.4));
    panel.position.x = s * 2.4;
    g.add(panel);
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), plastic('#ffffff', 0.4));
  dish.position.y = 1.2;
  g.add(dish);
  g.rotation.z = 0.3;
  return g;
}

function circusTent(i: number) {
  const g = new THREE.Group();
  const cols = [['#e8443a', '#ffffff'], ['#3a6fe8', '#ffd23f'], ['#3aa85a', '#ffffff']][i % 3];
  const st = Array.from({ length: 12 }, (_, k) => cols[k % 2]);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 6, 24), stripeMat(st, true));
  body.position.y = 3;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 6, 24), stripeMat(st, true));
  roof.position.y = 9;
  g.add(roof);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), plastic('#ffd23f', 0.6));
  flag.position.set(0.7, 13, 0);
  g.add(flag);
  return g;
}
