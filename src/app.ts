import { Renderer } from './render/renderer';
import { UI } from './ui/ui';
import { FlightInput } from './core/input';
import { audio } from './core/audio';
import { save, persist, gearsAvailable, initSave, loadStatus, storageOk, resetProgress, Settings } from './core/save';
import { track } from './core/telemetry';
import { Flight } from './game/flight';
import { Garage } from './game/garage';
import { STAGES } from './data/stages';
import { partById } from './data/parts';

type Mode = 'title' | 'stages' | 'garage' | 'flight';

const LOAD_NOTICE: Partial<Record<typeof loadStatus, string>> = {
  migrated: '저장 데이터를 새 버전으로 옮겼어요.',
  repaired: '저장 데이터 일부가 이상해서 고쳤어요.',
  backup: '저장이 손상돼서 직전 백업으로 되돌렸어요.',
  'corrupt-reset': '저장이 손상돼 복구할 수 없어서 새로 시작해요.',
  'storage-unavailable': '이 브라우저는 저장이 막혀 있어요. 진행이 남지 않을 수 있어요.',
};

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
  private contextLost = false;
  /** When true the rAF loop stops ticking (deterministic test clock, dev builds only). */
  manual = false;

  constructor(public container: HTMLElement) {
    initSave({ stages: STAGES.map((s) => s.id), gears: STAGES.flatMap((s) => s.gearIds) });
    const canvas = container.querySelector('canvas')!;
    this.renderer = new Renderer(canvas, save.settings.quality);
    this.input = new FlightInput(container.querySelector('#touch') as HTMLElement);
    this.input.setSensitivity(save.settings.sensitivity);
    this.ui = new UI(container.querySelector('#ui') as HTMLElement, {
      play: (id) => this.startFlight(id),
      openGarage: () => this.setMode('garage'),
      openStages: () => this.setMode('stages'),
      openTitle: () => this.setMode('title'),
      retry: () => this.retry(),
      nextStage: () => {
        const i = STAGES.findIndex((s) => s.id === this.stageId);
        this.startFlight(STAGES[Math.min(STAGES.length - 1, i + 1)].id);
      },
      pause: (on) => this.setPaused(on),
      quitToStages: () => {
        this.flight?.abandon();
        this.setMode('stages');
      },
      equip: (id) => this.equip(id),
      research: (id) => this.research(id),
      setSetting: (k, v) => this.setSetting(k, v),
      resetSave: () => {
        resetProgress();
        this.garage.setLoadout(save.equip);
        this.ui.toast('진행을 초기화했어요.');
        track('save_reset');
      },
      click: () => {
        audio.unlock();
        audio.click();
      },
    });
    this.ui.stagesList = STAGES;
    audio.sfxOn = save.settings.sfx;
    audio.musicOn = save.settings.music;
    audio.setVolumes(save.settings.sfxVol, save.settings.musicVol);
    this.garage = new Garage(this.renderer);
    this.garage.setLoadout(save.equip);
    // unlock audio on first interaction anywhere
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', (e) => {
      unlock();
      if (e.code !== 'Escape') return;
      if (this.ui.handleEscape()) return; // a dialog consumed it
      if (this.mode === 'flight' && this.flight?.canPause()) this.setPaused(true);
    });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      audio.suspend(document.hidden);
      if (document.hidden) {
        this.input.reset();
        if (this.mode === 'flight' && this.flight?.canPause()) this.setPaused(true);
        persist();
      }
      this.last = performance.now();
    });
    window.addEventListener('pagehide', () => persist());
    // C-125: a lost GPU context is reported and recovered instead of leaving a frozen frame
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      if (this.mode === 'flight' && this.flight?.canPause()) this.setPaused(true);
      this.ui.toast('그래픽이 잠깐 끊겼어요. 다시 그리는 중…');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.ui.toast('다시 연결됐어요!');
    });
    this.onResize();
    this.setMode('title');
    const notice = LOAD_NOTICE[loadStatus];
    if (notice) setTimeout(() => this.ui.toast(notice), 400);
    track('app_open', { load: loadStatus, storage: storageOk });
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

  setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
    save.settings[k] = v;
    const S = save.settings;
    if (k === 'sfx') audio.setSfx(S.sfx);
    if (k === 'music') audio.setMusic(S.music);
    if (k === 'sfxVol' || k === 'musicVol') audio.setVolumes(S.sfxVol, S.musicVol);
    if (k === 'quality') {
      this.renderer.setQuality(S.quality);
      this.lowFpsStrikes = 0;
      this.onResize();
    }
    if (k === 'sensitivity') this.input.setSensitivity(S.sensitivity);
    if (k === 'bigText' || k === 'reduceMotion') this.ui.applyTextSize();
    if (!persist()) this.ui.toast('설정을 저장하지 못했어요 (저장 공간 문제).');
  }

  setMode(m: Mode) {
    if (this.flight && m !== 'flight') {
      this.flight.dispose();
      this.flight = null;
    }
    this.mode = m;
    this.paused = false;
    this.ui.closeAll();
    this.input.reset();
    this.input.enabled = m === 'flight';
    audio.musicMood = 'menu';
    audio.setEngine(0, 'cola', 0);
    if (m !== 'flight') {
      this.garage.setMode(m === 'garage' ? 'garage' : m === 'stages' ? 'stages' : 'title');
      this.garage.setLoadout(save.equip);
      this.ui.show(m);
    }
  }

  private retry() {
    // a retry from the pause menu ends the current attempt first (it is settled as abandoned)
    this.flight?.abandon();
    this.startFlight(this.stageId, true);
  }

  startFlight(id: string, retry = false) {
    this.stageId = id;
    const st = STAGES.find((s) => s.id === id)!;
    if (this.flight) {
      this.flight.dispose();
      this.flight = null;
    }
    this.ui.closeAll();
    this.paused = false;
    this.mode = 'flight';
    this.input.reset();
    this.input.enabled = true;
    save.lastStage = id;
    this.flight = new Flight(this.renderer, st, { ...save.equip }, this.input, this.ui, retry);
  }

  setPaused(on: boolean) {
    if (this.mode !== 'flight' || !this.flight) return;
    if (on && !this.flight.canPause()) return;
    if (on === this.paused) return;
    this.paused = on;
    this.ui.showPause(on);
    this.input.reset();
    this.input.enabled = !on;
    if (on) audio.setEngine(0, 'cola', 0);
  }

  equip(id: string) {
    const p = partById(id);
    if (!save.owned[id]) return;
    if ((save.equip as any)[p.slot] === id) return;
    (save.equip as any)[p.slot] = id;
    persist();
    audio.click();
    this.garage.setLoadout(save.equip, true);
    this.ui.renderGarage();
    track('part_equip', { part: id, slot: p.slot });
  }

  research(id: string) {
    const p = partById(id);
    if (save.owned[id]) return;
    if (save.coins < p.cost) {
      this.ui.toast(`병뚜껑이 ${p.cost - save.coins}개 부족해요!`);
      audio.hurt();
      return;
    }
    if (gearsAvailable() < p.gears) {
      this.ui.toast(`톱니바퀴가 ${p.gears - gearsAvailable()}개 부족해요! 맵을 탐험해보자`);
      audio.hurt();
      return;
    }
    save.coins -= p.cost;
    save.gearsSpent += p.gears;
    save.owned[id] = true;
    (save.equip as any)[p.slot] = id;
    if (!persist()) this.ui.toast('저장하지 못했어요! 저장 공간을 확인해주세요.');
    else this.ui.toast(`${p.name} 완성!`);
    audio.gear();
    track('currency_sink', { part: id, coins: p.cost, gears: p.gears, balance: save.coins });
    this.garage.setLoadout(save.equip, true);
    this.ui.renderGarage();
  }

  private loop = (now: number) => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (this.manual || this.contextLost) return;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.autoQuality(dt);
    this.tick(dt, true);
    this.onFrame?.(dt);
  };

  /** Optional per-frame observer (perf overlay in dev builds). */
  onFrame?: (dt: number) => void;

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
        this.ui.toast('기기가 힘들어해서 저사양 그래픽으로 바꿨어요 (설정에서 변경)');
      }
    }
  }
}
