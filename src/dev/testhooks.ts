/**
 * Test hooks — compiled only into dev / test builds (`VITE_TEST_HOOKS=1`), never into the release
 * bundle (see main.ts; `npm run check:release` greps the output for `__jrr`).
 *
 * Rules (docs/qa-plan.md §자동화 원칙):
 *  - input goes through the real DOM path: PointerEvents are dispatched at the element under the
 *    point (`elementFromPoint`), so dialogs and HUD hit-testing apply exactly as for a finger
 *  - the only non-player control is the clock (`advance`), which runs the same fixed 60 Hz
 *    update the browser loop runs; nothing teleports, injects state or grants currency
 *  - `state()` is a read-only snapshot for assertions
 */
import type { App } from '../app';
import { save, loadStatus, loadProblems } from '../core/save';
import { events } from '../core/telemetry';
import { computeStats } from '../data/parts';
import { PerfMeter, installPerfOverlay } from './perf';
import { stressStage } from './stress';

interface PilotOpts {
  /** max approach speed (m/s) */
  speed?: number;
  /** keep full throttle into the target instead of braking */
  ram?: boolean;
  /** stop when within this distance */
  stopAt?: number;
  /** extra upward bias in the velocity controller (gravity compensation) */
  lift?: number;
  /** fuel-saving flying like a person: fall freely toward lower targets, wider dead band */
  eco?: boolean;
  /** render + perf-sample every frame (Q-PF measurement) instead of physics-only steps */
  render?: boolean;
}

export function installTestHooks(app: App) {
  const touch = app.container.querySelector('#touch') as HTMLElement;
  let pid = 100;
  let held: { id: number; x: number; y: number; target: Element } | null = null;

  const rect = () => app.container.getBoundingClientRect();
  /** dispatch a pointer event at game-relative CSS px (x,y) through normal hit testing */
  const fire = (type: string, x: number, y: number, target?: Element) => {
    const r = rect();
    const cx = r.left + x;
    const cy = r.top + y;
    const t = target ?? document.elementFromPoint(cx, cy) ?? touch;
    const id = held?.id ?? pid;
    t.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: cx, clientY: cy, bubbles: true, cancelable: true, composed: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, pointerType: 'touch' }));
    return t;
  };

  const down = (x: number, y: number) => {
    if (held) up();
    pid++;
    held = { id: pid, x, y, target: touch };
    held.target = fire('pointerdown', x, y);
    return held.target === touch || touch.contains(held.target);
  };
  const move = (x: number, y: number) => {
    if (!held) return;
    held.x = x;
    held.y = y;
    fire('pointermove', x, y, held.target);
  };
  const up = () => {
    if (!held) return;
    fire('pointerup', held.x, held.y, held.target);
    held = null;
  };

  const step = (n = 1) => {
    for (let i = 0; i < n; i++) app.tick(1 / 60, false);
  };
  const advance = (sec: number) => {
    app.manual = true;
    step(Math.max(1, Math.round(sec * 60)));
    app.tick(0.0001, true);
  };

  /** Tap at a point (down, one frame, up). */
  const tap = (x: number, y: number) => {
    const ok = down(x, y);
    step(1);
    up();
    return ok;
  };

  /** Click a visible UI button by its text or data-a/data-stage attribute, through elementFromPoint. */
  const press = (selector: string) => {
    const elm = app.container.querySelector(selector) as HTMLElement | null;
    if (!elm) return false;
    // a player scrolls a list to reach an item; never scrolls a covered button into reach
    elm.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = elm.getBoundingClientRect();
    const c = rect();
    const x = r.left + r.width / 2 - c.left;
    const y = r.top + r.height / 2 - c.top;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(hit === elm || elm.contains(hit))) return false; // covered or hidden: a player couldn't press it
    fire('pointerdown', x, y, hit);
    fire('pointerup', x, y, hit);
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    return true;
  };

  /**
   * Stage launch with normal input: skip the intro with a tap, tap to jump, then tap again
   * when the ring turns green (perfect=true) or at a fixed moment.
   */
  const launch = (perfect = true) => {
    const f = app.flight!;
    const W = app.container.clientWidth;
    const H = app.container.clientHeight;
    for (let i = 0; i < 600 && f.phase === 'intro'; i++) {
      if (f.phaseT > 0.5) tap(W / 2, H / 2);
      else step(1);
    }
    tap(W / 2, H / 2);
    for (let i = 0; i < 300 && f.phase === 'jump'; i++) {
      const s = f.jumpProgress();
      if (perfect && s >= 0.8) {
        tap(W / 2, H / 2);
        perfect = false;
      } else step(1);
    }
    return f.phase;
  };

  /**
   * Fly toward a world point using the one-thumb stick: put a finger down and drag in the jet
   * direction. A simple velocity controller decides the drag; it only ever moves the finger.
   */
  const pilot = (tx: number, ty: number, sec: number, o: PilotOpts = {}) => {
    const f = app.flight!;
    const W = app.container.clientWidth;
    const H = app.container.clientHeight;
    const ax = W * 0.5;
    const ay = H * 0.72;
    const maxDrag = app.input.maxDrag;
    const speed = o.speed ?? 14;
    const lift = o.lift ?? 2.0;
    let fingerDown = false;
    let minD = 1e9;
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      const r = f.rocket;
      if (r.dead || f.phase === 'done' || f.phase === 'fail') break;
      const p = r.body.getPosition();
      const v = r.body.getLinearVelocity();
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      minD = Math.min(minD, d);
      if (o.stopAt && d < o.stopAt) break;
      const sp = o.ram ? speed : Math.min(speed, d * 1.2);
      let dvx = (dx / d) * sp - v.x;
      let dvy = (dy / d) * sp - v.y + lift;
      if (o.eco && dy < -1.5 && !o.ram) {
        // target below: let gravity do the work, only brake when falling faster than wanted
        dvy = Math.min(0, (dy / d) * sp - v.y) < 0 ? 0 : (dy / d) * sp - v.y + lift;
        if (v.y < (dy / d) * sp - 1.5) dvy = (dy / d) * sp - v.y + lift;
      }
      const l = Math.hypot(dvx, dvy) || 1;
      const want = l > (o.eco ? 2.2 : 0.8) || o.ram;
      if (want) {
        if (!fingerDown) {
          down(ax, ay);
          fingerDown = true;
        }
        // jet sprays opposite to the wanted acceleration; screen y is down
        const k = Math.min(1, 0.3 + l / 5);
        const dist = app.input.deadZone + (maxDrag - app.input.deadZone) * k;
        move(ax - (dvx / l) * dist, ay + (dvy / l) * dist);
      } else if (fingerDown) {
        up();
        fingerDown = false;
      }
      if (o.render) frame(6); // software GL in CI: draw 1 frame in 6, time the update every frame
      else step(1);
    }
    if (fingerDown) up();
    app.tick(0.0001, true);
    return { phase: f.phase, minD: +minD.toFixed(1), ...state().rocket };
  };

  /** Let go and wait (no input). */
  const coast = (sec: number) => {
    up();
    advance(sec);
    return state();
  };

  const state = () => {
    const f = app.flight;
    const r = f?.rocket;
    const p = r && !r.dead ? r.body.getPosition() : null;
    const v = r && !r.dead ? r.body.getLinearVelocity() : null;
    return {
      mode: app.mode,
      paused: app.paused,
      modal: app.ui.modalOpen(),
      phase: f?.phase ?? null,
      canPause: f?.canPause() ?? false,
      rocket: r ? { dead: r.dead, x: p ? +p.x.toFixed(2) : null, y: p ? +p.y.toFixed(2) : null, vx: v ? +v.x.toFixed(2) : null, vy: v ? +v.y.toFixed(2) : null, fuel: +r.fuel.toFixed(1), hull: +r.hull.toFixed(1), throttle: +r.throttle.toFixed(2) } : null,
      targetAlive: f ? !!f.world.targetEnt?.alive : null,
      target: f?.world.targetEnt?.body ? { x: +f.world.targetEnt.body.getPosition().x.toFixed(2), y: +f.world.targetEnt.body.getPosition().y.toFixed(2) } : null,
      cause: f ? f.targetCause ?? null : null,
      perfect: f?.perfect ?? false,
      tappedEarly: f?.tappedEarly ?? false,
      emptyT: f ? +(f as any).emptyT.toFixed(2) : 0,
      settleT: f ? +(f as any).settleT.toFixed(2) : 0,
      runCoins: f?.runCoins ?? 0,
      gearsGot: f ? f.gearsGot.slice() : [],
      gearsAgain: f?.gearsAgain ?? 0,
      result: f?.result ? { success: f.result.success, cause: f.result.cause, total: f.result.total, paid: f.result.paid, reason: f.result.reason, escaped: f.result.escaped } : null,
      pickups: f ? f.world.pickups.map((p) => ({ kind: p.kind, id: p.id ?? null, x: +p.x.toFixed(2), y: +p.y.toFixed(2), taken: p.taken, owned: !!p.owned })) : [],
      dom: {
        pause: !!app.container.querySelector('.overlay.pause.on'),
        result: !!app.container.querySelector('.overlay.result.on'),
        settings: !!app.container.querySelector('.overlay.settings.on'),
        confirm: !!app.container.querySelector('.overlay.confirm.on'),
        ringHot: !!app.container.querySelector('.timing-ring.on.hot'),
        ringOn: !!app.container.querySelector('.timing-ring.on'),
        toast: (app.container.querySelector('.toast.on') as HTMLElement | null)?.innerText ?? null,
        focus: (document.activeElement as HTMLElement | null)?.getAttribute('data-a') ?? document.activeElement?.className ?? null,
      },
      broken: f?.world.stats.broken ?? 0,
      bodies: f ? f.world.pw.getBodyCount() : 0,
      planeAudit: f ? f.builder.planeAudit.slice() : [],
      save: JSON.parse(JSON.stringify(save)),
      loadStatus,
      loadProblems: loadProblems.slice(),
      stats: computeStats(save.equip),
    };
  };

  /** Find a named entity's current position (read-only, for steering the pilot). */
  const where = (name: string) => {
    const f = app.flight;
    if (!f) return null;
    for (const e of f.world.ents) {
      if (e.name === name && e.alive && e.body) {
        const p = e.body.getPosition();
        return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), hp: e.hp };
      }
    }
    return null;
  };

  // perf meter (always sampling in test builds; overlay with ?perf)
  const meter = new PerfMeter(app);
  if (/[?&]perf\b/.test(location.search)) installPerfOverlay(app, meter);
  /** one deterministic frame for measurement: fixed 60 Hz update + render, sampled like the browser loop */
  let frameN = 0;
  const frame = (renderEvery = 1) => {
    const t0 = performance.now();
    app.tick(1 / 60, frameN++ % renderEvery === 0);
    meter.sample(performance.now() - t0);
  };
  const perf = { meter, frame, report: () => meter.report(), reset: () => meter.reset(), counts: () => meter.counts() };
  /** start the Q-PF stress stage (test builds only) */
  const stress = () => {
    app.startFlight('stress', true, stressStage);
    advance(0.05);
  };

  (window as any).__jrr = { app, advance, step, tap, down, move, up, press, launch, pilot, coast, state, where, events, perf, stress };
}
