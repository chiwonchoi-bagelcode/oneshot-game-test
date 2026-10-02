import { ICON } from './icons';
import type { StageDef } from '../game/level';
import type { RunResult } from '../game/flight';
import { PARTS, SLOTS, Slot, computeStats, partById, styleLabel, PartDef, Loadout, flightCheck } from '../data/parts';
import { gearsAvailable, save, stageProg, Settings } from '../core/save';

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
  setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void;
  resetSave(): void;
  /** true when the equipped build can fly; otherwise explains and offers a fix (C-033, C-103) */
  checkBuild(): boolean;
  autoFixBuild(): void;
  click(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Screen = 'title' | 'stages' | 'garage' | 'flight' | 'none';

/**
 * DOM layer. Overlays (pause, settings, confirm, result) are modal dialogs: they take focus,
 * trap Tab, close with Escape where it is safe, and swallow input so nothing reaches the flight.
 */
export class UI {
  root: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  private fuelBar!: HTMLElement;
  private hullBar!: HTMLElement;
  private fuelTxt!: HTMLElement;
  private hullTxt!: HTMLElement;
  private coinTxt!: HTMLElement;
  private gearTxt!: HTMLElement;
  private altTxt!: HTMLElement;
  private targetEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private coachEl!: HTMLElement;
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
  private settingsEl!: HTMLElement;
  private confirmEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private bannerTimer = 0;
  private coachTimer = 0;
  private portraitEl!: HTMLElement;
  private sayEl!: HTMLElement;
  private sayTimer = 0;
  private current: Screen = 'none';
  private modalStack: { el: HTMLElement; restore: Element | null; onEsc?: () => void }[] = [];
  stagesList: StageDef[] = [];
  garageSlot: Slot = 'body';
  private lastHud = { fuel: -1, hull: -1, coins: -1, gears: -1, alt: -1 };
  /** called by the app when settings open/close during a flight */
  onSettingsClosed?: () => void;

  constructor(root: HTMLElement, public h: UIHandlers) {
    this.root = root;
    this.buildTitle();
    this.buildStages();
    this.buildGarage();
    this.buildHud();
    this.buildOverlays();
    root.addEventListener('keydown', (e) => this.onKey(e));
    this.applyTextSize();
  }

  /** Is a modal dialog currently open (pause/settings/confirm/result)? */
  modalOpen() {
    return this.modalStack.length > 0;
  }

  show(s: Screen) {
    this.current = s;
    for (const [k, e] of Object.entries(this.screens)) {
      const on = k === s;
      e.classList.toggle('on', on);
      e.toggleAttribute('inert', !on);
    }
    if (s === 'stages') this.renderStages();
    if (s === 'garage') this.renderGarage();
    if (s === 'title') this.renderTitle();
    // move focus into the new screen for keyboard users
    if (s !== 'flight' && !this.modalOpen()) requestAnimationFrame(() => (this.screens[s]?.querySelector('[data-focus]') as HTMLElement | null)?.focus({ preventScroll: true }));
  }

  applyTextSize() {
    document.documentElement.classList.toggle('big-text', save.settings.bigText);
    document.documentElement.classList.toggle('reduce-motion', save.settings.reduceMotion);
  }

  // ================================================================== modal plumbing
  private openModal(elm: HTMLElement, onEsc?: () => void) {
    if (this.modalStack.some((m) => m.el === elm)) return;
    this.modalStack.push({ el: elm, restore: document.activeElement, onEsc });
    elm.classList.add('on');
    elm.setAttribute('role', 'dialog');
    elm.setAttribute('aria-modal', 'true');
    for (const s of Object.values(this.screens)) s.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(() => {
      const f = (elm.querySelector('[data-focus]') ?? elm.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])')) as HTMLElement | null;
      f?.focus({ preventScroll: true });
    });
  }

  private closeModal(elm: HTMLElement) {
    const i = this.modalStack.findIndex((m) => m.el === elm);
    elm.classList.remove('on');
    if (i < 0) return;
    const [m] = this.modalStack.splice(i, 1);
    if (!this.modalStack.length) for (const s of Object.values(this.screens)) s.removeAttribute('aria-hidden');
    (m.restore as HTMLElement | null)?.focus?.({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent) {
    const top = this.modalStack[this.modalStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      top.onEsc?.();
      return;
    }
    if (e.key === 'Tab') {
      // keep focus inside the dialog
      const f = Array.from(top.el.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /** Global Escape handled by the app when no dialog is open. */
  handleEscape(): boolean {
    const top = this.modalStack[this.modalStack.length - 1];
    if (top) {
      top.onEsc?.();
      return true;
    }
    return false;
  }

  toast(msg: string, action?: { label: string; run: () => void }) {
    const t = this.toastEl;
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="chip" data-toast-act>${esc(action.label)}</button>` : ''}`;
    if (action) (t.querySelector('[data-toast-act]') as HTMLElement).onclick = () => {
      this.h.click();
      action.run();
      t.classList.remove('on');
    };
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    t.classList.toggle('sticky', !!action);
    clearTimeout((t as any)._tm);
    (t as any)._tm = setTimeout(() => t.classList.remove('on'), action ? 4500 : 2200);
  }

  /** In-page confirmation (the frame refuses window.confirm). */
  confirm(title: string, body: string, ok: string, onOk: () => void, cancel: string | null = '취소', onCancel?: () => void, okStyle = 'red') {
    const c = this.confirmEl;
    c.innerHTML = `
      <div class="panel confirm-panel" aria-labelledby="cf-t">
        <div class="p-title" id="cf-t">${esc(title)}</div>
        <div class="cf-body">${body}</div>
        <div class="res-row2">${cancel !== null ? `<button class="btn" data-a="no" data-focus>${esc(cancel)}</button>` : ''}<button class="btn ${okStyle}" data-a="yes" ${cancel === null ? 'data-focus' : ''}>${esc(ok)}</button></div>
      </div>`;
    const close = () => this.closeModal(c);
    if (cancel !== null) (c.querySelector('[data-a=no]') as HTMLElement).onclick = () => {
      this.h.click();
      close();
      onCancel?.();
    };
    (c.querySelector('[data-a=yes]') as HTMLElement).onclick = () => {
      this.h.click();
      close();
      onOk();
    };
    this.openModal(c, () => {
      close();
      onCancel?.();
    });
  }

  /** Un-flyable build: say why, and offer the smallest fix with owned parts. */
  explainBuild(fixNames: string[]) {
    const chk = flightCheck(computeStats(save.equip));
    this.confirm(
      '이 로켓은 못 날아요',
      `<p>${esc(chk.reason)}</p><p class="cf-fix">💡 ${esc(chk.fix)}</p>${fixNames.length ? `<p class="cf-note">자동 수리: ${fixNames.map(esc).join(', ')}(으)로 바꿔요.</p>` : ''}`,
      '가볍게 고쳐줘',
      () => this.h.autoFixBuild(),
      '직접 고칠래',
      () => this.h.openGarage(),
      'green',
    );
  }

  // ================================================================== title
  private buildTitle() {
    const s = el('div', 'screen title');
    s.innerHTML = `
      <div class="logo" role="img" aria-label="보리의 폐품 로켓 대소동">
        <div class="logo-top">보리의</div>
        <div class="logo-main"><span>폐품</span> <span>로켓</span></div>
        <div class="logo-sub">대소동!</div>
        <div class="logo-en">JUNK ROCKET RUCKUS</div>
      </div>
      <div class="next-card" aria-live="polite"></div>
      <div class="title-btns">
        <button class="btn big yellow" data-a="play" data-focus>출격하기!</button>
        <div class="res-row2">
          <button class="btn blue" data-a="garage">🔧 차고</button>
          <button class="btn" data-a="settings" aria-label="설정">⚙️ 설정</button>
        </div>
      </div>
      <div class="wallet title-wallet"></div>
    `;
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      this.h.click();
      if (a === 'play') this.h.openStages();
      if (a === 'garage') this.h.openGarage();
      if (a === 'settings') this.openSettings();
      if (a === 'next') {
        const id = (e.target as HTMLElement).closest('[data-stage]')?.getAttribute('data-stage');
        if (id) this.h.play(id);
      }
    });
    this.screens.title = s;
    this.root.appendChild(s);
  }

  renderTitle() {
    const s = this.screens.title;
    s.querySelector('.title-wallet')!.innerHTML = this.walletHtml();
    // C-208: coming back tells you where you were and what to try next
    const next = this.nextGoal();
    s.querySelector('.next-card')!.innerHTML = next
      ? `<div class="nc-label">다음 장난</div><div class="nc-main">${esc(next.title)}</div><div class="nc-sub">${esc(next.sub)}</div>${next.stage ? `<button class="btn small green" data-a="next" data-stage="${next.stage}">바로 출격 →</button>` : ''}`
      : '';
  }

  private nextGoal(): { title: string; sub: string; stage?: string } | null {
    const affordable = PARTS.filter((p) => !save.owned[p.id] && save.coins >= p.cost && gearsAvailable() >= p.gears);
    if (affordable.length) return { title: `새 부품 연구 가능: ${affordable[0].name}`, sub: affordable[0].trait };
    for (let i = 0; i < this.stagesList.length; i++) {
      const st = this.stagesList[i];
      const prog = stageProg(st.id);
      const prev = i > 0 ? stageProg(this.stagesList[i - 1].id) : null;
      if (prev && !prev.cleared) break;
      if (!prog.cleared) return { title: `${i + 1}. ${st.name} — ${st.targetName}`, sub: prog.runs ? `${prog.runs}번 도전했어요. 다른 길이나 부품을 시험해보자!` : '첫 장난을 시작해보자!', stage: st.id };
    }
    const last = this.stagesList.find((s) => s.id === save.lastStage) ?? this.stagesList[0];
    if (!last) return null;
    const prog = stageProg(last.id);
    const left = last.methods.filter((m) => !prog.methods[m.id]);
    const gearsLeft = last.gearIds.filter((g) => !save.gearsFound[g]).length;
    if (left.length || gearsLeft)
      return { title: `${last.name}: 공략 ${last.methods.length - left.length}/${last.methods.length} · 톱니 ${last.gearIds.length - gearsLeft}/${last.gearIds.length}`, sub: left.length ? `💬 소문: ${left[0].hint}` : '숨은 톱니바퀴를 찾아보자!', stage: last.id };
    return { title: '모든 장난을 정복했어요! 🏆', sub: '좋아하는 무대에서 더 대담한 길로 다시 날아보세요.' };
  }

  private walletHtml() {
    return `<span class="pill" aria-label="병뚜껑 ${save.coins}개">${ICON.cap}<b>${save.coins}</b></span><span class="pill" aria-label="쓸 수 있는 톱니바퀴 ${gearsAvailable()}개">${ICON.gear}<b>${gearsAvailable()}</b></span>`;
  }

  // ================================================================== stages
  private buildStages() {
    const s = el('div', 'screen stages');
    s.innerHTML = `
      <div class="topbar"><button class="iconbtn" data-a="back" aria-label="뒤로">${ICON.back}</button><h1 class="tb-title">장난 고르기</h1><div class="wallet"></div></div>
      <div class="stage-list" role="list"></div>
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
          this.toast('이전 장난을 먼저 성공해야 열려요');
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
      const card = el('button', `stage-card c${i} ${locked ? 'locked' : ''} ${prog.cleared ? 'cleared' : ''}`);
      card.setAttribute('data-stage', st.id);
      card.setAttribute('role', 'listitem');
      if (i === 0 || (!locked && !prog.cleared)) card.setAttribute('data-focus', '');
      card.setAttribute('aria-label', `${i + 1}. ${st.name}, 목표 ${st.targetName}. ${locked ? '잠김: 이전 장난을 먼저 성공하세요.' : prog.cleared ? '성공함.' : '아직 성공 못함.'} 공략 ${methodsFound}/${st.methods.length}, 톱니 ${found}/${st.gearIds.length}`);
      if (locked) card.setAttribute('aria-disabled', 'true');
      card.innerHTML = `
        <span class="sc-num" aria-hidden="true">${i + 1}</span>
        <span class="sc-body">
          <span class="sc-name">${st.name}</span>
          <span class="sc-target">${ICON.target}<span>${st.targetName}</span></span>
          <span class="sc-brief">${st.brief}</span>
          <span class="sc-row">
            <span class="sc-methods">${st.methods.map((m) => `<span class="mbadge ${prog.methods[m.id] ? 'on' : ''}" title="${prog.methods[m.id] ? m.name : '아직 모르는 공략'}">${prog.methods[m.id] ? m.icon : '?'}</span>`).join('')}<span class="mcount">공략 ${methodsFound}/${st.methods.length}</span></span>
            <span class="sc-gears" title="숨은 톱니바퀴">${ICON.gear}${found}/${st.gearIds.length}<span class="gdots">${st.gearIds.map((g) => `<i class="${save.gearsFound[g] ? 'on' : ''}"></i>`).join('')}</span></span>
          </span>
          ${rumor && !locked && methodsFound < st.methods.length ? `<span class="sc-rumor">💬 소문: ${rumor.hint}</span>` : ''}
          ${prog.cleared && methodsFound === st.methods.length ? `<span class="sc-rumor gold">🏆 모든 공략 정복!${found < st.gearIds.length ? ` 남은 톱니 ${st.gearIds.length - found}개` : ''}</span>` : ''}
          ${prog.escapes ? `<span class="sc-esc">🏃 유유히 퇴장 ${prog.escapes}회</span>` : ''}
        </span>
        ${locked ? `<span class="sc-lock">${ICON.lock}<span>🔒 잠김 — 이전 장난을 먼저 성공하세요</span></span>` : ''}
        ${prog.cleared ? '<span class="sc-stamp">성공!</span>' : ''}
      `;
      list.appendChild(card);
    });
  }

  // ================================================================== garage
  private buildGarage() {
    const s = el('div', 'screen garage');
    s.innerHTML = `
      <div class="topbar"><button class="iconbtn" data-a="back" aria-label="뒤로">${ICON.back}</button><h1 class="tb-title">보리의 차고</h1><div class="wallet"></div></div>
      <div class="build-card" aria-live="polite"></div>
      <div class="sheet">
        <div class="slot-tabs" role="tablist" aria-label="부품 종류"></div>
        <div class="part-list" role="list"></div>
        <div class="sheet-foot"><button class="btn big yellow" data-a="go" data-focus>출격!</button></div>
      </div>
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
        if (this.h.checkBuild()) this.h.openStages();
        return;
      }
      if (slot) {
        this.h.click();
        this.garageSlot = slot;
        this.renderGarage();
        (this.screens.garage.querySelector(`[data-slot=${slot}]`) as HTMLElement | null)?.focus();
        return;
      }
      if (part && act === 'research') {
        this.h.click();
        this.askResearch(part);
        return;
      }
      if (part) {
        if (save.owned[part]) this.h.equip(part);
        else this.askResearch(part);
      }
    });
    this.screens.garage = s;
    this.root.appendChild(s);
  }

  /** Q-GR-09: before buying, show exactly what changes, what it costs and what is missing. */
  private askResearch(id: string) {
    const p = partById(id);
    const needCaps = Math.max(0, p.cost - save.coins);
    const needGears = Math.max(0, p.gears - gearsAvailable());
    const cur = computeStats(save.equip);
    const next = computeStats({ ...save.equip, [p.slot]: id } as Loadout);
    const row = (k: string, a: number, b: number, f: (n: number) => string) => `<tr><th>${k}</th><td>${f(a)}</td><td>→</td><td><b>${f(b)}</b></td></tr>`;
    const body = `
      <p class="cf-trait">✨ ${esc(p.trait)}</p>
      <table class="cf-table">
        ${row('무게', cur.fullMass, next.fullMass, (n) => n.toFixed(1) + 'kg')}
        ${row('추력비', cur.twr, next.twr, (n) => n.toFixed(2))}
        ${row('최대 출력 연료', cur.burnTime, next.burnTime, (n) => n.toFixed(0) + '초')}
        ${row('내구도', cur.hull, next.hull, (n) => n.toFixed(0))}
        ${row('선회', cur.turn, next.turn, (n) => n.toFixed(1))}
      </table>
      <p class="cf-cost">비용: ${ICON.cap}${p.cost}${p.gears ? ` · ${ICON.gear}${p.gears}` : ''}</p>
      ${needCaps || needGears ? `<p class="cf-need">부족: ${needCaps ? `병뚜껑 ${needCaps}개 ` : ''}${needGears ? `톱니바퀴 ${needGears}개 (무대 곳곳에 숨어 있어요)` : ''}</p>` : '<p class="cf-note">연구하면 바로 장착돼요. 예전 부품으로 언제든 다시 바꿀 수 있어요(무료).</p>'}`;
    if (needCaps || needGears) {
      this.confirm(p.name, body, '닫기', () => {}, '확인');
      const yes = this.confirmEl.querySelector('[data-a=yes]') as HTMLElement;
      yes.style.display = 'none';
      return;
    }
    this.confirm(`${p.name} 연구`, body, '연구하기', () => this.h.research(id));
    const yes = this.confirmEl.querySelector('[data-a=yes]') as HTMLElement;
    yes.classList.remove('red');
    yes.classList.add('green');
  }

  renderGarage() {
    const s = this.screens.garage;
    s.querySelector('.wallet')!.innerHTML = this.walletHtml();
    const tabs = s.querySelector('.slot-tabs')!;
    tabs.innerHTML = SLOTS.map((sl) => {
      const eq = partById((save.equip as any)[sl.id]);
      const sel = sl.id === this.garageSlot;
      return `<button class="tab ${sel ? 'on' : ''}" role="tab" aria-selected="${sel}" data-slot="${sl.id}"><span class="tab-ico" aria-hidden="true">${sl.icon}</span><span class="tab-name">${sl.name}</span><span class="tab-eq">${eq.name.replace(/ (동체|엔진|연료통|날개)$/, '')}</span></button>`;
    }).join('');
    const list = s.querySelector('.part-list')!;
    const parts = PARTS.filter((p) => p.slot === this.garageSlot);
    const cur = computeStats(save.equip);
    list.innerHTML = parts.map((p) => this.partCard(p, cur)).join('');
    const st = cur;
    const style = styleLabel(st);
    const chk = flightCheck(st);
    const bar = (label: string, v: number, max: number, txt: string, title: string) =>
      `<div class="stat" title="${title}"><span class="sl">${label}</span><span class="sb" aria-hidden="true"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span><span class="sv">${txt}</span></div>`;
    s.querySelector('.build-card')!.innerHTML = `
      <div class="bc-style" style="background:${style.color}">${style.name}</div>
      ${bar('무게', st.fullMass, 7, st.fullMass.toFixed(1) + 'kg', '연료를 가득 채운 무게')}
      ${bar('추력비', st.twr, 3, st.twr.toFixed(2), '1보다 커야 떠요. 클수록 잘 올라가요')}
      ${bar('연료', st.burnTime, 22, st.burnTime.toFixed(0) + '초', '최대 출력으로 계속 분사할 때 버티는 시간. 손을 떼면 연료가 줄지 않아요')}
      ${bar('내구도', st.hull, 380, String(st.hull), '부딪힘을 견디는 힘')}
      ${bar('선회', st.turn, 8, st.turn.toFixed(1), '방향을 바꾸는 빠르기')}
      ${bar('돌파력', st.dryMass * st.punch, 12, (st.dryMass * st.punch).toFixed(1), '정면으로 들이받아 부수는 힘(무게×노즈)')}
      <div class="bc-note">연료 = 최대 출력 기준</div>
      ${!chk.ok || chk.warn ? `<div class="bc-warn" role="alert">⚠ ${esc(chk.ok ? chk.warn! : chk.reason)}<br>💡 ${esc(chk.fix)}</div>` : ''}
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
      return `<span class="d ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))}${good ? '' : ''}</span>`;
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
    const state = equipped ? '장착 중' : owned ? '보유 — 탭해서 장착' : canAfford ? '연구 가능' : '잠김';
    const need = !owned && !canAfford ? `부족: ${save.coins < p.cost ? `병뚜껑 ${p.cost - save.coins}` : ''}${gearsAvailable() < p.gears ? ` 톱니 ${p.gears - gearsAvailable()}` : ''}` : '';
    return `
      <button class="part-card ${equipped ? 'equipped' : ''} ${owned ? 'owned' : 'locked'}" role="listitem" data-part="${p.id}" aria-pressed="${equipped}" aria-label="${p.name}. ${state}. ${p.trait}">
        <span class="pc-head"><span class="pc-name">${p.name}</span><span class="pc-tag">${p.tag}</span></span>
        <span class="pc-desc">${p.desc}</span>
        <span class="pc-trait">✨ ${p.trait}</span>
        <span class="pc-deltas">${deltas}</span>
        <span class="pc-foot">
          ${equipped ? '<span class="pc-eq">✓ 장착 중</span>' : owned ? '<span class="pc-own">보유 · 탭해서 장착</span>' : `<span class="pc-lock">${canAfford ? '' : '🔒 '}${need}</span><span class="btn small ${canAfford ? 'green' : 'gray'}" data-act="research" data-part="${p.id}">연구 ${ICON.cap}${p.cost} ${p.gears ? ICON.gear + p.gears : ''}</span>`}
        </span>
      </button>`;
  }

  // ================================================================== HUD
  private buildHud() {
    const s = el('div', 'screen hud');
    s.innerHTML = `
      <div class="hud-top">
        <div class="gauges">
          <div class="gauge fuel" title="연료">${ICON.fuel}<div class="gbar"><i></i></div><b class="gtxt fuel-t">100%</b></div>
          <div class="gauge hull" title="내구도">${ICON.hull}<div class="gbar"><i></i></div><b class="gtxt hull-t">100%</b></div>
        </div>
        <div class="hud-right">
          <span class="pill" aria-label="이번 판 병뚜껑">${ICON.cap}<b class="coin-t">0</b></span>
          <span class="pill" aria-label="이번 판 새 톱니">${ICON.gear}<b class="gear-t">0</b></span>
          <button class="iconbtn pause-b" aria-label="일시정지">${ICON.pause}</button>
        </div>
      </div>
      <div class="alt-t">${ICON.alt}<b>0</b>m</div>
      <div class="portrait" aria-hidden="true"><div class="pt-ring"></div></div>
      <div class="say" aria-live="polite"></div>
      <div class="target-mark"><div class="tm-arrow"></div><div class="tm-label"><span class="tm-ico">${ICON.target}</span><b class="tm-d">0</b>m</div></div>
      <div class="banner" aria-live="assertive"><div class="bn-t"></div><div class="bn-s"></div></div>
      <div class="prompt" aria-live="polite"></div>
      <div class="coach" aria-live="polite"></div>
      <div class="pops" aria-hidden="true"></div>
      <div class="joy" aria-hidden="true"><div class="joy-ring"></div><div class="joy-jet"></div><div class="joy-knob"></div></div>
      <div class="joy-hint" aria-hidden="true"><div class="jh-finger">${ICON.finger}</div><div class="jh-txt">끌어서 분사! ↓ 아래로 끌면 ↑ 위로</div></div>
      <div class="timing-ring" aria-hidden="true"><div class="tr-outer"></div><div class="tr-inner"></div><div class="tr-txt">지금 탭!</div></div>
      <div class="hurt" aria-hidden="true"></div>
    `;
    this.fuelBar = s.querySelector('.fuel .gbar i')!;
    this.hullBar = s.querySelector('.hull .gbar i')!;
    this.fuelTxt = s.querySelector('.fuel-t')!;
    this.hullTxt = s.querySelector('.hull-t')!;
    this.coinTxt = s.querySelector('.coin-t')!;
    this.gearTxt = s.querySelector('.gear-t')!;
    this.altTxt = s.querySelector('.alt-t b')!;
    this.targetEl = s.querySelector('.target-mark')!;
    this.bannerEl = s.querySelector('.banner')!;
    this.promptEl = s.querySelector('.prompt')!;
    this.coachEl = s.querySelector('.coach')!;
    this.popLayer = s.querySelector('.pops')!;
    this.joy = s.querySelector('.joy')!;
    this.joyKnob = s.querySelector('.joy-knob')!;
    this.joyJet = s.querySelector('.joy-jet')!;
    this.joyHint = s.querySelector('.joy-hint')!;
    this.ringEl = s.querySelector('.timing-ring')!;
    this.hurtEl = s.querySelector('.hurt')!;
    this.portraitEl = s.querySelector('.portrait')!;
    this.sayEl = s.querySelector('.say')!;
    const pb = s.querySelector('.pause-b') as HTMLElement;
    pb.addEventListener('pointerdown', (e) => e.stopPropagation());
    pb.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.click();
      this.h.pause(true);
    });
    this.screens.flight = s;
    this.root.appendChild(s);
  }

  /** Where the live kid portrait should be drawn (CSS px, top-left origin). */
  portraitRect(): { x: number; y: number; s: number } | null {
    if (this.current !== 'flight') return null;
    const r = this.portraitEl.getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    if (r.width < 4) return null;
    const inset = 4;
    return { x: Math.round(r.left - root.left + inset), y: Math.round(r.top - root.top + inset), s: Math.round(r.width - inset * 2) };
  }

  kidSay(text: string) {
    const s = this.sayEl;
    s.textContent = text;
    s.classList.remove('on');
    void s.offsetWidth;
    s.classList.add('on');
    clearTimeout(this.sayTimer);
    this.sayTimer = window.setTimeout(() => s.classList.remove('on'), 1700);
    this.portraitEl.classList.remove('talk');
    void this.portraitEl.offsetWidth;
    this.portraitEl.classList.add('talk');
  }

  showHud(on: boolean) {
    if (on) this.show('flight');
    this.lastHud = { fuel: -1, hull: -1, coins: -1, gears: -1, alt: -1 };
  }

  setHud(d: { fuel: number; hull: number; coins: number; gears: number; alt: number; boosting?: boolean; thrust?: number; empty?: boolean }) {
    const L = this.lastHud;
    if (Math.abs(d.fuel - L.fuel) > 0.002 || d.empty !== undefined) {
      this.fuelBar.style.transform = `scaleX(${d.fuel})`;
      const g = this.fuelBar.parentElement!.parentElement!;
      g.classList.toggle('low', d.fuel < 0.2 && d.fuel > 0);
      g.classList.toggle('boost', !!d.boosting);
      g.classList.toggle('empty', !!d.empty);
      g.classList.toggle('burn', (d.thrust ?? 0) > 0.05);
      this.fuelTxt.textContent = d.boosting ? '무료' : d.empty ? '0%' : `${Math.round(d.fuel * 100)}%`;
      L.fuel = d.fuel;
    }
    if (Math.abs(d.hull - L.hull) > 0.002) {
      this.hullBar.style.transform = `scaleX(${d.hull})`;
      this.hullBar.parentElement!.parentElement!.classList.toggle('low', d.hull < 0.3);
      this.hullTxt.textContent = `${Math.round(d.hull * 100)}%`;
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
    const inside = t.x > m && t.x < W - m && t.y > 150 && t.y < H - m;
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
      const sy = (H / 2 - m - 70) / Math.max(1e-3, Math.abs(dy));
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
    if (this.popLayer.childElementCount > 14) this.popLayer.firstElementChild?.remove();
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
    this.bannerTimer = window.setTimeout(() => b.classList.remove('on'), style === 'win' ? 3200 : 2400);
  }

  prompt(text: string | null, pulse = false) {
    this.promptEl.textContent = text ?? '';
    this.promptEl.classList.toggle('on', !!text);
    this.promptEl.classList.toggle('pulse', pulse);
  }

  /** Onboarding coach line (stays until the action is done). `ok` = short praise that fades. */
  coach(text: string | null, ok = false) {
    clearTimeout(this.coachTimer);
    this.coachEl.textContent = text ?? '';
    this.coachEl.classList.toggle('on', !!text);
    this.coachEl.classList.toggle('ok', ok);
    if (ok) this.coachTimer = window.setTimeout(() => this.coachEl.classList.remove('on'), 1100);
  }

  timingRing(x: number, y: number, t: number, on: boolean, hot: boolean) {
    const r = this.ringEl;
    r.classList.toggle('on', on);
    if (!on) return;
    r.style.transform = `translate(${x}px, ${y}px)`;
    const s = 2.6 - t * 1.75;
    (r.querySelector('.tr-outer') as HTMLElement).style.transform = `translate(-50%,-50%) scale(${s})`;
    r.classList.toggle('hot', hot);
  }

  showJoystick(j: { ax: number; ay: number; px: number; py: number; t: number; max: number; dry?: boolean } | null) {
    if (!j) {
      this.joy.classList.remove('on');
      return;
    }
    this.joy.classList.add('on');
    this.joy.classList.toggle('dry', !!j.dry);
    this.joy.style.transform = `translate(${j.ax}px, ${j.ay}px)`;
    const dx = j.px - j.ax;
    const dy = j.py - j.ay;
    const l = Math.hypot(dx, dy);
    const k = l > j.max ? j.max / l : 1;
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    const ang = Math.atan2(dy, dx);
    this.joyJet.style.transform = `rotate(${ang}rad) scaleX(${0.3 + j.t * 0.9})`;
    this.joyJet.style.opacity = String(j.dry ? 0.25 : 0.3 + j.t * 0.7);
  }

  showJoyHint(on: boolean) {
    this.joyHint.classList.toggle('on', on);
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
    let resultLock = false;
    this.resultEl.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a || resultLock) return;
      // one transition per result screen, even with frantic tapping (C-177)
      resultLock = true;
      setTimeout(() => (resultLock = false), 400);
      this.h.click();
      this.closeModal(this.resultEl);
      if (a === 'retry') this.h.retry();
      if (a === 'garage') this.h.openGarage();
      if (a === 'next') this.h.nextStage();
      if (a === 'stages') this.h.openStages();
    });
    this.pauseEl = el('div', 'overlay pause');
    this.pauseEl.setAttribute('aria-label', '일시정지');
    this.pauseEl.innerHTML = `
      <div class="panel">
        <h2 class="p-title">잠깐 멈춤</h2>
        <button class="btn yellow" data-a="resume" data-focus>계속 날기</button>
        <button class="btn blue" data-a="retry">처음부터 다시</button>
        <button class="btn" data-a="settings">⚙️ 설정</button>
        <button class="btn red" data-a="quit">그만하고 나가기</button>
        <p class="p-note">나가거나 다시 하면 지금까지 주운 병뚜껑은 받아요. 성공 보상은 없어요.</p>
      </div>`;
    this.pauseEl.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      this.h.click();
      if (a === 'resume') this.h.pause(false);
      if (a === 'retry') this.h.retry();
      if (a === 'quit') this.h.quitToStages();
      if (a === 'settings') this.openSettings();
    });
    this.root.appendChild(this.pauseEl);
    this.settingsEl = el('div', 'overlay settings');
    this.settingsEl.setAttribute('aria-label', '설정');
    this.root.appendChild(this.settingsEl);
    this.confirmEl = el('div', 'overlay confirm');
    this.root.appendChild(this.confirmEl);
    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.root.appendChild(this.toastEl);
  }

  showPause(on: boolean) {
    if (on) this.openModal(this.pauseEl, () => this.h.pause(false));
    else this.closeModal(this.pauseEl);
  }

  // ---------------------------------------------------------------- settings (C-118/119, Q-VF-07)
  openSettings() {
    const S = save.settings;
    const c = this.settingsEl;
    const tog = (k: keyof Settings, label: string, desc = '') =>
      `<label class="set-row"><span><b>${label}</b>${desc ? `<small>${desc}</small>` : ''}</span><input type="checkbox" data-k="${k}" ${S[k] ? 'checked' : ''}></label>`;
    const range = (k: keyof Settings, label: string, min: number, max: number, step: number) =>
      `<label class="set-row"><span><b>${label}</b></span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"></label>`;
    c.innerHTML = `
      <div class="panel set-panel">
        <h2 class="p-title">설정</h2>
        <div class="set-list">
          <div class="set-h">소리·진동</div>
          ${tog('sfx', '효과음')}
          ${range('sfxVol', '효과음 크기', 0, 1, 0.05)}
          ${tog('music', '음악')}
          ${range('musicVol', '음악 크기', 0, 1, 0.05)}
          ${tog('vibration', '진동', '큰 충돌에만 짧게 울려요')}
          <div class="set-h">화면</div>
          <label class="set-row"><span><b>화면 흔들림</b></span><select data-k="shake"><option value="full" ${S.shake === 'full' ? 'selected' : ''}>보통</option><option value="reduced" ${S.shake === 'reduced' ? 'selected' : ''}>약하게</option><option value="off" ${S.shake === 'off' ? 'selected' : ''}>끄기</option></select></label>
          ${tog('flash', '번쩍임 효과', '폭발·피격 섬광')}
          ${tog('reduceMotion', '움직임 줄이기', '슬로모션·흔들림·멈칫 효과를 끕니다')}
          ${tog('bigText', '큰 글자')}
          <label class="set-row"><span><b>그래픽 품질</b><small>저사양: 블룸 끄기·작은 그림자</small></span><select data-k="quality"><option value="high" ${S.quality === 'high' ? 'selected' : ''}>고화질</option><option value="low" ${S.quality === 'low' ? 'selected' : ''}>저사양</option></select></label>
          <div class="set-h">조작</div>
          ${range('sensitivity', '조이스틱 감도', 0.6, 1.6, 0.1)}
          ${tog('tutorial', '조작 안내 보기', '무대1에서 다음 할 일을 알려줘요')}
          <button class="btn small" data-a="replay-tut">조작 안내 처음부터 다시 보기</button>
          <div class="set-h">저장</div>
          <p class="set-p">진행은 이 기기의 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 다른 기기에서는 이어지지 않아요.</p>
          <button class="btn small red" data-a="reset">진행 초기화…</button>
        </div>
        <button class="btn yellow" data-a="close" data-focus>닫기</button>
      </div>`;
    c.oninput = c.onchange = (e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      const k = t.getAttribute('data-k') as keyof Settings | null;
      if (!k) return;
      let v: any = t instanceof HTMLInputElement && t.type === 'checkbox' ? t.checked : t.value;
      if (t instanceof HTMLInputElement && t.type === 'range') v = Number(t.value);
      this.h.setSetting(k, v);
      this.applyTextSize();
    };
    c.onclick = (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (!a) return;
      this.h.click();
      if (a === 'close') this.closeSettings();
      if (a === 'replay-tut') {
        save.learned = {};
        save.tutorialDone = false;
        this.h.setSetting('tutorial', true);
        this.toast('무대1에서 조작 안내가 다시 나와요');
        (c.querySelector('[data-k=tutorial]') as HTMLInputElement).checked = true;
      }
      if (a === 'reset')
        this.confirm('진행을 지울까요?', '<p>병뚜껑·톱니바퀴·연구한 부품·공략 기록이 모두 사라지고 처음 상태로 돌아가요. 설정은 남아요.</p><p><b>되돌릴 수 없어요.</b></p>', '모두 지우기', () => {
          this.h.resetSave();
          this.closeSettings();
        });
    };
    this.openModal(c, () => this.closeSettings());
  }

  closeSettings() {
    this.closeModal(this.settingsEl);
    this.onSettingsClosed?.();
    if (this.current === 'title') this.renderTitle();
  }

  showIntro(st: StageDef) {
    this.introEl.innerHTML = `
      <div class="intro-card">
        <div class="ic-label">오늘의 장난</div>
        <div class="ic-target">${ICON.target}<span>${st.targetName}</span></div>
        <div class="ic-brief">${st.brief}</div>
        <div class="ic-tip">방법은 마음대로! 직접 들이받든, 무너뜨리든, 이상한 걸 건드려보든… 부순 뒤엔 유유히 빠져나오면 보너스!</div>
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
    if (r.escapeBonus) rows.push(['🏃 유유히 퇴장', r.escapeBonus]);
    const gearsLine = r.gears.length || r.gearsAgain
      ? `<div class="res-gears">${r.gears.length ? `${ICON.gear} 새 톱니바퀴 ${r.gears.length}개!` : ''}${r.gearsAgain ? ` <small>(이미 찾은 톱니 ${r.gearsAgain}개는 다시 받지 않아요)</small>` : ''}</div>`
      : '';
    this.resultEl.setAttribute('aria-label', r.success ? '장난 대성공 결과' : '실패 결과');
    this.resultEl.innerHTML = `
      <div class="panel res ${r.success ? 'win' : 'lose'}">
        <h2 class="res-title">${r.success ? '장난 대성공!' : '이번엔 실패…'}</h2>
        ${r.success ? `<div class="res-method">${r.methodName ?? ''}${r.newMethod ? '<span class="new">NEW!</span>' : ''}${r.escaped ? '<span class="esc">🏃 퇴장 성공</span>' : ''}</div>` : `<div class="res-reason">${esc(r.reason)}</div>`}
        <div class="res-rows">${rows.map(([k, v], i) => `<div class="rr" style="animation-delay:${0.15 + i * 0.12}s"><span>${k}</span><b>+${v}</b></div>`).join('')}
          <div class="rr total" style="animation-delay:${0.2 + rows.length * 0.12}s"><span>합계</span><b>${ICON.cap}${r.total}</b></div>
        </div>
        ${r.paid ? '' : '<div class="res-gears"><small>이 시도는 이미 정산됐어요</small></div>'}
        ${gearsLine}
        <div class="res-stats"><span>최고 고도 ${r.maxAlt}m</span><span>부순 물건 ${r.broken}개</span></div>
        <div class="res-methods">
          <div class="rm-label">이 장난의 공략법 (${st.methods.filter((m) => prog.methods[m.id]).length}/${st.methods.length})</div>
          <div class="rm-list">${st.methods.map((m) => `<span class="mbadge big ${prog.methods[m.id] ? 'on' : ''} ${r.cause === m.id ? 'now' : ''}">${prog.methods[m.id] ? m.icon : '?'}<small>${prog.methods[m.id] ? m.name : '???'}</small></span>`).join('')}</div>
          ${!r.success ? `<div class="rm-tip">💡 ${esc(r.tip || '다른 길이나 부품을 시험해보자.')}</div>` : st.methods.some((m) => !prog.methods[m.id]) ? `<div class="rm-tip">💡 다른 방법으로도 해낼 수 있을까?</div>` : ''}
        </div>
        <div class="res-btns">
          <button class="btn big yellow" data-a="retry" data-focus>다시 날리기!</button>
          <div class="res-row2">
            <button class="btn blue" data-a="garage">🔧 차고</button>
            ${hasNext ? '<button class="btn green" data-a="next">다음 장난 →</button>' : '<button class="btn" data-a="stages">무대 선택</button>'}
          </div>
        </div>
      </div>`;
    setTimeout(() => this.openModal(this.resultEl), 50);
  }

  hideResult() {
    this.closeModal(this.resultEl);
  }

  /** Close every dialog (screen change). */
  closeAll() {
    for (const m of [...this.modalStack]) this.closeModal(m.el);
    this.hideIntro();
  }
}
