import { clamp, len } from './math';

/**
 * One-thumb floating joystick (input contract: docs/spec-core.md §입력).
 * The player drags from where they touched; the drag vector is the direction the
 * fuel jet sprays. The rocket accelerates the opposite way.
 *
 *  - one primary pointer only: other fingers / palm touches are ignored
 *  - pointercancel, window blur, pause and screen changes release the stick (no stuck thrust)
 *  - `pressed` is the single press edge of a frame (pointerdown or a fresh key press)
 */
export class FlightInput {
  active = false;
  /** Unit vector (screen space, y down) of the jet direction. */
  jetX = 0;
  jetY = 0;
  /** 0..1 throttle from drag distance. */
  throttle = 0;
  /** Anchor & current pointer position in CSS px relative to element. */
  ax = 0;
  ay = 0;
  px = 0;
  py = 0;
  /** Set true on the frame a fresh press started. */
  pressed = false;
  tapped = false;
  private pointerId: number | null = null;
  private downTime = 0;
  private downX = 0;
  private downY = 0;
  private keys = new Set<string>();
  private keyEdges = new Set<string>();
  enabled = true;

  /** Drag length (CSS px) giving full throttle. */
  maxDrag = 64;
  deadZone = 7;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('keydown', (e) => {
      if (!e.repeat && !this.keys.has(e.code)) this.keyEdges.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
  }

  /** Joystick sensitivity from settings (1 = default). Higher = shorter drag for full power. */
  setSensitivity(s: number) {
    this.maxDrag = clamp(64 / s, 32, 110);
  }

  private rect() {
    return this.el.getBoundingClientRect();
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (this.pointerId !== null) return; // a second finger never steals the stick
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    const r = this.rect();
    this.ax = this.px = e.clientX - r.left;
    this.ay = this.py = e.clientY - r.top;
    this.downX = this.ax;
    this.downY = this.ay;
    this.downTime = performance.now();
    this.active = true;
    this.pressed = true;
    this.update();
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const r = this.rect();
    this.px = e.clientX - r.left;
    this.py = e.clientY - r.top;
    // Floating anchor: if the finger travels past the ring, drag the anchor along
    // so reversing direction is instant.
    const dx = this.px - this.ax;
    const dy = this.py - this.ay;
    const l = len(dx, dy);
    const lim = this.maxDrag * 1.25;
    if (l > lim) {
      this.ax = this.px - (dx / l) * lim;
      this.ay = this.py - (dy / l) * lim;
    }
    this.update();
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const dt = performance.now() - this.downTime;
    const moved = len(this.px - this.downX, this.py - this.downY);
    if (dt < 260 && moved < 14) this.tapped = true;
    this.release();
  };

  private onCancel = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  };

  /** Let go of the stick (pointer released / cancelled / screen changed). */
  release() {
    this.pointerId = null;
    this.active = false;
    this.throttle = 0;
  }

  /** Full reset: stick, held keys and pending edges (pause, app switch, new run). */
  reset() {
    this.release();
    this.keys.clear();
    this.keyEdges.clear();
    this.pressed = false;
    this.tapped = false;
  }

  private update() {
    const dx = this.px - this.ax;
    const dy = this.py - this.ay;
    const l = len(dx, dy);
    if (l > 0.001) {
      this.jetX = dx / l;
      this.jetY = dy / l;
    }
    const t = clamp((l - this.deadZone) / (this.maxDrag - this.deadZone), 0, 1);
    // Ease so small drags give fine hovering control.
    this.throttle = t <= 0 ? 0 : 0.25 + 0.75 * Math.pow(t, 0.85);
  }

  /** Keyboard fallback (desktop testing). Returns true if keys drive the jet. */
  pollKeys(): boolean {
    let x = 0;
    let y = 0;
    // Arrow/WASD = direction the rocket should accelerate. Jet is opposite.
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) y -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;
    if (x === 0 && y === 0) return false;
    const l = len(x, y);
    this.jetX = -x / l;
    this.jetY = -y / l;
    this.throttle = 1;
    return true;
  }

  isKey(code: string) {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down (holding does not repeat). */
  keyPressed(code: string) {
    return this.keyEdges.has(code);
  }

  /** A fresh "action" press this frame: touch/click down or Space/Enter edge. */
  actionPressed() {
    return this.pressed || this.keyPressed('Space') || this.keyPressed('Enter');
  }

  endFrame() {
    this.pressed = false;
    this.tapped = false;
    this.keyEdges.clear();
  }
}
