import * as THREE from 'three';
import * as T from './textures';

/**
 * Physical + visual material table. Physics uses density/friction/strength,
 * the renderer uses make() + uv (uv scale = 1 / texture world size in metres).
 */
export interface MatInfo {
  density: number;
  friction: number;
  restitution: number;
  /** hp per sqrt(area) — how hard to break */
  strength: number;
  /** damage factor applied to the rocket when it smashes this */
  hardness: number;
  flammable: boolean;
  sound: string;
  debris: number; // debris color
  uv: number;
  make: () => THREE.Material;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

export const MATS: Record<string, MatInfo> = {
  wood: {
    density: 0.7, friction: 0.6, restitution: 0.1, strength: 18, hardness: 0.35, flammable: true, sound: 'wood', debris: 0xb97a45, uv: 0.5,
    make: () => std({ ...T.wood('#c08550'), roughness: 0.8 }),
  },
  darkwood: {
    density: 0.8, friction: 0.6, restitution: 0.1, strength: 22, hardness: 0.35, flammable: true, sound: 'wood', debris: 0x7a4a2a, uv: 0.5,
    make: () => std({ ...T.wood('#8a5634'), roughness: 0.85 }),
  },
  cardboard: {
    density: 0.25, friction: 0.7, restitution: 0.05, strength: 9, hardness: 0.15, flammable: true, sound: 'wood', debris: 0xc89b62, uv: 0.45,
    make: () => std({ ...T.cardboard('#c89b62'), roughness: 0.95 }),
  },
  glass: {
    density: 1.2, friction: 0.2, restitution: 0.1, strength: 4, hardness: 0.08, flammable: false, sound: 'glass', debris: 0xbfe8ff, uv: 1,
    make: () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xbfe8ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 0.6, envMapIntensity: 0.7, depthWrite: false,
      }),
  },
  brick: {
    density: 2.0, friction: 0.7, restitution: 0.05, strength: 75, hardness: 0.55, flammable: false, sound: 'brick', debris: 0xb5523b, uv: 0.5,
    make: () => std({ ...T.brick('#b5523b'), roughness: 0.9 }),
  },
  metal: {
    density: 3.0, friction: 0.35, restitution: 0.15, strength: 210, hardness: 0.7, flammable: false, sound: 'metal', debris: 0x9aa3ad, uv: 0.5,
    make: () => std({ ...T.metal('#9aa3ad'), roughness: 0.4, metalness: 0.7 }),
  },
  redmetal: {
    density: 3.0, friction: 0.35, restitution: 0.15, strength: 210, hardness: 0.7, flammable: false, sound: 'metal', debris: 0xc84a3a, uv: 0.5,
    make: () => std({ ...T.metal('#c84a3a'), roughness: 0.45, metalness: 0.5 }),
  },
  stone: {
    density: 2.4, friction: 0.8, restitution: 0.05, strength: 140, hardness: 0.6, flammable: false, sound: 'stone', debris: 0x9a958c, uv: 0.35,
    make: () => std({ ...T.concrete('#a8a399'), roughness: 0.95 }),
  },
  concrete: {
    density: 2.4, friction: 0.8, restitution: 0.05, strength: 160, hardness: 0.6, flammable: false, sound: 'stone', debris: 0xb9b4aa, uv: 0.3,
    make: () => std({ ...T.concrete('#c4beb2'), roughness: 0.95 }),
  },
  ceramic: {
    density: 1.6, friction: 0.4, restitution: 0.1, strength: 22, hardness: 0.3, flammable: false, sound: 'ceramic', debris: 0xd28a5a, uv: 0.5,
    make: () => std({ color: 0xd28a5a, roughness: 0.6 }),
  },
  rubber: {
    density: 0.6, friction: 0.9, restitution: 0.85, strength: 9999, hardness: 0.1, flammable: false, sound: 'rubber', debris: 0xe05050, uv: 0.5,
    make: () => std({ ...T.felt('#e85a5a'), roughness: 0.6 }),
  },
  soft: {
    density: 0.5, friction: 0.8, restitution: 0.05, strength: 30, hardness: 0.12, flammable: false, sound: 'soft', debris: 0xfff1e0, uv: 0.5,
    make: () => std({ ...T.felt('#fff1e0'), roughness: 0.9 }),
  },
  fabric: {
    density: 0.3, friction: 0.8, restitution: 0.1, strength: 12, hardness: 0.1, flammable: true, sound: 'soft', debris: 0xe0c060, uv: 0.5,
    make: () => std({ ...T.felt('#e0c060'), roughness: 0.95 }),
  },
  // ---- static-only visuals
  grass: {
    density: 0, friction: 0.8, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'ground', debris: 0x6aa84f, uv: 0.4,
    make: () => std({ ...T.felt('#6fb04a'), roughness: 1 }),
  },
  soil: {
    density: 0, friction: 0.8, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'ground', debris: 0x7a5236, uv: 0.18,
    make: () => std({ ...T.soil('#7d5638'), roughness: 1 }),
  },
  darksoil: {
    density: 0, friction: 0.8, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'ground', debris: 0x5a3a26, uv: 0.18,
    make: () => std({ ...T.soil('#5c3d28'), roughness: 1 }),
  },
  roof: {
    density: 0, friction: 0.6, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'stone', debris: 0xc0503c, uv: 0.5,
    make: () => std({ ...T.tiles('#c45a40'), roughness: 0.75 }),
  },
  bluetile: {
    density: 0, friction: 0.6, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'stone', debris: 0x4a7ab0, uv: 0.5,
    make: () => std({ ...T.tiles('#4f7fb5'), roughness: 0.7 }),
  },
  plaster: {
    density: 0, friction: 0.7, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'stone', debris: 0xf2e6cf, uv: 0.3,
    make: () => std({ ...T.felt('#f2e4c8'), roughness: 0.95 }),
  },
  schoolwall: {
    density: 0, friction: 0.7, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'stone', debris: 0xe8d29a, uv: 0.3,
    make: () => std({ ...T.felt('#ead7a4'), roughness: 0.95 }),
  },
  feltblue: {
    density: 0, friction: 0.7, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'soft', debris: 0x4a8ad0, uv: 0.4,
    make: () => std({ ...T.felt('#5a92d6'), roughness: 1 }),
  },
  feltpink: {
    density: 0, friction: 0.7, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'soft', debris: 0xf08aa8, uv: 0.4,
    make: () => std({ ...T.felt('#f39ab5'), roughness: 1 }),
  },
  feltpurple: {
    density: 0, friction: 0.7, restitution: 0.1, strength: 9999, hardness: 0.5, flammable: false, sound: 'soft', debris: 0x8a6ad0, uv: 0.4,
    make: () => std({ ...T.felt('#8f72cf'), roughness: 1 }),
  },
  cloud: {
    density: 0, friction: 0.7, restitution: 0.3, strength: 9999, hardness: 0.2, flammable: false, sound: 'soft', debris: 0xffffff, uv: 0.4,
    make: () => std({ ...T.felt('#fbfbff'), roughness: 1 }),
  },
};

const matCache = new Map<string, THREE.Material>();
export function getMaterial(name: string): THREE.Material {
  let m = matCache.get(name);
  if (!m) {
    const info = MATS[name] ?? MATS.wood;
    m = info.make();
    matCache.set(name, m);
  }
  return m;
}

export function matInfo(name: string): MatInfo {
  return MATS[name] ?? MATS.wood;
}

// ---- generic coloured materials for models
const colCache = new Map<string, THREE.Material>();
export function feltMat(color: string, rough = 0.95) {
  const k = 'felt' + color + rough;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ ...T.felt(color), roughness: rough });
    colCache.set(k, m);
  }
  return m;
}
export function knitMat(color: string) {
  const k = 'knit' + color;
  let m = colCache.get(k);
  if (!m) {
    const tp = T.knit(color);
    m = new THREE.MeshStandardMaterial({ map: tp.map, normalMap: tp.normalMap, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
    colCache.set(k, m);
  }
  return m;
}
export function plastic(color: number | string, rough = 0.35, metal = 0) {
  const k = 'plastic' + color + rough + metal;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: color as any, roughness: rough, metalness: metal });
    colCache.set(k, m);
  }
  return m;
}
export function shiny(color: number | string, rough = 0.25, metal = 0.9) {
  return plastic(color, rough, metal);
}
export function emissive(color: number | string, intensity = 2) {
  const k = 'emi' + color + intensity;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: color as any, emissive: color as any, emissiveIntensity: intensity, roughness: 0.5 });
    colCache.set(k, m);
  }
  return m;
}
export function cardMat(color = '#c89b62') {
  const k = 'card' + color;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ ...T.cardboard(color), roughness: 0.95 });
    colCache.set(k, m);
  }
  return m;
}
export function woodMat(color = '#c08550') {
  const k = 'woodm' + color;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ ...T.wood(color, 256, false), roughness: 0.85 });
    colCache.set(k, m);
  }
  return m;
}
export function metalMat(color = '#9aa3ad', rough = 0.35) {
  const k = 'metm' + color + rough;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ ...T.metal(color, 256, false), roughness: rough, metalness: 0.8 });
    colCache.set(k, m);
  }
  return m;
}
export function stripeMat(colors: string[], vertical = false) {
  const k = 'str' + colors.join() + vertical;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ ...T.stripes(colors, 256, vertical), roughness: 0.95 });
    colCache.set(k, m);
  }
  return m;
}
export function polkaMat(bg: string, dot: string) {
  const k = 'polka' + bg + dot;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ ...T.polka(bg, dot), roughness: 0.8 });
    colCache.set(k, m);
  }
  return m;
}
export function texMat(key: string, tex: THREE.Texture, rough = 0.6, extra: THREE.MeshStandardMaterialParameters = {}) {
  const k = 'tex' + key;
  let m = colCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: rough, ...extra });
    colCache.set(k, m);
  }
  return m;
}
