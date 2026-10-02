/**
 * Local-only event log (schema: docs/spec-telemetry.md). Nothing leaves the device:
 * events are kept in a ring buffer in localStorage so QA can export a session, and the
 * same calls are the hook points for a real analytics SDK later.
 */
export const SCHEMA_VERSION = 1;
export const CONTENT_VERSION = '2026.10-rc1';
export const PHYSICS_VERSION = 'p3';
export const ECONOMY_VERSION = 'e2';

export interface TEvent {
  name: string;
  t: number; // ms since epoch
  session: string;
  props: Record<string, string | number | boolean | null>;
}

const KEY = 'junk-rocket-ruckus-events';
const MAX = 300;
const session = Math.random().toString(36).slice(2, 10);
let buf: TEvent[] = [];
const seen = new Set<string>();

try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) buf = arr.slice(-MAX);
  }
} catch {
  buf = [];
}

let flushTimer = 0;
function flush() {
  flushTimer = 0;
  try {
    localStorage.setItem(KEY, JSON.stringify(buf.slice(-MAX)));
  } catch {
    /* storage full / unavailable: the log is best-effort */
  }
}

/**
 * Record an event. `dedupe` makes the call idempotent (e.g. flight_end per attempt).
 */
export function track(name: string, props: TEvent['props'] = {}, dedupe?: string) {
  if (dedupe) {
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
  }
  buf.push({ name, t: Date.now(), session, props: { schema: SCHEMA_VERSION, content: CONTENT_VERSION, physics: PHYSICS_VERSION, economy: ECONOMY_VERSION, ...props } });
  if (buf.length > MAX * 1.5) buf = buf.slice(-MAX);
  if (!flushTimer) flushTimer = window.setTimeout(flush, 1000);
}

export function events() {
  return buf.slice();
}

export function flushNow() {
  if (flushTimer) clearTimeout(flushTimer);
  flush();
}

window.addEventListener('pagehide', flushNow);
