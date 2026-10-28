import Phaser from 'phaser';
import { FONT, GAME_WIDTH } from '../config';
import { clockText, type GameState } from './state';

const BARS: { key: 'satiety' | 'energy' | 'mood' | 'health' | 'wanted'; label: string; color: number }[] = [
  { key: 'satiety', label: 'Сытость', color: 0xe0a040 },
  { key: 'energy', label: 'Энергия', color: 0x4aa3ff },
  { key: 'mood', label: 'Настроение', color: 0xd070c0 },
  { key: 'health', label: 'Здоровье', color: 0x50c070 },
  { key: 'wanted', label: 'Розыск', color: 0xe05050 },
];

/** Status panel pinned to the top of the screen; call update() every frame (cheap) or after a change. */
export function createHud(scene: Phaser.Scene, state: GameState): { update: () => void } {
  const depth = 100;
  scene.add.rectangle(GAME_WIDTH / 2, 31, GAME_WIDTH, 62, 0x000000, 0.6).setScrollFactor(0).setDepth(depth);
  const clock = scene.add.text(8, 5, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setScrollFactor(0).setDepth(depth + 1);
  const money = scene.add.text(GAME_WIDTH - 8, 5, '', { fontFamily: FONT, fontSize: '16px', color: '#9be59b' }).setOrigin(1, 0).setScrollFactor(0).setDepth(depth + 1);

  const bw = 84, gap = 8;
  const fills = BARS.map((b, i) => {
    const x = 8 + i * (bw + gap);
    scene.add.text(x, 26, b.label, { fontFamily: FONT, fontSize: '10px', color: '#cccccc' }).setScrollFactor(0).setDepth(depth + 1);
    scene.add.rectangle(x, 42, bw, 10, 0x333333).setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth + 1);
    return scene.add.rectangle(x, 42, bw, 10, b.color).setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth + 2);
  });

  const update = (): void => {
    clock.setText(clockText(state));
    money.setText(`${Math.round(state.money)} ₽`).setColor(state.money < 0 ? '#ff7070' : '#9be59b');
    BARS.forEach((b, i) => {
      const v = Math.max(0, Math.min(100, state[b.key]));
      fills[i]?.setSize(Math.max(1, (bw * v) / 100), 10);
      // a need in the red zone blinks the bar colour so the player notices without reading numbers
      const danger = b.key === 'wanted' ? v > 70 : v < 20;
      fills[i]?.setFillStyle(danger ? 0xff3030 : b.color);
    });
  };
  update();
  return { update };
}
