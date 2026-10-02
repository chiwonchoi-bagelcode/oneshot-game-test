import * as THREE from 'three';
import { LevelBuilder, StageDef } from '../game/level';
import * as P from '../render/models/props';
import { feltMat, plastic, woodMat, emissive, texMat } from '../render/materials';
import { roundedBox } from '../render/geom';
import { signTexture } from '../render/textures';

/** Stage 1 — Grumpy grandpa's golden gnome. Open backyard sandbox. */
export const stage1: StageDef = {
  id: 's1',
  index: 0,
  name: '뒷마당 대소동',
  targetName: '심술 영감의 황금 노움',
  brief: '옆집 심술 영감이 내 공을 압수했다! 전망대 꼭대기의 황금 노움을 박살내자.',
  reward: 220,
  gearIds: ['s1_tunnel', 's1_house', 's1_kite', 's1_greenhouse', 's1_doghouse', 's1_cloud'],
  methods: [
    { id: 'ram', name: '정면 돌파', hint: '충분히 빠르게 들이받으면 노움도 산산조각!', icon: '💥' },
    { id: 'topple', name: '무너뜨리기', hint: '전망대 다리가 꽤 약해 보인다…', icon: '🪵' },
    { id: 'device', name: '화분 떨구기', hint: '노움 머리 위에 뭔가 매달려 있다.', icon: '🪴' },
    { id: 'boom', name: '펑!', hint: '할아버지가 압수한 불꽃놀이 상자가 전망대 밑에…', icon: '🎆' },
  ],
  sky: { horizon: '#ffd7a0', mid: '#79c3f0', top: '#3a88dc', space: '#1b2552', spaceAlt: 230 },
  fog: ['#bfdcf0', 90, 420],
  bounds: { minX: -112, maxX: 146, minY: -40, maxY: 215 },
  build(b: LevelBuilder) {
    b.launch = { x: 0, y: 0 };
    // ------------------------------------------------------------ ground
    b.ground([{ x: -125, y: -40 }, { x: -12, y: -40 }, { x: -12, y: 0 }, { x: -125, y: 0 }]);
    b.ground([{ x: -12, y: -40 }, { x: 58.5, y: -40 }, { x: 58.5, y: -16 }, { x: -12, y: -16 }], { fill: 'darksoil', top: null });
    b.ground([{ x: -9.5, y: -11.5 }, { x: 56, y: -11.5 }, { x: 56, y: 0 }, { x: -9.5, y: 0 }]);
    b.ground([{ x: 58.5, y: -40 }, { x: 160, y: -40 }, { x: 160, y: 0 }, { x: 58.5, y: 0 }]);
    // tunnel back wall + lanterns
    b.feltPanel(23, -13.8, 71, 5, '#3d2a1e', -2.9, 0.3);
    for (let x = -4; x < 56; x += 14) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), emissive('#ffcf7a', 2.5));
      b.put(lamp, x, -12.3, -2.4);
      const l = new THREE.PointLight(0xffb060, 6, 9, 1.6);
      l.position.set(x, -12.6, 0);
      b.deco.add(l);
    }
    // manhole lids
    b.block(-10.75, 0.18, 3.2, 0.36, 'wood', { hp: 10 });
    b.block(57.25, 0.18, 3.2, 0.36, 'wood', { hp: 10 });
    b.sign(-15, 0, '지하 통로 ↓\n(맨홀)', -1.6, 2.4, 1.2);
    // tunnel goodies
    b.coinLine(-6, -13.8, 50, -13.8, 14);
    b.fuel(8, -14.6);
    b.gear('s1_tunnel', 30, -14.3);
    b.wall(30, -16, 1, 3, 1.0, 1.2, 'cardboard');
    b.wall(44, -16, 2, 2, 1.0, 1.0, 'cardboard', { coins: 1 });

    // ------------------------------------------------------------ launch yard
    b.put(P.clothesline(9), 13, 0, -3.2);
    b.put(P.bush(3), -6, 0, -2.2);
    b.put(P.bush(5), 9, 0, -2.4);
    b.sign(10, 0, '목표는 →\n할아버지네!', -1.2, 2.6, 1.2);
    // coin trail rewarding the launch & first steering
    b.coinLine(-1, 16, -1, 42, 7);
    b.coinArc(12, 50, 12, Math.PI * 0.95, Math.PI * 0.35, 8);
    b.balloonAnchored(16, 22, 16, 10, '#ff4d6d', 3);
    b.balloonAnchored(19, 25, 19, 13, '#ffd23f', 3);
    b.balloonAnchored(-8, 30, -8, 18, '#4dd2ff', 3);

    // ------------------------------------------------------------ kid's tree + treehouse
    b.slab(-22, 11, 2, 22, 'darkwood', { depth: 2.4 });
    b.slab(-15.5, 15, 9, 0.8, 'darkwood', { angle: 0.22, depth: 1.6 });
    b.slab(-28, 21, 10, 0.7, 'wood', { depth: 2.4, top: 'grass' });
    for (const [x, y, r] of [[-22, 25, 4], [-27, 26, 3.4], [-17, 26.5, 3.2], [-12, 18, 2.6], [-23, 29, 3]] as const) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), feltMat(['#5aa83a', '#6fbf4a', '#4a9a3a'][Math.floor(x) % 3 === 0 ? 0 : 1]));
      b.put(puff, x, y, -3.5);
    }
    b.block(-31.5, 22.4, 0.4, 2.2, 'cardboard');
    b.block(-24.5, 22.4, 0.4, 2.2, 'cardboard');
    b.block(-28, 23.7, 7.4, 0.35, 'cardboard');
    b.coinGrid(-28, 22, 3, 1);
    b.sign(-30, 21.35, '보리 기지\n어른 금지', -1, 2.2, 1.0);

    // ------------------------------------------------------------ kid's house (cut-away)
    b.slab(-74.5, 7, 1, 14, 'plaster', { depth: 6 });
    b.slab(-41.5, 8.8, 1, 10.4, 'plaster', { depth: 6 });
    b.slab(-60.5, 7, 27, 0.6, 'wood', { depth: 6 });
    b.ground([{ x: -78, y: 14 }, { x: -37, y: 14 }, { x: -57.5, y: 25 }], { fill: 'roof', top: null, depth: 7 });
    b.slab(-47, 22, 2, 6, 'brick', { depth: 2 });
    b.feltPanel(-58, 7, 33, 14, '#f6e7c8', -2.8, 0.3);
    b.feltPanel(-58, 3.5, 33, 7, '#9fc4e8', -2.75, 0.2);
    // ladder up to the attic floor (deco)
    b.put(ladder(7.4), -45, 0, -2.2);
    // furniture
    b.put(workbench(), -66, 0, -1.8);
    b.put(bed(), -52, 7.3, -1.8);
    // piggy bank: smash for cash
    const piggy = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), plastic('#ff9ac0', 0.3));
    body.scale.set(1.2, 1, 1);
    piggy.add(body);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.25, 8), plastic('#ff9ac0', 0.3));
      ear.position.set(s * 0.25, 0.55, 0.2);
      piggy.add(ear);
    }
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.15, 12), plastic('#ff7aa8', 0.3));
    snout.rotation.z = Math.PI / 2;
    snout.position.x = 0.75;
    piggy.add(snout);
    b.block(-56, 8.0, 1.4, 1.1, 'ceramic', { obj: piggy, hp: 8, coins: 12, noDebris: false });
    b.gear('s1_house', -71, 9);
    b.fuel(-63, 1.2);
    b.coinLine(-70, 1.2, -48, 1.2, 7);
    b.wall(-58, 0, 2, 2, 1.1, 1.1, 'cardboard', { coins: 1 });
    // doghouse — narrow entrance (slim rockets) or just smash it (heavy)
    b.slab(-98, 1.6, 0.5, 3.2, 'wood', { breakable: true, hp: 40, depth: 2 });
    b.slab(-95, 3.45, 7, 0.5, 'wood', { breakable: true, hp: 40, depth: 2 });
    b.slab(-92, 2.35, 0.5, 1.7, 'wood', { breakable: true, hp: 40, depth: 2 });
    b.putInPlane(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), texMat('dogsign', signTexture('멍멍이 집', '#fff', '#d24a3a', 256, 96), 0.7)), -95, 4.3, 1.05);
    b.gear('s1_doghouse', -95.5, 0.8);
    b.put(P.bush(9), -104, 0, -2);
    b.put(P.tree(17, 1.1), -86, 0, -6);

    // ------------------------------------------------------------ grandpa's yard
    b.put(P.fenceSection(14, 2.4), 33, 0, -1.8);
    b.sign(30, 0, '할아버지네 마당\n출입 금지!!', -1.0, 2.6, 1.2);
    b.hydrant(40, 0);
    b.fireworks(61.8, 0.5, 1.4, 1.0, { radius: 6.5, power: 80 });
    // lookout tower — static legs that break, dynamic platform on top
    b.slab(66.5, 15, 0.8, 30, 'wood', { breakable: true, hp: 26, depth: 1.2, name: 'legL' });
    b.slab(73.5, 15, 0.8, 30, 'wood', { breakable: true, hp: 26, depth: 1.2, name: 'legR' });
    for (const y of [7, 17]) {
      b.slab(70, y, 7.6, 0.4, 'wood', { angle: 0.5, breakable: true, hp: 12, depth: 0.8 });
    }
    b.block(70, 30.3, 9, 0.6, 'wood', { hp: 40 });
    // glass display case around the gnome
    b.block(68.4, 31.6, 0.25, 2.0, 'glass', { density: 0.6 });
    b.block(71.6, 31.6, 0.25, 2.0, 'glass', { density: 0.6 });
    b.block(70, 32.75, 3.4, 0.25, 'glass', { density: 0.6 });
    b.target({ x: 70, y: 31.45, w: 1.0, h: 1.7, model: P.gnome(), hp: 20, density: 2.0, sound: 'ceramic' });
    // hanging iron pot from grandpa's tree branch
    b.slab(88, 24, 2.6, 48, 'darkwood', { depth: 3 });
    b.slab(78.5, 46.6, 20, 1.2, 'darkwood', { depth: 2 });
    for (const [x, y, r] of [[88, 50, 6], [80, 49, 4.5], [72, 49.5, 4], [94, 46, 4.5], [84, 54, 5]] as const) {
      b.put(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), feltMat(r > 5 ? '#4a9a3a' : '#5fae40')), x, y, -4.5);
    }
    const pot = b.w.addCircle({ x: 70.3, y: 40, r: 0.8, mat: 'metal', breakable: false, obj: P.flowerPot(), density: 3.2, kind: 'weight' });
    pot.obj!.children[0].position.y = 0;
    b.hang(70.3, 46.0, pot, { by: 40.6 });
    // greenhouse (glass)
    for (let i = 0; i < 3; i++) {
      b.slab(97, 1.2 + i * 2.2, 0.3, 2.1, 'glass', { breakable: true, hp: 4, depth: 3 });
      b.slab(111, 1.2 + i * 2.2, 0.3, 2.1, 'glass', { breakable: true, hp: 4, depth: 3 });
    }
    for (let i = 0; i < 4; i++) b.slab(98.8 + i * 3.4, 7.2, 3.3, 0.25, 'glass', { breakable: true, hp: 4, depth: 3 });
    b.coinGrid(104, 1, 4, 2);
    b.gear('s1_greenhouse', 104, 4.4);
    b.put(P.flowerPatch(5), 100, 0, -1.8);
    b.put(P.flowerPatch(6), 107, 0, -1.8);
    // grandpa's house
    b.slab(126, 6, 24, 12, 'plaster', { depth: 6 });
    b.ground([{ x: 112, y: 12 }, { x: 140, y: 12 }, { x: 126, y: 20 }], { fill: 'bluetile', top: null, depth: 7 });
    b.put(P.houseFacade(22, 11, '#e9dcc2', '#4f7fb5', 7), 126, 0, 3.2, 1).scale.set(1, 1, 0.5);
    b.vending(116, 12);
    b.put(grandpa(), 143, 0, -1.8);

    // ------------------------------------------------------------ sky
    b.clouds(-110, 150, 40, 200, 26);
    // cloud island with treasure (far up/right)
    b.ground(cloudShape(104, 150, 16, 2.6), { fill: 'cloud', top: null, depth: 5 });
    b.gear('s1_cloud', 106, 154);
    b.fuel(98, 153.5);
    b.coinArc(104, 152, 7, Math.PI * 0.15, Math.PI * 0.85, 7);
    // mid cloud steps
    b.ground(cloudShape(55, 95, 10, 2), { fill: 'cloud', top: null, depth: 4 });
    b.coinLine(50, 98.5, 60, 98.5, 5);
    b.ground(cloudShape(-40, 88, 11, 2.2), { fill: 'cloud', top: null, depth: 4 });
    b.coinLine(-45, 91.5, -35, 91.5, 5);
    // stuck kite with gear
    b.put(kite(), -30, 122, -1.8);
    b.gear('s1_kite', -30, 119.5);
    b.coinLine(-30, 104, -30, 114, 4);
    // coin ladder up the middle
    b.coinLine(25, 70, 40, 130, 8);
    b.balloonAnchored(30, 80, 25, 60, '#a35bff', 4);
    // background
    b.backdropHills(-220, 280, 0, ['#6fb84c', '#86c562', '#a3d27e'], [-60, -110, -170]);
    for (let i = 0; i < 7; i++) b.put(P.cityBlock(i * 13 + 2, ['#efd8c0', '#e2d0ea', '#c8e0ee', '#f2e2b8'][i % 4]), -150 + i * 55, 0, -75, 1.0);
    b.put(P.sun(), -30, 70, -150, 2.0);
    for (let i = 0; i < 9; i++) b.put(P.tree(i * 7 + 1, 1 + (i % 3) * 0.3), -120 + i * 32, 0, -14 - (i % 3) * 4);
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

function workbench() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(roundedBox(4, 0.25, 1.6, 0.06, 0.6), woodMat('#a8703e'));
  top.position.y = 1.4;
  g.add(top);
  for (const x of [-1.8, 1.8]) {
    const leg = new THREE.Mesh(roundedBox(0.2, 1.4, 1.4, 0.05, 0.6), woodMat('#8a5a30'));
    leg.position.set(x, 0.7, 0);
    g.add(leg);
  }
  // blueprint
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), texMat('blueprint', signTexture('로켓 설계도\n★ 극비 ★', '#2a5ab0', '#ffffff', 256, 180), 0.7));
  bp.rotation.x = -Math.PI / 2;
  bp.position.set(-0.6, 1.54, 0.1);
  g.add(bp);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12), plastic('#d42a2a', 0.3));
  can.position.set(1, 1.78, 0);
  g.add(can);
  const hammer = new THREE.Mesh(roundedBox(0.6, 0.12, 0.12, 0.03, 1), woodMat('#c08550'));
  hammer.position.set(0.3, 1.6, 0.4);
  hammer.rotation.y = 0.4;
  g.add(hammer);
  return g;
}

function ladder(h: number) {
  const g = new THREE.Group();
  for (const x of [-0.4, 0.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), woodMat('#9a6a3a'));
    rail.position.set(x, h / 2, 0);
    g.add(rail);
  }
  for (let y = 0.4; y < h; y += 0.6) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.08), woodMat('#9a6a3a'));
    rung.position.set(0, y, 0);
    g.add(rung);
  }
  return g;
}

function bed() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(roundedBox(4, 0.6, 1.8, 0.1, 0.6), woodMat('#c08550'));
  frame.position.y = 0.4;
  g.add(frame);
  const blanket = new THREE.Mesh(roundedBox(3.2, 0.35, 1.8, 0.15, 0.6), feltMat('#4a8ad8'));
  blanket.position.set(0.3, 0.85, 0);
  g.add(blanket);
  const pillow = new THREE.Mesh(roundedBox(0.8, 0.35, 1.2, 0.15, 0.6), feltMat('#ffffff'));
  pillow.position.set(-1.5, 0.9, 0);
  g.add(pillow);
  const head = new THREE.Mesh(roundedBox(0.2, 1.6, 1.8, 0.08, 0.6), woodMat('#c08550'));
  head.position.set(-2, 0.8, 0);
  g.add(head);
  return g;
}

function kite() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 1.6);
  s.lineTo(1.1, 0);
  s.lineTo(0, -2.2);
  s.lineTo(-1.1, 0);
  s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: 0xff5a4e, side: THREE.DoubleSide, roughness: 0.8 }));
  g.add(m);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5, 4), plastic('#fff', 0.8));
  tail.position.set(0.3, -4.3, 0);
  tail.rotation.z = 0.15;
  g.add(tail);
  for (let i = 0; i < 4; i++) {
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), feltMat(['#ffd23f', '#3a6fe8'][i % 2]));
    bow.rotation.z = Math.PI / 2;
    bow.position.set(0.3 + i * 0.18, -2.8 - i * 1.0, 0);
    g.add(bow);
  }
  g.rotation.z = -0.3;
  return g;
}

function grandpa() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 4, 12), feltMat('#7a6a9a'));
  body.position.y = 0.9;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), feltMat('#f2c9a0'));
  head.position.y = 1.9;
  g.add(head);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 12), feltMat('#ffffff'));
  beard.rotation.x = Math.PI;
  beard.position.set(0, 1.62, 0.2);
  g.add(beard);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.2, 14), feltMat('#4a3a2a'));
  hat.position.y = 2.25;
  g.add(hat);
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), feltMat('#ffffff'));
    brow.position.set(s * 0.14, 2.0, 0.36);
    brow.rotation.z = -s * 0.4;
    g.add(brow);
  }
  const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), woodMat('#6a3a1a'));
  cane.position.set(0.55, 0.9, 0.2);
  cane.rotation.z = -0.2;
  g.add(cane);
  return g;
}
