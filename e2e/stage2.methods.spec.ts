import { test, expect, Page } from '@playwright/test';
import { boot, J, startStage } from './helpers';

/**
 * Stage 2 — 교장쌤 생일파티 (private interior, Q-AH). Every method and every gear with normal input:
 * real pointer drags through `__jrr.pilot`, the deterministic clock, nothing teleported or injected.
 * Save fixtures only provide preconditions (stage unlocked; owned parts where a method needs them).
 */
type Step = { x: number; y: number; t: number; o?: Record<string, unknown> } | { coast: number };

const STARTER = { bottle: true, cola: true, milk: true, hat: true, cardboard: true };
const unlocked = (extra: Record<string, unknown> = {}) => ({ v: 2, stages: { s1: { cleared: true } }, seenIntro: { s2: true }, tutorialDone: true, ...extra });
const withParts = (equip: Record<string, string>) => unlocked({ owned: { ...STARTER, ...Object.fromEntries(Object.values(equip).map((id) => [id, true])) }, equip });

async function fly(page: Page, steps: Step[]) {
  return page.evaluate((steps) => {
    const J = (window as any).__jrr;
    const log: unknown[] = [];
    for (const s of steps) {
      const ph = J.state().phase;
      if (ph === 'done') break;
      if ('coast' in s) J.coast(s.coast);
      else log.push(J.pilot(s.x, s.y, s.t, s.o ?? {}));
    }
    return log;
  }, steps);
}

async function go(page: Page) {
  await startStage(page, 1);
  await J(page).launch(true);
  await J(page).advance(1.0);
}

async function settle(page: Page, max = 20) {
  const j = J(page);
  for (let i = 0; i < max * 2; i++) {
    const s = await j.state();
    if (s.phase === 'done') return s;
    await j.advance(0.5);
  }
  return j.state();
}

// through the big party window on the left, refuel right inside
const IN_LEFT: Step[] = [
  { x: 28, y: 14, t: 4 },
  { x: 44.8, y: 13.4, t: 3, o: { ram: true, speed: 9 } },
  { x: 53.2, y: 9.6, t: 2, o: { speed: 5 } },
  { x: 56, y: 15, t: 1.5, o: { speed: 6 } },
];
// back out through the same window: the escape (유유히 퇴장)
const OUT_LEFT: Step[] = [
  { x: 66, y: 14.5, t: 2, o: { speed: 5 } }, // climb over the furniture first
  { x: 52, y: 14, t: 2.5, o: { speed: 6 } },
  { x: 44, y: 13.2, t: 2, o: { speed: 6 } },
  { x: 34, y: 14, t: 2.5, o: { speed: 6 } },
];

test.describe('stage 2 methods (normal input)', () => {
  test('water: sprinkler valve, starter rocket, enter by the party window', async ({ page }) => {
    await boot(page, { save: unlocked() });
    await go(page);
    await fly(page, [...IN_LEFT, { x: 70, y: 16.8, t: 3, o: { speed: 6 } }, { x: 77.9, y: 17.5, t: 2.5, o: { ram: true, speed: 3, stopAt: 0.35 } }, { x: 66, y: 15, t: 2, o: { speed: 4 } }, { x: 66, y: 15, t: 5, o: { speed: 3 } }]);
    const s = await settle(page);
    expect(s.result?.success).toBe(true);
    expect(s.result?.cause).toBe('water');
  });

  test('boom: party fireworks next to the cake, then escape through the window', async ({ page }) => {
    await boot(page, { save: unlocked() });
    await go(page);
    const log = await fly(page, [...IN_LEFT.slice(0, 3), { x: 56, y: 13.5, t: 1.5, o: { speed: 6 } }, { x: 72.4, y: 9.0, t: 2.5, o: { ram: true, speed: 9 } }]);
    let s = await J(page).state();
    expect(s.cause, JSON.stringify(log)).toBe('boom');
    expect(['escape', 'done']).toContain(s.phase);
    await fly(page, OUT_LEFT);
    s = await settle(page);
    expect(s.result?.success, JSON.stringify(s.result)).toBe(true);
    expect(s.result?.cause).toBe('boom');
    expect(s.result?.escaped).toBe(true);
    expect(s.save.stages.s2.escapes).toBe(1);
  });

  test('topple: break the weak right table leg from the stair void', async ({ page }) => {
    await boot(page, { save: unlocked() });
    await go(page);
    await fly(page, [...IN_LEFT.slice(0, 3), { x: 56, y: 14.3, t: 1.5, o: { speed: 6 } }, { x: 74, y: 14.2, t: 3, o: { speed: 6 } }, { x: 86, y: 13, t: 2.5, o: { speed: 5 } }, { x: 85, y: 9.6, t: 2, o: { speed: 4 } }, { x: 79.6, y: 9.2, t: 1.5, o: { ram: true, speed: 7 } }, { coast: 3 }]);
    const s = await settle(page);
    expect(s.result?.success, JSON.stringify(s.result)).toBe(true);
    expect(s.result?.cause).toBe('topple');
  });

  test('ram: heavy breaker build smashes the cake head-on [fixture: cooker+extinguisher+thermos+drill owned]', async ({ page }) => {
    const equip = { body: 'cooker', engine: 'extinguisher', tank: 'thermos', nose: 'drill', fins: 'cardboard' };
    await boot(page, { save: withParts(equip) });
    await go(page);
    await fly(page, [{ x: 28, y: 13, t: 3.5, o: { eco: true } }, { x: 44.8, y: 12.5, t: 2.5, o: { ram: true, speed: 9 } }, { x: 58, y: 11.2, t: 2.5, o: { speed: 6 } }, { x: 64, y: 11.2, t: 1.5, o: { speed: 4 } }, { x: 80, y: 11.2, t: 2, o: { ram: true, speed: 13 } }, { x: 88, y: 13, t: 3, o: { speed: 4 } }]);
    const s = await settle(page);
    expect(s.result?.success).toBe(true);
    expect(s.result?.cause).toBe('ram');
  });
});

const THERMOS = { body: 'bottle', engine: 'cola', tank: 'thermos', nose: 'hat', fins: 'cardboard' };

async function gearRun(page: Page, save: unknown, steps: Step[], ids: string[]) {
  await boot(page, { save });
  await go(page);
  const log = await fly(page, steps);
  const s = await J(page).state();
  for (const id of ids) expect(s.save.gearsFound[id], `${id} ${JSON.stringify(log.slice(-3))}`).toBe(true);
  // collectibles are banked on pickup: quitting (or a fuel-out failure) keeps them
  if (s.canPause) {
    expect(await J(page).press('.pause-b')).toBe(true);
    expect(await J(page).press('.overlay.pause [data-a=quit]')).toBe(true);
  } else await settle(page);
  const after = await J(page).state();
  for (const id of ids) expect(after.save.gearsFound[id]).toBe(true);
}

test.describe('stage 2 gears (normal input)', () => {
  test('s2_tank (roof water tank) + s2_shed (garden shed, open right side) [fixture: thermos tank]', async ({ page }) => {
    await gearRun(page, withParts(THERMOS), [
      { x: 84, y: 42, t: 8, o: { speed: 12, eco: true, stopAt: 2 } },
      { x: 84, y: 37.4, t: 3, o: { speed: 3, stopAt: 0.5 } },
      { x: 100, y: 40, t: 6, o: { speed: 9, stopAt: 2 } },
      { x: 104, y: 1.6, t: 8, o: { speed: 8, eco: true, stopAt: 0.4 } },
      { x: 110, y: 7.5, t: 3, o: { speed: 5, stopAt: 1 } },
      { x: 127, y: 7, t: 5, o: { speed: 6, stopAt: 1 } },
      { x: 127, y: 3.9, t: 3, o: { speed: 3, stopAt: 0.5 } },
      { x: 120, y: 3.8, t: 4, o: { speed: 3, stopAt: 0.6 } },
      { x: 118, y: 1.3, t: 3, o: { speed: 3, stopAt: 0.4 } },
    ], ['s2_tank', 's2_shed']);
  });

  test('s2_hoop (basketball net), starter rocket', async ({ page }) => {
    await gearRun(page, unlocked(), [
      { x: -30, y: 23, t: 8, o: { speed: 10, eco: true, stopAt: 2 } },
      { x: -38, y: 23, t: 4, o: { speed: 6, stopAt: 1.2 } }, // over the flagpole
      { x: -41, y: 8.6, t: 5, o: { speed: 5, eco: true, stopAt: 0.8 } },
      { x: -45.2, y: 8.5, t: 3, o: { speed: 3, stopAt: 0.3 } },
    ], ['s2_hoop']);
  });

  test('s2_balloon (weather balloon, very high) [fixture: thermos tank]', async ({ page }) => {
    await gearRun(page, withParts(THERMOS), [
      { x: 20, y: 120, t: 10, o: { speed: 14, stopAt: 3 } },
      { x: 20, y: 142, t: 6, o: { speed: 5, stopAt: 0.4 } },
    ], ['s2_balloon']);
  });

  test('s2_bell (attic, in through the skylight), starter rocket', async ({ page }) => {
    await gearRun(page, unlocked(), [
      { x: 52, y: 34, t: 8, o: { speed: 10, eco: true, stopAt: 2 } },
      { x: 58.3, y: 25.6, t: 4, o: { ram: true, speed: 6 } },
      { x: 61, y: 22.5, t: 3, o: { speed: 3, stopAt: 0.8 } },
      { x: 66.2, y: 22.4, t: 3, o: { speed: 3, stopAt: 0.8 } },
      { x: 66.2, y: 19.8, t: 3, o: { speed: 2.5, stopAt: 0.3 } },
    ], ['s2_bell']);
  });

  test('s2_class (trophy cabinet) + s2_lab (under the kitchen shelf): in by the front door, refuel in the kitchen [fixture: thermos tank]', async ({ page }) => {
    await gearRun(page, withParts(THERMOS), [
      { x: 30, y: 4, t: 8, o: { speed: 10, eco: true, stopAt: 1.5 } },
      { x: 36, y: 2.4, t: 3, o: { speed: 4, stopAt: 0.8 } },
      { x: 48, y: 2.2, t: 2, o: { ram: true, speed: 13 } }, // front door
      { x: 52.5, y: 1.4, t: 2.5, o: { ram: true, speed: 4 } }, // trophy cabinet glass
      { x: 56, y: 4.8, t: 3, o: { speed: 4, stopAt: 0.8 } },
      { x: 61.4, y: 3.2, t: 3, o: { speed: 3, stopAt: 0.4 } }, // fuel can on the counter
      { x: 67.5, y: 5.2, t: 3, o: { speed: 4, stopAt: 0.8 } }, // over the fridge
      { x: 79, y: 4.8, t: 5, o: { speed: 5, stopAt: 0.8 } },
      { x: 79, y: 1.1, t: 3, o: { speed: 3, stopAt: 0.5 } },
      { x: 75.6, y: 1.0, t: 3, o: { speed: 2.5, stopAt: 0.3 } }, // under the shelf
    ], ['s2_class', 's2_lab']);
  });
});
