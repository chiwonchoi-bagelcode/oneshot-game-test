import * as THREE from 'three';
import { LevelBuilder, StageDef } from '../game/level';
import * as P from '../render/models/props';
import { feltMat, plastic, woodMat, emissive, texMat, metalMat, stripeMat } from '../render/materials';
import { roundedBox } from '../render/geom';
import { signTexture } from '../render/textures';
import { audio } from '../core/audio';
import { rand } from '../core/math';

/** Stage 2 — The principal's giant birthday cake on the school roof. */
export const stage2: StageDef = {
  id: 's2',
  index: 1,
  name: '운동회 대작전',
  targetName: '교장쌤의 3단 케이크',
  brief: '운동회 날인데 교장쌤 생일 파티만 한다고?! 옥상의 거대 케이크를 엉망으로 만들어버리자.',
  reward: 360,
  gearIds: ['s2_hoop', 's2_class', 's2_lab', 's2_bell', 's2_balloon', 's2_shed', 's2_tank'],
  methods: [
    { id: 'water', name: '물바다', hint: '케이크 바로 위에 물탱크 파이프가… 밸브가 유리로 돼 있다.', icon: '💦' },
    { id: 'topple', name: '케이크 추락', hint: '케이크 테이블이 옥상 끝에 아슬아슬하게 놓여 있다.', icon: '🎂' },
    { id: 'boom', name: '축포 폭발', hint: '파티용 축포 상자가 케이크 옆에…', icon: '🎆' },
    { id: 'ram', name: '정면 돌파', hint: '케이크가 엄청 무겁다. 드릴이나 압력솥이라면…?', icon: '💥' },
  ],
  sky: { horizon: '#ffdcae', mid: '#86c8f0', top: '#3f86da', space: '#1b2552', spaceAlt: 240 },
  fog: ['#c4def0', 90, 420],
  bounds: { minX: -95, maxX: 165, minY: -30, maxY: 225 },
  build(b: LevelBuilder) {
    b.launch = { x: 0, y: 0 };
    // ------------------------------------------------------------ ground
    b.ground([{ x: -110, y: -30 }, { x: 180, y: -30 }, { x: 180, y: 0 }, { x: -110, y: 0 }]);
    // running track stripes
    const track = new THREE.Mesh(roundedBox(70, 0.06, 4.5, 0.02, 0.2), stripeMat(['#d8643a', '#ffffff', '#d8643a', '#d8643a', '#ffffff', '#d8643a'], false));
    b.put(track, -25, 0.2, 0.2);
    // ------------------------------------------------------------ yard
    b.sign(6, 0, '오늘은 운동회!\n(케이크는 옥상)', -1.4, 2.8, 1.2);
    // sports-day gourd ball (박 터뜨리기)
    b.slab(-18, 4.5, 0.35, 9, 'metal', { depth: 0.4 });
    const bakVis = new THREE.Group();
    const half1 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12, 0, Math.PI), feltMat('#e8443a'));
    const half2 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12, Math.PI, Math.PI), feltMat('#ffffff'));
    half1.rotation.y = -Math.PI / 2;
    half2.rotation.y = -Math.PI / 2;
    bakVis.add(half1, half2);
    const bak = b.block(-18, 10.2, 1.6, 1.6, 'fabric', { obj: bakVis, static: true, hp: 5, breakable: true, coins: 10, noDebris: true });
    bak.onBreak = () => {
      b.w.fx.confettiBurst(-18, 10.2, 140, 12);
      audio.fanfare();
      b.w.events.onText(-18, 12, '운동회 만세!', 'launch');
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4), texMat('bakbanner', signTexture('장\n난\n최\n고', '#fff4c0', '#e8443a', 128, 360), 0.8));
      banner.position.set(-18, 7.8, 0.5);
      b.deco.add(banner);
    };
    // flagpole + pennants
    b.slab(-34, 10, 0.4, 20, 'metal', { depth: 0.4 });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), texMat('schoolflag', signTexture('★ 꿈나무 초등학교 ★', '#3a6fe8', '#ffffff', 384, 256), 0.8, { side: THREE.DoubleSide }));
    b.put(flag, -32.3, 18.6, 0);
    b.put(pennants(-33.6, 19.5, 40.5, 30), 0, 0, -0.5);
    // basketball hoop with a gear in the net
    b.slab(-48, 5, 0.5, 10, 'metal', { depth: 0.5 });
    b.slab(-46.6, 10.2, 0.25, 2.6, 'wood', { depth: 2.2 });
    b.slab(-44.0, 9.15, 0.25, 0.25, 'redmetal', { depth: 0.6 });
    b.put(hoopRim(), -45.2, 9.15, 0);
    b.gear('s2_hoop', -45.2, 8.4);
    b.coinArc(-45.2, 9, 3.6, Math.PI * 0.15, Math.PI * 0.85, 5);
    // balloon arch
    const cols = ['#ff4d6d', '#ffd23f', '#4dd2ff', '#7dff6a', '#a35bff'];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.15 + (i / 6) * 0.7);
      b.balloonAnchored(-13 + Math.cos(a) * 7, 2 + Math.sin(a) * 9, -13 + Math.cos(a) * 7, Math.sin(a) * 9 - 0.5, cols[i % 5], 2);
    }
    b.coinLine(0, 14, 0, 36, 6);
    // updraft blower near the school
    b.fan(29, 1.2, Math.PI / 2, 16, 30, 3);
    b.sign(29, 0, '송풍기 (위로 슝)', -2.6, 2.4, 1.0);
    b.coinLine(29, 8, 29, 28, 6);
    b.hydrant(35, 0, 28, 8);
    b.fuel(-30, 1.5);
    b.vending(-60, 0);
    b.put(P.tree(3, 1.2), -70, 0, -6);
    b.put(P.tree(8, 1.0), 15, 0, -8);
    b.put(P.bush(4), -38, 0, -2);
    b.put(P.bush(12), 22, 0, -2.4);

    // ------------------------------------------------------------ school building
    const X0 = 40;
    const X1 = 110;
    const FH = 8;
    b.feltPanel((X0 + X1) / 2, 16, X1 - X0, 32, '#efe0b8', -3.1, 0.3);
    const roomCols = ['#bfe0f4', '#f6d9c8', '#d6eec6', '#e8d8f4'];
    for (let k = 0; k < 4; k++) b.feltPanel((X0 + X1) / 2, k * FH + 4, X1 - X0 - 2, FH - 1, roomCols[k], -2.9, 0.2);
    for (let k = 0; k < 4; k++) {
      const y0 = k * FH;
      // left wall
      if (k === 0) {
        b.slab(X0 + 0.5, y0 + 1.25, 1, 2.5, 'brick', { depth: 6 });
        b.slab(X0 + 0.5, y0 + 4.25, 1, 3.5, 'brick', { depth: 6, breakable: true, hp: 150 });
        b.slab(X0 + 0.5, y0 + 7, 1, 2, 'brick', { depth: 6 });
      } else {
        b.slab(X0 + 0.5, y0 + 1.25, 1, 2.5, 'brick', { depth: 6 });
        b.slab(X0 + 0.5, y0 + 3.4, 0.3, 1.75, 'glass', { breakable: true, hp: 4, depth: 5 });
        b.slab(X0 + 0.5, y0 + 5.15, 0.3, 1.75, 'glass', { breakable: true, hp: 4, depth: 5 });
        b.slab(X0 + 0.5, y0 + 7, 1, 2, 'brick', { depth: 6 });
      }
      // right wall
      if (k === 0) {
        b.slab(X1 - 0.5, y0 + 6, 1, 4, 'brick', { depth: 6 });
      } else {
        b.slab(X1 - 0.5, y0 + 1.25, 1, 2.5, 'brick', { depth: 6 });
        b.slab(X1 - 0.5, y0 + 3.4, 0.3, 1.75, 'glass', { breakable: true, hp: 4, depth: 5 });
        b.slab(X1 - 0.5, y0 + 5.15, 0.3, 1.75, 'glass', { breakable: true, hp: 4, depth: 5 });
        b.slab(X1 - 0.5, y0 + 7, 1, 2, 'brick', { depth: 6 });
      }
    }
    // floors with zig-zag stair holes
    const floor = (y: number, holeA: number, holeB: number) => {
      if (holeA > X0 + 1) b.slab((X0 + 1 + holeA) / 2, y, holeA - X0 - 1, 0.8, 'concrete', { depth: 6 });
      if (holeB < X1 - 1) b.slab((holeB + X1 - 1) / 2, y, X1 - 1 - holeB, 0.8, 'concrete', { depth: 6 });
    };
    floor(8, 99, 103.5);
    floor(16, 46, 50.5);
    floor(24, 99, 103.5);
    floor(32.4, 46, 50.5);
    b.block(48.25, 32.75, 4.8, 0.4, 'cardboard', { static: true, hp: 6, breakable: true });
    b.slab(X0 + 0.5, 33.3, 1, 1.2, 'brick', { depth: 6 });
    b.put(P.signPost('↑ 옥상', 1.6, 0.8), 47, 24.4, -1.5);
    // ---- floor 0: cafeteria
    b.vending(64, 0);
    b.wall(80, 0, 2, 2, 1.2, 1.0, 'cardboard', { coins: 1 });
    b.fuel(72, 1.3);
    b.coinLine(46, 1.4, 58, 1.4, 5);
    b.put(chalkboard('급식실\n오늘 메뉴: 케이크(X)'), 88, 4.6, -2.6);
    // ---- floor 1: classroom + glass cabinet with a gear
    for (let i = 0; i < 4; i++) b.block(64 + i * 6, 8.85, 1.6, 0.9, 'wood', { coins: i % 2 });
    b.slab(55.5, 9.5, 0.2, 2.2, 'glass', { breakable: true, hp: 4, depth: 2 });
    b.slab(60.5, 9.5, 0.2, 2.2, 'glass', { breakable: true, hp: 4, depth: 2 });
    b.slab(58, 10.7, 5.2, 0.2, 'wood', { depth: 2 });
    b.gear('s2_class', 58, 9.6);
    b.put(chalkboard('숙제: 없음!\n(보리 씀)'), 82, 12.4, -2.6);
    b.coinLine(66, 13, 96, 13, 6);
    // ---- floor 2: science lab — fish tank + burner + gear behind boxes
    b.waterTank(70, 17.11, 2.6, 1.4, 45);
    b.fire(84, 16.4, 0.8, 'none');
    b.put(burner(), 84, 16.4, 0);
    b.wall(91, 16.4, 1, 3, 1.0, 1.0, 'cardboard');
    b.gear('s2_lab', 93.5, 17.4);
    b.put(chalkboard('과학실\nH₂O + 🔥 = ?'), 60, 20.4, -2.6);
    b.coinLine(56, 21, 66, 21, 4);
    // ---- floor 3: music room with a ceiling bell
    b.bell(75, 31.4, 3, 4);
    b.coinGrid(88, 25.5, 4, 2);
    b.put(chalkboard('음악실\n♪ 도레미 ♪'), 60, 28.4, -2.6);

    // ------------------------------------------------------------ rooftop
    // bell tower
    b.slab(44.5, 37, 1, 8, 'brick', { depth: 3 });
    b.slab(51.5, 37, 1, 8, 'brick', { depth: 3 });
    b.ground([{ x: 43, y: 41 }, { x: 53, y: 41 }, { x: 48, y: 45.5 }], { fill: 'roof', top: null, depth: 4 });
    b.bell(48, 40.9, 4, 4);
    b.gear('s2_bell', 48, 34.4);
    // water tower
    b.slab(88.3, 37.1, 0.6, 8.2, 'metal', { depth: 1.2 });
    b.slab(93.7, 37.1, 0.6, 8.2, 'metal', { depth: 1.2 });
    b.slab(91, 37.1, 6, 0.3, 'metal', { angle: 0.9, depth: 0.6 });
    b.slab(91, 41.4, 7, 0.4, 'metal', { depth: 2 });
    const tankVis = P.waterTank(5, 3.8);
    b.w.addBox({ x: 91, y: 43.5, w: 5, h: 3.8, mat: 'metal', static: true, breakable: false, obj: tankVis, kind: 'tankbig' });
    b.gear('s2_tank', 91, 47.2);
    // pipe → glass valve above the cake
    const CX = 106.4;
    b.slab((93.5 + CX + 0.25) / 2, 42.2, CX + 0.25 - 93.5, 0.5, 'metal', { depth: 0.6 });
    b.slab(CX, 41.0, 0.5, 2.4, 'metal', { depth: 0.6 });
    const valve = b.block(CX, 39.5, 0.8, 0.6, 'glass', { static: true, hp: 4, breakable: true });
    valve.onBreak = () => {
      b.w.addEmitter({ x: CX, y: 39.0, dx: 0, dy: -1, rate: 24, speed: 5, time: 8, spread: 0.35 });
      b.w.events.onText(CX, 40.5, '콸콸콸!', 'water');
      audio.splash();
    };
    b.sign(97, 33, '물탱크 밸브\n만지지 마시오', -1.4, 2.4, 1.0);
    // cake table at the roof's edge
    b.block(104.0, 33.61, 0.4, 1.6, 'wood', { hp: 14, name: 'legL' });
    b.block(109.0, 33.61, 0.4, 1.6, 'wood', { hp: 10, name: 'legR' });
    b.block(106.5, 34.62, 6.4, 0.4, 'wood', { hp: 60, friction: 0.12, density: 0.5 });
    const cakeT = b.target({ x: CX, y: 35.88, w: 3.2, h: 2.1, model: P.cake(), hp: 70, mat: 'soft', density: 1.6, soakMax: 40, sound: 'cake' });
    cakeT.body!.getFixtureList()!.setFriction(0.12);
    // party fireworks next to the cake
    b.fireworks(102.3, 33.31, 1.3, 1.0, { radius: 7, power: 90 });
    b.coinArc(CX, 38, 4, Math.PI * 0.1, Math.PI * 0.9, 6);
    b.fuel(75, 33.6);
    // principal (deco) on the roof
    b.put(principal(), 98.5, 32.8, -1.2);
    b.put(partyBanner(), 100, 37.5, -2.6);

    // ------------------------------------------------------------ behind school: shed
    b.slab(135.5, 2.25, 1, 4.5, 'brick', { breakable: true, hp: 140, depth: 3 });
    b.slab(146.5, 1.5, 1, 3, 'brick', { breakable: true, hp: 140, depth: 3 });
    b.slab(141, 5.0, 12.2, 0.6, 'wood', { depth: 3 });
    b.gear('s2_shed', 141, 1.2);
    b.coinLine(137.5, 1.2, 144.5, 1.2, 4);
    b.sign(128, 0, '창고\n(창문 열림)', -1.4, 2.2, 1.0);
    b.fuel(122, 1.4);

    // ------------------------------------------------------------ sky
    b.clouds(-100, 170, 50, 210, 26);
    b.ground(cloudShape(-20, 70, 12, 2.2), { fill: 'cloud', top: null, depth: 4 });
    b.coinLine(-25, 73.5, -15, 73.5, 5);
    b.ground(cloudShape(65, 95, 14, 2.4), { fill: 'cloud', top: null, depth: 4 });
    b.fuel(65, 98.2);
    b.coinArc(65, 97, 6, Math.PI * 0.2, Math.PI * 0.8, 5);
    // weather balloon (high)
    const wb = b.balloonAnchored(20, 150, 20, 140, '#ffffff', 6);
    wb.obj!.scale.setScalar(2.2);
    b.gear('s2_balloon', 20, 142);
    b.coinLine(20, 110, 20, 135, 6);
    // backdrop
    b.backdropHills(-200, 300, 0, ['#6fb84c', '#86c562', '#a3d27e'], [-70, -120, -180]);
    for (let i = 0; i < 9; i++) b.put(P.cityBlock(i * 17 + 5, ['#efd8c0', '#e2d0ea', '#c8e0ee', '#f2e2b8'][i % 4]), -140 + i * 40, 0, -50, 1.1);
    b.put(P.sun(), 140, 110, -150, 2.0);
    b.put(schoolFacade(), 75, 0, -6.2);
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

function chalkboard(text: string) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(roundedBox(5.4, 3.2, 0.2, 0.08, 0.5), woodMat('#9a6a3a'));
  g.add(frame);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.8), texMat('chalk' + text, signTexture(text, '#2f5a3a', '#f4f4e8', 512, 288), 0.9));
  board.position.z = 0.11;
  g.add(board);
  return g;
}

function hoopRim() {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 24), plastic('#ff6a1a', 0.4, 0.3));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.45, 1.0, 12, 3, true), new THREE.MeshStandardMaterial({ color: 0xffffff, wireframe: true }));
  net.position.y = -0.5;
  g.add(net);
  return g;
}

function burner() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.2, 14), metalMat('#555', 0.4));
  g.add(base);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10), metalMat('#999', 0.3));
  tube.position.y = 0.45;
  g.add(tube);
  return g;
}

function pennants(x0: number, y0: number, x1: number, y1: number) {
  const g = new THREE.Group();
  const cols = ['#e8443a', '#ffd23f', '#3a6fe8', '#3aa85a', '#ff6fa8'];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 4;
    const s = new THREE.Shape();
    s.moveTo(-0.4, 0);
    s.lineTo(0.4, 0);
    s.lineTo(0, -0.8);
    s.closePath();
    const f = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.9 }));
    f.position.set(x, y, 0);
    g.add(f);
  }
  return g;
}

function principal() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.9, 4, 12), feltMat('#3a4a6a'));
  body.position.y = 1.0;
  g.add(body);
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.05), feltMat('#e8443a'));
  tie.position.set(0, 1.25, 0.55);
  g.add(tie);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), feltMat('#f2c9a0'));
  head.position.y = 2.15;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, 0, 0.9), feltMat('#2a2a2a'));
  hair.position.y = 2.18;
  g.add(hair);
  for (const s of [-1, 1]) {
    const gl = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 14), plastic('#222', 0.3));
    gl.position.set(s * 0.15, 2.2, 0.4);
    g.add(gl);
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 14), plastic('#ffd23f', 0.4));
  hat.position.set(0.1, 2.75, 0);
  hat.rotation.z = -0.2;
  g.add(hat);
  return g;
}

function partyBanner() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), texMat('partyban', signTexture('★ 교장선생님 생신 축하 ★', '#ff6fa8', '#ffffff', 768, 120), 0.8, { side: THREE.DoubleSide }));
  return m;
}

function schoolFacade() {
  // roof cap + clock for silhouette (deco behind the cut-away)
  const g = new THREE.Group();
  const roofEdge = new THREE.Mesh(roundedBox(72, 1.2, 1.2, 0.2, 0.4), feltMat('#8a5a3a'));
  roofEdge.position.y = 33.0;
  g.add(roofEdge);
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 32), plastic('#ffffff', 0.5));
  face.rotation.x = Math.PI / 2;
  clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.15, 8, 32), plastic('#c9a24a', 0.3, 0.8));
  clock.add(rim);
  for (const [l, r] of [[1.2, 0.5], [0.8, 2.2]] as const) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, l, 0.05), plastic('#222', 0.5));
    hand.position.set(Math.sin(r) * l * 0.5, Math.cos(r) * l * 0.5, 0.2);
    hand.rotation.z = -r;
    clock.add(hand);
  }
  clock.position.set(-14, 36.5, 0);
  g.add(clock);
  void emissive;
  void rand;
  return g;
}
