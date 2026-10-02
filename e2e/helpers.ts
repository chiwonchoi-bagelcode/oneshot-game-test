import { expect, Page } from '@playwright/test';

/** Boot the game with a clean (or given) save and wait for the test hooks. */
export async function boot(page: Page, opts: { save?: unknown; rawSave?: string; backup?: string; settings?: Record<string, unknown> } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript((o) => {
    if ((window as any).__booted) return;
    (window as any).__booted = true;
    if (sessionStorage.getItem('jrr-keep')) return;
    localStorage.clear();
    if (o.rawSave !== undefined) localStorage.setItem('junk-rocket-ruckus-v1', o.rawSave);
    else if (o.save) localStorage.setItem('junk-rocket-ruckus-v1', JSON.stringify(o.save));
    if (o.backup !== undefined) localStorage.setItem('junk-rocket-ruckus-v1.backup', o.backup);
  }, opts);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__jrr, null, { timeout: 30_000 });
  // stop the wall-clock loop: from here time only moves through advance()
  await page.evaluate(() => (window as any).__jrr.advance(0.05));
  return errors;
}

/** Keep localStorage across a reload (simulate closing and reopening the app). */
export async function reopen(page: Page) {
  await page.evaluate(() => sessionStorage.setItem('jrr-keep', '1'));
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__jrr, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__jrr.advance(0.05));
}

export const J = (page: Page) => ({
  state: () => page.evaluate(() => (window as any).__jrr.state()),
  advance: (s: number) => page.evaluate((s) => (window as any).__jrr.advance(s), s),
  press: (sel: string) => page.evaluate((sel) => (window as any).__jrr.press(sel), sel),
  launch: (perfect = true) => page.evaluate((p) => (window as any).__jrr.launch(p), perfect),
  pilot: (x: number, y: number, sec: number, o: Record<string, unknown> = {}) => page.evaluate(([x, y, sec, o]) => (window as any).__jrr.pilot(x, y, sec, o), [x, y, sec, o] as const),
  where: (name: string) => page.evaluate((n) => (window as any).__jrr.where(n), name),
  events: () => page.evaluate(() => (window as any).__jrr.events()),
});

/** Title → stage list → stage card, through visible buttons only. */
export async function startStage(page: Page, index: number) {
  const j = J(page);
  expect(await j.press('.title [data-a=play]')).toBe(true);
  await j.advance(0.1);
  expect(await j.press(`.stage-card.c${index}`)).toBe(true);
  await j.advance(0.1);
  const s = await j.state();
  expect(s.mode).toBe('flight');
}
