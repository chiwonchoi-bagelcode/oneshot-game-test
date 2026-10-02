import * as THREE from 'three';
import { Renderer, createLights } from '../render/renderer';
import { Kid } from '../render/models/kid';
import { buildRocket, RocketModel } from '../render/models/rocket';
import { Effects } from '../render/effects';
import { Loadout } from '../data/parts';
import { cardMat, emissive, feltMat, metalMat, plastic, texMat, woodMat, stripeMat } from '../render/materials';
import { roundedBox } from '../render/geom';
import { signTexture, wood } from '../render/textures';
import * as P from '../render/models/props';
import { damp, rand } from '../core/math';

/** The kid's cosy garage workshop — backdrop for title & upgrade screens. */
export class Garage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 0.5, 0.1, 200);
  kid = new Kid();
  fx = new Effects();
  rocket: RocketModel | null = null;
  private turntable = new THREE.Group();
  mode: 'title' | 'garage' | 'stages' = 'title';
  private camPos = new THREE.Vector3(0, 4, 14);
  private camLook = new THREE.Vector3(0, 2.5, 0);
  private t = 0;
  private hop = 0;

  constructor(public renderer: Renderer) {
    const sc = this.scene;
    sc.environment = renderer.envTex;
    sc.environmentIntensity = 0.5;
    sc.background = new THREE.Color('#e9c99a');
    sc.fog = new THREE.Fog('#e9c99a', 18, 45);
    const L = createLights(sc, renderer.quality);
    L.follow(0, 3);
    L.sun.intensity = 1.6;
    L.hemi.intensity = 1.0;
    sc.add(this.fx.group);

    // floor
    const floorTex = wood('#b98a5a', 256, true);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 20), new THREE.MeshStandardMaterial({ ...floorTex, roughness: 0.8 }));
    (floor.material as THREE.MeshStandardMaterial).map!.repeat.set(1, 1);
    floor.position.set(0, -0.5, -2);
    floor.receiveShadow = true;
    sc.add(floor);
    // back wall
    const wall = new THREE.Mesh(roundedBox(40, 16, 1, 0.2, 0.25), feltMat('#d8b48a'));
    wall.position.set(0, 7.5, -7);
    wall.receiveShadow = true;
    sc.add(wall);
    // pegboard
    const peg = new THREE.Mesh(
      roundedBox(9, 4.5, 0.2, 0.1, 1),
      texMat('pegboard', (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const x = c.getContext('2d')!;
        x.fillStyle = '#c99e6a';
        x.fillRect(0, 0, 256, 256);
        x.fillStyle = '#7a5a3a';
        for (let i = 8; i < 256; i += 16) for (let j = 8; j < 256; j += 16) {
          x.beginPath();
          x.arc(i, j, 2.5, 0, Math.PI * 2);
          x.fill();
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
      })(), 0.9),
    );
    peg.position.set(-1.5, 6.2, -6.4);
    sc.add(peg);
    // tools on the pegboard
    const tools: [THREE.Object3D, number, number][] = [];
    const wrench = new THREE.Group();
    const wr = new THREE.Mesh(roundedBox(0.25, 1.6, 0.1, 0.05, 1), metalMat('#b0b6bc', 0.3));
    wrench.add(wr);
    const wh = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.09, 6, 12, Math.PI * 1.5), metalMat('#b0b6bc', 0.3));
    wh.position.y = 0.9;
    wrench.add(wh);
    tools.push([wrench, -4.5, 6.2]);
    const hammer = new THREE.Group();
    const hh = new THREE.Mesh(roundedBox(0.18, 1.5, 0.15, 0.05, 1), woodMat('#c08550'));
    hammer.add(hh);
    const hd = new THREE.Mesh(roundedBox(0.7, 0.28, 0.28, 0.05, 1), metalMat('#555', 0.4));
    hd.position.y = 0.75;
    hammer.add(hd);
    tools.push([hammer, -3.2, 6.1]);
    const saw = new THREE.Mesh(roundedBox(1.8, 0.6, 0.04, 0.05, 1), metalMat('#d0d4d8', 0.25));
    tools.push([saw, 0.8, 7.2]);
    const tape = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.14, 8, 16), plastic('#b8bcc2', 0.5));
    tools.push([tape, 2.2, 5.6]);
    const scis = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), plastic('#e8443a', 0.4));
    tools.push([scis, -1.5, 5.3]);
    for (const [o, x, y] of tools) {
      o.position.set(x, y, -6.2);
      o.traverse((m) => ((m as THREE.Mesh).isMesh ? (m.castShadow = true) : 0));
      sc.add(o);
    }
    // poster + window
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), texMat('poster', signTexture('보리 로켓\n연구소 🚀', '#2a5ab0', '#ffe14d', 512, 352), 0.8));
    poster.position.set(5.6, 7.4, -6.45);
    poster.rotation.z = 0.05;
    sc.add(poster);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3), emissive('#bfe6ff', 0.9));
    win.position.set(-8, 7, -6.45);
    sc.add(win);
    const frame = new THREE.Mesh(roundedBox(4.6, 3.4, 0.3, 0.1, 1), woodMat('#ffffff'));
    frame.position.set(-8, 7, -6.6);
    sc.add(frame);
    const cl = P.cloud(3, 0.5);
    cl.position.set(-8.4, 7.4, -6.3);
    cl.children[cl.children.length - 1].visible = false;
    sc.add(cl);
    // bunting
    const cols = ['#e8443a', '#ffd23f', '#3a6fe8', '#3aa85a', '#ff6fa8'];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Shape();
      s.moveTo(-0.35, 0);
      s.lineTo(0.35, 0);
      s.lineTo(0, -0.6);
      s.closePath();
      const f = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.9 }));
      const x = -9 + i * 1.4;
      f.position.set(x, 11.2 - Math.sin((i / 13) * Math.PI) * 0.8, -5);
      sc.add(f);
    }
    // bench
    const bench = new THREE.Group();
    const top = new THREE.Mesh(roundedBox(6, 0.35, 3, 0.08, 0.5), woodMat('#a8703e'));
    top.position.y = 1.8;
    bench.add(top);
    for (const x of [-2.7, 2.7]) {
      const leg = new THREE.Mesh(roundedBox(0.3, 1.8, 2.6, 0.05, 0.5), woodMat('#8a5a30'));
      leg.position.set(x, 0.9, 0);
      bench.add(leg);
    }
    const shelf = new THREE.Mesh(roundedBox(5.4, 0.15, 2.4, 0.04, 0.5), woodMat('#8a5a30'));
    shelf.position.y = 0.5;
    bench.add(shelf);
    bench.traverse((m) => ((m as THREE.Mesh).isMesh ? ((m.castShadow = true), (m.receiveShadow = true)) : 0));
    bench.position.set(0, 0, -1);
    sc.add(bench);
    // turntable (pizza box!)
    const box = new THREE.Mesh(roundedBox(2.2, 0.2, 2.2, 0.04, 0.5), cardMat('#d8b07a'));
    box.castShadow = box.receiveShadow = true;
    this.turntable.add(box);
    this.turntable.position.set(0, 2.08, -1);
    sc.add(this.turntable);
    // junk pile
    const junk = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const kind = i % 3;
      let m: THREE.Mesh;
      if (kind === 0) m = new THREE.Mesh(roundedBox(rand(0.8, 1.4), rand(0.6, 1.1), 1, 0.05, 0.5), cardMat('#c89b62'));
      else if (kind === 1) m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 12), plastic(['#d42a2a', '#3a6fe8', '#3aa85a'][i % 3], 0.3, 0.4));
      else m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.0, 12), new THREE.MeshPhysicalMaterial({ color: 0x9fe0b0, transparent: true, opacity: 0.6, roughness: 0.1 }));
      m.position.set(-6.5 + rand(-1.4, 1.4), 0.4 + Math.floor(i / 3) * 0.7, -2 + rand(-1, 1));
      m.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.4, 0.4));
      m.castShadow = m.receiveShadow = true;
      junk.add(m);
    }
    sc.add(junk);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.35, 10, 20), plastic('#2a2a2a', 0.8));
    tire.position.set(6.5, 0.35, -2);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    sc.add(tire);
    const stool = P.crateStack();
    stool.scale.setScalar(0.5);
    stool.position.set(7.5, 0, -3.5);
    sc.add(stool);
    // lamp
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), emissive('#ffe2a0', 1.6));
    bulb.position.set(0, 8.4, -1);
    sc.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), plastic('#222', 0.8));
    cord.position.set(0, 10.6, -1);
    sc.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.6, 16, 1, true), plastic('#3a8a5a', 0.4, 0.3));
    shade.position.set(0, 8.7, -1);
    (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    sc.add(shade);
    const lamp = new THREE.PointLight(0xffc880, 14, 18, 1.6);
    lamp.position.set(0, 8, 0);
    lamp.castShadow = false;
    sc.add(lamp);
    // rug
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.06, 32), stripeMat(['#e8443a', '#ffd23f', '#3a6fe8', '#ffffff'], false));
    rug.position.set(0, 0.03, 2);
    rug.receiveShadow = true;
    sc.add(rug);

    this.kid.root.position.set(3.6, 0, 0.6);
    this.kid.hips.rotation.y = -0.5;
    this.kid.root.scale.setScalar(1.6);
    this.kid.play('idle');
    this.kid.root.traverse((m) => ((m as THREE.Mesh).isMesh ? (m.castShadow = true) : 0));
    sc.add(this.kid.root);
  }

  setLoadout(l: Loadout, poof = false) {
    if (this.rocket) this.turntable.remove(this.rocket.root);
    this.rocket = buildRocket(l);
    this.rocket.root.position.y = 0.1 + -this.rocket.nozzleY;
    this.rocket.flame.visible = false;
    this.turntable.add(this.rocket.root);
    if (poof) {
      const p = new THREE.Vector3(0, 3.2, -1);
      for (let i = 0; i < 18; i++) {
        const a = rand(0, Math.PI * 2);
        this.fx.smoke.spawn({ x: p.x + Math.cos(a) * 0.5, y: p.y + rand(-1, 1), z: p.z + Math.sin(a) * 0.5, vx: Math.cos(a) * rand(2, 4), vy: rand(0, 2), vz: Math.sin(a) * rand(2, 4), life: rand(0.5, 0.9), s0: 0.2, s1: rand(0.6, 1), c0: 0xffffff, c1: 0xf0e0d0, drag: 3, puff: true });
      }
      this.fx.confettiBurst(p.x, p.y + 1, 30, 6);
      this.hop = 1;
      this.kid.play('cheer');
      setTimeout(() => this.kid.play(this.mode === 'garage' ? 'build' : 'idle'), 900);
    }
  }

  setMode(m: 'title' | 'garage' | 'stages') {
    this.mode = m;
    this.kid.play(m === 'garage' ? 'build' : m === 'title' ? 'wave' : 'idle');
    this.kid.setFace(m === 'garage' ? 'determined' : 'grin');
  }

  update(dt: number) {
    this.t += dt;
    const aspect = this.renderer.w / this.renderer.h;
    this.camera.aspect = aspect;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.mode === 'garage') {
      pos = new THREE.Vector3(Math.sin(this.t * 0.2) * 0.6, 3.6, 8.2 / Math.max(0.55, aspect * 1.6));
      look = new THREE.Vector3(0, 1.3, -1);
    } else if (this.mode === 'stages') {
      pos = new THREE.Vector3(-2, 6, 16);
      look = new THREE.Vector3(0, 4, -2);
    } else {
      pos = new THREE.Vector3(Math.sin(this.t * 0.15) * 1.2, 4.2, 15.5 / Math.max(0.55, aspect * 1.6));
      look = new THREE.Vector3(0.6, 4.4, -1);
    }
    this.camPos.x = damp(this.camPos.x, pos.x, 3, dt);
    this.camPos.y = damp(this.camPos.y, pos.y, 3, dt);
    this.camPos.z = damp(this.camPos.z, pos.z, 3, dt);
    this.camLook.x = damp(this.camLook.x, look.x, 3, dt);
    this.camLook.y = damp(this.camLook.y, look.y, 3, dt);
    this.camLook.z = damp(this.camLook.z, look.z, 3, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.updateProjectionMatrix();
    this.turntable.rotation.y += dt * (this.mode === 'garage' ? 0.6 : 0.35);
    if (this.hop > 0) {
      this.hop = Math.max(0, this.hop - dt * 2.5);
      this.turntable.position.y = 2.08 + Math.sin(this.hop * Math.PI) * 0.5;
    }
    if (this.rocket) {
      this.rocket.roll.rotation.y = 0;
      if (this.rocket.drillBit) this.rocket.drillBit.rotation.y += dt * 6;
      if (this.rocket.spinners) for (const s of this.rocket.spinners) s.rotation.y += dt * 8;
    }
    this.kid.update(dt, 0.3);
    this.fx.update(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
