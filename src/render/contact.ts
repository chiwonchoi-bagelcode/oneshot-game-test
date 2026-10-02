import * as THREE from 'three';

/**
 * Q-CI visual contract (docs/visual-contract.md).
 *
 *   role          | outline on the play plane            | other cues
 *   --------------|--------------------------------------|-----------------------------------------
 *   solid         | continuous dark ink line             | full saturation, casts shadow
 *   breakable     | dashed "stitch" ink line             | crack decals as it takes damage
 *   device        | dashed amber line, slow pulse        | it reacts when hit (valve, fireworks …)
 *   pass-through  | none                                 | coins/gears/fuel spin & glow; debris fades
 *   background    | none                                 | hazed toward the fog colour, no shadow
 *
 * The outline is drawn exactly on the physics collider edge (same numbers that build the body),
 * on the front face of the object, so "what you see is what you hit".
 */
export type ContactRole = 'solid' | 'breakable' | 'device';

export const INK = new THREE.Color('#2e1c10');
const T = 0.085; // line half-thickness (m)
const DASH = 0.34;
const GAP = 0.2;

const mats: Record<ContactRole, THREE.MeshBasicMaterial> = {
  solid: new THREE.MeshBasicMaterial({ color: INK, toneMapped: false }),
  breakable: new THREE.MeshBasicMaterial({ color: '#3a2414', toneMapped: false }),
  device: new THREE.MeshBasicMaterial({ color: '#ffb21e', toneMapped: false, transparent: true }),
};
for (const m of Object.values(mats)) {
  m.userData.shared = true;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
}

export function contactMaterial(role: ContactRole) {
  return mats[role];
}

/** Pulse the device outline (called once per frame). */
export function animateContact(t: number) {
  mats.device.opacity = 0.65 + 0.35 * Math.sin(t * 4);
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/** quad strip of segments along a closed polyline */
function strokeGeometry(pts: { x: number; y: number }[], closed: boolean, dashed: boolean, t = T) {
  const pos: number[] = [];
  const idx: number[] = [];
  const quad = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    // extend each segment by t so corners close
    const ux = dx / l;
    const uy = dy / l;
    const nx = -uy * t;
    const ny = ux * t;
    const sx = ax - ux * t;
    const sy = ay - uy * t;
    const ex = bx + ux * t;
    const ey = by + uy * t;
    const i = pos.length / 3;
    pos.push(sx + nx, sy + ny, 0, ex + nx, ey + ny, 0, ex - nx, ey - ny, 0, sx - nx, sy - ny, 0);
    idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  };
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let s = 0; s < segs; s++) {
    const a = pts[s];
    const b = pts[(s + 1) % n];
    if (!dashed) {
      quad(a.x, a.y, b.x, b.y);
      continue;
    }
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.round(L / (DASH + GAP)));
    const step = L / k;
    const d = step * (DASH / (DASH + GAP));
    for (let j = 0; j < k; j++) {
      const t0 = (j * step + (step - d) / 2) / L;
      const t1 = t0 + d / L;
      quad(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function rectGeometry(w: number, h: number, dashed: boolean) {
  const key = `r${w.toFixed(2)}x${h.toFixed(2)}${dashed ? 'd' : ''}`;
  let g = geoCache.get(key);
  if (!g) {
    const x = w / 2;
    const y = h / 2;
    g = strokeGeometry([{ x: -x, y: -y }, { x, y: -y }, { x, y }, { x: -x, y }], true, dashed);
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

function circleGeometry(r: number, dashed: boolean) {
  const key = `c${r.toFixed(2)}${dashed ? 'd' : ''}`;
  let g = geoCache.get(key);
  if (!g) {
    const n = Math.max(14, Math.round(r * 18));
    const pts = Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2) * r, y: Math.sin((i / n) * Math.PI * 2) * r }));
    g = strokeGeometry(pts, true, dashed);
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Outline mesh for a box/circle collider, to be added as a child of the entity's visual. */
export function contactOutline(shape: { w: number; h: number; round?: boolean }, role: ContactRole, z: number) {
  const dashed = role !== 'solid';
  const geo = shape.round ? circleGeometry(shape.w / 2, dashed) : rectGeometry(shape.w, shape.h, dashed);
  const m = new THREE.Mesh(geo, mats[role]);
  m.position.z = z;
  m.renderOrder = 2;
  m.name = 'contact';
  m.userData.contact = role;
  return m;
}

/** Outline for a terrain polygon (world coordinates, closed). */
export function terrainOutline(pts: { x: number; y: number }[], z: number) {
  const m = new THREE.Mesh(strokeGeometry(pts, true, false), mats.solid);
  m.position.z = z;
  m.name = 'contact';
  m.userData.contact = 'solid';
  return m;
}

// ------------------------------------------------------------------ damage states
let crackTex: THREE.CanvasTexture[] | null = null;
function crackTextures() {
  if (crackTex) return crackTex;
  crackTex = [1, 2].map((level) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(30,18,10,0.85)';
    g.lineCap = 'round';
    let seed = level * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const branches = level === 1 ? 4 : 9;
    for (let b = 0; b < branches; b++) {
      let x = 64 + (rnd() - 0.5) * 20;
      let y = 64 + (rnd() - 0.5) * 20;
      let a = rnd() * Math.PI * 2;
      g.lineWidth = level === 1 ? 3 : 4;
      g.beginPath();
      g.moveTo(x, y);
      const steps = level === 1 ? 4 : 7;
      for (let s = 0; s < steps; s++) {
        a += (rnd() - 0.5) * 1.1;
        x += Math.cos(a) * 11;
        y += Math.sin(a) * 11;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return crackTex;
}
const crackMats: THREE.MeshBasicMaterial[] = [];

/** Show 0 (none), 1 or 2 levels of cracks on the front face of a damaged breakable box. */
export function setCracks(obj: THREE.Object3D, w: number, h: number, z: number, level: 0 | 1 | 2) {
  let m = obj.getObjectByName('cracks') as THREE.Mesh | undefined;
  if (!level) {
    if (m) m.visible = false;
    return;
  }
  if (!crackMats.length) {
    for (const t of crackTextures()) {
      const cm = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
      cm.userData.shared = true;
      crackMats.push(cm);
    }
  }
  if (!m) {
    const geo = new THREE.PlaneGeometry(1, 1);
    m = new THREE.Mesh(geo, crackMats[0]);
    m.name = 'cracks';
    m.scale.set(Math.min(w, h * 2) * 0.95, Math.min(h, w * 2) * 0.95, 1);
    m.position.z = z + 0.005;
    m.renderOrder = 1;
    obj.add(m);
  }
  m.material = crackMats[level - 1];
  m.visible = true;
}

// ------------------------------------------------------------------ background haze
const hazeCache = new Map<string, THREE.Material>();

/**
 * Background version of a material: pulled toward the fog colour and desaturated so solid-looking
 * scenery behind the play plane never reads as an obstacle.
 */
export function hazed(mat: THREE.Material, fog: THREE.Color, k: number) {
  const key = mat.uuid + '|' + fog.getHexString() + '|' + k.toFixed(2);
  let out = hazeCache.get(key);
  if (out) return out;
  const m = mat.clone() as THREE.MeshStandardMaterial;
  if (m.color) {
    const hsl = { h: 0, s: 0, l: 0 };
    m.color.getHSL(hsl);
    m.color.setHSL(hsl.h, hsl.s * (1 - k * 0.6), hsl.l);
    m.color.lerp(fog, k);
  }
  if ((m as any).emissive) (m as any).emissive = (m.emissive ?? new THREE.Color(0)).clone().lerp(fog, k * 0.45);
  m.userData = { ...m.userData, shared: true, hazed: true };
  hazeCache.set(key, m);
  out = m;
  return out;
}
