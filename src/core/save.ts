import { DEFAULT_LOADOUT, Loadout, PARTS } from '../data/parts';

export interface StageProgress {
  cleared: boolean;
  methods: Record<string, true>;
  bestCoins: number;
  runs: number;
}

export interface SaveData {
  v: number;
  coins: number;
  gearsFound: Record<string, true>;
  gearsSpent: number;
  owned: Record<string, true>;
  equip: Loadout;
  stages: Record<string, StageProgress>;
  settings: { sfx: boolean; music: boolean; quality: 'high' | 'low' };
  seenIntro: Record<string, true>;
  tutorialDone: boolean;
}

const KEY = 'junk-rocket-ruckus-v1';

function fresh(): SaveData {
  const owned: Record<string, true> = {};
  for (const p of PARTS) if (p.cost === 0 && p.gears === 0) owned[p.id] = true;
  return {
    v: 1,
    coins: 0,
    gearsFound: {},
    gearsSpent: 0,
    owned,
    equip: { ...DEFAULT_LOADOUT },
    stages: {},
    settings: { sfx: true, music: true, quality: 'high' },
    seenIntro: {},
    tutorialDone: false,
  };
}

export const save: SaveData = load();

function load(): SaveData {
  const base = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...base,
      ...d,
      owned: { ...base.owned, ...(d.owned || {}) },
      equip: { ...base.equip, ...(d.equip || {}) },
      settings: { ...base.settings, ...(d.settings || {}) },
      stages: d.stages || {},
      gearsFound: d.gearsFound || {},
      seenIntro: d.seenIntro || {},
    };
  } catch {
    return base;
  }
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode etc. */
  }
}

export function resetSave() {
  const f = fresh();
  Object.assign(save, f);
  persist();
}

export function stageProg(id: string): StageProgress {
  if (!save.stages[id]) save.stages[id] = { cleared: false, methods: {}, bestCoins: 0, runs: 0 };
  return save.stages[id];
}

export const gearsAvailable = () => Object.keys(save.gearsFound).length - save.gearsSpent;
