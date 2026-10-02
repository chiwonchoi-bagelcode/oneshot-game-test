/**
 * Dev/QA perf overlay (Q-PF). Test builds only — never in the release bundle.
 * Open with `?perf` in the URL. Shows frame time distribution and the budgeted counters.
 */
import type { App } from '../app';
import { BUDGET } from '../game/budgets';
import { Particles } from '../render/effects';

export class PerfMeter {
  frames: number[] = [];
  updates: number[] = [];
  peakAt: { x: number | null; y: number | null; phase: string } | null = null;
  peak = { calls: 0, triangles: 0, awake: 0, debris: 0, water: 0, particles: 0, bodies: 0 };
  constructor(private app: App) {}

  sample(frameMs: number) {
    const a = this.app;
    this.frames.push(frameMs);
    this.updates.push(a.timing.update);
    if (this.frames.length > 600) {
      this.frames.shift();
      this.updates.shift();
    }
    const c = this.counts();
    if (c.calls > this.peak.calls) {
      const r = a.flight?.rocket;
      const p = r && !r.dead ? r.body.getPosition() : null;
      this.peakAt = { x: p ? +p.x.toFixed(1) : null, y: p ? +p.y.toFixed(1) : null, phase: a.flight?.phase ?? a.mode };
    }
    for (const k of Object.keys(this.peak) as (keyof typeof this.peak)[]) this.peak[k] = Math.max(this.peak[k], (c as any)[k] ?? 0);
  }

  counts() {
    const a = this.app;
    const w = a.flight?.world.perfCounts() ?? { bodies: 0, awake: 0, debris: 0, water: 0, ents: 0 };
    return { ...w, calls: a.renderer.frameStats.calls, triangles: a.renderer.frameStats.triangles, particles: Particles.alive() };
  }

  static pct(arr: number[], p: number) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  }

  report() {
    const P = PerfMeter.pct;
    return {
      frames: this.frames.length,
      frameMs: { p50: P(this.frames, 50), p95: P(this.frames, 95), p99: P(this.frames, 99), max: Math.max(0, ...this.frames) },
      updateMs: { p50: P(this.updates, 50), p95: P(this.updates, 95), p99: P(this.updates, 99), max: Math.max(0, ...this.updates) },
      peak: { ...this.peak },
      peakAt: this.peakAt,
      budget: BUDGET,
    };
  }

  reset() {
    this.frames.length = 0;
    this.updates.length = 0;
    for (const k of Object.keys(this.peak) as (keyof typeof this.peak)[]) this.peak[k] = 0;
  }
}

export function installPerfOverlay(app: App, meter: PerfMeter) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:4px;bottom:4px;z-index:50;font:11px/1.3 monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 6px;border-radius:6px;pointer-events:none;white-space:pre';
  app.container.appendChild(el);
  let acc = 0;
  app.onFrame = (dt) => {
    meter.sample(dt * 1000);
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    const r = meter.report();
    const c = meter.counts();
    const warn = (v: number, b: number) => (v > b ? ' !' : '');
    el.textContent =
      `fps ${(1000 / Math.max(1, r.frameMs.p50)).toFixed(0)}  p95 ${r.frameMs.p95.toFixed(1)}  p99 ${r.frameMs.p99.toFixed(1)} ms\n` +
      `cpu upd p95 ${r.updateMs.p95.toFixed(2)} ms  render ${app.timing.render.toFixed(2)} ms\n` +
      `calls ${c.calls}${warn(c.calls, BUDGET.drawCalls)}  tris ${(c.triangles / 1000).toFixed(0)}k\n` +
      `bodies ${c.bodies} awake ${c.awake}${warn(c.awake, BUDGET.awakeBodies)}  debris ${c.debris}  water ${c.water}\n` +
      `particles ${c.particles}${warn(c.particles, BUDGET.particles)}`;
  };
}
