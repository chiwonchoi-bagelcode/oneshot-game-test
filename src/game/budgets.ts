/**
 * Q-PF performance budgets (docs/perf-budget.md). Caps are enforced by the systems that own
 * them; the dev perf overlay and the stress test read them back. Visual-only effects are what
 * gets cut first: colliders, openings, chain reactions and the target are never removed.
 */
export const BUDGET = {
  /** frame budget at 60 FPS (ms) */
  frameMs: 16.7,
  /** physics step budget inside a frame (ms, mid-range phone) */
  physicsMs: 4,
  /** loose debris bodies (game-relevant big chunks are separate entities) */
  debris: 90,
  /** water particles (bodies; they don't collide with each other) */
  water: 160,
  /** awake dynamic bodies, everything included (water and debris too) */
  awakeBodies: 300,
  /** draw calls per frame at the worst chaos, high quality */
  drawCalls: 260,
  /** particles alive across all pools */
  particles: 1600,
  /** simultaneous one-shot sound voices */
  voices: 18,
} as const;
