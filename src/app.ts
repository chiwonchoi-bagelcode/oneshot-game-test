import { Renderer } from './render/renderer';
import { UI } from './ui/ui';
import { FlightInput } from './core/input';
import { audio } from './core/audio';
import { save, persist, gearsAvailable } from './core/save';
import { Flight } from './game/flight';
import { Garage } from './game/garage';
import { STAGES } from './data/stages';
import { partById } from './data/parts';

type Mode = 'title' | 'stages' | 'garage' | 'flight';

export class App {
  renderer: Renderer;
  ui: UI;
  input: FlightInput;
  garage: Garage;
  flight: Flight | null = null;
  mode: Mode = 'title';
  paused = false;
  private last = performance.now();
  private stageId = STAGES[0].id;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lowFpsStrikes = 0;

  constructor(public container: HTMLElement) {
    const canvas = container.querySelector('canvas')!;
    this.renderer = new Renderer(canvas, save.settings.quality);
    this.input = new FlightInput(container.querySelector('#touch') as HTMLElement);
    this.ui = new UI(container.querySelector('#ui') as HTMLElement, {
      play: (id) => this.startFlight(id),
      openGarage: () => this.setMode('garage'),
      openStages: () => this.setMode('stages'),
      openTitle: () => this.setMode('title'),
      retry: () => this.startFlight(this.stageId, true),
      nextStage: () => {
        const i = STAGES.findIndex((s) => s.id === this.stageId);
        this.startFlight(STAGES[Math.min(STAGES.length - 1, i + 1)].id);
      },
      pause: (on) => this.setPaused(on),
      quitToStages: () => this.setMode('stages'),
      equip: (id) => this.equip(id),
      research: (id) => this.research(id),
      setSetting: (k, v) => {
        (save.settings as any)[k] = v;
        persist();
        if (k === 'sfx') audio.setSfx(v);
        if (k === 'music') audio.setMusic(v);
        if (k === 'quality') {
          this.renderer.setQuality(v);
          this.onResize();
        }
      },
      resetSave: () => {},
      click: () => {
        audio.unlock();
        audio.click();
      },
    });
    this.ui.stagesList = STAGES;
    audio.sfxOn = save.settings.sfx;
    audio.musicOn = save.settings.music;
    this.garage = new Garage(this.renderer);
    this.garage.setLoadout(save.equip);
    // unlock audio on first interaction anywhere
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', (e) => {
      unlock();
      if (e.code === 'Escape' && this.mode === 'flight') this.setPaused(!this.paused);
    });
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'flight') this.setPaused(true);
    });
    this.onResize();
    this.setMode('title');
    requestAnimationFrame(this.loop);
  }

  onResize() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    // portrait game: letterbox on wide screens
    const w = W / H > 0.62 ? Math.round(H * 0.5625) : W;
    this.container.style.width = `${w}px`;
    this.container.style.height = `${H}px`;
    this.renderer.resize(w, H);
  }

  setMode(m: Mode) {
    if (this.flight && m !== 'flight') {
      this.flight.dispose();
      this.flight = null;
    }
    this.mode = m;
    this.paused = false;
    this.ui.showPause(false);
    this.ui.hideResult();
    this.ui.hideIntro();
    this.input.enabled = m === 'flight';
    audio.musicMood = 'menu';
    audio.setEngine(0, 'cola', 0);
    if (m !== 'flight') {
      this.garage.setMode(m === 'garage' ? 'garage' : m === 'stages' ? 'stages' : 'title');
      this.garage.setLoadout(save.equip);
      this.ui.show(m);
    }
  }

  startFlight(id: string, retry = false) {
    this.stageId = id;
    const st = STAGES.find((s) => s.id === id)!;
    if (this.flight) {
      this.flight.dispose();
      this.flight = null;
    }
    this.ui.hideResult();
    this.ui.showPause(false);
    this.paused = false;
    this.mode = 'flight';
    this.input.enabled = true;
    this.input.release();
    this.flight = new Flight(this.renderer, st, { ...save.equip }, this.input, this.ui, retry);
  }

  setPaused(on: boolean) {
    if (this.mode !== 'flight') return;
    this.paused = on;
    this.ui.showPause(on);
    this.input.release();
    if (on) audio.setEngine(0, 'cola', 0);
  }

  equip(id: string) {
    const p = partById(id);
    if (!save.owned[id]) return;
    (save.equip as any)[p.slot] = id;
    persist();
    audio.click();
    this.garage.setLoadout(save.equip, true);
    this.ui.renderGarage();
  }

  research(id: string) {
    const p = partById(id);
    if (save.owned[id]) return;
    if (save.coins < p.cost) {
      this.ui.toast('병뚜껑이 부족해요!');
      audio.hurt();
      return;
    }
    if (gearsAvailable() < p.gears) {
      this.ui.toast('톱니바퀴가 부족해요! 맵을 탐험해보자');
      audio.hurt();
      return;
    }
    save.coins -= p.cost;
    save.gearsSpent += p.gears;
    save.owned[id] = true;
    (save.equip as any)[p.slot] = id;
    persist();
    audio.gear();
    this.ui.toast(`${p.name} 완성!`);
    this.garage.setLoadout(save.equip, true);
    this.ui.renderGarage();
  }

  /** When true the rAF loop stops ticking (used by automated tests via advance()). */
  manual = false;

  private loop = (now: number) => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (this.manual) return;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.autoQuality(dt);
    this.tick(dt, true);
  };

  tick(dt: number, render: boolean) {
    if (this.mode === 'flight' && this.flight) {
      if (!this.paused) this.flight.update(dt);
      const r = this.flight.rocket;
      audio.setEngine(this.paused || r.dead ? 0 : r.throttle, r.stats.exhaust === 'foam' ? 'cola' : r.stats.exhaust === 'torch' ? 'spray' : 'extinguisher', r.dead ? 0 : r.speed());
      if (render) this.flight.render();
    } else {
      this.garage.update(dt);
      if (render) this.garage.render();
    }
  }

  /** Deterministically advance the game by `sec` seconds at 60 Hz, then draw one frame. */
  advance(sec: number) {
    this.manual = true;
    const n = Math.max(1, Math.round(sec * 60));
    for (let i = 0; i < n; i++) this.tick(1 / 60, false);
    this.tick(0.0001, true);
  }

  /** Drop to the cheap renderer if the device is struggling. */
  private autoQuality(dt: number) {
    if (this.renderer.quality === 'low') return;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 3) {
      const fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      if (fps < 32) this.lowFpsStrikes++;
      else this.lowFpsStrikes = 0;
      if (this.lowFpsStrikes >= 2) {
        this.renderer.setQuality('low');
        save.settings.quality = 'low';
        persist();
        this.onResize();
      }
    }
  }
}
