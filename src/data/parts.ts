export type Slot = 'body' | 'engine' | 'tank' | 'nose' | 'fins';

export const SLOTS: { id: Slot; name: string; icon: string }[] = [
  { id: 'body', name: '동체', icon: '🧴' },
  { id: 'engine', name: '엔진', icon: '🔥' },
  { id: 'tank', name: '연료통', icon: '🥛' },
  { id: 'nose', name: '노즈', icon: '🎉' },
  { id: 'fins', name: '날개', icon: '🪁' },
];

export interface PartDef {
  id: string;
  slot: Slot;
  name: string;
  /** one-line flavour */
  desc: string;
  /** qualitative trait that changes how you can play */
  trait: string;
  mass: number;
  cost: number; // coins
  gears: number; // research gears
  // body
  hull?: number;
  radius?: number;
  length?: number;
  drag?: number;
  armor?: number;
  // engine
  thrust?: number;
  burn?: number; // fuel units / s at full throttle
  spool?: number; // throttle response /s
  push?: number; // exhaust push force
  exhaust?: 'foam' | 'torch' | 'powder';
  // tank
  fuel?: number;
  // nose
  punch?: number; // breakthrough multiplier when hitting nose-first
  frontArmor?: number; // damage multiplier on nose hits
  knock?: number; // extra knockback multiplier on things we hit
  bounce?: number; // restitution override for nose hits
  // fins
  turn?: number; // rad/s
  turnAccel?: number;
  grip?: number; // lateral air grip
  glide?: boolean;
  tag: string; // short badge e.g. "돌파형"
}

export const PARTS: PartDef[] = [
  // ------------------------------------------------------------------ BODY
  {
    id: 'bottle', slot: 'body', name: '페트병 동체', tag: '가벼움',
    desc: '콜라 2L 페트병. 가볍고 날씬하다.',
    trait: '날씬해서 좁은 틈도 쏙 — 대신 충돌에 약하다.',
    mass: 0.9, cost: 0, gears: 0, hull: 90, radius: 0.3, length: 1.55, drag: 0.062, armor: 1,
  },
  {
    id: 'paint', slot: 'body', name: '페인트 통 동체', tag: '균형형',
    desc: '아빠 창고에서 슬쩍한 페인트 통. 묵직하다.',
    trait: '튼튼해서 나무판 정도는 그냥 뚫고 지나간다.',
    mass: 2.3, cost: 250, gears: 1, hull: 190, radius: 0.43, length: 1.45, drag: 0.07, armor: 1.15,
  },
  {
    id: 'cooker', slot: 'body', name: '압력솥 동체', tag: '돌파형',
    desc: '할머니의 무쇠 압력솥. 엄청 무겁다!',
    trait: '벽돌도 들이받는 탱크. 좁은 길은 못 지나가고 둔하다.',
    mass: 4.4, cost: 700, gears: 3, hull: 360, radius: 0.56, length: 1.5, drag: 0.08, armor: 1.45,
  },
  // ------------------------------------------------------------------ ENGINE
  {
    id: 'cola', slot: 'engine', name: '콜라 멘토스 엔진', tag: '기본',
    desc: '흔들고, 넣고, 뿜는다. 거품이 콸콸.',
    trait: '무난한 추진력. 거품 분사로 가벼운 물건을 밀 수 있다.',
    mass: 0.3, cost: 0, gears: 0, thrust: 54, burn: 9, spool: 7, push: 7, exhaust: 'foam',
  },
  {
    id: 'spray', slot: 'engine', name: '스프레이 토치', tag: '불꽃',
    desc: '스프레이 캔 세 개 + 라이터. 엄마한테 비밀.',
    trait: '불꽃을 뿜는다! 나무·종이·밧줄에 불을 붙여 태워버린다.',
    mass: 0.45, cost: 300, gears: 2, thrust: 72, burn: 11.5, spool: 10, push: 5, exhaust: 'torch',
  },
  {
    id: 'extinguisher', slot: 'engine', name: '소화기 부스터', tag: '괴력',
    desc: '학교 복도에서 빌려왔다(?). 반동이 무시무시하다.',
    trait: '엄청난 추진력과 분말 폭풍 — 불을 끄고 물건을 날려버린다. 연료를 많이 먹는다.',
    mass: 1.0, cost: 600, gears: 2, thrust: 125, burn: 17, spool: 4.2, push: 26, exhaust: 'powder',
  },
  // ------------------------------------------------------------------ TANK
  {
    id: 'milk', slot: 'tank', name: '우유팩 연료통', tag: '소형',
    desc: '1L 우유팩. 가볍지만 금방 바닥난다.',
    trait: '가벼운 기본 연료통.',
    mass: 0.2, cost: 0, gears: 0, fuel: 100,
  },
  {
    id: 'thermos', slot: 'tank', name: '보온병 연료통', tag: '중형',
    desc: '아빠 등산용 보온병.',
    trait: '연료 1.7배. 더 멀리 탐험할 수 있다.',
    mass: 0.5, cost: 200, gears: 1, fuel: 170,
  },
  {
    id: 'jug', slot: 'tank', name: '생수통 연료통', tag: '대형',
    desc: '정수기 생수통을 통째로!',
    trait: '연료 2.8배! 가득 차면 무거워서 굼뜨다 — 연료가 줄수록 가벼워진다.',
    mass: 0.9, cost: 500, gears: 2, fuel: 280,
  },
  // ------------------------------------------------------------------ NOSE
  {
    id: 'hat', slot: 'nose', name: '고깔모자', tag: '기본',
    desc: '생일 파티 고깔. 공기를 잘 가른다.',
    trait: '특별한 능력은 없지만 가볍다.',
    mass: 0.06, cost: 0, gears: 0, punch: 1, frontArmor: 1, knock: 1,
  },
  {
    id: 'pot', slot: 'nose', name: '냄비 투구', tag: '방어',
    desc: '라면 냄비를 거꾸로 씌웠다.',
    trait: '머리로 받을 때 피해 65% 감소. 박치기가 두렵지 않다.',
    mass: 0.55, cost: 150, gears: 1, punch: 1.2, frontArmor: 0.35, knock: 1.1,
  },
  {
    id: 'glove', slot: 'nose', name: '용수철 권투장갑', tag: '밀치기',
    desc: '용수철 끝에 권투 장갑. 뾰옹!',
    trait: '부수는 대신 튕겨내고 세게 밀친다 — 물건을 원하는 곳으로 날려라.',
    mass: 0.45, cost: 300, gears: 1, punch: 0.6, frontArmor: 0.4, knock: 3.2, bounce: 0.75,
  },
  {
    id: 'drill', slot: 'nose', name: '전동 드릴', tag: '관통',
    desc: '아빠 공구함의 보물. 위이이잉!',
    trait: '머리로 들이받을 때 돌파력 2.4배 — 벽돌벽도 뚫는다.',
    mass: 0.9, cost: 650, gears: 3, punch: 2.4, frontArmor: 0.6, knock: 1,
  },
  // ------------------------------------------------------------------ FINS
  {
    id: 'cardboard', slot: 'fins', name: '골판지 날개', tag: '기본',
    desc: '택배 상자를 오려 테이프로 붙였다.',
    trait: '무난한 선회력.',
    mass: 0.12, cost: 0, gears: 0, turn: 4.2, turnAccel: 22, grip: 1.0,
  },
  {
    id: 'umbrella', slot: 'fins', name: '우산 날개', tag: '활공',
    desc: '뒤집어진 우산을 날개로.',
    trait: '손을 떼면 우산이 펴져 천천히 활공 — 연료 없이 멀리 탐험.',
    mass: 0.35, cost: 250, gears: 1, turn: 4.0, turnAccel: 20, grip: 1.1, glide: true,
  },
  {
    id: 'gyro', slot: 'fins', name: '피젯 자이로', tag: '정밀',
    desc: '피젯 스피너 세 개로 만든 자이로.',
    trait: '칼같은 방향 전환과 강한 접지력 — 좁은 길을 정밀하게.',
    mass: 0.2, cost: 400, gears: 2, turn: 7.8, turnAccel: 55, grip: 1.9,
  },
];

export const partById = (id: string) => PARTS.find((p) => p.id === id)!;

export interface Loadout {
  body: string;
  engine: string;
  tank: string;
  nose: string;
  fins: string;
}

export const DEFAULT_LOADOUT: Loadout = { body: 'bottle', engine: 'cola', tank: 'milk', nose: 'hat', fins: 'cardboard' };

export const FUEL_MASS = 0.004; // kg per fuel unit
export const GRAVITY = 11;

export interface RocketStats {
  dryMass: number;
  fullMass: number;
  hull: number;
  radius: number;
  length: number;
  drag: number;
  armor: number;
  thrust: number;
  burn: number;
  spool: number;
  push: number;
  exhaust: 'foam' | 'torch' | 'powder';
  fuel: number;
  punch: number;
  frontArmor: number;
  knock: number;
  bounce: number;
  turn: number;
  turnAccel: number;
  grip: number;
  glide: boolean;
  twr: number;
  burnTime: number;
}

export function computeStats(l: Loadout): RocketStats {
  const b = partById(l.body);
  const e = partById(l.engine);
  const t = partById(l.tank);
  const n = partById(l.nose);
  const f = partById(l.fins);
  const dryMass = b.mass + e.mass + t.mass + n.mass + f.mass;
  const fuel = t.fuel!;
  const fullMass = dryMass + fuel * FUEL_MASS;
  const thrust = e.thrust!;
  return {
    dryMass,
    fullMass,
    hull: b.hull!,
    radius: b.radius!,
    length: b.length!,
    drag: b.drag! * (n.id === 'hat' ? 0.92 : 1),
    armor: b.armor!,
    thrust,
    burn: e.burn!,
    spool: e.spool!,
    push: e.push!,
    exhaust: e.exhaust!,
    fuel,
    punch: n.punch!,
    frontArmor: n.frontArmor!,
    knock: n.knock!,
    bounce: n.bounce ?? 0.22,
    turn: f.turn! * (b.id === 'cooker' ? 0.8 : b.id === 'paint' ? 0.92 : 1),
    turnAccel: f.turnAccel! * (b.id === 'cooker' ? 0.7 : b.id === 'paint' ? 0.88 : 1),
    grip: f.grip!,
    glide: !!f.glide,
    twr: thrust / (fullMass * GRAVITY),
    burnTime: fuel / e.burn!,
  };
}

/** Rough playstyle label from the build. */
export function styleLabel(s: RocketStats) {
  if (s.dryMass >= 4.5) return { name: '돌파형', color: '#d8573a' };
  if (s.dryMass <= 1.9 && s.turn >= 4) return { name: '회피형', color: '#3a9bd8' };
  return { name: '균형형', color: '#6bb34a' };
}
