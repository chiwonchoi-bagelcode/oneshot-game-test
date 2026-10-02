import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { boot, J, startStage } from './helpers';

/**
 * R-07 / Q-PF-10: resources converge over long sessions. Retry 100 times through the pause menu
 * and swap parts 100 times in the garage — all with normal UI presses — while GPU geometries /
 * textures / programs and JS heap are sampled. After warm-up the counts must stop growing.
 */
const STARTER = { bottle: true, cola: true, milk: true, hat: true, cardboard: true };

test('100 retries: GPU objects and heap converge [fixture: stage 2 unlocked]', async ({ page }) => {
  test.setTimeout(1_500_000);
  await boot(page, { save: { v: 2, stages: { s1: { cleared: true } }, tutorialDone: true, seenIntro: { s1: true, s2: true } } });
  const j = J(page);
  await startStage(page, 1);
  const samples: any[] = [];
  for (let i = 1; i <= 100; i++) {
    await j.launch(true);
    await j.advance(1.5);
    expect(await j.press('.pause-b'), `pause ${i}`).toBe(true);
    expect(await j.press('.overlay.pause [data-a=retry]'), `retry ${i}`).toBe(true);
    await j.advance(0.1);
    if (i % 10 === 0) {
      await page.evaluate(() => (window as any).gc?.());
      const s = await j.state();
      samples.push({ i, ...s.mem, attempts: s.save.attempts, settled: s.save.lastSettled });
    }
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/longrun-retry.json', JSON.stringify(samples, null, 2));
  console.log(JSON.stringify(samples.map((x) => [x.i, x.geometries, x.textures, x.programs, Math.round(x.heap / 1e6)])));
  const warm = samples[2]; // after 30 retries
  const last = samples[samples.length - 1];
  expect(last.geometries).toBeLessThanOrEqual(warm.geometries + 20);
  expect(last.textures).toBeLessThanOrEqual(warm.textures + 4);
  expect(last.programs).toBeLessThanOrEqual(warm.programs + 2);
  expect(last.sceneObjects).toBeLessThanOrEqual(warm.sceneObjects * 1.05);
  if (warm.heap && last.heap) expect(last.heap).toBeLessThan(warm.heap * 1.5);
  // each abandoned attempt was settled exactly once
  expect(last.settled).toBe(last.attempts - 1);
});

test('100 part swaps in the garage: GPU objects converge [fixture: parts owned]', async ({ page }) => {
  test.setTimeout(900_000);
  const owned = { ...STARTER, paint: true, cooker: true, spray: true, extinguisher: true };
  await boot(page, { save: { v: 2, owned, tutorialDone: true } });
  const j = J(page);
  expect(await j.press('.title [data-a=garage]')).toBe(true);
  await j.advance(0.1);
  expect(await j.press('[data-slot=body]')).toBe(true);
  const samples: any[] = [];
  const bodies = ['paint', 'bottle', 'cooker', 'bottle'];
  for (let i = 1; i <= 100; i++) {
    const id = bodies[i % bodies.length];
    expect(await j.press(`.part-card[data-part=${id}]`), `equip ${id} #${i}`).toBe(true);
    await j.advance(0.05);
    if (i % 10 === 0) samples.push({ i, ...(await j.state()).mem });
  }
  writeFileSync('test-results/longrun-equip.json', JSON.stringify(samples, null, 2));
  console.log(JSON.stringify(samples.map((x) => [x.i, x.geometries, x.textures, x.sceneObjects])));
  const warm = samples[1];
  const last = samples[samples.length - 1];
  expect(last.geometries).toBeLessThanOrEqual(warm.geometries + 10);
  expect(last.textures).toBeLessThanOrEqual(warm.textures + 2);
  expect(last.sceneObjects).toBeLessThanOrEqual(warm.sceneObjects + 20);
});
