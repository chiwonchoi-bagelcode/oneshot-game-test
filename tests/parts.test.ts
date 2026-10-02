import { describe, it, expect } from 'vitest';
import { PARTS, SLOTS, allLoadouts, computeStats, flightCheck, autoFixLoadout, DEFAULT_LOADOUT } from '../src/data/parts';

describe('324 part combinations (C-033, C-196)', () => {
  const all = allLoadouts();
  it('enumerates every combination exactly once', () => {
    const per = SLOTS.map((s) => PARTS.filter((p) => p.slot === s.id).length);
    expect(all.length).toBe(per.reduce((a, b) => a * b, 1));
    expect(all.length).toBe(324);
    expect(new Set(all.map((l) => JSON.stringify(l))).size).toBe(324);
  });

  it('every stat is finite and in range for every build', () => {
    for (const l of all) {
      const s = computeStats(l);
      for (const [k, v] of Object.entries(s)) if (typeof v === 'number') expect(Number.isFinite(v), `${k} ${JSON.stringify(l)}`).toBe(true);
      expect(s.dryMass).toBeGreaterThan(0);
      expect(s.fullMass).toBeGreaterThan(s.dryMass);
      expect(s.burnTime).toBeGreaterThan(4);
      expect(s.hull).toBeGreaterThan(0);
    }
  });

  it('legality is exactly twr >= 1, and every illegal build is explained', () => {
    let legal = 0;
    for (const l of all) {
      const s = computeStats(l);
      const c = flightCheck(s);
      expect(c.ok).toBe(s.twr >= 1);
      if (c.ok) legal++;
      else {
        expect(c.reason.length).toBeGreaterThan(5);
        expect(c.fix.length).toBeGreaterThan(5);
      }
    }
    // record the current split so a data change that shrinks the legal set is noticed
    expect(legal).toBe(267);
  });

  it('the starter build flies, and every single part swapped into it flies', () => {
    expect(flightCheck(computeStats(DEFAULT_LOADOUT)).ok).toBe(true);
    for (const p of PARTS) expect(flightCheck(computeStats({ ...DEFAULT_LOADOUT, [p.slot]: p.id })).ok, p.id).toBe(true);
  });

  it('every part is used by at least one legal build', () => {
    for (const p of PARTS) expect(all.some((l) => (l as any)[p.slot] === p.id && flightCheck(computeStats(l)).ok), p.id).toBe(true);
  });

  it('auto-fix turns every illegal build legal using owned parts only', () => {
    const free = Object.fromEntries(PARTS.filter((p) => p.cost === 0).map((p) => [p.id, true as const]));
    const everything = Object.fromEntries(PARTS.map((p) => [p.id, true as const]));
    for (const l of all) {
      if (flightCheck(computeStats(l)).ok) continue;
      for (const owned of [everything, { ...free, ...Object.fromEntries(Object.values(l).map((id) => [id, true as const])) }]) {
        const r = autoFixLoadout(l, owned);
        expect(flightCheck(computeStats(r.loadout)).ok, JSON.stringify(l)).toBe(true);
        for (const id of Object.values(r.loadout)) expect(owned[id], id).toBe(true);
      }
    }
  });

  it('heavy breaker vs light evader trade-off is real', () => {
    const heavy = computeStats({ body: 'cooker', engine: 'extinguisher', tank: 'thermos', nose: 'drill', fins: 'cardboard' });
    const light = computeStats({ body: 'bottle', engine: 'spray', tank: 'thermos', nose: 'hat', fins: 'gyro' });
    expect(heavy.hull).toBeGreaterThan(light.hull * 3);
    expect(heavy.punch).toBeGreaterThan(light.punch);
    expect(light.turn).toBeGreaterThan(heavy.turn * 1.5);
    expect(light.twr).toBeGreaterThan(1.15);
  });
});
