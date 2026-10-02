import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Recompute UVs as a box projection in world-ish units (uv = position * scale). */
export function boxUV(geo: THREE.BufferGeometry, scale: number, offset = new THREE.Vector3()) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (nz >= nx && nz >= ny) {
      u = x;
      v = y;
    } else if (nx >= ny) {
      u = z;
      v = y;
    } else {
      u = x;
      v = z;
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const rbCache = new Map<string, THREE.BufferGeometry>();
export function roundedBox(w: number, h: number, d: number, r = 0.08, uvScale = 0.5, seg = 2) {
  const key = [w, h, d, r, uvScale, seg].map((n) => n.toFixed(3)).join('|');
  let g = rbCache.get(key);
  if (!g) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    g = new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, rr));
    boxUV(g, uvScale);
    g.userData.shared = true;
    rbCache.set(key, g);
  }
  return g;
}

/** Extrude a 2D polygon (x,y pairs) to depth centered on z=0, with a soft bevel. */
export function extrudePoly(pts: { x: number; y: number }[], depth: number, bevel = 0.2, uvScale = 0.25, curveSegs = 2) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: curveSegs,
    curveSegments: 6,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.computeVertexNormals();
  boxUV(geo, uvScale);
  return geo;
}

export function extrudeShape(shape: THREE.Shape, depth: number, bevel = 0.05, uvScale = 1, curveSegments = 12) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 2,
    curveSegments,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.computeVertexNormals();
  boxUV(geo, uvScale);
  return geo;
}

export function lathe(profile: [number, number][], segs = 24) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

export function merge(geos: THREE.BufferGeometry[]) {
  // Normalise attributes so mergeGeometries doesn't complain.
  const prepared = geos.map((g) => {
    let gg = g.index ? g.toNonIndexed() : g.clone();
    if (!gg.getAttribute('uv')) {
      gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.getAttribute('position').count * 2), 2));
    }
    for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    return gg;
  });
  return mergeGeometries(prepared, false)!;
}

/**
 * Merge every static mesh under `root` (skipping subtrees flagged userData.dynamic)
 * into one mesh per material — slashes draw calls for big dioramas.
 */
export function bakeStatic(roots: THREE.Object3D[], out: THREE.Group) {
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const victims: THREE.Mesh[] = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    const visit = (o: THREE.Object3D) => {
      if (o.userData.dynamic) return;
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as any).isInstancedMesh && !Array.isArray(m.material) && m.visible) {
        const key = m.material.uuid + (m.castShadow ? '|c' : '|n');
        let b = buckets.get(key);
        if (!b) {
          b = { mat: m.material, cast: m.castShadow, geos: [] };
          buckets.set(key, b);
        }
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        b.geos.push(g);
        victims.push(m);
      }
      for (const c of o.children) visit(c);
    };
    visit(root);
  }
  for (const v of victims) v.parent?.remove(v);
  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    const merged = b.geos.length === 1 ? b.geos[0] : merge(b.geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return buckets.size;
}

/**
 * Free GPU resources owned by a subtree (R-07). Geometries/materials flagged
 * `userData.shared` belong to process-wide caches and are kept; textures are always cached.
 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as any).isPoints && !(o as any).isLine) return;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) if (!mat.userData.shared) mat.dispose();
    if ((m as any).isInstancedMesh) (m as unknown as THREE.InstancedMesh).dispose();
  });
}

/** Star / gear outline shape. */
export function gearShape(teeth: number, rOuter: number, rInner: number, hole = 0) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 4;
    const r = k === 1 || k === 2 ? rOuter : rInner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  if (hole > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, hole, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}

/**
 * Q-PF-04: collapse a prop model's sub-meshes into one mesh per material (in the root's local
 * space), so a 40-part cake costs a handful of draw calls. Parts under a node flagged
 * `userData.keep` (animated pieces) and outline meshes are left alone.
 */
export function mergeByMaterial(root: THREE.Object3D, minParts = 3) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const victims: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o !== root && o.userData.keep) return;
    const m = o as THREE.Mesh;
    if (o !== root && m.isMesh && !(m as any).isInstancedMesh && !Array.isArray(m.material) && m.visible && m.name !== 'contact') {
      const key = m.material.uuid + (m.castShadow ? '|c' : '|n');
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, geos: [] }));
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      b.geos.push(g);
      victims.push(m);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  if (victims.length < minParts) return 0;
  for (const v of victims) {
    v.parent?.remove(v);
    if (!v.geometry.userData.shared) v.geometry.dispose();
  }
  let n = 0;
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : merge(b.geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    root.add(mesh);
    n++;
  }
  return victims.length - n;
}

/**
 * Merge a rigged model without breaking its animation: inside every group, the meshes that
 * hang directly off it are merged per material; groups (joints) and parts flagged `keep`
 * (e.g. swappable mouths) stay separate.
 */
export function mergeRig(root: THREE.Object3D) {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh && !o.userData.keep) groups.push(o);
  });
  for (const g of groups) {
    const sub = g.children.filter((c) => !(c as THREE.Mesh).isMesh && !c.userData.keep);
    for (const c of sub) c.userData.keep = true;
    mergeByMaterial(g, 2);
    for (const c of sub) delete c.userData.keep;
  }
}
