import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { boot } from './helpers';

/**
 * Q-PF-02/03: the worst chaos first. The stress stage (real birthday house, density pushed past
 * the shipped stage) is flown with normal input while every frame is updated + rendered and the
 * budgeted counters are sampled. Headless SwiftShader frame *times* say nothing about a phone;
 * the counters (draw calls, awake bodies, debris, water, particles) and the CPU update time are
 * the regression guard. Real-device FPS stays "검증 대기" in the approval matrix.
 */
test('stress: max interior chaos stays inside the budgets', async ({ page }) => {
  test.setTimeout(600_000);
  await boot(page, { save: { v: 2, stages: { s1: { cleared: true } }, tutorialDone: true, seenIntro: { stress: true } } });
  const out = await page.evaluate(() => {
    const J = (window as any).__jrr;
    J.stress();
    J.launch(true);
    J.advance(1);
    J.perf.reset();
    const route = [
      [28, 6, 4, { speed: 10 }],
      [44.8, 13.4, 3, { ram: true, speed: 10 }],
      [53.2, 9.6, 2, { speed: 5 }],
      [56, 13.5, 1.5, { speed: 6 }],
      [72.4, 9.0, 2.5, { ram: true, speed: 9 }],
      [66, 14.5, 2, { speed: 5 }],
      [86, 13, 3, { speed: 6 }],
      [86, 3, 3, { speed: 5 }],
      [60, 4.5, 4, { speed: 7, ram: true }],
    ];
    const samples: unknown[] = [];
    for (const [x, y, t, o] of route) {
      J.pilot(x, y, t, { ...(o as object), render: true });
      samples.push(J.perf.counts());
    }
    // let the chain reactions play out while rendering
    for (let i = 0; i < 180; i++) J.perf.frame(6);
    return { report: J.perf.report(), samples, state: { phase: J.state().phase, cause: J.state().cause, broken: J.state().broken } };
  });
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/perf-stress.json', JSON.stringify(out, null, 2));
  const { report } = out;
  console.log(JSON.stringify({ updateMs: report.updateMs, peak: report.peak, peakAt: report.peakAt, broken: out.state.broken }));
  expect(out.state.broken).toBeGreaterThan(40); // it really was chaos
  expect(report.peak.calls).toBeLessThanOrEqual(report.budget.drawCalls);
  expect(report.peak.debris).toBeLessThanOrEqual(report.budget.debris);
  expect(report.peak.water).toBeLessThanOrEqual(report.budget.water);
  expect(report.peak.particles).toBeLessThanOrEqual(report.budget.particles);
  expect(report.peak.awake).toBeLessThanOrEqual(report.budget.awakeBodies);
  // CPU side of a frame (physics + game logic) on the CI machine
  expect(report.updateMs.p99).toBeLessThan(report.budget.physicsMs * 2);
});
