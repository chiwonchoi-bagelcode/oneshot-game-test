/**
 * Q-PF-02 stress stage (test builds only): the real birthday house with its density pushed past
 * anything shipped — extra gift walls, glass, fireworks, water tanks and a burning kitchen — so
 * the worst chaos is measured first. Same systems and colliders as the shipped stage.
 */
import { LevelBuilder, StageDef } from '../game/level';
import { stage2 } from '../data/stage2';

export const stressStage: StageDef = {
  ...stage2,
  id: 'stress',
  name: '스트레스 시험 (개발용)',
  gearIds: [],
  build(b: LevelBuilder) {
    stage2.build(b);
    const FY = 8.4;
    // more party clutter in the party room
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) b.block(57.5 + c * 1.05, FY + 0.5 + r * 1.0, 0.95, 0.95, 'cardboard', { hp: 6, coins: 1 });
    for (let i = 0; i < 6; i++) b.block(66 + i * 0.9, FY + 0.6, 0.3, 1.2, 'glass', { hp: 3 });
    b.fireworks(64.5, FY + 0.5, 1.3, 1.0, { radius: 6, power: 70 });
    b.fireworks(84.0, 0.5, 1.3, 1.0, { radius: 6, power: 70 });
    b.waterTank(86.5, 2.2, 1.6, 2.0, 50);
    // ground floor: crates, plates and a kitchen fire
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) b.block(56 + c * 1.0, 0.45 + r * 0.9, 0.9, 0.85, r % 2 ? 'wood' : 'cardboard', { hp: 8, coins: 1 });
    for (let i = 0; i < 10; i++) b.block(80 + (i % 5) * 0.7, 2.6 + Math.floor(i / 5) * 0.4, 0.6, 0.12, 'ceramic', { hp: 2 });
    b.fire(70.5, 3.6, 0.8, 'none');
    // a second gift mountain outside the window to smash through on the way in
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) b.block(38 + c * 1.1, 0.55 + r * 1.05, 1.0, 1.0, 'cardboard', { hp: 6, coins: 1 });
  },
};
