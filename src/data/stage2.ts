import * as THREE from 'three';
import { LevelBuilder, StageDef } from '../game/level';
import * as P from '../render/models/props';
import { feltMat, plastic, woodMat, emissive, texMat, metalMat, stripeMat } from '../render/materials';
import { roundedBox, extrudeShape } from '../render/geom';
import { signTexture } from '../render/textures';
import { audio } from '../core/audio';

/**
 * Stage 2 — the principal's private birthday party (Q-AH flagship, docs/ad-cards.md AH-1).
 *
 *   peaceful party seen through the windows → break in (window / door / skylight)
 *   → chain chaos (fireworks, sprinkler, chandelier, piñata, fish tank, balloons)
 *   → the family reacts → fly out through any opening for the escape bonus.
 */
const HX0 = 46; // house outer left
const HX1 = 94; // house outer right
const ROOF_Y = 30.5;
export const PARTY_HOUSE = { minX: HX0, maxX: HX1, minY: 0, maxY: ROOF_Y + 0.8 };

export const stage2: StageDef = {
  id: 's2',
  index: 1,
  name: '교장쌤 생일파티',
  targetName: '교장쌤의 3단 케이크',
  brief: '운동회 날인데 교장쌤은 집에서 몰래 생일파티?! 창문 너머 평화로운 파티… 케이크를 엉망으로 만들고 유유히 빠져나오자.',
  reward: 360,
  gearIds: ['s2_hoop', 's2_class', 's2_lab', 's2_bell', 's2_balloon', 's2_shed', 's2_tank'],
  methods: [
    { id: 'water', name: '스프링클러 물바다', hint: '파티방 천장에 스프링클러 파이프가… 밸브가 유리로 돼 있다.', icon: '💦' },
    { id: 'topple', name: '와르르 대참사', hint: '케이크 테이블은 계단 구멍 바로 옆, 오른쪽 다리가 삐걱… 천장 샹들리에도 위태롭다.', icon: '🎂' },
    { id: 'boom', name: '축포 폭발', hint: '케이크 옆에 파티용 축포 상자가…', icon: '🎆' },
    { id: 'ram', name: '정면 돌파', hint: '케이크가 엄청 무겁다. 드릴이나 압력솥이라면…?', icon: '💥' },
  ],
  sky: { horizon: '#ffdcae', mid: '#86c8f0', top: '#3f86da', space: '#1b2552', spaceAlt: 240 },
  fog: ['#c4def0', 90, 420],
  bounds: { minX: -95, maxX: 165, minY: -30, maxY: 225 },
  escapeZone: { ...PARTY_HOUSE, name: '교장쌤 댁' },
  build(b: LevelBuilder) {
    b.launch = { x: 0, y: 0 };
    // ------------------------------------------------------------ ground + sports-day yard
    b.ground([{ x: -110, y: -30 }, { x: 180, y: -30 }, { x: 180, y: 0 }, { x: -110, y: 0 }]);
    const track = new THREE.Mesh(roundedBox(70, 0.06, 4.5, 0.02, 0.2), stripeMat(['#d8643a', '#ffffff', '#d8643a', '#d8643a', '#ffffff', '#d8643a'], false));
    b.putInPlane(track, -25, 0.2, 0.2); // painted on the ground: flat, never in the way
    b.sign(6, 0, '오늘은 운동회!\n교장쌤 댁 →', -1.7, 2.8, 1.2);
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
    // flagpole + pennants (behind the play plane)
    b.slab(-34, 10, 0.4, 20, 'metal', { depth: 0.4 });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), texMat('schoolflag', signTexture('★ 꿈나무 초등학교 ★', '#3a6fe8', '#ffffff', 384, 256), 0.8, { side: THREE.DoubleSide }));
    b.put(flag, -32.3, 18.6, -1.7);
    b.put(pennants(-33.6, 19.5, 40.5, 26), 0, 0, -1.8);
    // basketball hoop with a gear in the net
    b.slab(-48, 5, 0.5, 10, 'metal', { depth: 0.5 });
    b.slab(-46.6, 10.2, 0.25, 2.6, 'wood', { depth: 2.2 });
    b.slab(-44.0, 9.15, 0.25, 0.25, 'redmetal', { depth: 0.6 });
    b.put(hoopRim(), -45.2, 9.15, -1.6);
    b.gear('s2_hoop', -45.2, 8.4);
    b.coinArc(-45.2, 9, 3.6, Math.PI * 0.15, Math.PI * 0.85, 5);
    // balloon arch
    const cols = ['#ff4d6d', '#ffd23f', '#4dd2ff', '#7dff6a', '#a35bff'];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.15 + (i / 6) * 0.7);
      b.balloonAnchored(-13 + Math.cos(a) * 7, 2 + Math.sin(a) * 9, -13 + Math.cos(a) * 7, Math.sin(a) * 9 - 0.5, cols[i % 5], 2);
    }
    b.coinLine(0, 14, 0, 36, 6);
    // updraft blower: lifts you to the party window
    b.fan(29, 1.2, Math.PI / 2, 16, 30, 3);
    b.sign(31.5, 0, '송풍기 (위로 슝)', -2.6, 2.4, 1.0);
    b.coinLine(29, 8, 29, 28, 6);
    b.hydrant(36, 0, 28, 8);
    b.fuel(-30, 1.5);
    b.vending(-60, 0);
    b.put(P.tree(3, 1.2), -70, 0, -6);
    b.put(P.tree(8, 1.0), 15, 0, -8);
    b.put(P.bush(4), -38, 0, -2);
    b.put(P.bush(12), 22, 0, -2.4);
    b.put(P.fenceSection(10), 100, 0, -2.2);
    b.put(P.fenceSection(10), 110, 0, -2.2);
    b.sign(41, 0, '교장선생님 댁\n(쉿! 파티 중)', -1.7, 2.6, 1.2);

    buildHouse(b);

    // ------------------------------------------------------------ behind the house: garden shed
    b.slab(112.5, 2.25, 1, 4.5, 'brick', { breakable: true, hp: 140, depth: 3 });
    b.slab(123.5, 1.5, 1, 3, 'brick', { breakable: true, hp: 140, depth: 3 });
    b.slab(118, 5.0, 12.2, 0.6, 'wood', { depth: 3 });
    b.gear('s2_shed', 118, 1.2);
    b.coinLine(114.5, 1.2, 121.5, 1.2, 4);
    b.sign(128, 0, '창고\n(오른쪽 창 열림)', -1.7, 2.2, 1.0);
    b.fuel(104, 1.4);

    // ------------------------------------------------------------ sky
    b.clouds(-100, 170, 50, 210, 26);
    b.ground(cloudShape(-20, 70, 12, 2.2), { fill: 'cloud', top: null, depth: 4 });
    b.coinLine(-25, 73.5, -15, 73.5, 5);
    b.ground(cloudShape(65, 95, 14, 2.4), { fill: 'cloud', top: null, depth: 4 });
    b.fuel(65, 98.2);
    b.coinArc(65, 97, 6, Math.PI * 0.2, Math.PI * 0.8, 5);
    const wb = b.balloonAnchored(20, 150, 20, 140, '#ffffff', 6);
    wb.obj!.scale.setScalar(2.2);
    b.gear('s2_balloon', 20, 142);
    b.coinLine(20, 110, 20, 135, 6);
    b.backdropHills(-200, 300, 0, ['#6fb84c', '#86c562', '#a3d27e'], [-70, -120, -180]);
    for (let i = 0; i < 9; i++) b.put(P.cityBlock(i * 17 + 5, ['#efd8c0', '#e2d0ea', '#c8e0ee', '#f2e2b8'][i % 4]), -140 + i * 40, 0, -50, 1.1);
    b.put(P.sun(), 140, 110, -150, 2.0);
    b.put(schoolFar(), -60, 0, -34);
  },
};

// ===================================================================== the party house
function buildHouse(b: LevelBuilder) {
  const W = 'brick';
  // ---------------------------------------------------------------- shell (play plane, depth 6)
  // ground floor (y 0..7.6): front door on the left, glass sliding door on the right
  const door = b.block(HX0 + 0.5, 2.0, 0.7, 4.0, 'wood', { static: true, breakable: true, hp: 26, obj: doorModel(), name: 'frontDoor', noDebris: false });
  void door;
  b.slab(HX0 + 0.5, 5.8, 1, 3.6, W, { depth: 6 });
  b.slab(HX1 - 0.5, 0.9, 0.3, 1.8, 'glass', { breakable: true, hp: 4, depth: 5 });
  b.slab(HX1 - 0.5, 2.7, 0.3, 1.8, 'glass', { breakable: true, hp: 4, depth: 5 });
  b.slab(HX1 - 0.5, 5.6, 1, 4.0, W, { depth: 6 });
  // party-room floor with the stair void on the right (x 81.5..93)
  b.slab((HX0 + 1 + 81.5) / 2, 8.0, 81.5 - HX0 - 1, 0.8, 'wood', { depth: 6, top: 'darkwood' });
  // party room walls (y 8.4..18): the big party window on the left, a smaller one on the right
  b.slab(HX0 + 0.5, 9.4, 1, 2.0, W, { depth: 6 });
  b.slab(HX0 + 0.5, 11.9, 0.3, 3.0, 'glass', { breakable: true, hp: 4, depth: 5, name: 'partyWindowLow' });
  b.slab(HX0 + 0.5, 14.9, 0.3, 3.0, 'glass', { breakable: true, hp: 4, depth: 5, name: 'partyWindowHigh' });
  b.slab(HX0 + 0.5, 17.2, 1, 1.6, W, { depth: 6 });
  b.slab(HX1 - 0.5, 9.7, 1, 2.6, W, { depth: 6 });
  b.slab(HX1 - 0.5, 12.1, 0.3, 2.2, 'glass', { breakable: true, hp: 4, depth: 5 });
  b.slab(HX1 - 0.5, 14.3, 0.3, 2.2, 'glass', { breakable: true, hp: 4, depth: 5 });
  b.slab(HX1 - 0.5, 16.7, 1, 2.6, W, { depth: 6 });
  // ceiling with the attic hatch (cardboard) at x 56..59
  b.slab((HX0 + 1 + 56) / 2, 18.4, 56 - HX0 - 1, 0.8, 'plaster', { depth: 6 });
  b.block(57.5, 18.4, 3, 0.8, 'cardboard', { static: true, breakable: true, hp: 6, name: 'atticHatch' });
  b.slab((59 + HX1 - 1) / 2, 18.4, HX1 - 1 - 59, 0.8, 'plaster', { depth: 6 });
  // roof: left slope with a skylight, flat right part with the water tank
  const A = { x: HX0 - 0.4, y: 18.9 };
  const B = { x: 68, y: ROOF_Y };
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const seg = (t0: number, t1: number, mat: string, o: { breakable?: boolean; hp?: number; name?: string } = {}) => {
    const tc = (t0 + t1) / 2;
    const nx = -Math.sin(ang) * 0.3;
    const ny = Math.cos(ang) * 0.3;
    return b.slab(A.x + dx * tc + nx, A.y + dy * tc + ny, L * (t1 - t0), mat === 'glass' ? 0.35 : 0.6, mat, { angle: ang, depth: mat === 'glass' ? 5 : 6.4, ...o });
  };
  seg(0, 0.48, 'roof');
  seg(0.48, 0.64, 'glass', { breakable: true, hp: 4, name: 'skylight' });
  seg(0.64, 1.0, 'roof');
  b.slab((68 + HX1) / 2, ROOF_Y + 0.4, HX1 - 68 + 0.4, 0.8, 'roof', { depth: 6.4 });
  // attic gable wall on the right, with a round-ish attic window
  b.slab(HX1 - 0.5, 20.9, 1, 4.2, W, { depth: 6 });
  b.slab(HX1 - 0.5, 23.9, 0.3, 1.8, 'glass', { breakable: true, hp: 4, depth: 5 });
  b.slab(HX1 - 0.5, 27.65, 1, 5.7, W, { depth: 6 });

  // ---------------------------------------------------------------- back walls (background)
  b.feltPanel(70, 4.0, HX1 - HX0 - 2, 7.6, '#f4e9cf', -3.1, 0.3); // hall + kitchen
  b.feltPanel(64.5, 13.2, 81.5 - HX0 - 1.5, 9.6, '#ffd9e4', -3.1, 0.3); // party room wallpaper
  b.feltPanel(87.5, 9.0, 11.5, 17.6, '#efe2c4', -3.1, 0.3); // stair void
  b.feltPanel(78, 24.5, 30, 11, '#c9a77c', -3.1, 0.3); // attic boards
  b.put(wallpaperDots(), 64.5, 13.2, -2.92);
  b.put(stairs(), 87, 0, -2.4);
  b.put(partyBanner(), 66, 16.6, -2.85);
  b.put(pictureFrame('#7fb6e8'), 52.5, 15.6, -2.9);
  b.put(pictureFrame('#f2b16b'), 86, 14.5, -2.9);
  b.put(tiles(), 64, 4.6, -2.92);

  // ---------------------------------------------------------------- ground floor: hall, trophies, kitchen, living area
  // trophy cabinet (glass) — gear inside
  b.slab(50.5, 1.6, 0.2, 3.2, 'glass', { breakable: true, hp: 4, depth: 2 });
  b.slab(54.5, 1.6, 0.2, 3.2, 'glass', { breakable: true, hp: 4, depth: 2 });
  b.slab(52.5, 3.3, 4.4, 0.2, 'wood', { depth: 2 });
  b.gear('s2_class', 52.5, 1.4);
  b.put(trophies(), 52.5, 3.4, -1.9);
  // kitchen counter + stove + fridge
  b.slab(63.5, 1.0, 6, 2.0, 'wood', { depth: 3, top: 'stone' });
  b.fire(65.2, 2.25, 0.7, 'none');
  b.fuel(61.4, 2.9);
  b.block(70.6, 1.7, 1.8, 3.4, 'metal', { hp: 80, density: 1.6, obj: fridge(), name: 'fridge' });
  b.slab(75.6, 2.4, 3, 0.3, 'wood', { depth: 2.4 });
  b.gear('s2_lab', 75.6, 0.9);
  b.coinLine(57, 5.2, 67, 5.2, 5);
  // living area under the stair void: sofa + TV (where a falling cake lands)
  b.block(86.5, 0.6, 4.2, 1.2, 'soft', { hp: 40, density: 0.6, obj: sofa() });
  b.block(91.4, 1.0, 1.4, 2.0, 'wood', { hp: 22 });
  b.block(91.4, 2.55, 1.6, 1.1, 'glass', { hp: 6, density: 1.5, obj: tv() });

  // ---------------------------------------------------------------- party room (y 8.4..18)
  const FY = 8.4;
  // gift pile with coins
  const giftCols = ['#ff6fa8', '#4dd2ff', '#ffd23f', '#7dd96a', '#b07dff', '#ff8a3f'];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 3 - r; c++) {
      const s = 1.05 - r * 0.1;
      b.block(49.2 + c * 1.1 + r * 0.55, FY + s / 2 + r * 1.05, s, s, 'cardboard', { hp: 6, coins: 2, obj: giftBox(s, giftCols[(r * 3 + c) % giftCols.length]) });
    }
  // fish tank on a cabinet
  b.slab(56, FY + 1.0, 3, 2.0, 'wood', { depth: 2.2 });
  b.waterTank(56, FY + 2.7, 2.6, 1.4, 45, { obj: fishTank(2.6, 1.4) });
  // piñata on a rope
  const pin = b.block(63.5, 15.6, 1.4, 1.2, 'fabric', { hp: 6, breakable: true, coins: 14, density: 0.4, obj: pinata(), noDebris: true });
  b.hang(63.5, 18.0, pin, { color: '#d8c8a8', cause: 'topple' });
  pin.onBreak = () => {
    const p = pin.body?.getPosition() ?? { x: 63.5, y: 15.6 };
    b.w.fx.confettiBurst(p.x, p.y, 70, 9);
    b.w.events.onText(p.x, p.y + 1.2, '사탕 비다!', 'coin');
    audio.pop();
  };
  // party fireworks next to the cake
  b.fireworks(72.4, FY + 0.5, 1.3, 1.0, { radius: 7, power: 90 });
  // balloons tied around the table
  for (let i = 0; i < 4; i++) b.balloonAnchored(68 + i * 1.2, FY + 4.2 + (i % 2) * 0.9, 68 + i * 1.2, FY + 0.2, giftCols[i], 2);
  // the cake table at the edge of the stair void — right leg is the weak one
  b.block(75.6, FY + 0.8, 0.4, 1.6, 'wood', { hp: 16, name: 'legL' });
  b.block(80.0, FY + 0.8, 0.4, 1.6, 'wood', { hp: 9, name: 'legR' });
  b.block(77.75, FY + 1.8, 6.0, 0.4, 'wood', { hp: 60, friction: 0.12, density: 0.5, obj: tableTop() });
  const CX = 78.6;
  const cakeT = b.target({ x: CX, y: FY + 3.05, w: 3.2, h: 2.1, model: P.cake(), hp: 70, mat: 'soft', density: 1.6, soakMax: 40, sound: 'cake' });
  cakeT.body!.getFixtureList()!.setFriction(0.12);
  // chandelier over the cake
  const chand = b.block(77.6, 15.9, 2.2, 0.7, 'metal', { breakable: false, density: 7, obj: chandelier() });
  b.hang(77.6, 18.0, chand, { color: '#c9a24a', cause: 'topple' });
  // sprinkler: pipe from the roof tank (background) to a glass valve over the cake (device)
  const valve = b.block(79.7, 17.7, 0.8, 0.6, 'glass', { static: true, hp: 4, breakable: true, role: 'device', obj: valveModel(), name: 'sprinkler' });
  valve.onBreak = () => {
    b.w.addEmitter({ x: 79.7, y: 17.2, dx: -0.15, dy: -1, rate: 26, speed: 5, time: 9, spread: 0.3 });
    b.w.events.onText(79.7, 16.8, '쏴아아!', 'water');
    audio.splash();
  };
  b.put(pipes(), 0, 0, -1.7);
  b.sign(83.5, FY, '스프링클러\n만지지 마시오', -1.7, 2.2, 1.0);
  b.coinArc(CX, FY + 5.6, 3.2, Math.PI * 0.15, Math.PI * 0.85, 5);
  // warm party light (seen through the windows from outside)
  const lamp = new THREE.PointLight('#ffcf8a', 26, 26, 1.6);
  lamp.position.set(66, 15.5, 1.5);
  b.deco.add(lamp);

  // ---------------------------------------------------------------- attic
  b.wall(63, 18.8, 2, 2, 1.2, 1.1, 'cardboard', { coins: 1 });
  b.gear('s2_bell', 66.2, 19.6);
  b.bell(80, 29.8, 3, 4);
  b.put(rockingHorse(), 72, 18.8, -2.0);
  b.coinLine(74, 20.2, 88, 20.2, 6);
  // roof: water tank (feeds the sprinkler) + gear on top
  const tankVis = P.waterTank(5, 3.8);
  b.w.addBox({ x: 84, y: ROOF_Y + 0.8 + 1.9, w: 5, h: 3.8, mat: 'metal', static: true, breakable: false, obj: tankVis, kind: 'tankbig' });
  b.gear('s2_tank', 84, ROOF_Y + 6.3);
  b.fuel(74, ROOF_Y + 1.6);

  // ---------------------------------------------------------------- the family (background: they never block)
  const fam = [
    { g: person({ shirt: '#3a4a6a', tie: '#e8443a', hair: '#2a2a2a', glasses: true }), x: 60.5, say: ['어허!', '내 케이크…!!'] },
    { g: person({ shirt: '#e86fa8', hair: '#5a3a20', bun: true }), x: 66.8, say: ['어머나!', '여보, 케이크!'] },
    { g: person({ shirt: '#ffd23f', hair: '#3a2a1a', scale: 0.7 }), x: 69.6, say: ['우와아!', '로켓이다!'] },
  ];
  for (const f of fam) {
    b.put(f.g.root, f.x, FY, -2.1);
    f.g.root.userData.noHaze = true;
  }
  let alarmed = -1;
  let cheered = false;
  const inside = (x: number, y: number) => x > HX0 + 1 && x < HX1 - 1 && y > 0 && y < ROOF_Y;
  b.animated.push((dt, t) => {
    const R = b.w.rocket;
    if (alarmed < 0 && R && !R.dead && R.ent.body) {
      const p = R.ent.body.getPosition();
      if (inside(p.x, p.y)) {
        alarmed = t;
        fam.forEach((f, i) => b.w.after(0.15 + i * 0.25, () => b.w.events.onText(f.x, FY + 3.4 * f.g.scale, f.say[0], 'warn')));
      }
    }
    for (let i = 0; i < fam.length; i++) {
      const f = fam[i].g;
      if (alarmed < 0) {
        // calm party: gentle sway, clapping
        f.root.position.y = FY + Math.abs(Math.sin(t * 2.2 + i)) * 0.05;
        f.armL.rotation.z = 0.5 + Math.sin(t * 6 + i) * 0.25;
        f.armR.rotation.z = -0.5 - Math.sin(t * 6 + i) * 0.25;
      } else {
        // panic: hop, arms up, look around
        const k = t - alarmed;
        f.root.position.y = FY + Math.abs(Math.sin(k * 9 + i)) * 0.4 * f.scale;
        f.armL.rotation.z = 2.7 + Math.sin(k * 14 + i) * 0.3;
        f.armR.rotation.z = -2.7 - Math.sin(k * 14 + i) * 0.3;
        f.head.rotation.y = Math.sin(k * 5 + i) * 0.6;
      }
    }
    if (!cheered && !cakeT.alive) {
      cheered = true;
      fam.forEach((f, i) => b.w.after(0.4 + i * 0.3, () => b.w.events.onText(f.x, FY + 3.6 * f.g.scale, f.say[1], 'warn')));
    }
  });

  // ---------------------------------------------------------------- front wall (cutaway: fades as you get close)
  b.cutaway(facade(), PARTY_HOUSE, 1.5, 7);
}

// ===================================================================== models
function person(o: { shirt: string; hair: string; tie?: string; glasses?: boolean; bun?: boolean; scale?: number }) {
  const s = o.scale ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.9, 4, 12), feltMat(o.shirt));
  body.position.y = 1.0;
  root.add(body);
  if (o.tie) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.05), feltMat(o.tie));
    tie.position.set(0, 1.25, 0.55);
    root.add(tie);
  }
  const head = new THREE.Group();
  head.position.y = 2.15;
  root.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), feltMat('#f2c9a0')));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, 0, 0.9), feltMat(o.hair));
  hair.position.y = 0.03;
  head.add(hair);
  if (o.bun) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), feltMat(o.hair));
    bun.position.set(0, 0.45, -0.1);
    head.add(bun);
  }
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), plastic('#1a1a1a', 0.3));
    eye.position.set(sx * 0.15, 0.05, 0.38);
    head.add(eye);
    if (o.glasses) {
      const gl = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 14), plastic('#222', 0.3));
      gl.position.set(sx * 0.15, 0.05, 0.4);
      head.add(gl);
    }
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 14), stripeMat(['#ff6fa8', '#ffffff', '#4dd2ff', '#ffffff'], false));
  hat.position.set(0.08, 0.62, 0);
  hat.rotation.z = -0.2;
  head.add(hat);
  const arm = (sx: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.55, 1.45, 0);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 8), feltMat(o.shirt));
    a.position.y = -0.38;
    pivot.add(a);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), feltMat('#f2c9a0'));
    hand.position.y = -0.75;
    pivot.add(hand);
    root.add(pivot);
    return pivot;
  };
  const armL = arm(-1);
  const armR = arm(1);
  root.scale.setScalar(s);
  return { root, head, armL, armR, scale: s };
}

function doorModel() {
  const g = new THREE.Group();
  const d = new THREE.Mesh(roundedBox(0.7, 4.0, 3.2, 0.08, 0.5), woodMat('#a8693a'));
  g.add(d);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), metalMat('#e0b84a', 0.25));
  knob.position.set(-0.4, -0.2, 0.9);
  g.add(knob);
  return g;
}

function fishTank(w: number, h: number) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(roundedBox(w, h, 1.2, 0.06, 1), new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.35, roughness: 0.05 }));
  g.add(glass);
  const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, h * 0.78, 1.08), new THREE.MeshStandardMaterial({ color: '#3a9be0', transparent: true, opacity: 0.55, roughness: 0.2 }));
  water.position.y = -h * 0.09;
  g.add(water);
  const sand = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.14, 1.08), feltMat('#f0d79a'));
  sand.position.y = -h / 2 + 0.1;
  g.add(sand);
  const cols = ['#ff8a3f', '#ffd23f', '#ff5a7a'];
  for (let i = 0; i < 3; i++) {
    const fish = new THREE.Group();
    const bodyF = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), plastic(cols[i], 0.3));
    bodyF.scale.set(1.5, 1, 0.6);
    fish.add(bodyF);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 6), plastic(cols[i], 0.3));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.3;
    fish.add(tail);
    fish.position.set(-0.7 + i * 0.7, -0.1 + (i % 2) * 0.25, 0.1);
    g.add(fish);
  }
  return g;
}

function giftBox(s: number, color: string) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(roundedBox(s * 0.98, s * 0.98, s * 0.98, 0.06, 1), feltMat(color)));
  const rib = feltMat('#ffffff');
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(s * 0.18, s, s + 0.02), rib);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(s + 0.02, s * 0.18, s + 0.02), rib);
  g.add(r1, r2);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(s * 0.16, s * 0.05, 6, 12), rib);
  bow.position.y = s * 0.55;
  g.add(bow);
  return g;
}

function pinata() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 10), stripeMat(['#ff4d6d', '#ffd23f', '#4dd2ff', '#7dff6a'], true));
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), feltMat('#ff8a3f'));
  headM.position.set(0.7, 0.25, 0);
  g.add(headM);
  for (const x of [-0.35, 0.35]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), feltMat('#ffd23f'));
    leg.position.set(x, -0.55, 0);
    g.add(leg);
  }
  return g;
}

function tableTop() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(roundedBox(6.0, 0.4, 2.6, 0.08, 0.5), woodMat('#c48a52')));
  const cloth = new THREE.Mesh(roundedBox(6.2, 0.12, 2.8, 0.04, 1), stripeMat(['#ffffff', '#ff9ec0'], true));
  cloth.position.y = 0.24;
  g.add(cloth);
  return g;
}

function chandelier() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 24), metalMat('#d8b04a', 0.25));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), metalMat('#d8b04a', 0.25));
  g.add(hub);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), emissive('#fff0b0', 2.4));
    c.position.set(Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95);
    g.add(c);
  }
  return g;
}

function valveModel() {
  const g = new THREE.Group();
  const v = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 14), plastic('#9fe0ff', 0.1, 0.1));
  (v.material as THREE.MeshStandardMaterial).transparent = true;
  (v.material as THREE.MeshStandardMaterial).opacity = 0.75;
  g.add(v);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 10), metalMat('#c0c6cc'));
  cap.position.y = 0.4;
  g.add(cap);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.1, 0.2, 10), metalMat('#e84a3a'));
  head.position.y = -0.36;
  g.add(head);
  return g;
}

function pipes() {
  const g = new THREE.Group();
  const m = metalMat('#9aa3ad', 0.4);
  const v = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, ROOF_Y - 17.7, 10), m);
  v.position.set(86.5, (ROOF_Y + 17.7) / 2, 0);
  g.add(v);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 86.5 - 79.7, 10), m);
  h.rotation.z = Math.PI / 2;
  h.position.set((86.5 + 79.7) / 2, 17.7, 0);
  g.add(h);
  return g;
}

function fridge() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(roundedBox(1.8, 3.4, 1.6, 0.18, 0.5), plastic('#f2f4f6', 0.35)));
  const line = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.05), plastic('#b8c0c8', 0.4));
  line.position.set(0, 0.5, 0.82);
  g.add(line);
  for (const y of [1.0, -0.4]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), metalMat('#a0a8b0'));
    h.position.set(0.7, y, 0.84);
    g.add(h);
  }
  const mag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), texMat('fridgenote', signTexture('생일\n축하♥', '#fff8a0', '#e8443a', 128, 100), 0.8));
  mag.position.set(-0.3, 1.1, 0.82);
  g.add(mag);
  return g;
}

function sofa() {
  const g = new THREE.Group();
  const m = feltMat('#6a8fd0');
  const seat = new THREE.Mesh(roundedBox(4.2, 0.7, 1.6, 0.25, 0.5), m);
  seat.position.y = -0.25;
  g.add(seat);
  const back = new THREE.Mesh(roundedBox(4.2, 1.2, 0.5, 0.2, 0.5), m);
  back.position.set(0, 0.3, -0.6);
  g.add(back);
  return g;
}

function tv() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(roundedBox(1.6, 1.1, 0.25, 0.06, 1), plastic('#222428', 0.4)));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), emissive('#6ad0ff', 0.6));
  scr.position.z = 0.13;
  g.add(scr);
  return g;
}

function trophies() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.12, 0.5, 12), metalMat('#e8c04a', 0.2));
    cup.position.set(-1.2 + i * 1.2, 0.35, 0);
    g.add(cup);
  }
  return g;
}

function stairs() {
  const g = new THREE.Group();
  const m = woodMat('#b98a5a');
  for (let i = 0; i < 10; i++) {
    const st = new THREE.Mesh(roundedBox(1.2, 0.4, 2.2, 0.05, 0.5), m);
    st.position.set(-4.5 + i * 1.0, 0.4 + i * 0.82, 0);
    g.add(st);
  }
  return g;
}

function tiles() {
  return new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), stripeMat(['#ffffff', '#cfe8f0'], true));
}

function wallpaperDots() {
  const g = new THREE.Group();
  const cols = ['#ffffff', '#ffb6cc', '#ffe08a'];
  for (let i = 0; i < 40; i++) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), feltMat(cols[i % 3]));
    d.position.set(-15.5 + (i % 10) * 3.4 + (Math.floor(i / 10) % 2) * 1.7, -3.6 + Math.floor(i / 10) * 2.3, 0);
    g.add(d);
  }
  return g;
}

function pictureFrame(color: string) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(roundedBox(2.0, 1.5, 0.12, 0.05, 1), woodMat('#e0b070')));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), feltMat(color));
  pic.position.z = 0.07;
  g.add(pic);
  return g;
}

function rockingHorse() {
  const g = new THREE.Group();
  const m = woodMat('#d08a4a');
  const body = new THREE.Mesh(roundedBox(1.6, 0.6, 0.5, 0.2, 0.5), m);
  body.position.y = 1.1;
  g.add(body);
  const head = new THREE.Mesh(roundedBox(0.5, 0.8, 0.4, 0.15, 0.5), m);
  head.position.set(0.8, 1.6, 0);
  g.add(head);
  const rocker = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 6, 20, Math.PI * 0.6), m);
  rocker.rotation.z = Math.PI * 1.2;
  rocker.position.y = 1.2;
  g.add(rocker);
  return g;
}

function partyBanner() {
  return new THREE.Mesh(new THREE.PlaneGeometry(10, 1.3), texMat('partyban', signTexture('★ 교장선생님 생신 축하 ★', '#ff6fa8', '#ffffff', 768, 110), 0.8, { side: THREE.DoubleSide }));
}

/** Front wall of the house with window holes; becomes a ghost when the rocket is close (Q-CI-05). */
function facade() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(HX0 - 0.4, -0.1);
  s.lineTo(HX1 + 0.4, -0.1);
  s.lineTo(HX1 + 0.4, ROOF_Y + 1.2);
  s.lineTo(68, ROOF_Y + 1.2);
  s.lineTo(HX0 - 0.9, 18.6);
  s.closePath();
  const hole = (x0: number, y0: number, x1: number, y1: number) => {
    const h = new THREE.Path();
    h.moveTo(x0, y0);
    h.lineTo(x0, y1);
    h.lineTo(x1, y1);
    h.lineTo(x1, y0);
    h.closePath();
    s.holes.push(h);
  };
  const wins: [number, number, number, number][] = [
    [50, 10.6, 64, 16.4], // party window — the family is visible from outside
    [67, 10.6, 78, 16.4],
    [60, 2.6, 68, 6.4], // kitchen
    [48.5, 0.2, 52, 5], // door glass
    [76, 21, 82, 26], // attic
  ];
  for (const w of wins) hole(...w);
  const wall = new THREE.Mesh(extrudeShape(s, 0.3, 0.06, 0.25), feltMat('#f6e3c6'));
  g.add(wall);
  const frameM = woodMat('#ffffff');
  for (const [x0, y0, x1, y1] of wins) {
    for (const [cx, cy, w, h] of [
      [(x0 + x1) / 2, y0, x1 - x0 + 0.4, 0.3],
      [(x0 + x1) / 2, y1, x1 - x0 + 0.4, 0.3],
      [x0, (y0 + y1) / 2, 0.3, y1 - y0],
      [x1, (y0 + y1) / 2, 0.3, y1 - y0],
      [(x0 + x1) / 2, (y0 + y1) / 2, 0.15, y1 - y0],
    ] as const) {
      const f = new THREE.Mesh(roundedBox(w, h, 0.35, 0.05, 1), frameM);
      f.position.set(cx, cy, 0.25);
      g.add(f);
    }
  }
  const trim = new THREE.Mesh(roundedBox(HX1 - HX0 + 1, 0.6, 0.6, 0.1, 0.5), feltMat('#b0523a'));
  trim.position.set((HX0 + HX1) / 2, ROOF_Y + 1.4, 0.2);
  g.add(trim);
  g.position.z = 3.4;
  return g;
}

function schoolFar() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(40, 16, 6, 0.4, 0.5), feltMat('#efe0b8'));
  body.position.y = 8;
  g.add(body);
  for (let i = 0; i < 8; i++)
    for (let r = 0; r < 3; r++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), feltMat('#8fc7ec'));
      w.position.set(-16 + i * 4.6, 3.5 + r * 4.6, 3.05);
      g.add(w);
    }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), texMat('schoolname', signTexture('꿈나무 초등학교', '#3a6fe8', '#ffffff', 512, 80), 0.8));
  sign.position.set(0, 16.9, 3.1);
  g.add(sign);
  return g;
}

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
