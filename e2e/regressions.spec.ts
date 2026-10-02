import { test, expect } from '@playwright/test';
import { boot, J, startStage, failByFuel, reopen } from './helpers';

/** R-01..R-11 (checklist v3 §R) reproduced with normal input. */

test('R-01 pause never opens over a settled run; result transitions once', async ({ page }) => {
  await boot(page);
  const j = J(page);
  await startStage(page, 0);
  const s = await failByFuel(page);
  expect(s.result?.success).toBe(false);
  expect(s.canPause).toBe(false);
  const coins = s.save.coins;
  // Escape, Escape, the (hidden) pause button: nothing may resume the old flight
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await j.advance(0.2);
  let t = await j.state();
  expect(t.dom.pause).toBe(false);
  expect(t.paused).toBe(false);
  expect(await j.press('.pause-b')).toBe(false); // covered by the result dialog
  // frantic retry taps: exactly one new attempt, paid exactly once
  await page.waitForFunction(() => (window as any).__jrr.state().dom.result);
  const btn = page.locator('.overlay.result [data-a=retry]');
  await btn.click({ force: true });
  await btn.click({ force: true }).catch(() => {});
  await btn.click({ force: true }).catch(() => {});
  await j.advance(0.1);
  t = await j.state();
  expect(t.phase).not.toBe('done');
  expect(t.save.coins).toBe(coins);
  expect(t.save.attempts).toBe(s.save.attempts + 1);
});

test('R-01 pause → Escape resumes; settings over pause; quit settles as abandoned', async ({ page }) => {
  await boot(page);
  const j = J(page);
  await startStage(page, 0);
  await j.launch();
  await j.advance(3);
  await page.keyboard.press('Escape');
  let t = await j.state();
  expect(t.paused).toBe(true);
  expect(t.dom.pause).toBe(true);
  const y0 = t.rocket.y;
  await j.advance(2);
  t = await j.state();
  expect(t.rocket.y).toBe(y0); // frozen while paused
  expect(await j.press('.overlay.pause [data-a=settings]')).toBe(true);
  await j.advance(0.05);
  expect((await j.state()).dom.settings).toBe(true);
  await page.keyboard.press('Escape'); // closes settings only
  t = await j.state();
  expect(t.dom.settings).toBe(false);
  expect(t.dom.pause).toBe(true);
  await page.keyboard.press('Escape'); // resumes
  t = await j.state();
  expect(t.paused).toBe(false);
  await page.keyboard.press('Escape');
  expect(await j.press('.overlay.pause [data-a=quit]')).toBe(true);
  t = await j.state();
  expect(t.mode).toBe('stages');
  expect(t.save.lastSettled).toBe(t.save.attempts);
});

test('R-02 green ring == perfect window; early tap is told and locked out', async ({ page }) => {
  await boot(page);
  const j = J(page);
  await startStage(page, 0);
  // skip intro, start jump with a real tap
  await page.evaluate(() => {
    const J = (window as any).__jrr;
    for (let i = 0; i < 600 && J.state().phase === 'intro'; i++) J.state().phaseT, J.tap(195, 390);
  });
  await page.evaluate(() => (window as any).__jrr.tap(195, 390));
  // step frame by frame; tap on the very first frame the ring is shown green
  const r = await page.evaluate(() => {
    const J = (window as any).__jrr;
    for (let i = 0; i < 200; i++) {
      J.step(1);
      const s = J.state();
      if (s.dom.ringHot) {
        J.tap(195, 390);
        J.step(1);
        return J.state();
      }
      if (s.phase !== 'jump') return s;
    }
    return J.state();
  });
  expect(r.perfect).toBe(true);
  expect(r.tappedEarly).toBe(false);

  // second attempt: tap one frame before green → early, and a later green tap no longer counts
  await page.keyboard.press('Escape');
  expect(await j.press('.overlay.pause [data-a=retry]')).toBe(true);
  const r2 = await page.evaluate(() => {
    const J = (window as any).__jrr;
    for (let i = 0; i < 600 && J.state().phase === 'intro'; i++) J.tap(195, 390);
    J.tap(195, 390);
    let prevOn = false;
    for (let i = 0; i < 200; i++) {
      const s = J.state();
      // the frame where the jump is past the ring start but the ring is not green yet
      if (s.dom.ringOn && !s.dom.ringHot && prevOn) {
        J.tap(195, 390);
        break;
      }
      prevOn = s.dom.ringOn;
      J.step(1);
    }
    for (let i = 0; i < 200; i++) {
      const s = J.state();
      if (s.dom.ringHot) {
        J.tap(195, 390);
        break;
      }
      J.step(1);
    }
    J.step(60);
    return J.state();
  });
  expect(r2.tappedEarly).toBe(true);
  expect(r2.perfect).toBe(false);
});

test('R-02 holding Space does not repeat the jump tap', async ({ page }) => {
  await boot(page);
  const j = J(page);
  await startStage(page, 0);
  await j.advance(0.5); // intro can be skipped after 0.4 s
  await page.keyboard.down('Space'); // skips intro (edge)
  await j.advance(0.3);
  let t = await j.state();
  expect(t.phase).toBe('ready');
  await j.advance(0.5); // still held: no jump
  t = await j.state();
  expect(t.phase).toBe('ready');
  await page.keyboard.up('Space');
  await page.keyboard.down('Space');
  await j.advance(0.1);
  t = await j.state();
  expect(t.phase).toBe('jump');
  await page.keyboard.up('Space');
});

test('R-04 nothing changes the economy after settlement (30 s wait)', async ({ page }) => {
  await boot(page);
  const j = J(page);
  await startStage(page, 0);
  const s = await failByFuel(page);
  const before = { coins: s.save.coins, gears: Object.keys(s.save.gearsFound).length, bodies: s.bodies, settled: s.save.lastSettled };
  await j.advance(30);
  const t = await j.state();
  expect(t.save.coins).toBe(before.coins);
  expect(Object.keys(t.save.gearsFound).length).toBe(before.gears);
  expect(t.save.lastSettled).toBe(before.settled);
  expect(t.phase).toBe('done');
  // reopening the app keeps exactly the settled values
  await reopen(page);
  const u = await j.state();
  expect(u.save.coins).toBe(before.coins);
});

test('R-08 corrupt primary save falls back to the backup and tells the player', async ({ page }) => {
  const good = { v: 2, coins: 777, owned: { bottle: true, cola: true, milk: true, hat: true, cardboard: true }, stages: { s1: { cleared: true, methods: { ram: true }, bestCoins: 300, runs: 3, escapes: 0 } } };
  await boot(page, { rawSave: '{"v":2,"coins":12', backup: JSON.stringify(good) });
  const j = J(page);
  const s = await j.state();
  expect(s.loadStatus).toBe('backup');
  expect(s.save.coins).toBe(777);
  await page.waitForFunction(() => (window as any).__jrr.state().dom.toast !== null, null, { timeout: 3000 });
});

test('R-08 garbage without backup → safe fresh state + notice', async ({ page }) => {
  await boot(page, { rawSave: 'not json at all' });
  const s = await J(page).state();
  expect(s.loadStatus).toBe('corrupt-reset');
  expect(s.save.coins).toBe(0);
  expect(s.save.owned.bottle).toBe(true);
});

test('R-08 old version / unknown ids / bad numbers are repaired', async ({ page }) => {
  await boot(page, {
    save: { v: 1, coins: -50, gearsFound: { s1_tunnel: true, nope: true }, gearsSpent: 9, owned: { bottle: true, cola: true, milk: true, hat: true, cardboard: true, laser: true }, equip: { body: 'laser', engine: 'cola', tank: 'milk', nose: 'hat', fins: 'cardboard' }, settings: { sfxVol: 7, shake: 'wild' } },
  });
  const s = await J(page).state();
  expect(s.loadStatus).toBe('migrated');
  expect(s.save.coins).toBe(0);
  expect(s.save.gearsFound).toEqual({ s1_tunnel: true });
  expect(s.save.gearsSpent).toBe(1);
  expect(s.save.owned.laser).toBeUndefined();
  expect(s.save.equip.body).toBe('bottle');
  expect(s.save.settings.sfxVol).toBe(1);
  expect(['full', 'reduced']).toContain(s.save.settings.shake);
  expect(s.loadProblems).toContain('part:laser');
});

test('R-08 storage that refuses writes is reported, game keeps running', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.startsWith('junk-rocket-ruckus-v1') && (window as any).__denyWrites) throw new DOMException('quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  await boot(page);
  const j = J(page);
  await page.evaluate(() => ((window as any).__denyWrites = true));
  expect(await j.press('.title [data-a=settings]')).toBe(true);
  await j.advance(0.05);
  await page.locator('.overlay.settings input[data-k=flash]').click({ force: true });
  await page.waitForFunction(() => /저장/.test((window as any).__jrr.state().dom.toast ?? ''), null, { timeout: 3000 });
});

test('R-08 reset progress: cancel keeps, confirm erases but keeps settings', async ({ page }) => {
  await boot(page, { save: { v: 2, coins: 500, owned: { bottle: true, cola: true, milk: true, hat: true, cardboard: true }, settings: { bigText: true } } });
  const j = J(page);
  expect(await j.press('.title [data-a=settings]')).toBe(true);
  await j.advance(0.05);
  expect(await j.press('.overlay.settings [data-a=reset]')).toBe(true);
  await j.advance(0.05);
  expect((await j.state()).dom.confirm).toBe(true);
  expect(await j.press('.overlay.confirm [data-a=no]')).toBe(true);
  let s = await j.state();
  expect(s.save.coins).toBe(500);
  expect(await j.press('.overlay.settings [data-a=reset]')).toBe(true);
  await j.advance(0.05);
  expect(await j.press('.overlay.confirm [data-a=yes]')).toBe(true);
  s = await j.state();
  expect(s.save.coins).toBe(0);
  expect(s.save.settings.bigText).toBe(true);
  await reopen(page);
  s = await j.state();
  expect(s.save.coins).toBe(0);
  expect(s.loadStatus).toBe('ok');
});

test('R-11 keyboard-only flow, focus trap, zoom allowed, menu taps never thrust', async ({ page }) => {
  await boot(page);
  const j = J(page);
  const vp = await page.locator('meta[name=viewport]').getAttribute('content');
  expect(vp).not.toMatch(/user-scalable=no|maximum-scale=1\b/);
  await page.waitForTimeout(100);
  // title has focus on the play button; Enter opens the stage list; Enter on first card starts it
  await page.keyboard.press('Enter');
  await j.advance(0.05);
  expect((await j.state()).mode).toBe('stages');
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await j.advance(0.05);
  expect((await j.state()).mode).toBe('flight');
  await j.launch();
  await j.advance(2.5);
  // tapping the pause button must not start the stick
  expect(await j.press('.pause-b')).toBe(true);
  let t = await j.state();
  expect(t.paused).toBe(true);
  expect(t.rocket.throttle).toBe(0);
  // focus stays inside the dialog
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => !!document.activeElement?.closest('.overlay.pause'));
  expect(inside).toBe(true);
  await page.keyboard.press('Escape');
  t = await j.state();
  expect(t.paused).toBe(false);
  // icon-only buttons have names
  const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim())).length);
  expect(unnamed).toBe(0);
});
