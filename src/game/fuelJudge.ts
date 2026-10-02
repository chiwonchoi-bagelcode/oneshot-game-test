/**
 * Fuel-out rule (C-093, R-03), pure so it can be unit-tested: an empty tank is not a failure by
 * itself — only resting (speed < 0.8 m/s for 1.4 s) or 20 s of empty flight is. A refuel starts
 * both timers over: it is a brand new chance, never a continuation of the previous empty spell.
 */
export class FuelJudge {
  emptyT = 0;
  settleT = 0;
  static readonly SETTLE = 1.4;
  static readonly MAX_EMPTY = 20;
  static readonly REST_SPEED = 0.8;

  /** returns true when the run should become a fuel-out failure candidate */
  update(dt: number, fuel: number, boosting: boolean, speed: number) {
    if (fuel > 0 || boosting) return false;
    this.emptyT += dt;
    if (speed < FuelJudge.REST_SPEED) this.settleT += dt;
    else this.settleT = Math.max(0, this.settleT - dt * 0.5);
    return this.settleT > FuelJudge.SETTLE || this.emptyT > FuelJudge.MAX_EMPTY;
  }

  refuel() {
    this.emptyT = 0;
    this.settleT = 0;
  }
}
