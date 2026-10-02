export interface WindBox {
  x: number;
  y: number;
  ang: number;
  len: number;
  wid: number;
  power: number;
}

/**
 * Acceleration a wind zone gives a body centred at (x,y), or null when outside the zone's
 * oriented box. Pure, so zone order / overlap can be unit-tested (R-10).
 */
export function windAccel(z: WindBox, x: number, y: number, kind?: string) {
  const ca = Math.cos(z.ang);
  const sa = Math.sin(z.ang);
  const dx = x - z.x;
  const dy = y - z.y;
  const along = dx * ca + dy * sa;
  const across = -dx * sa + dy * ca;
  if (along < 0 || along > z.len || Math.abs(across) > z.wid / 2) return null;
  const fall = (1 - along / z.len) * 0.6 + 0.4;
  const acc = z.power * fall * (kind === 'rocket' ? 1 : kind === 'water' ? 0.4 : 0.7);
  return { x: ca * acc, y: sa * acc };
}
