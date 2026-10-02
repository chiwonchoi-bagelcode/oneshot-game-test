import { describe, it, expect, beforeEach, vi } from 'vitest';

class MemStorage {
  m = new Map<string, string>();
  deny = false;
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.deny) throw new Error('QuotaExceededError');
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const store = new MemStorage();
(globalThis as any).localStorage = store;

const CONTENT = { stages: ['s1', 's2', 's3'], gears: ['g1', 'g2', 'g3'] };
const KEY = 'junk-rocket-ruckus-v1';
const BK = KEY + '.backup';

async function load() {
  vi.resetModules();
  const m = await import('../src/core/save');
  const status = m.initSave(CONTENT);
  return { m, status };
}

beforeEach(() => {
  store.clear();
  store.deny = false;
});

describe('save contract (R-08, docs/spec-save.md)', () => {
  it('fresh install → new, starter parts owned', async () => {
    const { m, status } = await load();
    expect(status).toBe('new');
    expect(m.save.coins).toBe(0);
    expect(m.save.owned).toEqual({ bottle: true, cola: true, milk: true, hat: true, cardboard: true });
  });

  it('round trip keeps everything', async () => {
    let { m } = await load();
    m.save.coins = 321;
    m.save.gearsFound.g1 = true;
    m.stageProg('s1').cleared = true;
    expect(m.persist()).toBe(true);
    ({ m } = await load());
    expect(m.loadStatus).toBe('ok');
    expect(m.save.coins).toBe(321);
    expect(m.save.gearsFound).toEqual({ g1: true });
    expect(m.save.stages.s1.cleared).toBe(true);
  });

  it('every write keeps the previous good copy as backup', async () => {
    const { m } = await load();
    m.save.coins = 1;
    m.persist();
    m.save.coins = 2;
    m.persist();
    expect(JSON.parse(store.getItem(BK)!).coins).toBe(1);
    expect(JSON.parse(store.getItem(KEY)!).coins).toBe(2);
  });

  it('truncated primary → backup restored', async () => {
    store.setItem(BK, JSON.stringify({ v: 2, coins: 99 }));
    store.setItem(KEY, '{"v":2,"coins":12');
    const { m, status } = await load();
    expect(status).toBe('backup');
    expect(m.save.coins).toBe(99);
    // the repaired state is written back immediately
    expect(JSON.parse(store.getItem(KEY)!).coins).toBe(99);
  });

  it('both slots corrupt → safe fresh state, reported', async () => {
    store.setItem(BK, '][');
    store.setItem(KEY, 'garbage');
    const { m, status } = await load();
    expect(status).toBe('corrupt-reset');
    expect(m.save.coins).toBe(0);
  });

  it('wrong types, negative/huge numbers, unknown ids are repaired', async () => {
    store.setItem(KEY, JSON.stringify({
      v: 2, coins: 'lots', gearsFound: { g1: true, ghost: true }, gearsSpent: 50,
      owned: { bottle: true, cola: true, milk: true, hat: true, cardboard: true, rocketboots: true },
      equip: { body: 'paint', engine: 'cola', tank: 'milk', nose: 'hat', fins: 'cardboard' },
      stages: { s1: { cleared: 'yes', methods: { ram: true }, bestCoins: -5, runs: 1e99 }, s9: { cleared: true } },
      settings: { sfxVol: -3, musicVol: 'x', quality: 'ultra', sensitivity: 99 },
      attempts: 5, lastSettled: 50,
    }));
    const { m, status } = await load();
    expect(status).toBe('repaired');
    expect(m.save.coins).toBe(0);
    expect(m.save.gearsFound).toEqual({ g1: true });
    expect(m.save.gearsSpent).toBe(1);
    expect(m.save.owned.rocketboots).toBeUndefined();
    expect(m.save.equip.body).toBe('bottle'); // paint not owned → starter
    expect(m.save.stages.s1.cleared).toBe(false);
    expect(m.save.stages.s1.bestCoins).toBe(0);
    expect(m.save.stages.s9).toBeUndefined();
    expect(m.save.settings.sfxVol).toBe(0);
    expect(m.save.settings.quality).toBe('high');
    expect(m.save.settings.sensitivity).toBe(1.6);
    expect(m.save.lastSettled).toBeLessThanOrEqual(m.save.attempts);
    expect(m.loadProblems).toEqual(expect.arrayContaining(['gear:ghost', 'part:rocketboots', 'stage:s9']));
  });

  it('v1 save migrates and keeps progress', async () => {
    store.setItem(KEY, JSON.stringify({ v: 1, coins: 640, gearsFound: { g2: true }, stages: { s1: { cleared: true, methods: { boom: true }, bestCoins: 400, runs: 4 } } }));
    const { m, status } = await load();
    expect(status).toBe('migrated');
    expect(m.save.coins).toBe(640);
    expect(m.save.stages.s1.escapes).toBe(0);
    expect(m.save.v).toBe(2);
  });

  it('write refusal is reported, never thrown', async () => {
    const { m } = await load();
    store.deny = true;
    m.save.coins = 5;
    expect(m.persist()).toBe(false);
    expect(m.storageOk).toBe(false);
  });

  it('reset keeps settings and drops the backup', async () => {
    const { m } = await load();
    m.save.coins = 900;
    m.save.settings.bigText = true;
    m.persist();
    m.save.coins = 901;
    m.persist();
    expect(m.resetProgress()).toBe(true);
    expect(m.save.coins).toBe(0);
    expect(m.save.settings.bigText).toBe(true);
    expect(store.getItem(BK)).toBeNull();
  });

  it('gears spent can never exceed gears found', async () => {
    store.setItem(KEY, JSON.stringify({ v: 2, gearsFound: { g1: true, g2: true }, gearsSpent: 7 }));
    const { m } = await load();
    expect(m.gearsAvailable()).toBe(0);
    expect(m.save.gearsSpent).toBe(2);
  });
});
