import { DEFAULT_LOADOUT, Loadout, PARTS, SLOTS } from '../data/parts';

/**
 * Local save (contract: docs/spec-save.md).
 *  - versioned schema, every field validated on load (unknown IDs dropped, numbers clamped)
 *  - the previous good save is kept as a backup slot; a corrupt primary falls back to it
 *  - storage failures are reported to the UI instead of being swallowed
 */

export const SAVE_VERSION = 2;
const KEY = 'junk-rocket-ruckus-v1';
const BACKUP_KEY = 'junk-rocket-ruckus-v1.backup';

export interface StageProgress {
  cleared: boolean;
  methods: Record<string, true>;
  bestCoins: number;
  runs: number;
  escapes: number;
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  sfxVol: number;
  musicVol: number;
  quality: 'high' | 'low';
  vibration: boolean;
  shake: 'full' | 'reduced' | 'off';
  flash: boolean;
  reduceMotion: boolean;
  bigText: boolean;
  sensitivity: number;
  tutorial: boolean;
}

export interface SaveData {
  v: number;
  coins: number;
  gearsFound: Record<string, true>;
  gearsSpent: number;
  owned: Record<string, true>;
  equip: Loadout;
  stages: Record<string, StageProgress>;
  settings: Settings;
  seenIntro: Record<string, true>;
  tutorialDone: boolean;
  /** onboarding steps that were actually performed */
  learned: Record<string, true>;
  /** monotonically increasing attempt counter; a settled attempt id is never paid twice */
  attempts: number;
  lastSettled: number;
  lastStage: string;
}

export type LoadStatus = 'new' | 'ok' | 'migrated' | 'repaired' | 'backup' | 'corrupt-reset' | 'storage-unavailable';

/** Known content IDs, registered by the app before loading (avoids import cycles). */
let KNOWN = { stages: [] as string[], gears: [] as string[] };

function defaultSettings(): Settings {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    sfx: true, music: true, sfxVol: 1, musicVol: 0.8, quality: 'high', vibration: true,
    shake: reduce ? 'reduced' : 'full', flash: true, reduceMotion: reduce, bigText: false, sensitivity: 1, tutorial: true,
  };
}

export function freshSave(): SaveData {
  const owned: Record<string, true> = {};
  for (const p of PARTS) if (p.cost === 0 && p.gears === 0) owned[p.id] = true;
  return {
    v: SAVE_VERSION,
    coins: 0,
    gearsFound: {},
    gearsSpent: 0,
    owned,
    equip: { ...DEFAULT_LOADOUT },
    stages: {},
    settings: defaultSettings(),
    seenIntro: {},
    tutorialDone: false,
    learned: {},
    attempts: 0,
    lastSettled: 0,
    lastStage: '',
  };
}

export const save: SaveData = freshSave();
export let loadStatus: LoadStatus = 'new';
export let storageOk = true;
/** last problems found while sanitizing (for the recovery notice / tests) */
export let loadProblems: string[] = [];

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validate + repair any parsed object into a well-formed SaveData. */
export function sanitize(raw: unknown, problems: string[] = []): SaveData {
  const base = freshSave();
  if (!isObj(raw)) {
    problems.push('not-an-object');
    return base;
  }
  const d = raw;
  const partIds = new Set(PARTS.map((p) => p.id));
  const out = base;
  out.coins = Math.floor(num(d.coins, 0, 1e9, 0));
  if (d.coins !== undefined && out.coins !== d.coins) problems.push('coins');
  if (isObj(d.gearsFound)) {
    for (const k of Object.keys(d.gearsFound)) {
      if (!KNOWN.gears.length || KNOWN.gears.includes(k)) out.gearsFound[k] = true;
      else problems.push('gear:' + k);
    }
  }
  const found = Object.keys(out.gearsFound).length;
  out.gearsSpent = Math.floor(num(d.gearsSpent, 0, found, 0));
  if (isObj(d.owned)) {
    for (const k of Object.keys(d.owned)) {
      if (partIds.has(k)) out.owned[k] = true;
      else problems.push('part:' + k);
    }
  }
  // spending can never exceed what was found (e.g. a removed gear): refund parts safely by clamping
  if (isObj(d.equip)) {
    for (const s of SLOTS) {
      const id = d.equip[s.id];
      const p = PARTS.find((pp) => pp.id === id);
      if (p && p.slot === s.id && out.owned[id]) (out.equip as any)[s.id] = id;
      else if (id !== undefined) problems.push('equip:' + s.id);
    }
  }
  if (isObj(d.stages)) {
    for (const [k, v] of Object.entries(d.stages)) {
      if (KNOWN.stages.length && !KNOWN.stages.includes(k)) {
        problems.push('stage:' + k);
        continue;
      }
      if (!isObj(v)) continue;
      const methods: Record<string, true> = {};
      if (isObj(v.methods)) for (const m of Object.keys(v.methods)) methods[m] = true;
      out.stages[k] = {
        cleared: bool(v.cleared, false), methods, bestCoins: Math.floor(num(v.bestCoins, 0, 1e9, 0)), runs: Math.floor(num(v.runs, 0, 1e9, 0)),
        escapes: Math.floor(num(v.escapes, 0, 1e9, 0)),
      };
    }
  }
  if (isObj(d.settings)) {
    const s = d.settings;
    const S = out.settings;
    S.sfx = bool(s.sfx, S.sfx);
    S.music = bool(s.music, S.music);
    S.sfxVol = num(s.sfxVol, 0, 1, S.sfxVol);
    S.musicVol = num(s.musicVol, 0, 1, S.musicVol);
    S.quality = s.quality === 'low' ? 'low' : 'high';
    S.vibration = bool(s.vibration, S.vibration);
    S.shake = s.shake === 'off' || s.shake === 'reduced' || s.shake === 'full' ? s.shake : S.shake;
    S.flash = bool(s.flash, S.flash);
    S.reduceMotion = bool(s.reduceMotion, S.reduceMotion);
    S.bigText = bool(s.bigText, S.bigText);
    S.sensitivity = num(s.sensitivity, 0.6, 1.6, 1);
    S.tutorial = bool(s.tutorial, S.tutorial);
  }
  if (isObj(d.seenIntro)) for (const k of Object.keys(d.seenIntro)) out.seenIntro[k] = true;
  if (isObj(d.learned)) for (const k of Object.keys(d.learned)) out.learned[k] = true;
  out.tutorialDone = bool(d.tutorialDone, false);
  out.attempts = Math.floor(num(d.attempts, 0, 1e12, 0));
  out.lastSettled = Math.floor(num(d.lastSettled, 0, out.attempts, 0));
  out.lastStage = typeof d.lastStage === 'string' && (!KNOWN.stages.length || KNOWN.stages.includes(d.lastStage)) ? d.lastStage : '';
  if (typeof d.v === 'number' && d.v < SAVE_VERSION) problems.push('migrated-from-v' + d.v);
  return out;
}

function readKey(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    storageOk = false;
    return null;
  }
}

/** Load (or reload) the save. Call once at boot after registering content. */
export function initSave(content: { stages: string[]; gears: string[] }) {
  KNOWN = content;
  loadProblems = [];
  const primary = readKey(KEY);
  let status: LoadStatus = storageOk ? 'new' : 'storage-unavailable';
  let data: SaveData | null = null;
  if (primary) {
    try {
      const parsed = JSON.parse(primary);
      const probs: string[] = [];
      data = sanitize(parsed, probs);
      loadProblems = probs;
      status = probs.some((p) => p.startsWith('migrated')) ? 'migrated' : probs.length ? 'repaired' : 'ok';
    } catch {
      data = null;
    }
    if (!data) {
      const backup = readKey(BACKUP_KEY);
      if (backup) {
        try {
          data = sanitize(JSON.parse(backup), loadProblems);
          status = 'backup';
        } catch {
          data = null;
        }
      }
      if (!data) status = 'corrupt-reset';
    }
  }
  Object.assign(save, data ?? freshSave());
  loadStatus = status;
  if (status === 'migrated' || status === 'repaired' || status === 'backup' || status === 'corrupt-reset') persist();
  return status;
}

/** Write the save. The previous good copy is moved to the backup slot first. Returns false on failure. */
export function persist(): boolean {
  try {
    save.v = SAVE_VERSION;
    const json = JSON.stringify(save);
    const prev = localStorage.getItem(KEY);
    if (prev && prev !== json) {
      try {
        JSON.parse(prev);
        localStorage.setItem(BACKUP_KEY, prev);
      } catch {
        /* never back up garbage */
      }
    }
    localStorage.setItem(KEY, json);
    storageOk = true;
    return true;
  } catch {
    storageOk = false;
    return false;
  }
}

/** Erase progress (settings are kept). */
export function resetProgress() {
  const keep = { ...save.settings };
  Object.assign(save, freshSave());
  save.settings = keep;
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* ignore */
  }
  return persist();
}

export function stageProg(id: string): StageProgress {
  if (!save.stages[id]) save.stages[id] = { cleared: false, methods: {}, bestCoins: 0, runs: 0, escapes: 0 };
  return save.stages[id];
}

export const gearsAvailable = () => Object.keys(save.gearsFound).length - save.gearsSpent;
