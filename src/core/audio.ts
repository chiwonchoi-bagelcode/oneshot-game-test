import { clamp, rand } from './math';

type Mat = string;

/** Tiny synthesized sound engine: no audio assets, everything is generated. */
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOscGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private lastPlay = new Map<string, number>();
  sfxOn = true;
  musicOn = true;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  musicMood: 'menu' | 'flight' = 'menu';

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startEngineLoop();
    this.startMusic();
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1);
  }

  private throttle(key: string, minGap: number) {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? 0;
    if (now - last < minGap) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private noise(t: number, dur: number, filterType: BiquadFilterType, f0: number, f1: number, q: number, vol: number, attack = 0.005) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rand(0.9, 1.1);
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.sfxBus);
    src.start(t, rand(0, 1.5));
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.005, bus?: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- engine loop
  private startEngineLoop() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineFilter.Q.value = 1.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    src.connect(this.engineFilter).connect(this.engineGain).connect(this.sfxBus);
    src.start();
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    this.engineOscGain = ctx.createGain();
    this.engineOscGain.gain.value = 0;
    this.engineOsc.connect(lp).connect(this.engineOscGain).connect(this.sfxBus);
    this.engineOsc.start();
    // wind
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = this.noiseBuf;
    wsrc.loop = true;
    wsrc.playbackRate.value = 0.7;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wsrc.connect(this.windFilter).connect(this.windGain).connect(this.sfxBus);
    wsrc.start();
  }

  /** Called every frame with current thrust (0..1) and the engine flavour. */
  setEngine(throttle: number, kind: string, speed: number) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const th = clamp(throttle, 0, 1);
    const base = kind === 'extinguisher' ? 260 : kind === 'spray' ? 900 : 520;
    this.engineFilter!.frequency.setTargetAtTime(base + th * (kind === 'spray' ? 2400 : 1400), t, 0.05);
    this.engineGain.gain.setTargetAtTime(th * (kind === 'extinguisher' ? 0.55 : 0.4), t, 0.04);
    this.engineOsc!.frequency.setTargetAtTime(40 + th * 30 + (kind === 'extinguisher' ? -10 : 0), t, 0.08);
    this.engineOscGain!.gain.setTargetAtTime(th * 0.18, t, 0.05);
    const w = clamp((speed - 6) / 30, 0, 1);
    this.windGain!.gain.setTargetAtTime(w * 0.22, t, 0.15);
    this.windFilter!.frequency.setTargetAtTime(300 + w * 900, t, 0.15);
  }

  // ---------------------------------------------------------------- one-shots
  impact(intensity: number, mat: Mat = 'wood') {
    if (!this.ctx || !this.throttle('impact' + mat, 45)) return;
    const t = this.ctx.currentTime;
    const v = clamp(intensity, 0.05, 1);
    switch (mat) {
      case 'glass':
        this.noise(t, 0.25, 'highpass', 3000, 6000, 0.7, 0.5 * v);
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.02, 'sine', rand(2200, 5200), rand(2000, 5000), 0.3, 0.08 * v);
        break;
      case 'metal':
        this.noise(t, 0.12, 'bandpass', 2400, 1200, 2, 0.4 * v);
        this.tone(t, 'square', rand(320, 420), rand(300, 400), 0.4, 0.06 * v);
        this.tone(t, 'sine', rand(900, 1300), rand(880, 1250), 0.6, 0.08 * v);
        break;
      case 'brick':
      case 'stone':
      case 'ground':
        this.noise(t, 0.22, 'lowpass', 900, 120, 1, 0.8 * v);
        this.tone(t, 'sine', 120, 45, 0.25, 0.5 * v);
        break;
      case 'soft':
        this.noise(t, 0.18, 'lowpass', 500, 100, 1, 0.6 * v);
        this.tone(t, 'sine', 160, 60, 0.2, 0.3 * v);
        break;
      case 'rubber':
        this.tone(t, 'sine', 220, 520, 0.18, 0.4 * v);
        break;
      default: // wood / cardboard
        this.noise(t, 0.12, 'bandpass', 700, 300, 1.5, 0.8 * v);
        this.tone(t, 'triangle', rand(180, 240), 90, 0.14, 0.35 * v);
    }
  }

  crunch(mat: Mat, big = false) {
    if (!this.ctx || !this.throttle('crunch' + mat, 40)) return;
    const t = this.ctx.currentTime;
    const s = big ? 1 : 0.7;
    if (mat === 'glass') {
      this.noise(t, 0.5, 'highpass', 2500, 5000, 0.5, 0.6 * s);
      for (let i = 0; i < 8; i++) this.tone(t + rand(0, 0.15), 'sine', rand(2500, 6500), rand(2500, 6500), rand(0.1, 0.4), 0.06);
    } else if (mat === 'metal') {
      this.noise(t, 0.3, 'bandpass', 1800, 600, 1, 0.5 * s);
      this.tone(t, 'sawtooth', 210, 90, 0.5, 0.12 * s);
      this.tone(t, 'sine', 1400, 1300, 0.8, 0.07);
    } else if (mat === 'brick' || mat === 'stone') {
      this.noise(t, 0.45, 'lowpass', 1600, 150, 0.8, 0.9 * s);
      this.tone(t, 'sine', 90, 35, 0.35, 0.6 * s);
      for (let i = 0; i < 5; i++) this.noise(t + rand(0.03, 0.25), 0.06, 'bandpass', rand(800, 1600), 400, 3, 0.2);
    } else if (mat === 'soft' || mat === 'cake') {
      this.noise(t, 0.35, 'lowpass', 700, 90, 1, 0.9 * s);
      this.tone(t, 'sine', 140, 50, 0.3, 0.5);
    } else if (mat === 'ceramic') {
      this.noise(t, 0.35, 'highpass', 1800, 3500, 0.6, 0.6 * s);
      for (let i = 0; i < 6; i++) this.tone(t + rand(0, 0.1), 'sine', rand(1500, 3500), rand(1500, 3500), rand(0.1, 0.3), 0.07);
      this.tone(t, 'sine', 300, 120, 0.2, 0.4);
    } else {
      // wood / cardboard: splintery crack
      this.noise(t, 0.08, 'highpass', 1200, 2500, 0.7, 0.8 * s);
      this.noise(t + 0.02, 0.3, 'bandpass', 900, 200, 1.2, 0.7 * s);
      this.tone(t, 'triangle', 160, 60, 0.25, 0.4 * s);
      for (let i = 0; i < 4; i++) this.noise(t + rand(0.02, 0.2), 0.04, 'bandpass', rand(1500, 3000), 800, 4, 0.25);
    }
  }

  explosion(size = 1) {
    if (!this.ctx || !this.throttle('boom', 70)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 1.2 * size, 'lowpass', 3000, 60, 0.7, 1.0);
    this.noise(t, 0.15, 'highpass', 2000, 4000, 0.5, 0.6);
    this.tone(t, 'sine', 110, 28, 0.9 * size, 0.9);
    this.tone(t, 'triangle', 70, 25, 1.1 * size, 0.5);
    for (let i = 0; i < 6; i++) this.noise(t + rand(0.05, 0.6), 0.08, 'bandpass', rand(400, 1500), 200, 2, 0.2);
  }

  firework() {
    if (!this.ctx || !this.throttle('firework', 60)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.25, 'highpass', 1500, 3000, 0.6, 0.6);
    for (let i = 0; i < 14; i++) this.noise(t + 0.1 + rand(0, 0.8), 0.03, 'highpass', 4000, 5000, 1, 0.25);
    this.tone(t, 'sine', 90, 40, 0.5, 0.5);
  }

  coin() {
    if (!this.ctx || !this.throttle('coin', 35)) return;
    const t = this.ctx.currentTime;
    const p = rand(0.97, 1.05);
    this.tone(t, 'square', 988 * p, 988 * p, 0.07, 0.07);
    this.tone(t + 0.06, 'square', 1319 * p, 1319 * p, 0.22, 0.07);
    this.tone(t, 'sine', 1976 * p, 1976 * p, 0.2, 0.05);
  }

  gear() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.tone(t + i * 0.07, 'triangle', f, f, 0.35, 0.18);
      this.tone(t + i * 0.07, 'sine', f * 2, f * 2, 0.25, 0.05);
    });
  }

  fuel() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'sine', 300, 900, 0.25, 0.25);
    this.noise(t, 0.3, 'bandpass', 600, 1800, 3, 0.3);
  }

  boing(power = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(380 * power, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.6);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18;
    const lg = ctx.createGain();
    lg.gain.value = 30;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.75);
    lfo.stop(t + 0.75);
    this.noise(t, 0.2, 'lowpass', 600, 100, 1, 0.8);
  }

  ignite() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.9, 'lowpass', 300, 3000, 0.8, 0.9, 0.05);
    this.tone(t, 'sawtooth', 50, 120, 0.8, 0.25, 0.05);
    this.noise(t, 0.12, 'highpass', 2000, 2000, 0.5, 0.5);
  }

  whoosh(up = true) {
    if (!this.ctx || !this.throttle('whoosh', 80)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.45, 'bandpass', up ? 300 : 1500, up ? 1800 : 300, 2, 0.35, 0.12);
  }

  splash() {
    if (!this.ctx || !this.throttle('splash', 90)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.6, 'bandpass', 2000, 400, 0.8, 0.7, 0.01);
    for (let i = 0; i < 5; i++) this.tone(t + rand(0, 0.3), 'sine', rand(600, 1400), rand(1400, 2200), 0.08, 0.06);
  }

  drip() {
    if (!this.ctx || !this.throttle('drip', 120)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'sine', rand(700, 1100), rand(1500, 2200), 0.07, 0.05);
  }

  pop() {
    if (!this.ctx || !this.throttle('pop', 40)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.08, 'highpass', 1000, 3000, 0.7, 0.9, 0.001);
    this.tone(t, 'sine', 600, 200, 0.06, 0.4, 0.001);
  }

  ding() {
    if (!this.ctx || !this.throttle('ding', 200)) return;
    const t = this.ctx.currentTime;
    [1, 2.76, 5.4, 8.9].forEach((m, i) => this.tone(t, 'sine', 440 * m, 440 * m, 2.5 / (i + 1), 0.25 / (i + 1), 0.002));
  }

  zap() {
    if (!this.ctx || !this.throttle('zap', 100)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'sawtooth', 1200, 80, 0.3, 0.2);
    this.noise(t, 0.3, 'highpass', 3000, 3000, 1, 0.3);
  }

  sizzle() {
    if (!this.ctx || !this.throttle('sizzle', 160)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.5, 'highpass', 3000, 6000, 0.5, 0.25, 0.02);
  }

  fireLoop() {
    if (!this.ctx || !this.throttle('fireloop', 220)) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.3, 'lowpass', 900, 300, 0.7, 0.12, 0.05);
    for (let i = 0; i < 2; i++) this.noise(t + rand(0, 0.2), 0.03, 'highpass', 2500, 3000, 1, 0.08);
  }

  hurt() {
    if (!this.ctx || !this.throttle('hurt', 120)) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'square', 220, 110, 0.12, 0.08);
  }

  alarm() {
    if (!this.ctx || !this.throttle('alarm', 600)) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.tone(t + i * 0.18, 'square', 880, 880, 0.09, 0.06);
    }
  }

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'sine', 800, 500, 0.06, 0.2, 0.002);
    this.noise(t, 0.03, 'bandpass', 2000, 2000, 2, 0.15);
  }

  perfect() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(t + i * 0.05, 'triangle', f, f, 0.3, 0.16));
  }

  fanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes: [number, number, number][] = [
      [523, 0, 0.12],
      [659, 0.12, 0.12],
      [784, 0.24, 0.12],
      [1047, 0.36, 0.4],
      [988, 0.8, 0.12],
      [1047, 0.92, 0.7],
    ];
    for (const [f, d, l] of notes) {
      this.tone(t + d, 'square', f, f, l, 0.07, 0.01);
      this.tone(t + d, 'triangle', f / 2, f / 2, l, 0.15, 0.01);
    }
    for (let i = 0; i < 10; i++) this.noise(t + 0.4 + rand(0, 1), 0.04, 'highpass', 4000, 5000, 1, 0.15);
  }

  sad() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 370, 349, 330].forEach((f, i) => this.tone(t + i * 0.22, 'triangle', f, f * (i === 3 ? 0.8 : 1), i === 3 ? 0.7 : 0.2, 0.15));
  }

  // ---------------------------------------------------------------- music
  private startMusic() {
    if (this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx!.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const bpm = this.musicMood === 'flight' ? 124 : 104;
    const step = 60 / bpm / 2; // 8th notes
    // I - vi - IV - V in C, playful pizzicato + marimba-ish lead.
    const chords = [
      [48, 52, 55],
      [45, 48, 52],
      [41, 45, 48],
      [43, 47, 50],
    ];
    const lead = [
      72, -1, 76, 79, 76, -1, 74, 72,
      69, -1, 72, 76, 74, -1, 72, 69,
      65, -1, 69, 72, 74, 72, 69, -1,
      67, 71, 74, -1, 71, 74, 79, -1,
    ];
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const s = this.musicStep % 32;
      const bar = Math.floor(s / 8);
      const t = this.nextNoteTime;
      const ch = chords[bar];
      const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
      // bass on beats
      if (s % 4 === 0) this.pluck(t, mtof(ch[0] - 12), 0.35, 0.32, 'triangle');
      if (s % 4 === 2) this.pluck(t, mtof(ch[2] - 12), 0.2, 0.18, 'triangle');
      // offbeat chord stabs
      if (s % 2 === 1) for (const n of ch) this.pluck(t, mtof(n + 12), 0.12, 0.035, 'square');
      // lead (sparser in menu)
      const ln = lead[s];
      if (ln > 0 && (this.musicMood === 'flight' || this.musicStep % 64 < 32)) {
        this.pluck(t, mtof(ln), 0.22, 0.1, 'sine');
        this.pluck(t, mtof(ln + 12), 0.08, 0.025, 'sine');
      }
      // hats
      if (this.musicMood === 'flight' && s % 2 === 0) this.hat(t, s % 4 === 0 ? 0.05 : 0.03);
      if (this.musicMood === 'flight' && s % 8 === 4) this.snare(t);
      this.nextNoteTime += step;
      this.musicStep++;
    }
  }

  private pluck(t: number, f: number, dur: number, vol: number, type: OscillatorType) {
    this.tone(t, type, f, f, dur, vol, 0.004, this.musicBus);
  }
  private hat(t: number, vol: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }
  private snare(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random());
    src.stop(t + 0.15);
  }
}

export const audio = new Audio();
