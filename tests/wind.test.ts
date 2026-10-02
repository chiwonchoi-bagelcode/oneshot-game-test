import { describe, it, expect } from 'vitest';
import { windAccel } from '../src/game/wind';

// R-10: a zone only affects what is inside its own oriented box; overlap/order never hides a zone
describe('wind zones', () => {
  const A = { x: 0, y: 0, ang: Math.PI / 2, len: 10, wid: 4, power: 20 }; // updraft
  const B = { x: 3, y: 0, ang: 0, len: 10, wid: 4, power: 10 }; // sideways, overlaps A's query box

  it('outside the box → no force', () => {
    expect(windAccel(A, 3.1, 5)).toBeNull();
    expect(windAccel(A, 0, -0.1)).toBeNull();
    expect(windAccel(A, 0, 10.1)).toBeNull();
  });
  it('inside → force along the zone direction, stronger near the source', () => {
    const near = windAccel(A, 0, 1)!;
    const far = windAccel(A, 0, 9)!;
    expect(near.y).toBeGreaterThan(far.y);
    expect(Math.abs(near.x)).toBeLessThan(1e-9);
  });
  it('a body in both zones gets both, independent of order', () => {
    const p = { x: 4, y: 1 };
    const inA = windAccel(A, p.x, p.y);
    const inB = windAccel(B, p.x, p.y)!;
    expect(inA).toBeNull(); // 4 is outside A's half-width 2
    const q = { x: 1.5, y: 1 };
    const sum1 = [A, B].map((z) => windAccel(z, q.x, q.y)).filter(Boolean);
    const sum2 = [B, A].map((z) => windAccel(z, q.x, q.y)).filter(Boolean);
    expect(sum1.length).toBe(1); // q.x=1.5 < B.x=3 → only A
    expect(sum2.length).toBe(1);
    const r = { x: 3.5, y: 1.5 };
    const both = [A, B].map((z) => windAccel(z, r.x, r.y));
    expect(both[0]).toBeNull();
    expect(both[1]!.x).toBeGreaterThan(0);
    expect(inB.x).toBeGreaterThan(0);
  });
  it('rocket feels full power, water less', () => {
    expect(windAccel(A, 0, 2, 'rocket')!.y).toBeGreaterThan(windAccel(A, 0, 2, 'box')!.y);
    expect(windAccel(A, 0, 2, 'box')!.y).toBeGreaterThan(windAccel(A, 0, 2, 'water')!.y);
  });
});
