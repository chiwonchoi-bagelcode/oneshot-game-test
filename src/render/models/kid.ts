import * as THREE from 'three';
import { feltMat, knitMat, plastic, shiny, stripeMat } from '../materials';
import { roundedBox } from '../geom';
import { damp } from '../../core/math';

export type KidAnim = 'idle' | 'run' | 'crouch' | 'jump' | 'tuck' | 'stomp' | 'cheer' | 'sad' | 'remote' | 'wave' | 'worried' | 'build';
export type Face = 'smile' | 'grin' | 'o' | 'worried' | 'determined';

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}

/**
 * "보리" — the mischievous rocket genius. A knitted doll-like kid with an
 * aviator cap, goggles, red scarf and a junk remote control.
 */
export class Kid {
  root = new THREE.Group();
  /** rotate this for flips (pivot at hip height) */
  spin = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  scarf: THREE.Object3D[] = [];
  remote = new THREE.Group();
  private mouths: Record<Face, THREE.Object3D> = {} as any;
  private eyes: THREE.Object3D[] = [];
  anim: KidAnim = 'idle';
  face: Face = 'smile';
  t = 0;
  blinkT = 2;
  private cur = { hipY: 0.36, lean: 0, armL: 0.2, armR: -0.2, armLz: 0.3, armRz: -0.3, legL: 0, legR: 0, head: 0, kneel: 0 };

  constructor() {
    const skin = knitMat('#f2c9a0');
    const denim = knitMat('#3f6fb5');
    const shirt = stripeMat(['#f2c12e', '#e8553d', '#f2c12e', '#e8553d', '#f2c12e', '#e8553d'], false);
    const scarfM = knitMat('#e2372f');
    const capM = feltMat('#8a5a34');
    const shoeM = feltMat('#d8433a');
    const soleM = plastic('#f4efe6', 0.8);
    const black = shiny('#16120f', 0.15, 0.1);
    const white = plastic('#ffffff', 0.3);

    this.root.add(this.spin);
    this.spin.position.y = 0.55;
    this.spin.add(this.hips);
    this.hips.position.y = -0.55 + 0.36;

    // --- legs
    for (const [leg, side] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      leg.position.set(side * 0.1, 0, 0);
      const thigh = mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 10), denim);
      thigh.position.y = -0.12;
      leg.add(thigh);
      const shoe = mesh(roundedBox(0.15, 0.1, 0.24, 0.045, 4), shoeM);
      shoe.position.set(0, -0.3, 0.04);
      leg.add(shoe);
      const sole = mesh(roundedBox(0.16, 0.035, 0.26, 0.015, 4), soleM);
      sole.position.set(0, -0.345, 0.045);
      leg.add(sole);
      const lace = mesh(new THREE.BoxGeometry(0.08, 0.012, 0.06), white);
      lace.position.set(0, -0.245, 0.1);
      leg.add(lace);
      this.hips.add(leg);
    }

    // --- torso
    this.hips.add(this.torso);
    const belly = mesh(new THREE.SphereGeometry(0.21, 20, 16), denim);
    belly.scale.set(1, 1.05, 0.9);
    belly.position.y = 0.16;
    this.torso.add(belly);
    const chest = mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.18, 18), shirt);
    chest.position.y = 0.3;
    this.torso.add(chest);
    // overall bib + buttons
    const bib = mesh(roundedBox(0.2, 0.14, 0.05, 0.02, 4), denim);
    bib.position.set(0, 0.3, 0.155);
    this.torso.add(bib);
    for (const s of [-1, 1]) {
      const strap = mesh(new THREE.BoxGeometry(0.04, 0.2, 0.03), denim);
      strap.position.set(s * 0.09, 0.36, 0.14);
      strap.rotation.z = s * 0.15;
      this.torso.add(strap);
      const btn = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.015, 12), shiny('#e8c24a', 0.3, 0.8));
      btn.rotation.x = Math.PI / 2;
      btn.position.set(s * 0.08, 0.34, 0.185);
      this.torso.add(btn);
    }
    // pocket patch with gear stitched
    const pocket = mesh(roundedBox(0.1, 0.08, 0.02, 0.01, 4), feltMat('#f2c12e'));
    pocket.position.set(0, 0.12, 0.2);
    this.torso.add(pocket);

    // --- arms
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(side * 0.2, 0.36, 0);
      const up = mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 10), shirt);
      up.position.y = -0.12;
      arm.add(up);
      const hand = mesh(new THREE.SphereGeometry(0.075, 14, 12), skin);
      hand.position.y = -0.28;
      arm.add(hand);
      this.torso.add(arm);
    }
    // remote control in right hand
    const rbox = mesh(roundedBox(0.16, 0.1, 0.06, 0.02, 4), plastic('#4a4f58', 0.6));
    this.remote.add(rbox);
    const ant = mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.32, 6), shiny('#cfd4da', 0.3, 0.9));
    ant.position.set(0.05, 0.18, 0);
    ant.rotation.z = -0.2;
    this.remote.add(ant);
    const tip = mesh(new THREE.SphereGeometry(0.02, 8, 8), plastic('#ff3b30', 0.3));
    tip.position.set(0.082, 0.335, 0);
    this.remote.add(tip);
    for (const [x, c] of [
      [-0.04, '#ff4d4d'],
      [0.0, '#ffd23f'],
      [0.04, '#4dd2ff'],
    ] as const) {
      const b = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10), plastic(c, 0.3));
      b.rotation.x = Math.PI / 2;
      b.position.set(x, 0.0, 0.035);
      this.remote.add(b);
    }
    this.remote.position.set(0, -0.32, 0.06);
    this.remote.rotation.x = -0.4;
    this.armR.add(this.remote);

    // --- head
    this.torso.add(this.head);
    this.head.position.y = 0.42;
    const neck = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 12), skin);
    neck.position.y = 0.02;
    this.head.add(neck);
    const skull = mesh(new THREE.SphereGeometry(0.31, 28, 22), skin);
    skull.position.y = 0.3;
    skull.scale.set(1.04, 0.96, 0.95);
    this.head.add(skull);
    // ears
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(0.07, 12, 10), skin);
      ear.scale.set(0.6, 1, 0.8);
      ear.position.set(s * 0.31, 0.29, 0);
      this.head.add(ear);
    }
    // cap
    const cap = mesh(new THREE.SphereGeometry(0.325, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), capM);
    cap.position.y = 0.31;
    cap.rotation.x = -0.18;
    this.head.add(cap);
    for (const s of [-1, 1]) {
      const flap = mesh(new THREE.SphereGeometry(0.12, 14, 10), capM);
      flap.scale.set(0.35, 1, 0.8);
      flap.position.set(s * 0.3, 0.2, -0.02);
      flap.rotation.z = s * 0.2;
      this.head.add(flap);
    }
    const capRim = mesh(new THREE.TorusGeometry(0.31, 0.03, 8, 30), feltMat('#f4e7cc'));
    capRim.rotation.x = Math.PI / 2 - 0.18;
    capRim.position.y = 0.3;
    capRim.position.z = 0.02;
    this.head.add(capRim);
    // goggles
    const gogStrap = mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 30, Math.PI), feltMat('#3a2a20'));
    gogStrap.position.set(0, 0.47, 0.0);
    gogStrap.rotation.set(-0.5, 0, 0);
    this.head.add(gogStrap);
    for (const s of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.075, 0.025, 10, 20), shiny('#c99a3e', 0.3, 0.9));
      ring.position.set(s * 0.095, 0.5, 0.25);
      ring.rotation.x = -0.65;
      this.head.add(ring);
      const lens = mesh(new THREE.CircleGeometry(0.07, 18), new THREE.MeshPhysicalMaterial({ color: 0x7fd1ff, roughness: 0.05, metalness: 0.2, clearcoat: 1 }));
      lens.position.set(s * 0.095, 0.5, 0.25);
      lens.rotation.x = -0.65;
      lens.translateZ(0.012);
      this.head.add(lens);
    }
    // hair tufts
    for (let i = 0; i < 4; i++) {
      const tuft = mesh(new THREE.ConeGeometry(0.04, 0.12, 6), feltMat('#d8742c'));
      tuft.position.set(-0.11 + i * 0.07, 0.4, 0.28);
      tuft.rotation.set(0.9, 0, (i - 1.5) * 0.35);
      this.head.add(tuft);
    }
    // eyes
    for (const s of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.048, 14, 12), black, false);
      eye.scale.set(0.85, 1.15, 0.6);
      eye.position.set(s * 0.1, 0.3, 0.28);
      this.head.add(eye);
      const hl = mesh(new THREE.SphereGeometry(0.014, 8, 6), plastic('#ffffff', 0.2), false);
      hl.position.set(s * 0.1 + 0.015, 0.325, 0.31);
      this.head.add(hl);
      this.eyes.push(eye);
      const cheek = mesh(new THREE.SphereGeometry(0.045, 12, 10), feltMat('#f08a8a'), false);
      cheek.scale.set(1.2, 0.7, 0.4);
      cheek.position.set(s * 0.17, 0.22, 0.25);
      this.head.add(cheek);
    }
    // nose
    const nose = mesh(new THREE.SphereGeometry(0.03, 10, 8), skin, false);
    nose.position.set(0, 0.25, 0.3);
    this.head.add(nose);
    // mouths
    const mouthM = plastic('#8a2a2a', 0.6);
    const smile = mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI), mouthM, false);
    smile.rotation.z = Math.PI;
    smile.position.set(0, 0.2, 0.285);
    this.head.add(smile);
    this.mouths.smile = smile;
    const grin = new THREE.Group();
    const grinShape = new THREE.Shape();
    grinShape.absarc(0, 0, 0.075, Math.PI, Math.PI * 2, false);
    grinShape.closePath();
    const gm = mesh(new THREE.ShapeGeometry(grinShape), plastic('#6a1c1c', 0.6), false);
    grin.add(gm);
    const teeth = mesh(new THREE.PlaneGeometry(0.1, 0.02), plastic('#ffffff', 0.4), false);
    teeth.position.set(0, -0.01, 0.001);
    grin.add(teeth);
    grin.position.set(0, 0.2, 0.29);
    grin.rotation.x = -0.25;
    this.head.add(grin);
    this.mouths.grin = grin;
    const o = mesh(new THREE.TorusGeometry(0.03, 0.013, 6, 14), mouthM, false);
    o.position.set(0, 0.19, 0.29);
    this.head.add(o);
    this.mouths.o = o;
    const worried = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), mouthM, false);
    worried.position.set(0, 0.17, 0.29);
    this.head.add(worried);
    this.mouths.worried = worried;
    const det = mesh(new THREE.CapsuleGeometry(0.01, 0.07, 3, 6), mouthM, false);
    det.rotation.z = Math.PI / 2 + 0.15;
    det.position.set(0.01, 0.2, 0.29);
    this.head.add(det);
    this.mouths.determined = det;
    this.setFace('smile');

    // scarf: ring + tail segments
    const ring = mesh(new THREE.TorusGeometry(0.13, 0.055, 10, 20), scarfM);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.42;
    this.torso.add(ring);
    let parent: THREE.Object3D = this.torso;
    const anchor = new THREE.Group();
    anchor.position.set(-0.1, 0.42, -0.1);
    this.torso.add(anchor);
    parent = anchor;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      const piece = mesh(roundedBox(0.1, 0.14, 0.035, 0.015, 4), scarfM);
      piece.position.y = -0.06;
      seg.add(piece);
      if (i === 3) {
        for (let k = 0; k < 3; k++) {
          const fr = mesh(new THREE.BoxGeometry(0.018, 0.05, 0.02), feltMat('#f2c12e'));
          fr.position.set(-0.03 + k * 0.03, -0.15, 0);
          seg.add(fr);
        }
      }
      seg.position.y = i === 0 ? 0 : -0.12;
      parent.add(seg);
      this.scarf.push(seg);
      parent = seg;
    }

    this.root.traverse((o) => {
      (o as any).userData.kid = true;
    });
  }

  setFace(f: Face) {
    this.face = f;
    for (const [k, m] of Object.entries(this.mouths)) m.visible = k === f;
  }

  play(a: KidAnim) {
    if (this.anim === a) return;
    this.anim = a;
    this.t = 0;
  }

  update(dt: number, wind = 0) {
    this.t += dt;
    const t = this.t;
    const c = this.cur;
    let hipY = 0.36;
    let lean = 0;
    let armL = 0.15;
    let armR = -0.15;
    let armLz = 0.25;
    let armRz = -0.25;
    let legL = 0;
    let legR = 0;
    let head = 0;
    let kneel = 0;
    let speed = 14;
    switch (this.anim) {
      case 'idle': {
        const b = Math.sin(t * 2.6);
        hipY = 0.36 + b * 0.008;
        armL = 0.1 + b * 0.05;
        armR = 0.5;
        armRz = -0.15;
        head = Math.sin(t * 0.9) * 0.08;
        break;
      }
      case 'remote': {
        const b = Math.sin(t * 9);
        hipY = 0.35 + Math.abs(b) * 0.01;
        armL = 1.1;
        armLz = 0.6;
        armR = 1.2;
        armRz = -0.5;
        head = -0.45;
        lean = -0.05;
        break;
      }
      case 'run': {
        const p = t * 13;
        hipY = 0.36 + Math.abs(Math.sin(p)) * 0.05;
        legL = Math.sin(p) * 0.9;
        legR = -Math.sin(p) * 0.9;
        armL = -Math.sin(p) * 1.0;
        armR = Math.sin(p) * 1.0;
        lean = -0.25;
        speed = 30;
        break;
      }
      case 'crouch':
        hipY = 0.24;
        kneel = 0.9;
        armL = -0.9;
        armR = -0.9;
        lean = -0.35;
        speed = 25;
        break;
      case 'jump':
        hipY = 0.38;
        armL = 2.8;
        armR = 2.8;
        armLz = 0.4;
        armRz = -0.4;
        legL = 0.3;
        legR = -0.2;
        speed = 25;
        break;
      case 'tuck':
        hipY = 0.4;
        kneel = 1.6;
        legL = 1.4;
        legR = 1.4;
        armL = 1.2;
        armR = 1.2;
        armLz = 0.1;
        armRz = -0.1;
        lean = -0.2;
        speed = 30;
        break;
      case 'stomp':
        hipY = 0.3;
        legL = 0.0;
        legR = 0.0;
        armL = 2.6;
        armR = 2.6;
        armLz = 1.0;
        armRz = -1.0;
        lean = 0.1;
        speed = 40;
        break;
      case 'cheer': {
        const b = Math.abs(Math.sin(t * 7));
        hipY = 0.36 + b * 0.12;
        armL = 2.9 + Math.sin(t * 14) * 0.2;
        armR = 2.9 - Math.sin(t * 14) * 0.2;
        armLz = 0.5;
        armRz = -0.5;
        legL = b * 0.3;
        legR = -b * 0.3;
        head = Math.sin(t * 7) * 0.15;
        break;
      }
      case 'wave': {
        armR = 2.6;
        armRz = -0.6 + Math.sin(t * 10) * 0.35;
        armL = 0.2;
        head = Math.sin(t * 2) * 0.1;
        break;
      }
      case 'sad':
        hipY = 0.33;
        armL = -0.1;
        armR = -0.1;
        armLz = 0.1;
        armRz = -0.1;
        head = 0.45;
        lean = 0.15;
        speed = 6;
        break;
      case 'worried': {
        armL = 2.2;
        armR = 2.2;
        armLz = 1.3;
        armRz = -1.3;
        head = Math.sin(t * 20) * 0.04;
        break;
      }
      case 'build': {
        const b = Math.sin(t * 12);
        armR = 1.0 + b * 0.6;
        armRz = -0.3;
        armL = 0.7;
        head = 0.25;
        lean = 0.1;
        break;
      }
    }
    c.hipY = damp(c.hipY, hipY, speed, dt);
    c.lean = damp(c.lean, lean, speed, dt);
    c.armL = damp(c.armL, armL, speed, dt);
    c.armR = damp(c.armR, armR, speed, dt);
    c.armLz = damp(c.armLz, armLz, speed, dt);
    c.armRz = damp(c.armRz, armRz, speed, dt);
    c.legL = damp(c.legL, legL, speed, dt);
    c.legR = damp(c.legR, legR, speed, dt);
    c.head = damp(c.head, head, speed * 0.6, dt);
    c.kneel = damp(c.kneel, kneel, speed, dt);

    this.hips.position.y = -0.55 + c.hipY;
    this.torso.rotation.x = -c.lean;
    this.armL.rotation.x = -c.armL;
    this.armR.rotation.x = -c.armR;
    this.armL.rotation.z = -c.armLz;
    this.armR.rotation.z = -c.armRz;
    this.legL.rotation.x = -c.legL;
    this.legR.rotation.x = -c.legR;
    this.head.rotation.x = c.head;
    this.head.rotation.y = Math.sin(this.t * 0.7) * 0.05;
    this.remote.visible = true;

    // blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = blink ? 0.15 : 1.15;

    // scarf flutter
    for (let i = 0; i < this.scarf.length; i++) {
      const s = this.scarf[i];
      s.rotation.x = 0.35 + Math.sin(this.t * 9 - i * 0.9) * (0.15 + Math.abs(wind) * 0.04) + (i === 0 ? 0.5 : 0.1);
      s.rotation.z = Math.sin(this.t * 6 - i) * 0.12 + wind * 0.08;
    }
  }
}
