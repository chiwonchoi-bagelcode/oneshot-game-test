// Generates docs/parts.md from src/data/parts.ts (run: npx tsx scripts/gen-parts-doc.ts)
import { writeFileSync } from 'node:fs';
import { PARTS, SLOTS, DEFAULT_LOADOUT, computeStats, flightCheck, allLoadouts } from '../src/data/parts';
import { STAGE_ECONOMY } from './economy-data';

const lines: string[] = ['# 부품 사전 (자동 생성)', '', '> `npx tsx scripts/gen-parts-doc.ts`로 다시 만든다. 수치는 초기값(체감 미승인).', ''];
for (const s of SLOTS) {
  lines.push(`## ${s.icon} ${s.name}`, '', '| ID | 이름 | 태그 | 질량 kg | 비용(병뚜껑/톱니) | 특성 | 기본 기체에 끼우면 추력비 |', '|---|---|---|---|---|---|---|');
  for (const p of PARTS.filter((pp) => pp.slot === s.id)) {
    const st = computeStats({ ...DEFAULT_LOADOUT, [s.id]: p.id } as any);
    lines.push(`| ${p.id} | ${p.name} | ${p.tag} | ${p.mass} | ${p.cost} / ${p.gears} | ${p.trait.replace(/\|/g, '/')} | ${st.twr.toFixed(2)} |`);
  }
  lines.push('');
}
const all = allLoadouts();
const legal = all.filter((l) => flightCheck(computeStats(l)).ok).length;
const weak = all.filter((l) => { const c = flightCheck(computeStats(l)); return c.ok && c.warn; }).length;
lines.push('## 합법 조합', '', `전체 ${all.length}개 중 출격 가능 ${legal}개(그중 간신히 뜨는 경고 ${weak}개), 출격 불가 ${all.length - legal}개 — 불가 조합은 모두 콜라 멘토스 엔진 + 무거운 부품. 출격 시 이유와 자동 수리를 보여준다.`, '');
const cost = PARTS.reduce((a, p) => a + p.cost, 0);
const gears = PARTS.reduce((a, p) => a + p.gears, 0);
lines.push('## 연구 총량', '', `병뚜껑 ${cost}, 톱니 ${gears} (톱니 공급 ${STAGE_ECONOMY.gears}개).`, '');
writeFileSync('docs/parts.md', lines.join('\n'));
console.log('docs/parts.md', legal, weak, cost, gears);
