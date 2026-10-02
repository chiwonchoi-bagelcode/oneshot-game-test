import { describe, it, expect } from 'vitest';
import { FuelJudge } from '../src/game/fuelJudge';

const run = (j: FuelJudge, sec: number, fuel: number, speed: number) => {
  let fired = false;
  for (let i = 0; i < Math.round(sec * 60); i++) fired = j.update(1 / 60, fuel, false, speed) || fired;
  return fired;
};

describe('fuel-out rule (C-093, R-03)', () => {
  it('fuel left or boosting never fails', () => {
    const j = new FuelJudge();
    expect(run(j, 60, 10, 0)).toBe(false);
    expect(j.update(1, 0, true, 0)).toBe(false);
  });
  it('empty but still gliding is not a failure until 20 s', () => {
    const j = new FuelJudge();
    expect(run(j, 19.5, 0, 5)).toBe(false);
    expect(run(j, 1, 0, 5)).toBe(true);
  });
  it('empty and at rest fails after 1.4 s', () => {
    const j = new FuelJudge();
    expect(run(j, 1.3, 0, 0.2)).toBe(false);
    expect(run(j, 0.2, 0, 0.2)).toBe(true);
  });
  it('R-03: dry → refuel → fly → dry again starts over (no accumulated timers)', () => {
    const j = new FuelJudge();
    expect(run(j, 15, 0, 3)).toBe(false); // 15 s of empty gliding
    expect(run(j, 1.0, 0, 0.2)).toBe(false); // nearly settled
    j.refuel();
    expect(j.emptyT).toBe(0);
    expect(j.settleT).toBe(0);
    expect(run(j, 5, 30, 3)).toBe(false); // flying on the new fuel
    // empty again: the old 15 s / 1.0 s must not count
    expect(run(j, 10, 0, 3)).toBe(false);
    expect(run(j, 1.0, 0, 0.2)).toBe(false);
  });
});
