import { test, expect, Page } from '@playwright/test';
import { boot, J, startStage } from './helpers';

/**
 * STAGE 3 (s3, card index 2) — every success method and every hidden gear is reachable with
 * normal player input from the launch.
 *
 *  - Precondition (save fixture, labelled in each test name): s1 + s2 cleared (s3 is locked
 *    otherwise), intro seen, tutorial done, and the parts of the build `owned` + `equip`ped.
 *    No coins are granted and nothing in the world is touched.
 *  - Movement only through the hooks' player input: launch() (real taps), pilot()/coast()
 *    (a one-thumb drag through real PointerEvents) and the deterministic clock.
 *  - Reads (`state()`, the blimp position, the ferris wheel spoke angle) are used only to decide
 *    where to steer, like a player watching the screen.
 */

type V2 = [number, number];
interface PilotOpts { speed?: number; ram?: boolean; stopAt?: number; lift?: number; eco?: boolean }
/** One leg of a route. `chunk` re-plans every `chunk` s and records the phase in between. */
type Step =
  | { to: V2; t: number; o?: PilotOpts; chunk?: number; untilBroken?: boolean }
  | { coast: number }
  /** steer toward the (moving) blimp + offset, re-aiming every `chunk` s */
  | { blimp: V2; t: number; o?: PilotOpts; chunk?: number }
  /** thread the rotating ferris wheel spokes along the middle of the nearest gap (-1 in, +1 out) */
  | { wheel: -1 | 1; t: number; o?: PilotOpts; chunk?: number; stepR?: number }
  /** keep the thumb on the stick at one spot until the fuel is gone and the run fails */
  | { burn: V2; t: number };

const STARTER = { body: 'bottle', engine: 'cola', tank: 'milk', nose: 'hat', fins: 'cardboard' };
type Build = Partial<typeof STARTER>;

/** Save fixture: s3 unlocked (s1, s2 cleared) + the build's parts owned and equipped. */
function fixture(build: Build) {
  const equip = { ...STARTER, ...build };
  const owned: Record<string, true> = {};
  for (const id of [...Object.values(STARTER), ...Object.values(equip)]) owned[id] = true;
  return { v: 2, stages: { s1: { cleared: true }, s2: { cleared: true } }, owned, equip, tutorialDone: true, seenIntro: { s3: true } };
}

/** boot → title → stage list → stage 3 card → seesaw launch (perfect tap). */
async function startS3(page: Page, build: Build) {
  const errors = await boot(page, { save: fixture(build) });
  const j = J(page);
  await startStage(page, 2);
  const s = await j.state();
  expect(s.save.equip).toEqual({ ...STARTER, ...build });
  expect(s.stats.twr).toBeGreaterThanOrEqual(1); // a legal build (flightCheck), the game let it sortie
  expect(s.target).not.toBeNull();
  expect(await j.launch(true)).toBe('boost');
  return errors;
}

/** Runs one route leg in the page with player input only; returns the phases seen. */
async function leg(page: Page, st: Step) {
  return page.evaluate((st: any) => {
    const J = (window as any).__jrr;
    const trace: string[] = [];
    const note = () => {
      const p = J.state().phase;
      if (trace[trace.length - 1] !== p) trace.push(p);
      return p;
    };
    const live = (p: string) => p === 'boost' || p === 'fly' || p === 'escape';
    note();
    if ('coast' in st) {
      J.coast(st.coast);
      note();
    } else if ('burn' in st) {
      J.pilot(st.burn[0], st.burn[1], st.t, { speed: 4 });
      note();
    } else if ('to' in st && !st.chunk) {
      J.pilot(st.to[0], st.to[1], st.t, st.o ?? {});
      note();
    } else {
      const dt = st.chunk ?? 0.25;
      const n = Math.round(st.t / dt);
      const b0 = J.state().broken;
      const spoke = 'wheel' in st ? J.app.flight.world.ents.find((e: any) => e.id === 9000).body : null; // read-only
      for (let i = 0; i < n; i++) {
        const s = J.state();
        if (!live(s.phase) || s.rocket.dead) break;
        let tx: number, ty: number;
        if ('to' in st) [tx, ty] = st.to;
        else if ('blimp' in st) {
          if (!s.target) break;
          tx = s.target.x + st.blimp[0];
          ty = s.target.y + st.blimp[1];
        } else {
          const W = { x: -42, y: 30 };
          const rx = s.rocket.x - W.x;
          const ry = s.rocket.y - W.y;
          const r = Math.hypot(rx, ry);
          if (st.wheel < 0 && J.state().gearsGot.includes('s3_wheel')) break;
          if (st.wheel > 0 && r > 26) break;
          const th = Math.atan2(ry, rx);
          const q = Math.PI / 4;
          const a0 = spoke.getAngle() + q / 2; // centre line of a gap between two spokes
          const g = a0 + Math.round((th - a0) / q) * q + 0.15; // lead a little: the wheel turns ccw
          const rt = st.wheel < 0 ? Math.max(0, r - (st.stepR ?? 6)) : r + (st.stepR ?? 6);
          tx = W.x + Math.cos(g) * rt;
          ty = W.y + Math.sin(g) * rt;
        }
        const res = J.pilot(tx, ty, dt, st.o ?? {});
        note();
        if (st.o?.stopAt && res.minD < st.o.stopAt) break;
        if (st.untilBroken && J.state().broken > b0) break;
      }
    }
    const s = J.state();
    return { trace, phase: s.phase, rocket: s.rocket, cause: s.cause, gearsGot: s.gearsGot, broken: s.broken };
  }, st as any);
}

/** Fly a whole route; returns every phase seen in order (consecutive duplicates collapsed). */
async function fly(page: Page, route: Step[]) {
  const trace: string[] = [];
  for (const st of route) {
    const t0 = Date.now();
    const r = await leg(page, st);
    for (const p of r.trace) if (trace[trace.length - 1] !== p) trace.push(p);
    console.log(JSON.stringify(st), '→', JSON.stringify({ phase: r.phase, rocket: r.rocket, cause: r.cause, gears: r.gearsGot }), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  return trace;
}

/** No input: let the run end on its own (escape timer / fuel-out settle), tracing phases. */
async function settle(page: Page, trace: string[]) {
  const j = J(page);
  const seen: string[] = await page.evaluate(() => {
    const J = (window as any).__jrr;
    J.up(); // thumb off the screen
    const out: string[] = [];
    for (let i = 0; i < 240; i++) {
      const p = J.state().phase;
      if (out[out.length - 1] !== p) out.push(p);
      if (p === 'done') break;
      J.step(15); // 0.25 s of the fixed 60 Hz clock, no render in between
    }
    J.advance(0.05); // one rendered frame
    return out;
  });
  for (const p of seen) if (trace[trace.length - 1] !== p) trace.push(p);
  await page.waitForFunction(() => (window as any).__jrr.state().dom.result, null, { timeout: 30_000, polling: 250 });
  const s = await j.state();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('junk-rocket-ruckus-v1') ?? '{}'));
  return { s, persisted, trace };
}

async function expectSuccess(page: Page, route: Step[], method: string) {
  const trace = await fly(page, route);
  const { s, persisted } = await settle(page, trace);
  console.log('phases', trace.join(' → '), '| result', JSON.stringify(s.result));
  expect(trace).not.toContain('fail');
  const iEsc = trace.indexOf('escape');
  expect(iEsc).toBeGreaterThan(-1);
  expect(trace.indexOf('done')).toBeGreaterThan(iEsc);
  expect(s.phase).toBe('done');
  expect(s.cause).toBe(method);
  expect(s.result.success).toBe(true);
  expect(s.result.cause).toBe(method);
  expect(s.targetAlive).toBe(false);
  expect(s.save.stages.s3.cleared).toBe(true);
  expect(s.save.stages.s3.methods[method]).toBe(true);
  expect(persisted.stages.s3.methods[method]).toBe(true);
  return s;
}

/** After the run has settled (any outcome), the gears are in the save and in storage. */
async function expectGears(page: Page, route: Step[], ids: string[]) {
  const trace = await fly(page, route);
  const { s, persisted } = await settle(page, trace);
  console.log('phases', trace.join(' → '), '| result', JSON.stringify(s.result), '| gears', JSON.stringify(s.gearsGot));
  expect(s.phase).toBe('done');
  expect(s.result).not.toBeNull();
  for (const id of ids) {
    expect(s.gearsGot).toContain(id);
    expect(s.save.gearsFound[id]).toBe(true);
    expect(persisted.gearsFound[id]).toBe(true);
  }
  return s;
}

// --------------------------------------------------------------------------------- routes
/** free boost (2.2 s, no fuel) steered up-right; passes above the cloud slab at (30, 62) */
const BOOST_RIGHT = (x = 70): Step[] => [{ to: [x, 200], t: 2.1, o: { speed: 40, ram: true } }, { coast: 0.8 }];
/** over to the TV tower top: s3_tower gear (73, 102) and the fuel can (79, 102.2) */
const TOWER: Step[] = [
  { to: [70, 106], t: 8, o: { stopAt: 3, speed: 12 } },
  { to: [73, 102.3], t: 4, o: { stopAt: 0.5, speed: 5 } },
  { to: [79, 102.2], t: 4, o: { stopAt: 0.5, speed: 5 } },
];

// --------------------------------------------------------------------------------- methods
test('s3 method device — festival cannon button [fixture: s1+s2 cleared; cola + thermos]', async ({ page }) => {
  const errors = await startS3(page, { tank: 'thermos' });
  await expectSuccess(page, [
    ...BOOST_RIGHT(70),
    { to: [70, 106], t: 8, o: { stopAt: 3, speed: 12 } },
    { to: [79, 102.2], t: 4, o: { stopAt: 0.5, speed: 6 } }, // fuel can on the tower
    { to: [112, 104], t: 4, o: { stopAt: 3, speed: 10 } }, // over the tower, then drop
    { coast: 2.5 },
    { to: [118.6, 14], t: 8, o: { stopAt: 1.5, speed: 8 } },
    { to: [118.6, 6.8], t: 6, o: { speed: 3 }, chunk: 0.5, untilBroken: true }, // press the big red button
    { to: [124, 14], t: 3, o: { speed: 6 }, chunk: 0.5 }, // step aside, the shell flies to the blimp
  ], 'device');
  expect(errors).toEqual([]);
});

test('s3 method precision — air valve on top of the blimp [fixture: s1+s2 cleared; starter build]', async ({ page }) => {
  const errors = await startS3(page, {});
  await expectSuccess(page, [
    { to: [50, 75], t: 5, o: { stopAt: 8 } }, // right of the cloud slab
    { to: [66, 128], t: 6, o: { stopAt: 5 } },
    { to: [76.5, 141], t: 4, o: { stopAt: 1.5, speed: 8 } }, // above the blimp
    { blimp: [0.5, 2.45], t: 5, o: { speed: 3 }, chunk: 0.5 }, // touch the valve (body offset 0.5, 2.05 + r)
    { to: [60, 150], t: 3, o: { speed: 8 }, chunk: 0.5 },
  ], 'precision');
  expect(errors).toEqual([]);
});

test('s3 method fire — torch exhaust on the blimp [fixture: s1+s2 cleared; spray torch + thermos]', async ({ page }) => {
  const errors = await startS3(page, { engine: 'spray', tank: 'thermos' });
  expect((await J(page).state()).stats.exhaust).toBe('torch');
  await expectSuccess(page, [
    ...BOOST_RIGHT(80),
    { to: [68, 128], t: 8, o: { stopAt: 4, speed: 12 } },
    { to: [76, 139], t: 4, o: { stopAt: 1.5, speed: 6 } },
    { blimp: [0, 6.5], t: 6, o: { speed: 4 }, chunk: 0.5 }, // hover above it, flame pointing down
    { to: [60, 145], t: 3, o: { speed: 8 }, chunk: 0.5 },
  ], 'fire');
  expect(errors).toEqual([]);
});

test('s3 method ram — drill through the blimp [fixture: s1+s2 cleared; drill + extinguisher + thermos]', async ({ page }) => {
  const errors = await startS3(page, { nose: 'drill', engine: 'extinguisher', tank: 'thermos' });
  await expectSuccess(page, [
    ...BOOST_RIGHT(80),
    { to: [60, 126], t: 10, o: { stopAt: 3, speed: 12 } },
    { to: [58, 131], t: 4, o: { stopAt: 1, speed: 5 } }, // left of the blimp, below the valve
    { blimp: [0, -0.5], t: 4, o: { speed: 25, ram: true }, chunk: 0.2 }, // full throttle, nose first
    { to: [60, 140], t: 2, o: { speed: 8 }, chunk: 0.5 },
  ], 'ram');
  expect(errors).toEqual([]);
});

// --------------------------------------------------------------------------------- gears
test('s3 gears tower + blimp, then a precision clear [fixture: s1+s2 cleared; cola + thermos]', async ({ page }) => {
  const errors = await startS3(page, { tank: 'thermos' });
  const s = await expectGears(page, [
    ...BOOST_RIGHT(70),
    ...TOWER,
    { to: [85, 125], t: 6, o: { stopAt: 2, speed: 10 } }, // right of the blimp
    { to: [83.5, 136.5], t: 5, o: { stopAt: 0.5, speed: 6 } }, // s3_blimp
    { to: [77, 141], t: 4, o: { stopAt: 1.2, speed: 6 } },
    { blimp: [0.5, 2.45], t: 5, o: { speed: 3 }, chunk: 0.5 },
    { to: [60, 145], t: 3, o: { speed: 8 }, chunk: 0.5 },
  ], ['s3_tower', 's3_blimp']);
  expect(s.result.success).toBe(true); // gears are kept on a clear
  expect(s.result.cause).toBe('precision');
  expect(errors).toEqual([]);
});

test('s3 gear wagon (fortune teller, enter under the right wall) [fixture: s1+s2 cleared; cola + thermos]', async ({ page }) => {
  const errors = await startS3(page, { tank: 'thermos' });
  const s = await expectGears(page, [
    ...BOOST_RIGHT(70),
    ...TOWER,
    { to: [125, 104], t: 5, o: { stopAt: 3, speed: 10 } },
    { coast: 3.2 },
    { to: [142, 2], t: 10, o: { stopAt: 1, speed: 10, eco: true } },
    { to: [141, 0.8], t: 6, o: { stopAt: 0.4, speed: 3, lift: 0.5 } }, // ground level, right of the wagon
    { to: [132, 0.7], t: 8, o: { stopAt: 0.4, speed: 4, lift: 0.5 } }, // through the 1.6 m gap under the wall
    { burn: [132, 1.6], t: 40 }, // stay inside until the fuel is gone → run settles as a failure
  ], ['s3_wagon', 's3_tower']);
  expect(s.result.success).toBe(false); // gears are kept on a failure too
  expect(errors).toEqual([]);
});

test('s3 gear ferris wheel hub (thread the rotating spokes) [fixture: s1+s2 cleared; starter build]', async ({ page }) => {
  const errors = await startS3(page, {});
  const s = await expectGears(page, [
    { to: [-14, 32], t: 8, o: { stopAt: 1.5, speed: 10 } }, // right of the wheel, hub height
    { wheel: -1, t: 10, o: { speed: 8 }, chunk: 0.3, stepR: 6 }, // ride the gap in to the hub
    { burn: [-42, 30], t: 40 },
  ], ['s3_wheel']);
  expect(s.result.success).toBe(false);
  expect(errors).toEqual([]);
});

for (const [label, build] of [
  ['smallest body (bottle, starter build)', {}],
  ['largest legal body (pressure cooker + extinguisher)', { body: 'cooker', engine: 'extinguisher' }],
] as [string, Build][]) {
  test(`s3 gear tent (R-05: break the flap, get in) — ${label} [fixture: s1+s2 cleared]`, async ({ page }) => {
    const errors = await startS3(page, build);
    const j = J(page);
    expect(await j.where('tentFlap')).not.toBeNull();
    const s = await expectGears(page, [
      { to: [16, 3], t: 7, o: { stopAt: 1.5, speed: 8 } },
      { to: [18, 1.5], t: 3, o: { stopAt: 0.7, speed: 4 } }, // run-up at door height
      { to: [32, 1.5], t: 6, o: { stopAt: 0.3, speed: 7 } }, // through the flap to the gear (32, 1.6)
      { burn: [32, 2.5], t: 40 },
    ], ['s3_tent']);
    expect(await j.where('tentFlap')).toBeNull(); // the flap was broken by the rocket
    expect(s.result.success).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('s3 gears candy cloud + space satellite (via the jet stream) [fixture: s1+s2 cleared; cola + jug]', async ({ page }) => {
  const errors = await startS3(page, { tank: 'jug' });
  const s = await expectGears(page, [
    { to: [-40, 200], t: 2.1, o: { speed: 40, ram: true } }, // boost up-left
    { coast: 0.8 },
    { to: [-36, 172], t: 15, o: { stopAt: 2, speed: 14 } }, // around the cloud's underside
    { to: [-50, 170], t: 5, o: { stopAt: 0.5, speed: 5 } }, // s3_candy
    { to: [-55, 169], t: 4, o: { stopAt: 0.5, speed: 4 } }, // fuel can
    { to: [-50, 196], t: 6, o: { stopAt: 2, speed: 8 } }, // into the jet stream (y 185..207)
    { to: [100, 200], t: 12, o: { stopAt: 3, speed: 25 } }, // ride it right
    { to: [108, 254], t: 10, o: { stopAt: 0.5, speed: 10 } }, // s3_space
    { burn: [108, 256], t: 40 },
  ], ['s3_candy', 's3_space']);
  expect(s.result.success).toBe(false);
  expect(errors).toEqual([]);
});
