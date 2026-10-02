import { test, expect, Page } from '@playwright/test';
import { boot, J, reopen, startStage } from './helpers';

/**
 * Stage 1 (s1, card 0) — every success method and every hidden gear is reachable with normal
 * player input from the launch.
 *
 * Evidence rules: the save is fresh (no fixture) unless a test name says otherwise; the stage is
 * entered through visible buttons (`startStage`), the seesaw launch uses real taps (`launch`), and
 * all flying is done with the one-thumb drag stick (`pilot`, real PointerEvents). The only
 * non-player control is the deterministic 60 Hz clock. State is only ever read.
 *
 * A route is a list of waypoints: [x, y, seconds, pilot options]. The pilot flies a straight line
 * toward each point, so waypoints are placed to go around the level geometry.
 */
/** pilot() options; `watch` (test-side only) flies the leg in 0.25 s slices to observe short phases */
type Opts = { speed?: number; ram?: boolean; stopAt?: number; lift?: number; watch?: boolean };
/** a waypoint, or `'coast <sec>'`: finger off, let the rocket fly/fall on its own */
type WP = [x: number, y: number, sec: number, o?: Opts] | `coast ${number}`;

test.describe.configure({ mode: 'parallel' });

async function fly(page: Page, route: WP[]) {
  const j = J(page);
  const phases: string[] = [];
  const log: string[] = [];
  for (const wp of route) {
    if (typeof wp === 'string') {
      // pilot() always lifts the finger at the end of a leg, so this is pure free flight
      await j.advance(Number(wp.split(' ')[1]));
      const s = await j.state();
      phases.push(s.phase);
      log.push(`${wp} at (${s.rocket.x},${s.rocket.y}) fuel=${s.rocket.fuel} phase=${s.phase}`);
      continue;
    }
    const [x, y, sec, oo] = wp;
    const { watch, ...o } = oo ?? {};
    let r: any;
    if (watch) {
      // the same leg in 0.25 s slices so short phases (escape) are observed
      for (let t = 0; t < sec - 1e-6; t += 0.25) {
        r = await j.pilot(x, y, Math.min(0.25, sec - t), o);
        const p = (await j.state()).phase;
        if (phases[phases.length - 1] !== p) phases.push(p);
        if (p === 'done' || p === 'fail' || (o.stopAt && r.minD < o.stopAt)) break;
      }
    } else r = await j.pilot(x, y, sec, o);
    const s = await j.state();
    phases.push(s.phase);
    log.push(`→(${x},${y}) minD=${r.minD} at (${r.x},${r.y}) fuel=${r.fuel} hull=${r.hull} phase=${s.phase} cause=${s.cause} gears=${s.gearsGot.join('|')}`);
    if (s.phase === 'done' || s.phase === 'fail') break;
  }
  return { phases, log };
}

/** Let the run play out without input until it settles, recording each phase seen. */
async function settle(page: Page, phases: string[], maxSec = 20) {
  const j = J(page);
  for (let t = 0; t < maxSec; t += 0.25) {
    const s = await j.state();
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    if (s.phase === 'done') break;
    await j.advance(0.25);
  }
  return j.state();
}

async function launchStage1(page: Page) {
  await startStage(page, 0);
  const j = J(page);
  expect(await j.launch(true)).toBe('boost');
  const s = await j.state();
  expect(s.perfect).toBe(true);
}

async function expectMethod(page: Page, method: string, route: WP[]) {
  const errors = await boot(page);
  await launchStage1(page);
  const { phases, log } = await fly(page, route);
  console.log(`[${method}]\n  ` + log.join('\n  '));
  const s = await settle(page, phases);
  console.log(`[${method}] phases: ${phases.join(' > ')}`);
  // the run ends in success through the escape phase, credited to this method
  expect(s.phase).toBe('done');
  const iEsc = phases.indexOf('escape');
  expect(iEsc).toBeGreaterThanOrEqual(0);
  expect(phases.indexOf('fail')).toBe(-1);
  expect(phases.lastIndexOf('done')).toBeGreaterThan(iEsc);
  expect(s.cause).toBe(method);
  expect(s.result?.success).toBe(true);
  expect(s.result?.cause).toBe(method);
  expect(s.targetAlive).toBe(false);
  expect(s.save.stages.s1?.methods?.[method]).toBe(true);
  expect(Object.keys(s.save.stages.s1.methods)).toEqual([method]);
  // the result dialog comes up for the settled run
  for (let i = 0; i < 20 && !(await J(page).state()).dom.result; i++) await J(page).advance(0.25);
  expect((await J(page).state()).dom.result).toBe(true);
  expect(errors).toEqual([]);
}

/** Fly a route that picks up gears, then settle the run the way a player would: pause → quit. */
async function expectGears(page: Page, gears: string[], route: WP[]) {
  const errors = await boot(page);
  const j = J(page);
  await launchStage1(page);
  const { phases, log } = await fly(page, route);
  console.log(`[${gears.join(',')}]\n  ` + log.join('\n  '));
  let s = await j.state();
  expect(s.gearsGot.slice().sort()).toEqual(gears.slice().sort());
  // picked up during a live run (not after the end)
  expect(['boost', 'fly', 'escape']).toContain(phases[phases.length - 1]);
  // settle: pause button → "그만하고 나가기"
  expect(await j.press('.pause-b')).toBe(true);
  await j.advance(0.05);
  expect((await j.state()).dom.pause).toBe(true);
  expect(await j.press('.overlay.pause [data-a=quit]')).toBe(true);
  await j.advance(0.1);
  s = await j.state();
  expect(s.mode).toBe('stages'); // back on the stage list: the attempt was settled as abandoned
  expect(s.save.lastSettled).toBe(s.save.attempts);
  for (const g of gears) expect(s.save.gearsFound[g]).toBe(true);
  expect(Object.keys(s.save.gearsFound).sort()).toEqual(gears.slice().sort());
  // and the find survives closing and reopening the app
  await reopen(page);
  s = await j.state();
  for (const g of gears) expect(s.save.gearsFound[g]).toBe(true);
  expect(errors).toEqual([]);
}

// ------------------------------------------------------------------------------------ methods

test('s1 method ram: fly level into the gnome display case at speed', async ({ page }) => {
  await expectMethod(page, 'ram', [
    [20, 25, 2], // boost out of the yard
    [50, 31.5, 4, { stopAt: 1.5 }], // line up level with the gnome, west of the tower
    [70, 31.5, 3, { ram: true, speed: 20 }], // full throttle through the glass into the gnome
    [40, 40, 3, { watch: true }], // fly away (escape)
  ]);
});

test('s1 method topple: smash both watchtower legs from the east so it falls away from the fireworks', async ({ page }) => {
  // Note: ramming the legs west→east (legL first) tips the tower west onto the fireworks crate at
  // x 61.8; the crate then goes off and the gnome is credited to 'boom'. East→west tips it east.
  await expectMethod(page, 'topple', [
    [20, 25, 2],
    [55, 36, 4, { stopAt: 2.5 }], // over the tower's west side, below the hanging pot (y 39–41)
    [80, 36, 4, { stopAt: 2 }], // between the gnome case (top y 32.9) and the pot, east of the rope
    [82, 20, 4, { stopAt: 1.2 }], // down on the east side, short of grandpa's tree (x 86.7)
    [52, 20, 3, { ram: true, speed: 20, stopAt: 1 }], // through legR (x 73.5) then legL (x 66.5)
    [45, 20, 3, { watch: true }], // hover clear while the tower comes down
  ]);
});

test('s1 method device: cut the iron flower pot rope above the gnome', async ({ page }) => {
  await expectMethod(page, 'device', [
    [20, 25, 2],
    [60, 43, 5, { stopAt: 1.5 }], // under the branch, left of the rope (x 70.3, y 40.6–46)
    [82, 43, 3, { ram: true, speed: 9, stopAt: 1 }], // slice the rope; the pot drops on the case
    [82, 60, 3, { watch: true }], // climb away
  ]);
});

test('s1 method boom: ram the confiscated fireworks crate under the tower', async ({ page }) => {
  await expectMethod(page, 'boom', [
    [20, 20, 2],
    [60, 20, 3, { stopAt: 2 }],
    [62, 2, 3, { ram: true, speed: 12 }], // dive into the crate at (61.8, 0.5)
    [40, 12, 3, { stopAt: 3, watch: true }], // get out from under the tower before the gnome comes down
  ]);
});

// ------------------------------------------------------------------------------------ gears

test('s1 gear s1_tunnel: through the west manhole into the tunnel', async ({ page }) => {
  await expectGears(page, ['s1_tunnel'], [
    [-10.75, 5, 3, { stopAt: 1 }], // hover over the manhole lid
    [-10.75, -13.5, 3, { ram: true, speed: 10, stopAt: 3.5 }], // smash the lid, drop down the shaft
    [8, -14, 4, { stopAt: 1 }], // fuel can in the tunnel
    [29.3, -14.3, 4, { stopAt: 0.4 }], // gear behind the cardboard stack at x 30
  ]);
});

test('s1 gear s1_greenhouse: over grandpa\'s tree, down through the glass roof', async ({ page }) => {
  await expectGears(page, ['s1_greenhouse'], [
    [40, 45, 2.2, { stopAt: 3 }], // boost up-right
    [60, 58, 3, { stopAt: 3, speed: 16 }], // above the pot branch (y 47)
    [96, 56, 4, { stopAt: 3, speed: 16 }], // over the tree crown
    [104, 15, 4, { stopAt: 1.5, speed: 14 }],
    [104, 4.4, 3, { ram: true, speed: 6, stopAt: 0.5 }], // through the glass roof onto the gear
  ]);
});

test('s1 gear s1_house: over the treehouse, in at the kid\'s house door, refuel, up the ladder hole to the attic', async ({ page }) => {
  await expectGears(page, ['s1_house'], [
    [-6, 28, 2.2, { stopAt: 3 }], // boost straight up, clear of the tree branch
    [-30, 28, 4, { stopAt: 4, speed: 12 }], // west over the treehouse
    'coast 0.7', // let go: fall toward the door instead of burning fuel
    [-38.5, 2.0, 4, { stopAt: 0.8, speed: 8 }], // in front of the door (opening under the wall, y < 3.6)
    [-52, 2.2, 3, { stopAt: 2, speed: 8 }], // ground floor
    [-63, 1.6, 4, { stopAt: 0.7, speed: 7 }], // fuel can past the cardboard boxes
    [-45.5, 4, 4, { stopAt: 2, speed: 10 }], // back under the ladder hole (x -47..-42)
    [-44.5, 9.8, 3, { stopAt: 1.2, speed: 8 }], // up into the attic
    [-70.6, 9.6, 5, { stopAt: 0.5, speed: 12 }], // attic gear at (-71, 9)
  ]);
});

test('s1 gear s1_doghouse: over the treehouse and the kid\'s house, in through the low door', async ({ page }) => {
  await expectGears(page, ['s1_doghouse'], [
    [-6, 30, 2.2, { stopAt: 3 }], // boost straight up, clear of the tree branch
    [-87, 30, 6, { stopAt: 3, speed: 18 }], // west above the roofs
    [-87.5, 1, 4, { stopAt: 0.6, speed: 12 }], // land at the doghouse door (x -92, opening y 0–1.5)
    [-96, 0.4, 4, { ram: true, speed: 4, lift: -1, stopAt: 0.5 }], // slide in along the floor
  ]);
});

test('s1 gear s1_kite: straight up to the stuck kite', async ({ page }) => {
  await expectGears(page, ['s1_kite'], [[-30, 119.5, 12, { stopAt: 0.8, speed: 16 }]]);
});

test('s1 gear s1_cloud: east of the mid cloud, up to the cloud island', async ({ page }) => {
  await expectGears(page, ['s1_cloud'], [
    [72, 98, 8, { stopAt: 4, speed: 22 }], // pass east of the mid cloud (55, 95)
    [98, 155, 10, { stopAt: 0.8, speed: 22 }], // fuel can on the island
    [106, 154.5, 4, { stopAt: 0.8 }], // gear
  ]);
});
