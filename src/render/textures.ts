import * as THREE from 'three';
import { mulberry32 } from '../core/math';

/** Procedural "craft material" textures: felt, knit, cardboard, wood, brick... */

type Ctx = CanvasRenderingContext2D;

function canvas(size: number, h = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  return c;
}

function heightToNormal(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d')!;
  const data = sctx.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);
  const o = img.data;
  const H = (x: number, y: number) => {
    x = (x + w) % w;
    y = (y + h) % h;
    return data[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * w + x) * 4;
      o[i] = (nx * 0.5 + 0.5) * 255;
      o[i + 1] = (ny * 0.5 + 0.5) * 255;
      o[i + 2] = (nz * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function toTex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface TexPair {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
}

function pair(color: HTMLCanvasElement, height: HTMLCanvasElement | null, strength = 2): TexPair {
  const out: TexPair = { map: toTex(color) };
  if (height) out.normalMap = toTex(heightToNormal(height, strength), false);
  return out;
}

function hex(c: string | number) {
  return new THREE.Color(c as any);
}
function css(col: THREE.Color, a = 1) {
  return `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`;
}
function shade(col: THREE.Color, f: number) {
  const c = col.clone();
  if (f > 0) c.lerp(new THREE.Color(1, 1, 1), f);
  else c.multiplyScalar(1 + f);
  return c;
}

function fillNoise(ctx: Ctx, size: number, rnd: () => number, count: number, minA: number, maxA: number, light = true, dot = 1.5) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${minA + rnd() * (maxA - minA)})`;
    ctx.fillRect(rnd() * size, rnd() * size, dot * (0.5 + rnd()), dot * (0.5 + rnd()));
  }
}

function fibers(ctx: Ctx, size: number, rnd: () => number, count: number, color: string, len = 6, width = 0.6) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const l = len * (0.4 + rnd());
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.5, y + Math.sin(a + 1) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

const cache = new Map<string, TexPair>();
function cached(key: string, fn: () => TexPair) {
  let v = cache.get(key);
  if (!v) {
    v = fn();
    cache.set(key, v);
  }
  return v;
}

// ------------------------------------------------------------------ felt
export function felt(color: string | number, size = 256): TexPair {
  return cached('felt' + color, () => {
    const rnd = mulberry32(11);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, size, size);
    // blotchy tone variation
    for (let i = 0; i < 40; i++) {
      const r = 10 + rnd() * 40;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      const sc = shade(base, (rnd() - 0.5) * 0.18);
      g.addColorStop(0, css(sc, 0.35));
      g.addColorStop(1, css(sc, 0));
      ctx.save();
      ctx.translate(rnd() * size, rnd() * size);
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
    fibers(ctx, size, rnd, 900, css(shade(base, 0.25), 0.35), 7, 0.6);
    fibers(ctx, size, rnd, 700, css(shade(base, -0.25), 0.3), 6, 0.6);
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    fibers(hctx, size, rnd, 1400, 'rgba(255,255,255,0.35)', 6, 1);
    fibers(hctx, size, rnd, 1000, 'rgba(0,0,0,0.3)', 6, 1);
    return pair(c, hc, 2.5);
  });
}

// ------------------------------------------------------------------ knit (characters)
export function knit(color: string | number, size = 256): TexPair {
  return cached('knit' + color, () => {
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    ctx.fillStyle = css(shade(base, -0.25));
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#202020';
    hctx.fillRect(0, 0, size, size);
    const cols = 16;
    const rows = 20;
    const cw = size / cols;
    const rh = size / rows;
    const rnd = mulberry32(5);
    for (let r = 0; r < rows + 1; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cw + cw / 2;
        const y = r * rh;
        const tone = shade(base, (rnd() - 0.5) * 0.12);
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(x + side * cw * 0.22, y);
          ctx.rotate(side * 0.55);
          const g = ctx.createLinearGradient(-cw * 0.25, 0, cw * 0.25, 0);
          g.addColorStop(0, css(shade(tone, -0.12)));
          g.addColorStop(0.5, css(shade(tone, 0.12)));
          g.addColorStop(1, css(shade(tone, -0.12)));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(0, 0, cw * 0.27, rh * 0.78, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          hctx.save();
          hctx.translate(x + side * cw * 0.22, y);
          hctx.rotate(side * 0.55);
          const hg = hctx.createRadialGradient(0, 0, 0, 0, 0, rh * 0.8);
          hg.addColorStop(0, '#ffffff');
          hg.addColorStop(1, '#303030');
          hctx.fillStyle = hg;
          hctx.beginPath();
          hctx.ellipse(0, 0, cw * 0.27, rh * 0.78, 0, 0, Math.PI * 2);
          hctx.fill();
          hctx.restore();
        }
      }
    }
    fibers(ctx, size, rnd, 300, css(shade(base, 0.35), 0.25), 4, 0.5);
    return pair(c, hc, 3);
  });
}

// ------------------------------------------------------------------ cardboard
export function cardboard(color = '#c89b62', size = 256): TexPair {
  return cached('card' + color, () => {
    const rnd = mulberry32(7);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, size, size);
    // corrugation bands
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    const bands = 16;
    for (let i = 0; i < bands; i++) {
      const x = (i / bands) * size;
      const g = ctx.createLinearGradient(x, 0, x + size / bands, 0);
      g.addColorStop(0, css(shade(base, -0.05), 0.5));
      g.addColorStop(0.5, css(shade(base, 0.06), 0.5));
      g.addColorStop(1, css(shade(base, -0.05), 0.5));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, size / bands, size);
      const hg = hctx.createLinearGradient(x, 0, x + size / bands, 0);
      hg.addColorStop(0, '#6a6a6a');
      hg.addColorStop(0.5, '#9a9a9a');
      hg.addColorStop(1, '#6a6a6a');
      hctx.fillStyle = hg;
      hctx.fillRect(x, 0, size / bands, size);
    }
    fillNoise(ctx, size, rnd, 2500, 0.05, 0.18, false, 1.4);
    fillNoise(ctx, size, rnd, 900, 0.05, 0.15, true, 1.4);
    fibers(ctx, size, rnd, 160, css(shade(base, -0.3), 0.25), 5, 0.5);
    // a couple of printed marks / tape
    ctx.fillStyle = css(shade(base, -0.35), 0.18);
    ctx.font = `bold ${size * 0.09}px sans-serif`;
    ctx.fillText('THIS SIDE UP ↑', size * 0.1, size * 0.85);
    return pair(c, hc, 1.6);
  });
}

// ------------------------------------------------------------------ wood
export function wood(color = '#b97a45', size = 256, plank = true): TexPair {
  return cached('wood' + color + plank, () => {
    const rnd = mulberry32(3);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 70; i++) {
      const y0 = rnd() * size;
      const amp = 2 + rnd() * 5;
      const freq = 0.01 + rnd() * 0.02;
      const ph = rnd() * 10;
      const col = shade(base, rnd() < 0.5 ? -0.15 - rnd() * 0.2 : 0.08 + rnd() * 0.1);
      ctx.strokeStyle = css(col, 0.5);
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      hctx.strokeStyle = rnd() < 0.5 ? 'rgba(40,40,40,0.5)' : 'rgba(200,200,200,0.4)';
      hctx.lineWidth = ctx.lineWidth;
      ctx.beginPath();
      hctx.beginPath();
      for (let x = -4; x <= size + 4; x += 4) {
        const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
        if (x === -4) {
          ctx.moveTo(x, y);
          hctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          hctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      hctx.stroke();
    }
    // knots
    for (let i = 0; i < 2; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      for (let r = 9; r > 1; r -= 2) {
        ctx.strokeStyle = css(shade(base, -0.3), 0.4);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.8, r * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (plank) {
      // plank seams
      const n = 4;
      for (let i = 0; i < n; i++) {
        const y = (i / n) * size;
        ctx.fillStyle = css(shade(base, -0.45), 0.8);
        ctx.fillRect(0, y, size, 2);
        hctx.fillStyle = '#000';
        hctx.fillRect(0, y, size, 3);
        // nails
        for (const nx of [size * 0.08, size * 0.92]) {
          ctx.fillStyle = '#5b5550';
          ctx.beginPath();
          ctx.arc(nx, y + size / n / 2, 2.2, 0, Math.PI * 2);
          ctx.fill();
          hctx.fillStyle = '#fff';
          hctx.beginPath();
          hctx.arc(nx, y + size / n / 2, 2.4, 0, Math.PI * 2);
          hctx.fill();
        }
      }
    }
    return pair(c, hc, 2.2);
  });
}

// ------------------------------------------------------------------ brick
export function brick(color = '#b5523b', size = 256): TexPair {
  return cached('brick' + color, () => {
    const rnd = mulberry32(9);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    ctx.fillStyle = '#d8cbb5';
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#000';
    hctx.fillRect(0, 0, size, size);
    fillNoise(ctx, size, rnd, 1500, 0.05, 0.2, false, 1.2);
    const rows = 8;
    const bh = size / rows;
    const bw = size / 4;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let i = -1; i < 5; i++) {
        const x = i * bw + off + 2;
        const y = r * bh + 2;
        const w = bw - 4;
        const h = bh - 4;
        const col = shade(base, (rnd() - 0.5) * 0.25);
        ctx.fillStyle = css(col);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 3);
        ctx.fill();
        // speckle
        for (let k = 0; k < 25; k++) {
          ctx.fillStyle = css(shade(col, (rnd() - 0.5) * 0.5), 0.5);
          ctx.fillRect(x + rnd() * w, y + rnd() * h, 2, 2);
        }
        const g = hctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#d0d0d0');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, '#b0b0b0');
        hctx.fillStyle = g;
        hctx.beginPath();
        hctx.roundRect(x, y, w, h, 4);
        hctx.fill();
      }
    }
    return pair(c, hc, 3);
  });
}

// ------------------------------------------------------------------ metal
export function metal(color = '#9aa3ad', size = 256, rivets = true): TexPair {
  return cached('metal' + color + rivets, () => {
    const rnd = mulberry32(13);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 400; i++) {
      const y = rnd() * size;
      ctx.strokeStyle = css(shade(base, (rnd() - 0.5) * 0.3), 0.25);
      ctx.lineWidth = 0.5 + rnd();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (rnd() - 0.5) * 3);
      ctx.stroke();
    }
    // scratches
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = css(shade(base, 0.4), 0.35);
      ctx.lineWidth = 0.6;
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 10);
      ctx.stroke();
    }
    if (rivets) {
      ctx.strokeStyle = css(shade(base, -0.35), 0.6);
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size - 2, size - 2);
      hctx.strokeStyle = '#202020';
      hctx.lineWidth = 3;
      hctx.strokeRect(1, 1, size - 2, size - 2);
      for (let i = 0; i < 8; i++) {
        for (const [x, y] of [
          [10 + (i * (size - 20)) / 7, 10],
          [10 + (i * (size - 20)) / 7, size - 10],
        ]) {
          const g = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, 4);
          g.addColorStop(0, css(shade(base, 0.5)));
          g.addColorStop(1, css(shade(base, -0.3)));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          hctx.fillStyle = '#fff';
          hctx.beginPath();
          hctx.arc(x, y, 3.5, 0, Math.PI * 2);
          hctx.fill();
        }
      }
    }
    return pair(c, hc, 2);
  });
}

// ------------------------------------------------------------------ soil / dirt
export function soil(color = '#7a5236', size = 256): TexPair {
  return cached('soil' + color, () => {
    const rnd = mulberry32(17);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#606060';
    hctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 60; i++) {
      const r = 3 + rnd() * 9;
      const x = rnd() * size;
      const y = rnd() * size;
      const col = shade(base, (rnd() - 0.4) * 0.4);
      ctx.fillStyle = css(col);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
      const g = hctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, 'rgba(96,96,96,0)');
      hctx.fillStyle = g;
      hctx.beginPath();
      hctx.arc(x, y, r, 0, Math.PI * 2);
      hctx.fill();
    }
    fillNoise(ctx, size, rnd, 2500, 0.05, 0.2, false, 1.5);
    fillNoise(ctx, size, rnd, 800, 0.05, 0.12, true, 1.5);
    fibers(ctx, size, rnd, 200, css(shade(base, -0.4), 0.3), 5, 0.6);
    return pair(c, hc, 2);
  });
}

// ------------------------------------------------------------------ concrete
export function concrete(color = '#b9b4aa', size = 256): TexPair {
  return cached('conc' + color, () => {
    const rnd = mulberry32(19);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    fillNoise(ctx, size, rnd, 4000, 0.04, 0.16, false, 1.4);
    fillNoise(ctx, size, rnd, 2000, 0.04, 0.14, true, 1.4);
    fillNoise(hctx, size, rnd, 3000, 0.1, 0.4, false, 2);
    ctx.strokeStyle = css(shade(base, -0.3), 0.6);
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    hctx.strokeStyle = '#000';
    hctx.lineWidth = 3;
    hctx.strokeRect(0, 0, size, size);
    return pair(c, hc, 1.5);
  });
}

// ------------------------------------------------------------------ roof tiles
export function tiles(color = '#c0503c', size = 256): TexPair {
  return cached('tiles' + color, () => {
    const rnd = mulberry32(23);
    const base = hex(color);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    ctx.fillStyle = css(shade(base, -0.4));
    ctx.fillRect(0, 0, size, size);
    hctx.fillStyle = '#000';
    hctx.fillRect(0, 0, size, size);
    const rows = 6;
    const cols = 6;
    const th = size / rows;
    const tw = size / cols;
    for (let r = rows; r >= -1; r--) {
      for (let i = -1; i <= cols; i++) {
        const x = i * tw + (r % 2 ? tw / 2 : 0);
        const y = r * th;
        const col = shade(base, (rnd() - 0.5) * 0.2);
        const g = ctx.createLinearGradient(0, y, 0, y + th * 1.2);
        g.addColorStop(0, css(shade(col, 0.1)));
        g.addColorStop(1, css(shade(col, -0.2)));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + tw, y);
        ctx.lineTo(x + tw, y + th * 0.8);
        ctx.quadraticCurveTo(x + tw / 2, y + th * 1.3, x, y + th * 0.8);
        ctx.closePath();
        ctx.fill();
        const hg = hctx.createLinearGradient(0, y, 0, y + th * 1.2);
        hg.addColorStop(0, '#606060');
        hg.addColorStop(1, '#ffffff');
        hctx.fillStyle = hg;
        hctx.beginPath();
        hctx.moveTo(x, y);
        hctx.lineTo(x + tw, y);
        hctx.lineTo(x + tw, y + th * 0.8);
        hctx.quadraticCurveTo(x + tw / 2, y + th * 1.3, x, y + th * 0.8);
        hctx.closePath();
        hctx.fill();
      }
    }
    return pair(c, hc, 2.5);
  });
}

// ------------------------------------------------------------------ stripes (saekdong etc.)
export function stripes(colors: string[], size = 256, vertical = false): TexPair {
  return cached('stripes' + colors.join() + vertical, () => {
    const rnd = mulberry32(29);
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    const n = colors.length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[i];
      if (vertical) ctx.fillRect((i / n) * size, 0, size / n + 1, size);
      else ctx.fillRect(0, (i / n) * size, size, size / n + 1);
    }
    fibers(ctx, size, rnd, 600, 'rgba(255,255,255,0.18)', 5, 0.6);
    fibers(ctx, size, rnd, 600, 'rgba(0,0,0,0.12)', 5, 0.6);
    const hc = canvas(size);
    const hctx = hc.getContext('2d')!;
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, size, size);
    fibers(hctx, size, rnd, 1200, 'rgba(255,255,255,0.3)', 5, 1);
    return pair(c, hc, 2);
  });
}

export function polka(bg: string, dot: string, size = 256): TexPair {
  return cached('polka' + bg + dot, () => {
    const c = canvas(size);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = dot;
    const n = 6;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.beginPath();
        ctx.arc(((x + (y % 2) * 0.5) / n) * size, (y / n) * size + size / n / 2, size / n / 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    const rnd = mulberry32(31);
    fibers(ctx, size, rnd, 300, 'rgba(255,255,255,0.15)', 5, 0.6);
    return pair(c, null);
  });
}

/** Printed label wrapped around bottles/cans. */
export function label(key: string, draw: (ctx: Ctx, w: number, h: number) => void, w = 512, h = 256): THREE.Texture {
  const k = 'label' + key;
  const hit = cache.get(k);
  if (hit) return hit.map;
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = toTex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(k, { map: t });
  return t;
}

/** Soft round sprite for flames / glows. */
export function glowSprite(): THREE.Texture {
  return cached('glow', () => {
    const s = 128;
    const c = canvas(s);
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { map: t };
  }).map;
}

/** Vertical gradient for flame cones: hot at the nozzle, fading to the tip. */
export function flameGradient(): THREE.Texture {
  return cached('flamegrad', () => {
    const c = canvas(8, 128);
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { map: t };
  }).map;
}

/** Text drawn on a canvas, for signs. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 256): THREE.Texture {
  return label('sign' + text + bg + fg, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(text.length * 7);
    fibers(ctx, w, rnd, 400, 'rgba(0,0,0,0.12)', 8, 0.8);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    const fs = Math.min(h / (lines.length + 0.6), (w / Math.max(...lines.map((l) => l.length))) * 1.6);
    ctx.font = `bold ${fs}px "Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.05));
  }, w, h);
}
