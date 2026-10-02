import * as THREE from 'three';
import { Loadout, partById } from '../../data/parts';
import { cardMat, feltMat, metalMat, plastic, polkaMat, shiny, texMat, knitMat } from '../materials';
import { label } from '../textures';
import { extrudeShape, lathe, roundedBox } from '../geom';

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

// ------------------------------------------------------------------ labels
const colaLabel = () =>
  label('cola', (ctx, w, h) => {
    ctx.fillStyle = '#d42a2a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.62 + Math.sin(x * 0.03) * h * 0.08);
    ctx.lineTo(w, h * 0.7);
    for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, h * 0.7 + Math.sin(x * 0.03) * h * 0.08);
    ctx.fill();
    ctx.font = `italic bold ${h * 0.42}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Kola!', w * 0.25, h * 0.5);
    ctx.fillText('Kola!', w * 0.75, h * 0.5);
    ctx.font = `bold ${h * 0.12}px sans-serif`;
    ctx.fillText('★ 보리 로켓 1호 ★', w * 0.5, h * 0.9);
  });

const paintLabel = () =>
  label('paint', (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#ff5a4e', '#ffc43d', '#3ec46d', '#3b8cff', '#a35bff'];
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = cols[i % cols.length];
      const x = (i / 40) * w;
      const l = 20 + ((i * 37) % 60);
      ctx.beginPath();
      ctx.roundRect(x, -10, 10, l, 5);
      ctx.fill();
    }
    ctx.fillStyle = '#2a59c8';
    ctx.fillRect(0, h * 0.42, w, h * 0.3);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${h * 0.2}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SUPER PAINT', w * 0.5, h * 0.64);
    ctx.fillStyle = '#333';
    ctx.font = `${h * 0.08}px sans-serif`;
    ctx.fillText('4L · 무광 · 보리꺼 아님', w * 0.5, h * 0.88);
  });

const milkLabel = () =>
  label('milk', (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3d8be8';
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(i * 70 + 20, h * 0.6, 38, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3d8be8';
    ctx.font = `bold ${h * 0.24}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('우유', w * 0.5, h * 0.42);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${h * 0.12}px sans-serif`;
    ctx.fillText('FUEL 1L', w * 0.5, h * 0.85);
  }, 256, 256);

// ------------------------------------------------------------------ bodies
function buildBody(id: string, L: number, R: number): THREE.Group {
  const g = new THREE.Group();
  if (id === 'bottle') {
    // PET bottle upside down: neck at the bottom (nozzle), petal base up top.
    const prof: [number, number][] = [
      [0.0, -L / 2 - 0.02],
      [R * 0.32, -L / 2 - 0.02],
      [R * 0.32, -L / 2 + 0.1],
      [R * 0.45, -L / 2 + 0.16],
      [R * 0.9, -L / 2 + 0.36],
      [R, -L / 2 + 0.48],
      [R, L / 2 - 0.2],
      [R * 0.92, L / 2 - 0.1],
      [R * 0.7, L / 2 - 0.02],
      [0.0, L / 2],
    ];
    const bottleMat = new THREE.MeshPhysicalMaterial({
      color: 0xb8f0c8, roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide,
    });
    const shell = mesh(lathe(prof, 28), bottleMat);
    shell.castShadow = true;
    g.add(shell);
    // fizzy cola inside
    const liquid = mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.86, L * 0.62, 20), plastic('#3a1d10', 0.3));
    liquid.position.y = -0.02;
    g.add(liquid);
    // label
    const lab = mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, L * 0.32, 28, 1, true), texMat('colaLbl', colaLabel(), 0.5));
    lab.position.y = 0.05;
    g.add(lab);
    // cap (at nozzle)
    const cap = mesh(new THREE.CylinderGeometry(R * 0.38, R * 0.38, 0.09, 16), plastic('#e83a2e', 0.4));
    cap.position.y = -L / 2 - 0.02;
    g.add(cap);
    // duct tape bands
    for (const y of [-L * 0.2, L * 0.28]) {
      const tape = mesh(new THREE.CylinderGeometry(R * 1.03, R * 1.03, 0.08, 24, 1, true), plastic('#b8bcc2', 0.55, 0.3));
      tape.position.y = y;
      g.add(tape);
    }
  } else if (id === 'paint') {
    const can = mesh(new THREE.CylinderGeometry(R, R, L * 0.82, 28), metalMat('#c9ced4', 0.35));
    g.add(can);
    const lab = mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, L * 0.62, 28, 1, true), texMat('paintLbl', paintLabel(), 0.6));
    g.add(lab);
    for (const s of [-1, 1]) {
      const rim = mesh(new THREE.TorusGeometry(R * 0.98, 0.03, 8, 28), metalMat('#b0b6bd', 0.3));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = (s * L * 0.82) / 2;
      g.add(rim);
    }
    // drips of paint over the top
    const dripCols = ['#ff5a4e', '#3b8cff', '#ffc43d'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const d = mesh(new THREE.CapsuleGeometry(0.035, 0.08 + (i % 3) * 0.06, 4, 8), plastic(dripCols[i % 3], 0.2));
      d.position.set(Math.cos(a) * R * 1.01, L * 0.36 - (i % 3) * 0.04, Math.sin(a) * R * 1.01);
      g.add(d);
    }
    // bail handle
    const bail = mesh(new THREE.TorusGeometry(R * 0.95, 0.018, 6, 24, Math.PI), metalMat('#888f96', 0.3));
    bail.position.y = L * 0.25;
    bail.rotation.y = Math.PI / 2;
    bail.rotation.z = -0.5;
    g.add(bail);
    // funnel nozzle mount
    const funnel = mesh(lathe([[R * 0.95, 0], [R * 0.5, -0.12], [R * 0.3, -0.18]], 20), metalMat('#7d848c', 0.4));
    funnel.position.y = -L * 0.41;
    g.add(funnel);
    const top = mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.96, 0.02, 24), metalMat('#d5d9de', 0.3));
    top.position.y = L * 0.41;
    g.add(top);
  } else {
    // pressure cooker
    const pot = mesh(lathe([[0, -L * 0.42], [R * 0.95, -L * 0.42], [R, -L * 0.38], [R, L * 0.3], [R * 1.04, L * 0.32], [R * 0.6, L * 0.4], [0, L * 0.42]], 32), metalMat('#c2c8cf', 0.22));
    g.add(pot);
    for (const y of [-L * 0.2, L * 0.05]) {
      const band = mesh(new THREE.TorusGeometry(R * 1.0, 0.025, 6, 30), metalMat('#8a9097', 0.3));
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      g.add(band);
    }
    // bolts
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = mesh(new THREE.SphereGeometry(0.04, 8, 6), metalMat('#6f757c', 0.3));
      b.position.set(Math.cos(a) * R * 1.02, L * 0.31, Math.sin(a) * R * 1.02);
      g.add(b);
    }
    // handles
    for (const s of [-1, 1]) {
      const h = mesh(roundedBox(0.3, 0.08, 0.1, 0.035, 2), plastic('#222', 0.6));
      h.position.set(s * (R + 0.12), L * 0.28, 0);
      g.add(h);
    }
    // gauge
    const gauge = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20), metalMat('#c9a24a', 0.25));
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(0, 0, R * 1.0);
    g.add(gauge);
    const face = mesh(
      new THREE.CircleGeometry(0.09, 20),
      texMat('gauge', label('gauge', (ctx, w, h) => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * 0.4, Math.PI * 0.8, Math.PI * 2.2);
        ctx.stroke();
        ctx.strokeStyle = '#e33';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * 0.4, Math.PI * 1.9, Math.PI * 2.2);
        ctx.stroke();
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2);
        ctx.lineTo(w * 0.8, h * 0.3);
        ctx.stroke();
      }, 128, 128), 0.4),
    );
    face.position.set(0, 0, R * 1.0 + 0.026);
    g.add(face);
    const valve = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 12), plastic('#d33', 0.4));
    valve.position.y = L * 0.46;
    g.add(valve);
  }
  return g;
}

// ------------------------------------------------------------------ engines
function buildEngine(id: string, L: number, R: number): { g: THREE.Group; nozzleY: number; spin?: THREE.Object3D } {
  const g = new THREE.Group();
  const base = -L / 2;
  if (id === 'cola') {
    // mentos tube + funnel
    const funnel = mesh(lathe([[0.06, 0], [0.09, -0.06], [0.2, -0.2]], 20), plastic('#f2f2f2', 0.4));
    funnel.position.y = base - 0.02;
    g.add(funnel);
    const tube = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 14), texMat('mentos', label('mentos', (ctx, w, h) => {
      ctx.fillStyle = '#1d5fd1';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${h * 0.45}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('MINTOS', w * 0.5, h * 0.65);
    }, 256, 64), 0.4));
    tube.position.set(R * 0.9, base + 0.28, 0.0);
    tube.rotation.z = 0.05;
    g.add(tube);
    return { g, nozzleY: base - 0.22 };
  }
  if (id === 'spray') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const can = new THREE.Group();
      const c = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 14), plastic(['#ff7a1a', '#ffd51a', '#1ac6ff'][i], 0.3, 0.4));
      can.add(c);
      const top = mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metalMat('#ccc', 0.3));
      top.position.y = -0.2;
      can.add(top);
      const nz = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 8), plastic('#222', 0.5));
      nz.position.y = -0.28;
      can.add(nz);
      can.position.set(Math.cos(a) * 0.1, base - 0.06, Math.sin(a) * 0.1);
      g.add(can);
    }
    const lighter = mesh(roundedBox(0.07, 0.14, 0.04, 0.015, 2), plastic('#e83a8a', 0.3));
    lighter.position.set(R * 0.55, base - 0.25, 0.1);
    lighter.rotation.z = 0.5;
    g.add(lighter);
    const strap = mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 20), plastic('#888', 0.6));
    strap.rotation.x = Math.PI / 2;
    strap.position.y = base - 0.05;
    g.add(strap);
    return { g, nozzleY: base - 0.33 };
  }
  // extinguisher
  const tank = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 20), plastic('#e0322a', 0.3, 0.2));
  tank.position.set(0, base - 0.1, 0);
  g.add(tank);
  const lab = mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.16, 20, 1, true), texMat('extLbl', label('ext', (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e0322a';
    ctx.font = `bold ${h * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('소화기 FIRE', w * 0.5, h * 0.68);
  }, 256, 64), 0.4));
  lab.position.set(0, base - 0.08, 0);
  g.add(lab);
  const horn = mesh(lathe([[0.04, 0], [0.07, -0.1], [0.15, -0.24]], 18), plastic('#1a1a1a', 0.5));
  horn.position.y = base - 0.38;
  g.add(horn);
  const valve = mesh(roundedBox(0.2, 0.06, 0.06, 0.02, 2), metalMat('#333', 0.3));
  valve.position.set(0.12, base + 0.16, 0);
  g.add(valve);
  return { g, nozzleY: base - 0.6 };
}

// ------------------------------------------------------------------ tanks
function buildTank(id: string, L: number, R: number): THREE.Group {
  const g = new THREE.Group();
  if (id === 'milk') {
    const box = mesh(roundedBox(0.26, 0.4, 0.26, 0.02, 2), texMat('milkLbl', milkLabel(), 0.7));
    g.add(box);
    const roof = new THREE.Shape();
    roof.moveTo(-0.13, 0);
    roof.lineTo(0, 0.12);
    roof.lineTo(0.13, 0);
    roof.closePath();
    const r = mesh(extrudeShape(roof, 0.26, 0.01, 1), plastic('#ffffff', 0.7));
    r.position.y = 0.2;
    g.add(r);
    g.position.set(R + 0.1, -0.05, -0.04);
  } else if (id === 'thermos') {
    const c = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 18), plastic('#2d9a6a', 0.35, 0.3));
    g.add(c);
    const cup = mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.16, 18), metalMat('#d0d4d8', 0.25));
    cup.position.y = 0.42;
    g.add(cup);
    const band = mesh(new THREE.CylinderGeometry(0.134, 0.134, 0.06, 18), metalMat('#c0c4c8', 0.3));
    band.position.y = -0.25;
    g.add(band);
    g.position.set(R + 0.1, 0, -0.05);
  } else {
    const jug = mesh(
      lathe([[0, -0.4], [0.26, -0.4], [0.3, -0.35], [0.3, 0.25], [0.12, 0.38], [0.08, 0.46], [0, 0.46]], 22),
      new THREE.MeshPhysicalMaterial({ color: 0x5ab4ff, roughness: 0.1, transparent: true, opacity: 0.6, clearcoat: 1 }),
    );
    g.add(jug);
    const water = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.5, 18), plastic('#2a78d8', 0.2));
    water.position.y = -0.12;
    g.add(water);
    for (const y of [-0.2, 0.05]) {
      const rib = mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 24), plastic('#5ab4ff', 0.2));
      rib.rotation.x = Math.PI / 2;
      rib.position.y = y;
      g.add(rib);
    }
    g.position.set(R + 0.22, 0.02, -0.12);
    g.scale.setScalar(0.95);
  }
  // strap holding it on
  const strap = mesh(new THREE.TorusGeometry(R + 0.06, 0.025, 6, 28), plastic('#3a3a3a', 0.7));
  strap.rotation.x = Math.PI / 2;
  strap.scale.set(1.25, 1, 0.75);
  strap.position.set(g.position.x * 0.5, g.position.y, g.position.z * 0.5);
  const holder = new THREE.Group();
  holder.add(g);
  holder.add(strap);
  return holder;
}

// ------------------------------------------------------------------ noses
function buildNose(id: string, L: number, R: number): { g: THREE.Group; spin?: THREE.Object3D } {
  const g = new THREE.Group();
  const top = L / 2;
  if (id === 'hat') {
    const cone = mesh(new THREE.ConeGeometry(R * 0.98, 0.55, 24), polkaMat('#ff6fa8', '#ffe14d'));
    cone.position.y = top + 0.27;
    g.add(cone);
    const pom = mesh(new THREE.IcosahedronGeometry(0.08, 1), feltMat('#ffe14d'));
    pom.position.y = top + 0.56;
    g.add(pom);
    const band = mesh(new THREE.TorusGeometry(R * 0.96, 0.03, 6, 24), feltMat('#ffffff'));
    band.rotation.x = Math.PI / 2;
    band.position.y = top + 0.02;
    g.add(band);
    return { g };
  }
  if (id === 'pot') {
    const pot = mesh(lathe([[0, 0.34], [R * 0.95, 0.3], [R * 1.08, 0.04], [R * 1.12, 0.0], [R * 1.05, -0.02], [0, -0.02]], 28), metalMat('#e0a63a', 0.25));
    pot.position.y = top;
    g.add(pot);
    for (const s of [-1, 1]) {
      const h = mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI), plastic('#222', 0.5));
      h.position.set(s * (R * 1.1), top + 0.1, 0);
      h.rotation.z = s * Math.PI / 2;
      g.add(h);
    }
    const knob = mesh(new THREE.SphereGeometry(0.06, 12, 8), plastic('#222', 0.5));
    knob.position.y = top + 0.36;
    g.add(knob);
    return { g };
  }
  if (id === 'glove') {
    // spring
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const a = i * 0.5;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.1, (i / 80) * 0.32, Math.sin(a) * 0.1));
    }
    const spring = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.018, 6), metalMat('#c0c6cc', 0.25));
    spring.position.y = top;
    g.add(spring);
    const glove = mesh(new THREE.SphereGeometry(0.24, 20, 16), plastic('#d8262a', 0.35));
    glove.scale.set(1, 1.1, 0.9);
    glove.position.y = top + 0.52;
    g.add(glove);
    const thumb = mesh(new THREE.SphereGeometry(0.09, 12, 10), plastic('#d8262a', 0.35));
    thumb.position.set(0.18, top + 0.42, 0.08);
    g.add(thumb);
    const cuff = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.12, 16), plastic('#ffffff', 0.5));
    cuff.position.y = top + 0.33;
    g.add(cuff);
    return { g };
  }
  // drill
  const chuck = mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.9, 0.22, 20), plastic('#ffb21a', 0.4));
  chuck.position.y = top + 0.1;
  g.add(chuck);
  const collar = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 14), metalMat('#444', 0.3));
  collar.position.y = top + 0.27;
  g.add(collar);
  const bit = new THREE.Group();
  const cone = new THREE.ConeGeometry(0.16, 0.6, 18, 12);
  // twist the cone into a drill bit
  const pos = cone.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = (y + 0.3) * 9;
    const flute = 1 + 0.25 * Math.sin(Math.atan2(z, x) * 2 + a);
    const ca = Math.cos(a * 0.2);
    const sa = Math.sin(a * 0.2);
    pos.setXYZ(i, (x * ca - z * sa) * flute, y, (x * sa + z * ca) * flute);
  }
  cone.computeVertexNormals();
  const bm = mesh(cone, metalMat('#d9dee3', 0.15));
  bit.add(bm);
  bit.position.y = top + 0.62;
  g.add(bit);
  return { g, spin: bit };
}

// ------------------------------------------------------------------ fins
function buildFins(id: string, L: number, R: number): { g: THREE.Group; spin?: THREE.Object3D[]; umbrella?: THREE.Object3D } {
  const g = new THREE.Group();
  const base = -L / 2;
  if (id === 'cardboard') {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.42, -0.22);
    s.lineTo(0.42, -0.38);
    s.lineTo(0, -0.2);
    s.lineTo(0, 0.25);
    s.closePath();
    const geo = extrudeShape(s, 0.035, 0.008, 2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const f = mesh(geo, cardMat('#c89b62'));
      const holder = new THREE.Group();
      f.position.x = R * 0.85;
      holder.add(f);
      // tape
      const tape = mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), plastic('#b8bcc2', 0.5, 0.3));
      tape.position.set(R * 0.9, 0.0, 0);
      holder.add(tape);
      holder.rotation.y = a;
      holder.position.y = base + 0.36;
      g.add(holder);
    }
    return { g };
  }
  if (id === 'umbrella') {
    const umb = new THREE.Group();
    const canopy = mesh(
      new THREE.ConeGeometry(0.75, 0.32, 8, 1, true),
      new THREE.MeshStandardMaterial({ ...{}, color: 0x3fb6e8, roughness: 0.6, side: THREE.DoubleSide }),
    );
    canopy.rotation.x = Math.PI; // opens downward (canopy facing up when flying up? we want drag)
    umb.add(canopy);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rib = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 4), metalMat('#333', 0.4));
      rib.position.set(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
      rib.rotation.set(0, -a, Math.PI / 2 - 0.4);
      umb.add(rib);
    }
    // stripes: alternate panel colour via a second smaller cone
    const inner = mesh(new THREE.ConeGeometry(0.45, 0.2, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff27a, roughness: 0.6, side: THREE.DoubleSide }));
    inner.rotation.x = Math.PI;
    inner.position.y = -0.065;
    umb.add(inner);
    umb.position.y = base + 0.45;
    g.add(umb);
    const handle = mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI), plastic('#6a3a1a', 0.5));
    handle.position.set(0, base - 0.05, 0.0);
    handle.rotation.z = Math.PI;
    g.add(handle);
    return { g, umbrella: umb };
  }
  // gyro: three fidget spinners
  const spins: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const holder = new THREE.Group();
    const sp = new THREE.Group();
    const cols = ['#18c2ff', '#ff3fa0', '#a3ff3f'];
    for (let k = 0; k < 3; k++) {
      const ka = (k / 3) * Math.PI * 2;
      const lobe = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14), plastic(cols[i], 0.25, 0.3));
      lobe.position.set(Math.cos(ka) * 0.12, 0, Math.sin(ka) * 0.12);
      sp.add(lobe);
      const arm = mesh(new THREE.BoxGeometry(0.12, 0.035, 0.05), plastic(cols[i], 0.25, 0.3));
      arm.position.set(Math.cos(ka) * 0.06, 0, Math.sin(ka) * 0.06);
      arm.rotation.y = -ka;
      sp.add(arm);
    }
    const hub = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12), metalMat('#ddd', 0.2));
    sp.add(hub);
    sp.rotation.z = Math.PI / 2;
    sp.position.x = R + 0.16;
    holder.add(sp);
    const stick = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), metalMat('#999', 0.3));
    stick.rotation.z = Math.PI / 2;
    stick.position.x = R + 0.05;
    holder.add(stick);
    holder.rotation.y = a;
    holder.position.y = base + 0.3;
    g.add(holder);
    spins.push(sp);
  }
  return { g, spin: spins };
}

export interface RocketModel {
  root: THREE.Group;
  /** rotates around long axis for liveliness */
  roll: THREE.Group;
  nozzleY: number;
  noseY: number;
  drillBit?: THREE.Object3D;
  spinners?: THREE.Object3D[];
  umbrella?: THREE.Object3D;
  flame: THREE.Group;
}

/** Build the junk rocket. Local +Y is the nose direction. */
export function buildRocket(l: Loadout): RocketModel {
  const body = partById(l.body);
  const L = body.length!;
  const R = body.radius!;
  const root = new THREE.Group();
  const roll = new THREE.Group();
  root.add(roll);
  roll.add(buildBody(l.body, L, R));
  const eng = buildEngine(l.engine, L, R);
  roll.add(eng.g);
  roll.add(buildTank(l.tank, L, R));
  const nose = buildNose(l.nose, L, R);
  roll.add(nose.g);
  const fins = buildFins(l.fins, L, R);
  roll.add(fins.g);
  // sticker: the kid's logo
  const sticker = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 20),
    texMat('logoSticker', label('logo', (ctx, w, h) => {
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#e8553d';
      ctx.font = `bold ${h * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('보', w / 2, h * 0.68);
    }, 128, 128), 0.6, { transparent: true }),
  );
  sticker.position.set(0, -L * 0.15, R * 1.02 + 0.01);
  roll.add(sticker);

  // flame group (filled by effects)
  const flame = new THREE.Group();
  flame.position.y = eng.nozzleY;
  root.add(flame);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
    }
  });
  return {
    root,
    roll,
    nozzleY: eng.nozzleY,
    noseY: L / 2 + 0.5,
    drillBit: nose.spin,
    spinners: fins.spin,
    umbrella: fins.umbrella,
    flame,
  };
}

/** Little partial preview mesh for a part card in the garage. */
export function buildPartPreview(slot: string, id: string): THREE.Group {
  const R = 0.36;
  const L = 1.4;
  const g = new THREE.Group();
  if (slot === 'body') g.add(buildBody(id, partById(id).length!, partById(id).radius!));
  else if (slot === 'engine') {
    const e = buildEngine(id, L, R);
    e.g.position.y = L / 2 + 0.2;
    g.add(e.g);
  } else if (slot === 'tank') {
    const t = buildTank(id, L, R);
    t.position.x = -(R + 0.15);
    g.add(t);
  } else if (slot === 'nose') {
    const n = buildNose(id, L, R);
    n.g.position.y = -L / 2 - 0.2;
    g.add(n.g);
  } else {
    const f = buildFins(id, L, R);
    f.g.position.y = L / 2 - 0.2;
    g.add(f.g);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.6, 16), knitMat('#e8e0d0'));
    g.add(core);
  }
  return g;
}
