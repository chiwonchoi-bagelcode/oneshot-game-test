import { test, expect } from '@playwright/test';
import { boot, J, startStage } from './helpers';

test('boots clean and flies stage 1 with normal input', async ({ page }) => {
  const errors = await boot(page);
  const j = J(page);
  await startStage(page, 0);
  expect(await j.launch(true)).not.toBe('jump');
  let s = await j.state();
  expect(['boost', 'fly']).toContain(s.phase);
  await j.advance(3);
  s = await j.state();
  expect(s.phase).toBe('fly');
  const r = await j.pilot(s.rocket.x + 10, s.rocket.y + 5, 3);
  console.log(JSON.stringify(r));
  expect(errors).toEqual([]);
});
