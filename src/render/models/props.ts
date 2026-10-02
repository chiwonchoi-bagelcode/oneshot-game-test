import * as THREE from 'three';
import { cardMat, emissive, feltMat, getMaterial, knitMat, metalMat, plastic, shiny, stripeMat, texMat, woodMat } from '../materials';
import { extrudeShape, gearShape, lathe, roundedBox } from '../geom';
import { label, signTexture } from '../textures';
import { mulberry32 } from '../../core/math';

export function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true, receive = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = receive;
  return o;
}

// ------------------------------------------------------------------ generic block
export function blockMesh(w: number, h: number, d: number, mat: string) {
  const info = getMaterial(mat);
  const r = Math.min(0.12, Math.min(w, h) * 0.18);
  const uv = mat === 'glass' ? 1 : 0.5;
  const m = mesh(roundedBox(w, h, d, r, uv, 2), info);
  if (mat === 'glass') {
    m.castShadow = false;
    const g = new THREE.Group();
    g.add(m);
    // frame edges so glass reads clearly
    const frameM = plastic('#a9c4d6', 0.35, 0.3);
    const t = 0.06;
    for (const [fw, fh, x, y] of [
      [w, t, 0, h / 2 - t / 2],
      [w, t, 0, -h / 2 + t / 2],
      [t, h, w / 2 - t / 2, 0],
      [t, h, -w / 2 + t / 2, 0],
    ]) {
      const f = mesh(new THREE.BoxGeometry(fw, fh, d * 1.02), frameM);
      f.position.set(x, y, 0);
      g.add(f);
    }
    // glint
    const glint = mesh(new THREE.PlaneGeometry(Math.min(w, h) * 0.15, Math.max(w, h) * 0.7), plastic('#ffffff', 0.1), false, false);
    (glint.material as THREE.MeshStandardMaterial).transparent = true;
    glint.position.set(-w * 0.2, 0, d / 2 + 0.01);
    glint.rotation.z = 0.5;
    g.add(glint);
    return g;
  }
  return m;
}

// ------------------------------------------------------------------ seesaw (널뛰기)
export function seesaw() {
  const g = new THREE.Group();
  // straw bundle fulcrum wrapped in saekdong cloth
  const bundle = mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.6, 20), stripeMat(['#e8443a', '#f6d23a', '#3aa85a', '#3a6fe8', '#f2f2f2', '#b84ae8'], true));
  bundle.rotation.x = Math.PI / 2;
  bundle.position.y = 0.42;
  g.add(bundle);
  for (const z of [-0.6, 0, 0.6]) {
    const rope = mesh(new THREE.TorusGeometry(0.43, 0.03, 6, 20), feltMat('#d8b878'));
    rope.position.set(0, 0.42, z);
    g.add(rope);
  }
  const board = new THREE.Group();
  board.position.y = 0.88;
  const plank = mesh(roundedBox(5.2, 0.16, 1.0, 0.05, 0.6), woodMat('#c58a52'));
  board.add(plank);
  // painted ends
  for (const s of [-1, 1]) {
    const pad = mesh(roundedBox(0.8, 0.04, 0.9, 0.02, 1), feltMat(s < 0 ? '#e8443a' : '#3a6fe8'));
    pad.position.set(s * 2.1, 0.1, 0);
    board.add(pad);
  }
  g.add(board);
  return { group: g, board };
}

export function crateStack() {
  const g = new THREE.Group();
  const mk = (w: number, h: number, x: number, y: number, rot = 0, mat = cardMat('#c89b62')) => {
    const c = mesh(roundedBox(w, h, 1.4, 0.05, 0.45), mat);
    c.position.set(x, y + h / 2, 0);
    c.rotation.z = rot;
    g.add(c);
    // tape stripe
    const tape = mesh(new THREE.BoxGeometry(w * 1.01, 0.12, 1.42), plastic('#c9a46a', 0.7));
    tape.position.set(x, y + h * 0.5, 0);
    tape.rotation.z = rot;
    g.add(tape);
  };
  mk(1.6, 1.2, 0, 0);
  mk(1.4, 1.1, 0.1, 1.2, 0.03);
  mk(1.2, 1.0, -0.05, 2.3, -0.04, woodMat('#b07040'));
  mk(1.0, 0.9, 0.05, 3.3, 0.02);
  // ladder
  const ladder = new THREE.Group();
  for (const x of [-0.25, 0.25]) {
    const rail = mesh(new THREE.BoxGeometry(0.08, 4.4, 0.08), woodMat('#9a6a3a'));
    rail.position.set(x, 2.2, 0);
    ladder.add(rail);
  }
  for (let i = 0; i < 9; i++) {
    const rung = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), woodMat('#9a6a3a'));
    rung.position.set(0, 0.3 + i * 0.47, 0);
    ladder.add(rung);
  }
  ladder.position.set(0.95, 0, 0.5);
  ladder.rotation.z = 0.12;
  g.add(ladder);
  return g;
}

// ------------------------------------------------------------------ targets
export function gnome() {
  const g = new THREE.Group();
  const gold = shiny('#f2c14a', 0.25, 1);
  const beard = feltMat('#fbf6ec');
  const hat = plastic('#e23a2a', 0.35);
  const body = mesh(lathe([[0, 0], [0.42, 0], [0.45, 0.1], [0.38, 0.6], [0.25, 0.75], [0, 0.78]], 24), gold);
  g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.27, 20, 16), plastic('#f6c9a4', 0.5));
  head.position.y = 0.95;
  g.add(head);
  const beardM = mesh(new THREE.ConeGeometry(0.28, 0.55, 16), beard);
  beardM.rotation.x = Math.PI;
  beardM.position.set(0, 0.7, 0.13);
  g.add(beardM);
  const nose = mesh(new THREE.SphereGeometry(0.09, 12, 10), plastic('#f08a7a', 0.4));
  nose.position.set(0, 0.93, 0.26);
  g.add(nose);
  const hatM = mesh(new THREE.ConeGeometry(0.3, 0.75, 20), hat);
  hatM.position.y = 1.42;
  hatM.rotation.z = 0.15;
  g.add(hatM);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 8, 8), plastic('#111', 0.2));
    eye.position.set(s * 0.09, 1.02, 0.23);
    g.add(eye);
    const brow = mesh(new THREE.BoxGeometry(0.1, 0.025, 0.03), beard);
    brow.position.set(s * 0.09, 1.08, 0.24);
    brow.rotation.z = -s * 0.35; // grumpy
    g.add(brow);
  }
  // pedestal
  const ped = mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 24), plastic('#f4efe6', 0.6));
  ped.position.y = -0.04;
  g.add(ped);
  // a shovel
  const shovel = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), gold);
  shovel.position.set(0.4, 0.45, 0.1);
  shovel.rotation.z = -0.2;
  g.add(shovel);
  return g;
}

export function cake() {
  const g = new THREE.Group();
  const tiers = [
    [1.6, 0.8, '#f9e4ec'],
    [1.2, 0.7, '#ffffff'],
    [0.8, 0.6, '#ffd3e2'],
  ] as const;
  let y = 0;
  for (const [r, h, c] of tiers) {
    const t = mesh(new THREE.CylinderGeometry(r, r, h, 28), feltMat(c, 0.8));
    t.position.y = y + h / 2;
    g.add(t);
    // frosting drips
    const drip = mesh(new THREE.TorusGeometry(r, 0.08, 8, 28), feltMat('#fff7fb', 0.6));
    drip.rotation.x = Math.PI / 2;
    drip.position.y = y + h;
    g.add(drip);
    // berries
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = mesh(new THREE.SphereGeometry(0.09, 10, 8), plastic('#e0203a', 0.25));
      b.position.set(Math.cos(a) * r * 0.85, y + h + 0.06, Math.sin(a) * r * 0.85);
      g.add(b);
    }
    y += h;
  }
  // candles
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const c = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), stripeMat(['#4fb3ff', '#ffffff'], false));
    c.position.set(Math.cos(a) * 0.45, y + 0.17, Math.sin(a) * 0.45);
    g.add(c);
    const f = mesh(new THREE.SphereGeometry(0.05, 8, 8), emissive('#ffb02e', 4));
    f.scale.y = 1.6;
    f.position.set(Math.cos(a) * 0.45, y + 0.4, Math.sin(a) * 0.45);
    f.name = 'candleFlame';
    g.add(f);
  }
  // "교장선생님 생신 축하" plate
  const plate = mesh(new THREE.PlaneGeometry(0.9, 0.3), texMat('cakeplate', signTexture('교장쌤 생신♥', '#ffffff', '#e8553d', 384, 128), 0.6));
  plate.position.set(0, 0.4, 1.61);
  g.add(plate);
  return g;
}

export function blimp() {
  const g = new THREE.Group();
  const env = mesh(new THREE.SphereGeometry(1, 32, 20), stripeMat(['#f2f2f2', '#e8443a', '#f2f2f2', '#e8443a', '#f2f2f2', '#e8443a', '#f2f2f2', '#e8443a'], false));
  env.scale.set(5.2, 2.0, 2.0);
  g.add(env);
  // fins
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-1.6, 1.4);
  finShape.lineTo(-2.1, 1.4);
  finShape.lineTo(-1.4, 0);
  finShape.closePath();
  const finGeo = extrudeShape(finShape, 0.15, 0.04, 1);
  for (const [rx, sy] of [
    [0, 1],
    [0, -1],
    [Math.PI / 2, 1],
    [-Math.PI / 2, 1],
  ] as const) {
    const f = mesh(finGeo, feltMat('#e8443a'));
    f.position.x = -4.0;
    f.scale.y = sy;
    f.rotation.x = rx;
    g.add(f);
  }
  // gondola
  const gon = mesh(roundedBox(2.0, 0.6, 0.8, 0.2, 0.6), plastic('#f6d23a', 0.4));
  gon.position.set(0.3, -2.2, 0);
  g.add(gon);
  for (let i = 0; i < 4; i++) {
    const w = mesh(new THREE.CircleGeometry(0.13, 12), plastic('#7fd1ff', 0.1));
    w.position.set(-0.45 + i * 0.3, -2.15, 0.41);
    g.add(w);
  }
  // banner: mayor's face
  const banner = mesh(
    new THREE.PlaneGeometry(4.6, 1.1),
    texMat('blimpBanner', signTexture('시장님 최고! 투표 2번!', '#ffffff', '#1d4fbf', 768, 192), 0.6, { side: THREE.DoubleSide }),
  );
  banner.position.set(0.2, 0, 2.02);
  g.add(banner);
  // valve on top
  const valve = mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.25, 12), metalMat('#c9a24a', 0.3));
  valve.position.set(0.5, 2.0, 0);
  valve.name = 'valve';
  g.add(valve);
  return g;
}

// ------------------------------------------------------------------ hanging heavy pot
export function flowerPot() {
  const g = new THREE.Group();
  const pot = mesh(lathe([[0, -0.55], [0.5, -0.55], [0.7, 0.35], [0.8, 0.4], [0.8, 0.55], [0, 0.55]], 24), plastic('#5a5f66', 0.4, 0.6));
  g.add(pot);
  const soil = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 20), feltMat('#4a3020'));
  soil.position.y = 0.5;
  g.add(soil);
  const rnd = mulberry32(4);
  for (let i = 0; i < 7; i++) {
    const st = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), feltMat('#3f8a3a'));
    const x = (rnd() - 0.5) * 0.8;
    st.position.set(x, 0.8, (rnd() - 0.5) * 0.4);
    g.add(st);
    const fl = mesh(new THREE.IcosahedronGeometry(0.12, 0), feltMat(['#ff5a7a', '#ffd23a', '#ffffff'][i % 3]));
    fl.position.set(x, 1.1, st.position.z);
    g.add(fl);
  }
  // label
  const tag = mesh(new THREE.PlaneGeometry(0.7, 0.3), texMat('potLabel', signTexture('무쇠 화분 50kg', '#f4e7cc', '#333', 256, 96), 0.7));
  tag.position.set(0, 0.0, 0.66);
  tag.rotation.x = -0.2;
  g.add(tag);
  return g;
}

export function anvil() {
  const g = new THREE.Group();
  const m = metalMat('#3a3d42', 0.4);
  const top = mesh(roundedBox(1.4, 0.35, 0.6, 0.05, 1), m);
  top.position.y = 0.25;
  g.add(top);
  const horn = mesh(new THREE.ConeGeometry(0.17, 0.6, 12), m);
  horn.rotation.z = Math.PI / 2;
  horn.position.set(-0.95, 0.3, 0);
  g.add(horn);
  const waist = mesh(roundedBox(0.5, 0.35, 0.45, 0.05, 1), m);
  waist.position.y = -0.1;
  g.add(waist);
  const foot = mesh(roundedBox(1.0, 0.2, 0.6, 0.05, 1), m);
  foot.position.y = -0.35;
  g.add(foot);
  return g;
}

// ------------------------------------------------------------------ nature deco
export function tree(seed = 1, scale = 1, autumn = false) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const trunkH = 4 + rnd() * 2;
  const trunk = mesh(new THREE.CylinderGeometry(0.3, 0.5, trunkH, 10), woodMat('#7a4a2a'));
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const greens = autumn ? ['#e8943a', '#d8642a', '#f2c14a'] : ['#5aa83a', '#6fbf4a', '#4a9a3a', '#82c85a'];
  const n = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const r = 1.1 + rnd() * 0.9;
    const puff = mesh(new THREE.IcosahedronGeometry(r, 2), feltMat(greens[i % greens.length]));
    puff.position.set((rnd() - 0.5) * 3, trunkH + (rnd() - 0.3) * 2, (rnd() - 0.5) * 1.6);
    g.add(puff);
  }
  g.scale.setScalar(scale);
  return g;
}

export function bush(seed = 1, color = '#4f9e3a') {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = mesh(new THREE.IcosahedronGeometry(0.5 + rnd() * 0.4, 1), feltMat(color));
    p.position.set((rnd() - 0.5) * 1.6, 0.4 + rnd() * 0.3, (rnd() - 0.5) * 0.6);
    g.add(p);
  }
  // flowers
  for (let i = 0; i < 5; i++) {
    const f = mesh(new THREE.SphereGeometry(0.08, 6, 6), feltMat(['#ff6a8a', '#fff', '#ffd23a'][i % 3]));
    f.position.set((rnd() - 0.5) * 1.6, 0.6 + rnd() * 0.5, 0.45);
    g.add(f);
  }
  return g;
}

export function cloud(seed = 1, scale = 1) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const m = feltMat('#ffffff');
  const n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const r = 0.8 + rnd() * 1.0;
    const p = mesh(new THREE.IcosahedronGeometry(r, 2), m, false, true);
    p.position.set((i - n / 2) * 0.9 + rnd() * 0.4, (rnd() - 0.2) * 0.8 + (1 - Math.abs(i - n / 2) / n) * 0.8, (rnd() - 0.5) * 0.8);
    p.scale.y = 0.75;
    g.add(p);
  }
  // string holding the cloud (it's a craft diorama!)
  const s = mesh(new THREE.CylinderGeometry(0.012, 0.012, 14, 3), plastic('#d8d0c8', 0.9), false, false);
  s.position.y = 7.5;
  g.add(s);
  g.scale.setScalar(scale);
  return g;
}

export function flowerPatch(seed = 1) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const st = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), feltMat('#3f8a3a'), false);
    const x = (rnd() - 0.5) * 2;
    st.position.set(x, 0.2, rnd() * 0.5);
    g.add(st);
    const fl = mesh(new THREE.IcosahedronGeometry(0.1, 0), feltMat(['#ff5a7a', '#ffd23a', '#ffffff', '#a37aff'][i % 4]), false);
    fl.position.set(x, 0.42, st.position.z);
    g.add(fl);
  }
  return g;
}

export function fenceSection(len = 6, h = 2.2, color = '#d8b27a') {
  const g = new THREE.Group();
  const m = woodMat(color);
  const n = Math.round(len / 0.55);
  for (let i = 0; i < n; i++) {
    const p = mesh(roundedBox(0.42, h, 0.12, 0.04, 0.6), m);
    p.position.set(-len / 2 + 0.27 + i * 0.55, h / 2, 0);
    g.add(p);
    const tip = new THREE.Shape();
    tip.moveTo(-0.21, 0);
    tip.lineTo(0, 0.25);
    tip.lineTo(0.21, 0);
    const t = mesh(extrudeShape(tip, 0.12, 0.01, 1), m);
    t.position.set(p.position.x, h, 0);
    g.add(t);
  }
  for (const y of [h * 0.25, h * 0.75]) {
    const rail = mesh(roundedBox(len, 0.18, 0.1, 0.03, 0.6), woodMat('#b08050'));
    rail.position.set(0, y, -0.1);
    g.add(rail);
  }
  return g;
}

/** Cutaway dollhouse facade. */
export function houseFacade(w: number, h: number, color = '#f2e4c8', roofColor = '#c45a40', seed = 3) {
  const g = new THREE.Group();
  const wall = mesh(roundedBox(w, h, 0.4, 0.1, 0.3), feltMat(color));
  wall.position.y = h / 2;
  g.add(wall);
  const rnd = mulberry32(seed);
  const cols = Math.max(1, Math.floor(w / 3));
  const rows = Math.max(1, Math.floor(h / 3.2));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      const y = 1.6 + r * 3.2;
      const frame = mesh(roundedBox(1.5, 1.6, 0.2, 0.05, 1), woodMat('#ffffff'));
      frame.position.set(x, y, 0.25);
      g.add(frame);
      const lit = rnd() < 0.3;
      const glass = mesh(new THREE.PlaneGeometry(1.25, 1.35), lit ? emissive('#ffd98a', 0.7) : plastic('#9fd4f2', 0.1, 0.1));
      glass.position.set(x, y, 0.36);
      g.add(glass);
      const bar = mesh(new THREE.BoxGeometry(0.06, 1.35, 0.05), woodMat('#ffffff'));
      bar.position.set(x, y, 0.38);
      g.add(bar);
      const bar2 = mesh(new THREE.BoxGeometry(1.25, 0.06, 0.05), woodMat('#ffffff'));
      bar2.position.set(x, y, 0.38);
      g.add(bar2);
      // flower box
      const box = mesh(roundedBox(1.4, 0.25, 0.35, 0.05, 1), feltMat('#a0603a'));
      box.position.set(x, y - 0.95, 0.4);
      g.add(box);
      for (let k = 0; k < 4; k++) {
        const fl = mesh(new THREE.SphereGeometry(0.1, 6, 6), feltMat(['#ff5a7a', '#ffd23a', '#ffffff'][k % 3]));
        fl.position.set(x - 0.5 + k * 0.33, y - 0.75, 0.45);
        g.add(fl);
      }
    }
  // roof triangle (deco)
  const roof = new THREE.Shape();
  roof.moveTo(-w / 2 - 0.6, 0);
  roof.lineTo(0, h * 0.45);
  roof.lineTo(w / 2 + 0.6, 0);
  roof.closePath();
  const rm = mesh(extrudeShape(roof, 0.8, 0.1, 0.5), feltMat(roofColor));
  rm.position.y = h;
  g.add(rm);
  return g;
}

// ------------------------------------------------------------------ pickups
export function bottleCapGeometry() {
  const g = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 21);
  // crimp the edge
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    if (r > 0.3) {
      const a = Math.atan2(z, x);
      const k = 1 + 0.06 * Math.sign(Math.sin(a * 21));
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2);
  return g;
}

export function gearPickup() {
  const g = new THREE.Group();
  const geo = extrudeShape(gearShape(10, 0.6, 0.48, 0.18), 0.22, 0.04, 1);
  const m = mesh(geo, shiny('#ffcc33', 0.2, 1));
  g.add(m);
  const hub = mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20), shiny('#fff2b0', 0.2, 1));
  g.add(hub);
  // glow halo
  const halo = mesh(new THREE.RingGeometry(0.75, 0.95, 32), emissive('#ffe680', 1.4), false, false);
  (halo.material as THREE.Material).transparent = true;
  (halo.material as THREE.MeshStandardMaterial).opacity = 0.5;
  halo.position.z = -0.2;
  g.add(halo);
  return g;
}

export function fuelCan() {
  const g = new THREE.Group();
  const body = mesh(roundedBox(0.7, 0.9, 0.35, 0.08, 1), plastic('#e8b81a', 0.35, 0.3));
  g.add(body);
  const handle = mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 12, Math.PI), plastic('#333', 0.5));
  handle.position.set(-0.1, 0.48, 0);
  g.add(handle);
  const spout = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 10), plastic('#333', 0.5));
  spout.position.set(0.25, 0.55, 0);
  spout.rotation.z = -0.6;
  g.add(spout);
  const lab = mesh(new THREE.PlaneGeometry(0.5, 0.4), texMat('fuelLbl', signTexture('연료\nFUEL', '#e8443a', '#ffffff', 256, 200), 0.6));
  lab.position.z = 0.18;
  g.add(lab);
  return g;
}

// ------------------------------------------------------------------ interactive props
export function waterTank(w: number, h: number) {
  const g = new THREE.Group();
  const shell = mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 24), plastic('#3a8be0', 0.3, 0.1));
  g.add(shell);
  for (const y of [-h * 0.3, 0, h * 0.3]) {
    const band = mesh(new THREE.TorusGeometry(w / 2 + 0.02, 0.04, 6, 24), metalMat('#888', 0.3));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const lid = mesh(new THREE.ConeGeometry(w / 2 + 0.05, 0.4, 24), plastic('#2a6bc0', 0.3));
  lid.position.y = h / 2 + 0.2;
  g.add(lid);
  const lab = mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.35), texMat('waterLbl', signTexture('물 💧\nWATER', '#ffffff', '#2a6bc0', 256, 200), 0.6));
  lab.position.z = w / 2 + 0.02;
  g.add(lab);
  return g;
}

export function barrel(w: number, h: number) {
  const g = new THREE.Group();
  const shell = mesh(lathe([[w * 0.45, -h / 2], [w * 0.5, 0], [w * 0.45, h / 2], [0, h / 2]], 20), woodMat('#9a6a3a'));
  g.add(shell);
  const bottom = mesh(new THREE.CircleGeometry(w * 0.45, 20), woodMat('#9a6a3a'));
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -h / 2;
  g.add(bottom);
  for (const y of [-h * 0.35, h * 0.35]) {
    const band = mesh(new THREE.TorusGeometry(w * 0.48, 0.04, 6, 24), metalMat('#555', 0.4));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const water = mesh(new THREE.CircleGeometry(w * 0.44, 20), plastic('#3a9be8', 0.1));
  water.rotation.x = -Math.PI / 2;
  water.position.y = h / 2 - 0.05;
  g.add(water);
  return g;
}

export function hydrant() {
  const g = new THREE.Group();
  const m = plastic('#e0322a', 0.35, 0.3);
  const body = mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.0, 16), m);
  body.position.y = 0.5;
  g.add(body);
  const cap = mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
  cap.position.y = 1.0;
  g.add(cap);
  const nub = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.15, 8), metalMat('#c9a24a', 0.3));
  nub.position.y = 1.32;
  g.add(nub);
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 12), m);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(s * 0.35, 0.7, 0);
    g.add(arm);
  }
  const base = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16), m);
  base.position.y = 0.05;
  g.add(base);
  return g;
}

export function fireworksCrate(w: number, h: number) {
  const g = new THREE.Group();
  const box = mesh(roundedBox(w, h, 1.2, 0.06, 0.6), woodMat('#b07040'));
  g.add(box);
  const lab = mesh(new THREE.PlaneGeometry(w * 0.85, h * 0.6), texMat('fwLbl', signTexture('위험!\n불꽃놀이', '#f6d23a', '#d8262a', 256, 200), 0.6));
  lab.position.z = 0.61;
  g.add(lab);
  const cols = ['#e8443a', '#3a6fe8', '#3aa85a', '#f6d23a', '#b84ae8'];
  for (let i = 0; i < 5; i++) {
    const r = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 10), plastic(cols[i], 0.4));
    r.position.set(-w / 2 + 0.2 + i * ((w - 0.4) / 4), h / 2 + 0.3, 0);
    r.rotation.z = (i - 2) * 0.12;
    g.add(r);
    const tip = mesh(new THREE.ConeGeometry(0.09, 0.18, 10), plastic('#ffffff', 0.4));
    tip.position.set(r.position.x - Math.sin(r.rotation.z) * 0.42, h / 2 + 0.72, 0);
    tip.rotation.z = r.rotation.z;
    g.add(tip);
  }
  const fuse = mesh(new THREE.TorusGeometry(0.15, 0.02, 4, 10, Math.PI * 1.5), plastic('#333', 0.8));
  fuse.position.set(w / 2 - 0.1, h / 2 + 0.05, 0.4);
  g.add(fuse);
  return g;
}

export function balloon(color: string) {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.55, 20, 16), new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));
  b.scale.y = 1.15;
  g.add(b);
  const knot = mesh(new THREE.ConeGeometry(0.08, 0.14, 8), plastic(color, 0.4));
  knot.position.y = -0.66;
  g.add(knot);
  const hl = mesh(new THREE.SphereGeometry(0.12, 8, 8), plastic('#ffffff', 0.1), false, false);
  hl.scale.set(0.6, 1, 0.3);
  hl.position.set(-0.2, 0.25, 0.45);
  g.add(hl);
  return g;
}

export function fan(size: number) {
  const g = new THREE.Group();
  const cage = mesh(new THREE.TorusGeometry(size * 0.5, 0.05, 8, 32), metalMat('#e0e0e0', 0.3));
  g.add(cage);
  for (let i = 0; i < 8; i++) {
    const wire = mesh(new THREE.CylinderGeometry(0.015, 0.015, size, 4), metalMat('#e0e0e0', 0.3));
    wire.rotation.y = (i / 8) * Math.PI;
    wire.rotation.x = Math.PI / 2;
    wire.position.z = 0.2;
    g.add(wire);
  }
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const bl = mesh(new THREE.SphereGeometry(size * 0.22, 12, 8), plastic('#5ad1ff', 0.3));
    bl.scale.set(1, 0.45, 0.12);
    bl.position.x = size * 0.22;
    const holder = new THREE.Group();
    holder.add(bl);
    holder.rotation.z = (i / 3) * Math.PI * 2;
    blades.add(holder);
  }
  const hub = mesh(new THREE.SphereGeometry(size * 0.08, 12, 8), plastic('#ffffff', 0.4));
  blades.add(hub);
  g.add(blades);
  const motor = mesh(new THREE.CylinderGeometry(size * 0.15, size * 0.15, 0.5, 16), plastic('#f2f2f2', 0.4));
  motor.rotation.x = Math.PI / 2;
  motor.position.z = -0.35;
  g.add(motor);
  return { group: g, blades };
}

export function springPad(w: number) {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const a = i * 0.6;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.25, (i / 60) * 0.5, Math.sin(a) * 0.25));
  }
  const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.04, 6);
  for (const x of [-w * 0.3, w * 0.3]) {
    const s = mesh(tg, metalMat('#c0c6cc', 0.2));
    s.position.set(x, -0.4, 0);
    g.add(s);
  }
  const pad = mesh(roundedBox(w, 0.25, 1.4, 0.1, 0.6), stripeMat(['#e8443a', '#ffffff', '#e8443a', '#ffffff'], true));
  pad.position.y = 0.15;
  g.add(pad);
  const base = mesh(roundedBox(w, 0.15, 1.4, 0.05, 0.6), metalMat('#666', 0.4));
  base.position.y = -0.45;
  g.add(base);
  return g;
}

export function vendingMachine() {
  const g = new THREE.Group();
  const body = mesh(roundedBox(1.6, 2.6, 1.0, 0.08, 0.5), plastic('#d8262a', 0.35, 0.2));
  g.add(body);
  const front = mesh(new THREE.PlaneGeometry(1.0, 1.6), texMat('vend', label('vend', (ctx, w, h) => {
    ctx.fillStyle = '#e8f4ff';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#e8443a', '#3a6fe8', '#3aa85a', '#f6d23a', '#ff8a2a'];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = cols[(r + c) % 5];
        ctx.beginPath();
        ctx.roundRect(15 + c * 60, 20 + r * 100, 40, 70, 10);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(22 + c * 60, 40 + r * 100, 26, 10);
      }
  }, 256, 420), 0.3, { emissive: new THREE.Color('#556677'), emissiveIntensity: 0.4 }));
  front.position.set(-0.15, 0.25, 0.51);
  g.add(front);
  const slot = mesh(roundedBox(0.3, 0.6, 0.05, 0.02, 1), plastic('#222', 0.4));
  slot.position.set(0.6, 0.3, 0.5);
  g.add(slot);
  const tray = mesh(roundedBox(1.0, 0.3, 0.05, 0.02, 1), plastic('#222', 0.4));
  tray.position.set(-0.15, -0.9, 0.5);
  g.add(tray);
  return g;
}

export function bell() {
  const g = new THREE.Group();
  const b = mesh(lathe([[0, 0.9], [0.25, 0.88], [0.45, 0.6], [0.55, 0.15], [0.75, 0], [0.7, -0.05], [0, -0.02]], 24), shiny('#d8a83a', 0.25, 1));
  b.position.y = -0.9;
  g.add(b);
  const clapper = mesh(new THREE.SphereGeometry(0.12, 10, 8), metalMat('#555', 0.4));
  clapper.position.y = -0.85;
  g.add(clapper);
  const yoke = mesh(roundedBox(1.4, 0.2, 0.3, 0.05, 0.6), woodMat('#7a4a2a'));
  yoke.position.y = 0.05;
  g.add(yoke);
  return g;
}

export function grill() {
  const g = new THREE.Group();
  const bowl = mesh(new THREE.SphereGeometry(0.7, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), plastic('#222', 0.4, 0.5));
  bowl.position.y = 1.0;
  g.add(bowl);
  for (const s of [-1, 0, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), metalMat('#555', 0.4));
    leg.position.set(s * 0.45, 0.5, s === 0 ? -0.3 : 0.15);
    leg.rotation.z = -s * 0.25;
    g.add(leg);
  }
  for (let i = 0; i < 4; i++) {
    const sausage = mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), plastic('#b8442a', 0.4));
    sausage.rotation.z = Math.PI / 2;
    sausage.position.set(-0.3 + i * 0.2, 1.04, 0.1 - (i % 2) * 0.2);
    g.add(sausage);
  }
  return g;
}

export function bonfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 8), woodMat('#6a3a1a'));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.15 + (i % 2) * 0.12;
    g.add(log);
  }
  for (let i = 0; i < 8; i++) {
    const st = mesh(new THREE.DodecahedronGeometry(0.2, 0), plastic('#777', 0.9));
    const a = (i / 8) * Math.PI * 2;
    st.position.set(Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.5);
    g.add(st);
  }
  return g;
}

export function signPost(text: string, w = 2.4, h = 1.1, bg = '#f4e7cc', fg = '#4a3020') {
  const g = new THREE.Group();
  const post = mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.2, 8), woodMat('#7a4a2a'));
  post.position.y = 1.1;
  g.add(post);
  const board = mesh(roundedBox(w, h, 0.12, 0.05, 0.6), woodMat('#c08550'));
  board.position.y = 2.0;
  g.add(board);
  const face = mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.85), texMat('sign' + text, signTexture(text, bg, fg, 512, Math.round((512 * h) / w)), 0.8));
  face.position.set(0, 2.0, 0.07);
  g.add(face);
  return g;
}

export function doghouse() {
  const g = new THREE.Group();
  const body = mesh(roundedBox(2.4, 1.8, 1.6, 0.08, 0.5), woodMat('#d24a3a'));
  body.position.y = 0.9;
  g.add(body);
  const roof = new THREE.Shape();
  roof.moveTo(-1.5, 0);
  roof.lineTo(0, 1.1);
  roof.lineTo(1.5, 0);
  roof.closePath();
  const r = mesh(extrudeShape(roof, 2.0, 0.08, 0.5), feltMat('#4a6fd8'));
  r.position.y = 1.8;
  g.add(r);
  const hole = mesh(new THREE.CircleGeometry(0.55, 20), plastic('#1a1210', 0.9));
  hole.position.set(0, 0.7, 0.81);
  g.add(hole);
  const name = mesh(new THREE.PlaneGeometry(0.9, 0.3), texMat('dogname', signTexture('멍멍이', '#fff', '#d24a3a', 256, 96), 0.7));
  name.position.set(0, 1.55, 0.82);
  g.add(name);
  return g;
}

export function clothesline(len: number) {
  const g = new THREE.Group();
  for (const x of [-len / 2, len / 2]) {
    const p = mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), woodMat('#9a6a3a'));
    p.position.set(x, 2, -0.5);
    g.add(p);
  }
  const line = mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 4), plastic('#fff', 0.9));
  line.rotation.z = Math.PI / 2;
  line.position.set(0, 3.8, -0.5);
  g.add(line);
  const cols = ['#e8443a', '#3a6fe8', '#f6d23a', '#3aa85a', '#ff8ab5'];
  const n = Math.floor(len / 1.3);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.8 + i * 1.3;
    const shirt = mesh(roundedBox(0.8, 0.9, 0.05, 0.03, 1), knitMat(cols[i % cols.length]));
    shirt.position.set(x, 3.3, -0.5);
    shirt.rotation.z = (i % 2 ? 1 : -1) * 0.05;
    g.add(shirt);
    const pin = mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), woodMat('#d8b27a'));
    pin.position.set(x, 3.78, -0.48);
    g.add(pin);
  }
  return g;
}

export function sun() {
  const g = new THREE.Group();
  const disc = mesh(new THREE.CircleGeometry(6, 40), emissive('#ffd65a', 1.6), false, false);
  g.add(disc);
  for (let i = 0; i < 14; i++) {
    const ray = mesh(new THREE.ConeGeometry(0.9, 3, 4), emissive('#ffc23a', 1.3), false, false);
    const a = (i / 14) * Math.PI * 2;
    ray.position.set(Math.cos(a) * 8, Math.sin(a) * 8, -0.1);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  // smiley face
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.CircleGeometry(0.6, 16), plastic('#5a3a10', 0.8), false, false);
    eye.position.set(s * 2, 1.2, 0.05);
    g.add(eye);
  }
  const smile = mesh(new THREE.TorusGeometry(2.4, 0.3, 6, 20, Math.PI), plastic('#5a3a10', 0.8), false, false);
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.2, 0.05);
  g.add(smile);
  return g;
}

export function hill(w: number, h: number, color: string, seed = 1) {
  const rnd = mulberry32(seed);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -w / 2 + t * w;
    const y = Math.sin(t * Math.PI) * h * (0.75 + rnd() * 0.25);
    s.lineTo(x, y);
  }
  s.lineTo(w / 2, -20);
  s.lineTo(-w / 2, -20);
  s.closePath();
  const geo = extrudeShape(s, 2, 0.4, 0.05, 24);
  const m = mesh(geo, feltMat(color), false, true);
  return m;
}

export function cityBlock(seed: number, color: string) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const w = 6 + rnd() * 6;
  const h = 8 + rnd() * 16;
  const b = mesh(roundedBox(w, h, 3, 0.2, 0.2), feltMat(color));
  b.position.y = h / 2;
  g.add(b);
  for (let y = 2; y < h - 1; y += 2.5)
    for (let x = -w / 2 + 1.2; x < w / 2 - 0.8; x += 1.8) {
      const win = mesh(new THREE.PlaneGeometry(0.9, 1.2), rnd() < 0.3 ? emissive('#ffe08a', 0.6) : plastic('#7fb4da', 0.3));
      win.position.set(x, y, 1.52);
      g.add(win);
    }
  return g;
}
