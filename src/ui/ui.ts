import { ICON } from './icons';
import type { StageDef } from '../game/level';
import type { RunResult } from '../game/flight';
import { PARTS, SLOTS, Slot, computeStats, partById, styleLabel, PartDef, Loadout } from '../data/parts';
import { gearsAvailable, save, stageProg } from '../core/save';

export interface UIHandlers {
  play(stageId: string): void;
  openGarage(): void;
  openStages(): void;
  openTitle(): void;
  retry(): void;
  nextStage(): void;
  pause(on: boolean): void;
  quitToStages(): void;
  equip(partId: string): void;
  research(partId: string): void;
  setSetting(k: 'sfx' | 'music' | 'quality', v: any): void;
  resetSave(): void;
  click(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

type Screen = 'title' | 'stages' | 'garage' | 'flight' | 'none';

export class UI {
  root: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  private hud!: HTMLElement;
  private fuelBar!: HTMLElement;
  private hullBar!: HTMLElement;
  private coinTxt!: HTMLElement;
  private gearTxt!: HTMLElement;
  private altTxt!: HTMLElement;
  private targetEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private popLayer!: HTMLElement;
  private joy!: HTMLElement;
  private joyKnob!: HTMLElement;
  private joyJet!: HTMLElement;
  private joyHint!: HTMLElement;
  private ringEl!: HTMLElement;
  private hurtEl!: HTMLElement;
  private introEl!: HTMLElement;
  private resultEl!: HTMLElement;
  private pauseEl!: HTMLElement;
  private bannerTimer = 0;
  private current: Screen = 'none';
  stagesList: StageDef[] = [];
  garageSlot: Slot = 'body';
  private lastHud = { fuel: -1, hull: -1, coins: -1, gears: -1, alt: -1 };

  constructor(root: HTMLElement, public h: UIHandlers) {
    this.root = root;
    this.buildTitle();
    this.buildStages();
    this.buildGarage();
    this.buildHud();
    this.buildOverlays();
  }

  show(s: Screen) {
    this.current = s;
    for (const [k, e] of Object.entries(this.screens)) e.classList.toggle('on', k === s);
    if (s === 'stages') this.renderStages();
    if (s === 'garage') this.renderGarage();
    if (s === 'title') this.renderTitle();
  }

  // ================================================================== title
  private buildTitle() {
    const s = el('div', 'screen title');
    s.innerHTML = `
      <div class="logo">
        <div class="logo-top">보리의</div>
        <div class="logo-main"><span>폐품</span> <span>로켓</span></div>
        <div class="logo-sub">대소동!</div>
        <div class="logo-en">JUNK ROCKET RUCKUS</div>
      </div>
      <div class="title-btns">
        <button class="btn big yellow" data-a="play">출격하기!</button>
        <button class="btn blue" data-a="garage">🔧 차고</button>
      </div>
      <div class="title-foot">
        <button class="chip" data-a="sfx"></button>
        <button class="chip" data-a="music"></button>
        <button class="chip" data-a="quality"></button>
      </div>
      <div class="wallet title-wallet"></div>
    `;
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      this.h.click();
      if (a === 'play') this.h.openStages();
      if (a === 'garage') this.h.openGarage();
      if (a === 'sfx') this.h.setSetting('sfx', !save.settings.sfx);
      if (a === 'music') this.h.setSetting('music', !save.settings.music);
      if (a === 'quality') this.h.setSetting('quality', save.settings.quality === 'high' ? 'low' : 'high');
      this.renderTitle();
    });
    this.screens.title = s;
    this.root.appendChild(s);
  }

  renderTitle() {
    const s = this.screens.title;
    s.querySelector('[data-a=sfx]')!.textContent = save.settings.sfx ? '🔊 효과음' : '🔇 효과음';
    s.querySelector('[data-a=music]')!.textContent = save.settings.music ? '🎵 음악' : '🔕 음악';
    s.querySelector('[data-a=quality]')!.textContent = save.settings.quality === 'high' ? '✨ 고화질' : '⚡ 저사양';
    s.querySelector('.title-wallet')!.innerHTML = this.walletHtml();
  }

  private walletHtml() {
    return `<span class="pill">${ICON.cap}<b>${save.coins}</b></span><span class="pill">${ICON.gear}<b>${gearsAvailable()}</b></span>`;
  }

  // ================================================================== stages
  private buildStages() {
    const s = el('div', 'screen stages');
    s.innerHTML = `
      <div class="topbar"><button class="iconbtn" data-a="back">${ICON.back}</button><div class="tb-title">어디로 날아갈까?</div><div class="wallet"></div></div>
      <div class="stage-list"></div>
      <div class="bottombar"><button class="btn blue" data-a="garage">🔧 차고에서 개조하기</button></div>
    `;
    s.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const a = t.closest('[data-a]')?.getAttribute('data-a');
      const st = t.closest('[data-stage]')?.getAttribute('data-stage');
      if (a === 'back') {
        this.h.click();
        this.h.openTitle();
      } else if (a === 'garage') {
        this.h.click();
        this.h.openGarage();
      } else if (st) {
        const card = t.closest('.stage-card') as HTMLElement;
        if (card.classList.contains('locked')) {
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
          return;
        }
        this.h.click();
        this.h.play(st);
      }
    });
    this.screens.stages = s;
    this.root.appendChild(s);
  }

  renderStages() {
    const s = this.screens.stages;
    s.querySelector('.wallet')!.innerHTML = this.walletHtml();
    const list = s.querySelector('.stage-list')!;
    list.innerHTML = '';
    this.stagesList.forEach((st, i) => {
      const prog = stageProg(st.id);
      const prev = i > 0 ? stageProg(this.stagesList[i - 1].id) : null;
      const locked = !!prev && !prev.cleared;
      const found = st.gearIds.filter((g) => save.gearsFound[g]).length;
      const methodsFound = st.methods.filter((m) => prog.methods[m.id]).length;
      const rumor = prog.cleared ? st.methods.find((m) => !prog.methods[m.id]) : st.methods[0];
      const card = el('div', `stage-card c${i} ${locked ? 'locked' : ''} ${prog.cleared ? 'cleared' : ''}`);
      card.setAttribute('data-stage', st.id);
      card.innerHTML = `
        <div class="sc-num">${i + 1}</div>
        <div class="sc-body">
          <div class="sc-name">${st.name}</div>
          <div class="sc-target">${ICON.target}<span>${st.targetName}</span></div>
          <div class="sc-brief">${st.brief}</div>
          <div class="sc-row">
            <div class="sc-methods">${st.methods.map((m) => `<span class="mbadge ${prog.methods[m.id] ? 'on' : ''}" title="${m.name}">${prog.methods[m.id] ? m.icon : '?'}</span>`).join('')}<span class="mcount">공략 ${methodsFound}/${st.methods.length}</span></div>
            <div class="sc-gears">${ICON.gear}${found}/${st.gearIds.length}</div>
          </div>
          ${rumor && !locked && methodsFound < st.methods.length ? `<div class="sc-rumor">💬 소문: ${rumor.hint}</div>` : ''}
          ${prog.cleared && methodsFound === st.methods.length ? `<div class="sc-rumor gold">🏆 모든 공략 정복!</div>` : ''}
        </div>
        ${locked ? `<div class="sc-lock">${ICON.lock}<span>이전 장난을 먼저 성공하세요</span></div>` : ''}
        ${prog.cleared ? '<div class="sc-stamp">성공!</div>' : ''}
      `;
      list.appendChild(card);
    });
  }

  // ================================================================== garage
  private buildGarage() {
    const s = el('div', 'screen garage');
    s.innerHTML = `
      <div class="topbar"><button class="iconbtn" data-a="back">${ICON.back}</button><div class="tb-title">보리의 차고</div><div class="wallet"></div></div>
      <div class="build-card"></div>
      <div class="sheet">
        <div class="slot-tabs"></div>
        <div class="part-list"></div>
        <div class="sheet-foot"><button class="btn big yellow" data-a="go">출격!</button></div>
      </div>
      <div class="toast"></div>
    `;
    s.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const a = t.closest('[data-a]')?.getAttribute('data-a');
      const slot = t.closest('[data-slot]')?.getAttribute('data-slot') as Slot | null;
      const part = t.closest('[data-part]')?.getAttribute('data-part');
      const act = t.closest('[data-act]')?.getAttribute('data-act');
      if (a === 'back') {
        this.h.click();
        this.h.openTitle();
        return;
      }
      if (a === 'go') {
        this.h.click();
        this.h.openStages();
        return;
      }
      if (slot) {
        this.h.click();
        this.garageSlot = slot;
        this.renderGarage();
        return;
      }
      if (part && act === 'research') {
        this.h.research(part);
        return;
      }
      if (part) {
        if (save.owned[part]) this.h.equip(part);
        else {
          const card = t.closest('.part-card') as HTMLElement;
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
        }
      }
    });
    this.screens.garage = s;
    this.root.appendChild(s);
  }

  toast(msg: string) {
    const t = this.screens.garage.querySelector('.toast') as HTMLElement;
    t.textContent = msg;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
  }

  renderGarage() {
    const s = this.screens.garage;
    s.querySelector('.wallet')!.innerHTML = this.walletHtml();
    const tabs = s.querySelector('.slot-tabs')!;
    tabs.innerHTML = SLOTS.map((sl) => {
      const eq = partById((save.equip as any)[sl.id]);
      return `<button class="tab ${sl.id === this.garageSlot ? 'on' : ''}" data-slot="${sl.id}"><span class="tab-ico">${sl.icon}</span><span class="tab-name">${sl.name}</span><span class="tab-eq">${eq.name.replace(/ (동체|엔진|연료통|날개)$/, '')}</span></button>`;
    }).join('');
    const list = s.querySelector('.part-list')!;
    const parts = PARTS.filter((p) => p.slot === this.garageSlot);
    const cur = computeStats(save.equip);
    list.innerHTML = parts.map((p) => this.partCard(p, cur)).join('');
    // build summary
    const st = cur;
    const style = styleLabel(st);
    const bar = (label: string, v: number, max: number, txt: string) =>
      `<div class="stat"><span class="sl">${label}</span><span class="sb"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span><span class="sv">${txt}</span></div>`;
    s.querySelector('.build-card')!.innerHTML = `
      <div class="bc-style" style="background:${style.color}">${style.name}</div>
      ${bar('무게', st.fullMass, 7, st.fullMass.toFixed(1) + 'kg')}
      ${bar('추력비', st.twr, 3, st.twr.toFixed(2))}
      ${bar('연료', st.burnTime, 22, st.burnTime.toFixed(0) + '초')}
      ${bar('내구도', st.hull, 380, String(st.hull))}
      ${bar('선회', st.turn, 8, st.turn.toFixed(1))}
      ${bar('돌파력', st.dryMass * st.punch, 12, (st.dryMass * st.punch).toFixed(1))}
    `;
  }

  private partCard(p: PartDef, cur: ReturnType<typeof computeStats>) {
    const owned = !!save.owned[p.id];
    const equipped = (save.equip as any)[p.slot] === p.id;
    const canAfford = save.coins >= p.cost && gearsAvailable() >= p.gears;
    const test: Loadout = { ...save.equip, [p.slot]: p.id } as Loadout;
    const ts = computeStats(test);
    const delta = (a: number, b: number, fmt: (n: number) => string, invert = false) => {
      const d = b - a;
      if (Math.abs(d) < 0.01) return '';
      const good = invert ? d < 0 : d > 0;
      return `<span class="d ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))}</span>`;
    };
    const deltas = equipped
      ? ''
      : [
          ['무게', delta(cur.fullMass, ts.fullMass, (n) => n.toFixed(1), true)],
          ['추력비', delta(cur.twr, ts.twr, (n) => n.toFixed(2))],
          ['연료', delta(cur.burnTime, ts.burnTime, (n) => n.toFixed(0) + 's')],
          ['내구', delta(cur.hull, ts.hull, (n) => n.toFixed(0))],
          ['선회', delta(cur.turn, ts.turn, (n) => n.toFixed(1))],
        ]
          .filter(([, d]) => d)
          .map(([k, d]) => `<span class="dk">${k}${d}</span>`)
          .join('');
    return `
      <div class="part-card ${equipped ? 'equipped' : ''} ${owned ? 'owned' : 'locked'}" data-part="${p.id}">
        <div class="pc-head"><span class="pc-name">${p.name}</span><span class="pc-tag">${p.tag}</span></div>
        <div class="pc-desc">${p.desc}</div>
        <div class="pc-trait">✨ ${p.trait}</div>
        <div class="pc-deltas">${deltas}</div>
        <div class="pc-foot">
          ${equipped ? '<span class="pc-eq">장착 중 ✓</span>' : owned ? '<span class="pc-own">탭해서 장착</span>' : `<button class="btn small ${canAfford ? 'green' : 'gray'}" data-act="research" data-part="${p.id}">연구 ${ICON.cap}${p.cost} ${p.gears ? ICON.gear + p.gears : ''}</button>`}
        </div>
      </div>`;
  }

  // ================================================================== HUD
  private buildHud() {
    const s = el('div', 'screen hud');
    s.innerHTML = `
      <div class="hud-top">
        <div class="gauges">
          <div class="gauge fuel">${ICON.fuel}<div class="gbar"><i></i></div></div>
          <div class="gauge hull">${ICON.hull}<div class="gbar"><i></i></div></div>
        </div>
        <div class="hud-right">
          <span class="pill">${ICON.cap}<b class="coin-t">0</b></span>
          <span class="pill">${ICON.gear}<b class="gear-t">0</b></span>
          <button class="iconbtn pause-b">${ICON.pause}</button>
        </div>
      </div>
      <div class="alt-t">${ICON.alt}<b>0</b>m</div>
      <div class="target-mark"><div class="tm-arrow"></div><div class="tm-label"><span class="tm-ico">${ICON.target}</span><b class="tm-d">0</b>m</div></div>
      <div class="banner"><div class="bn-t"></div><div class="bn-s"></div></div>
      <div class="prompt"></div>
      <div class="pops"></div>
      <div class="joy"><div class="joy-ring"></div><div class="joy-jet"></div><div class="joy-knob"></div></div>
      <div class="joy-hint"><div class="jh-finger">${ICON.finger}</div><div class="jh-txt">끌어서 분사! ↓ 아래로 끌면 ↑ 위로</div></div>
      <div class="timing-ring"><div class="tr-outer"></div><div class="tr-inner"></div><div class="tr-txt">지금 탭!</div></div>
      <div class="hurt"></div>
    `;
    this.hud = s;
    this.fuelBar = s.querySelector('.fuel .gbar i')!;
    this.hullBar = s.querySelector('.hull .gbar i')!;
    this.coinTxt = s.querySelector('.coin-t')!;
    this.gearTxt = s.querySelector('.gear-t')!;
    this.altTxt = s.querySelector('.alt-t b')!;
    this.targetEl = s.querySelector('.target-mark')!;
    this.bannerEl = s.querySelector('.banner')!;
    this.promptEl = s.querySelector('.prompt')!;
    this.popLayer = s.querySelector('.pops')!;
    this.joy = s.querySelector('.joy')!;
    this.joyKnob = s.querySelector('.joy-knob')!;
    this.joyJet = s.querySelector('.joy-jet')!;
    this.joyHint = s.querySelector('.joy-hint')!;
    this.ringEl = s.querySelector('.timing-ring')!;
    this.hurtEl = s.querySelector('.hurt')!;
    s.querySelector('.pause-b')!.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.h.click();
      this.h.pause(true);
    });
    this.screens.flight = s;
    this.root.appendChild(s);
  }

  showHud(on: boolean) {
    if (on) this.show('flight');
    this.lastHud = { fuel: -1, hull: -1, coins: -1, gears: -1, alt: -1 };
  }

  setHud(d: { fuel: number; hull: number; coins: number; gears: number; alt: number; boosting?: boolean }) {
    const L = this.lastHud;
    if (Math.abs(d.fuel - L.fuel) > 0.002) {
      this.fuelBar.style.transform = `scaleX(${d.fuel})`;
      this.fuelBar.parentElement!.parentElement!.classList.toggle('low', d.fuel < 0.2);
      this.fuelBar.parentElement!.parentElement!.classList.toggle('boost', !!d.boosting);
      L.fuel = d.fuel;
    }
    if (Math.abs(d.hull - L.hull) > 0.002) {
      this.hullBar.style.transform = `scaleX(${d.hull})`;
      this.hullBar.parentElement!.parentElement!.classList.toggle('low', d.hull < 0.3);
      L.hull = d.hull;
    }
    if (d.coins !== L.coins) {
      this.coinTxt.textContent = String(d.coins);
      this.coinTxt.parentElement!.classList.remove('bump');
      void (this.coinTxt as HTMLElement).offsetWidth;
      this.coinTxt.parentElement!.classList.add('bump');
      L.coins = d.coins;
    }
    if (d.gears !== L.gears) {
      this.gearTxt.textContent = String(d.gears);
      L.gears = d.gears;
    }
    if (d.alt !== L.alt) {
      this.altTxt.textContent = String(d.alt);
      L.alt = d.alt;
    }
  }

  setTarget(t: { x: number; y: number; dist: number; name: string } | null) {
    if (!t) {
      this.targetEl.style.display = 'none';
      return;
    }
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    const m = 34;
    const inside = t.x > m && t.x < W - m && t.y > 90 && t.y < H - m;
    this.targetEl.style.display = 'block';
    this.targetEl.classList.toggle('edge', !inside);
    (this.targetEl.querySelector('.tm-d') as HTMLElement).textContent = String(t.dist);
    let x = t.x;
    let y = t.y;
    if (!inside) {
      const cx = W / 2;
      const cy = H / 2;
      const dx = t.x - cx;
      const dy = t.y - cy;
      const sx = (W / 2 - m) / Math.max(1e-3, Math.abs(dx));
      const sy = (H / 2 - m - 40) / Math.max(1e-3, Math.abs(dy));
      const k = Math.min(sx, sy);
      x = cx + dx * k;
      y = cy + dy * k;
      const ang = Math.atan2(dy, dx);
      (this.targetEl.querySelector('.tm-arrow') as HTMLElement).style.transform = `rotate(${ang}rad)`;
    }
    this.targetEl.style.transform = `translate(${x}px, ${y}px)`;
  }

  popWorld(p: { x: number; y: number; behind?: boolean }, text: string, style = 'pop') {
    if (p.behind) return;
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) return;
    if (this.popLayer.childElementCount > 18) this.popLayer.firstElementChild?.remove();
    const d = el('div', `pop ${style}`);
    d.textContent = text;
    d.style.left = `${p.x}px`;
    d.style.top = `${p.y}px`;
    d.style.setProperty('--r', `${(Math.random() - 0.5) * 16}deg`);
    this.popLayer.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  banner(t: string, sub = '', style = 'info') {
    const b = this.bannerEl;
    b.className = `banner ${style}`;
    (b.querySelector('.bn-t') as HTMLElement).textContent = t;
    (b.querySelector('.bn-s') as HTMLElement).textContent = sub;
    void b.offsetWidth;
    b.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('on'), style === 'win' ? 3200 : 2200);
  }

  prompt(text: string | null, pulse = false) {
    this.promptEl.textContent = text ?? '';
    this.promptEl.classList.toggle('on', !!text);
    this.promptEl.classList.toggle('pulse', pulse);
  }

  timingRing(x: number, y: number, t: number, on: boolean) {
    const r = this.ringEl;
    r.classList.toggle('on', on);
    if (!on) return;
    r.style.transform = `translate(${x}px, ${y}px)`;
    const s = 2.6 - t * 1.75;
    (r.querySelector('.tr-outer') as HTMLElement).style.transform = `translate(-50%,-50%) scale(${s})`;
    r.classList.toggle('hot', t > 0.62);
  }

  showJoystick(j: { ax: number; ay: number; px: number; py: number; t: number; max: number } | null) {
    if (!j) {
      this.joy.classList.remove('on');
      return;
    }
    this.joy.classList.add('on');
    this.joy.style.transform = `translate(${j.ax}px, ${j.ay}px)`;
    const dx = j.px - j.ax;
    const dy = j.py - j.ay;
    const l = Math.hypot(dx, dy);
    const k = l > j.max ? j.max / l : 1;
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    const ang = Math.atan2(dy, dx);
    this.joyJet.style.transform = `rotate(${ang}rad) scaleX(${0.3 + j.t * 0.9})`;
    this.joyJet.style.opacity = String(0.3 + j.t * 0.7);
  }

  showJoyHint(on: boolean) {
    this.joyHint.classList.toggle('on', on && !save.tutorialDone);
    if (!on && !save.tutorialDone) save.tutorialDone = true;
  }

  flashHurt(p: number) {
    this.hurtEl.style.opacity = String(Math.min(0.7, 0.2 + p * 0.6));
    this.hurtEl.classList.remove('go');
    void this.hurtEl.offsetWidth;
    this.hurtEl.classList.add('go');
  }

  // ================================================================== overlays
  private buildOverlays() {
    this.introEl = el('div', 'overlay intro');
    this.root.appendChild(this.introEl);
    this.resultEl = el('div', 'overlay result');
    this.root.appendChild(this.resultEl);
    this.resultEl.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      this.h.click();
      this.resultEl.classList.remove('on');
      if (a === 'retry') this.h.retry();
      if (a === 'garage') this.h.openGarage();
      if (a === 'next') this.h.nextStage();
      if (a === 'stages') this.h.openStages();
    });
    this.pauseEl = el('div', 'overlay pause');
    this.pauseEl.innerHTML = `
      <div class="panel">
        <div class="p-title">잠깐 멈춤</div>
        <button class="btn yellow" data-a="resume">계속 날기</button>
        <button class="btn blue" data-a="retry">처음부터 다시</button>
        <button class="btn red" data-a="quit">스테이지 선택</button>
        <div class="p-row"><button class="chip" data-a="sfx"></button><button class="chip" data-a="music"></button></div>
      </div>`;
    this.pauseEl.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      this.h.click();
      if (a === 'resume') this.h.pause(false);
      if (a === 'retry') {
        this.h.pause(false);
        this.h.retry();
      }
      if (a === 'quit') {
        this.h.pause(false);
        this.h.quitToStages();
      }
      if (a === 'sfx') this.h.setSetting('sfx', !save.settings.sfx);
      if (a === 'music') this.h.setSetting('music', !save.settings.music);
      this.renderPause();
    });
    this.root.appendChild(this.pauseEl);
  }

  renderPause() {
    this.pauseEl.querySelector('[data-a=sfx]')!.textContent = save.settings.sfx ? '🔊 효과음' : '🔇 효과음';
    this.pauseEl.querySelector('[data-a=music]')!.textContent = save.settings.music ? '🎵 음악' : '🔕 음악';
  }

  showPause(on: boolean) {
    this.renderPause();
    this.pauseEl.classList.toggle('on', on);
  }

  showIntro(st: StageDef) {
    this.introEl.innerHTML = `
      <div class="intro-card">
        <div class="ic-label">오늘의 장난</div>
        <div class="ic-target">${ICON.target}<span>${st.targetName}</span></div>
        <div class="ic-brief">${st.brief}</div>
        <div class="ic-tip">방법은 마음대로! 직접 들이받든, 무너뜨리든, 이상한 걸 건드려보든…</div>
        <div class="ic-skip">탭해서 넘기기</div>
      </div>`;
    this.introEl.classList.add('on');
  }

  hideIntro() {
    this.introEl.classList.remove('on');
  }

  showResult(r: RunResult) {
    const st = r.stage;
    const prog = stageProg(st.id);
    const idx = this.stagesList.indexOf(st);
    const hasNext = r.success && idx >= 0 && idx < this.stagesList.length - 1;
    const rows: [string, number][] = [
      ['주운 병뚜껑', r.coins - r.perfect],
      ['장난 보너스', r.mischief],
    ];
    if (r.perfect) rows.push(['완벽한 발사', r.perfect]);
    if (r.reward) rows.push([r.firstClear ? '첫 성공 보상 x2' : r.newMethod ? '새 공략 보상' : '성공 보상', r.reward]);
    this.resultEl.innerHTML = `
      <div class="panel res ${r.success ? 'win' : 'lose'}">
        <div class="res-title">${r.success ? '장난 대성공!' : '이번엔 실패…'}</div>
        ${r.success ? `<div class="res-method">${r.methodName ?? ''}${r.newMethod ? '<span class="new">NEW!</span>' : ''}</div>` : `<div class="res-reason">${r.reason}</div>`}
        <div class="res-rows">${rows.map(([k, v], i) => `<div class="rr" style="animation-delay:${0.15 + i * 0.12}s"><span>${k}</span><b>+${v}</b></div>`).join('')}
          <div class="rr total" style="animation-delay:${0.2 + rows.length * 0.12}s"><span>합계</span><b>${ICON.cap}${r.total}</b></div>
        </div>
        ${r.gears.length ? `<div class="res-gears">${ICON.gear} 톱니바퀴 ${r.gears.length}개 획득!</div>` : ''}
        <div class="res-stats"><span>최고 고도 ${r.maxAlt}m</span><span>부순 물건 ${r.broken}개</span></div>
        <div class="res-methods">
          <div class="rm-label">이 장난의 공략법 (${st.methods.filter((m) => prog.methods[m.id]).length}/${st.methods.length})</div>
          <div class="rm-list">${st.methods.map((m) => `<span class="mbadge big ${prog.methods[m.id] ? 'on' : ''} ${r.cause === m.id ? 'now' : ''}">${prog.methods[m.id] ? m.icon : '?'}<small>${prog.methods[m.id] ? m.name : '???'}</small></span>`).join('')}</div>
          ${!r.success ? `<div class="rm-tip">💡 ${this.failTip(r)}</div>` : st.methods.some((m) => !prog.methods[m.id]) ? `<div class="rm-tip">💡 다른 방법으로도 해낼 수 있을까?</div>` : ''}
        </div>
        <div class="res-btns">
          <button class="btn big yellow" data-a="retry">다시 날리기!</button>
          <div class="res-row2">
            <button class="btn blue" data-a="garage">🔧 차고</button>
            ${hasNext ? '<button class="btn green" data-a="next">다음 장난 →</button>' : '<button class="btn" data-a="stages">스테이지</button>'}
          </div>
        </div>
      </div>`;
    setTimeout(() => this.resultEl.classList.add('on'), 50);
  }

  private failTip(r: RunResult) {
    const tips = [
      '연료가 모자라면 차고에서 더 큰 연료통을 연구해보자.',
      '로켓이 약하면 부딪히지 말고 돌아가거나, 튼튼한 동체를 써보자.',
      '맵 구석구석에 연료통과 톱니바퀴가 숨어 있다.',
      '손을 떼면 관성으로 날아간다 — 연료를 아껴 쓰자!',
      '무거운 로켓은 더 세게 부수지만 더 많은 추력이 필요하다.',
      '목표 주변의 이상한 물건들을 건드려보자.',
    ];
    if (r.reason.includes('연료')) return tips[Math.random() < 0.5 ? 0 : 3];
    if (r.reason.includes('대파')) return tips[1];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  hideResult() {
    this.resultEl.classList.remove('on');
  }
}
