import { test, expect, Page } from '@playwright/test';
import { boot, J, startStage } from './helpers';

/** Contracts the approval audit found untested: Q-CI plane audit, R-03, R-09, escape settlement. */
const unlocked = (extra: Record<string, unknown> = {}) => ({ v: 2, stages: { s1: { cleared: true }, s2: { cleared: true } }, seenIntro: { s1: true, s2: true, s3: true }, tutorialDone: true, ...extra });

async function fly(page: Page, steps: [number, number, number, Record<string, unknown>?][]) {
  return page.evaluate((steps) => {
    const J = (window as any).__jrr;
    for (const [x, y, t, o] of steps) J.pilot(x, y, t, o ?? {});
    return J.state();
  }, steps);
}

test('Q-CI-01: no pass-through scenery sits in the play plane, on any stage', async ({ page }) => {
  await boot(page, { save: unlocked() });
  const j = J(page);
  for (const i of [0, 1, 2]) {
    await page.evaluate(() => (window as any).__jrr.app.setMode('stages'));
    await j.advance(0.05);
    expect(await j.press(`.stage-card.c${i}`)).toBe(true);
    await j.advance(0.05);
    const s = await j.state();
    expect(s.mode).toBe('flight');
    expect(s.planeAudit, `stage ${i}`).toEqual([]);
  }
});

// R-03 timer semantics are unit-tested in tests/fuel.test.ts (FuelJudge); the pickup wiring
// (onFuel → fuelJudge.refuel) is exercised by every route that takes a fuel can mid-flight.

test('R-09: an already-found gear is a ghost and pays nothing [fixture: s2_bell found]', async ({ page }) => {
  await boot(page, { save: unlocked({ gearsFound: { s2_bell: true } }) });
  await startStage(page, 1);
  const j = J(page);
  const ghost = (await j.state()).pickups.find((p: any) => p.id === 's2_bell');
  expect(ghost.owned).toBe(true);
  await j.launch(true);
  await j.advance(1);
  const s = await fly(page, [[52, 34, 8, { speed: 10, eco: true, stopAt: 2 }], [58.3, 25.6, 4, { ram: true, speed: 6 }], [61, 22.5, 3, { speed: 3, stopAt: 0.8 }], [66.2, 22.4, 3, { speed: 3, stopAt: 0.8 }], [66.2, 19.8, 3, { speed: 2.5, stopAt: 0.3 }]]);
  expect(s.pickups.find((p: any) => p.id === 's2_bell').taken).toBe(true);
  expect(s.gearsAgain).toBe(1);
  expect(s.gearsGot).toEqual([]);
  expect(Object.keys(s.save.gearsFound)).toEqual(['s2_bell']);
  expect(s.save.gearsSpent).toBe(0);
});

test('Q-AH-08: quitting during the escape keeps the success (no escape bonus)', async ({ page }) => {
  await boot(page, { save: { v: 2, stages: { s1: { cleared: true } }, seenIntro: { s2: true }, tutorialDone: true } });
  await startStage(page, 1);
  const j = J(page);
  await j.launch(true);
  await j.advance(1);
  const s = await fly(page, [[28, 14, 4], [44.8, 13.4, 3, { ram: true, speed: 9 }], [53.2, 9.6, 2, { speed: 5 }], [56, 13.5, 1.5, { speed: 6 }], [72.4, 9.0, 2.5, { ram: true, speed: 9 }]]);
  expect(s.phase).toBe('escape');
  expect(await j.press('.pause-b')).toBe(true);
  expect(await j.press('.overlay.pause [data-a=quit]')).toBe(true);
  const t = await j.state();
  expect(t.mode).toBe('stages');
  expect(t.save.stages.s2.cleared).toBe(true);
  expect(t.save.stages.s2.methods.boom).toBe(true);
  expect(t.save.stages.s2.escapes ?? 0).toBe(0);
  expect(t.save.coins).toBeGreaterThanOrEqual(720); // first-clear reward was paid
});
