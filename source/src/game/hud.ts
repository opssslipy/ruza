import Phaser from 'phaser';
import { FONT } from '../config';
import { clockText, SEASON_NAMES, seasonOf, type GameState } from './state';

const BARS: { key: 'satiety' | 'energy' | 'mood' | 'health' | 'wanted'; label: string; color: number }[] = [
  { key: 'satiety', label: 'Сытость', color: 0xe0a040 },
  { key: 'energy', label: 'Энергия', color: 0x4aa3ff },
  { key: 'mood', label: 'Настроение', color: 0xd070c0 },
  { key: 'health', label: 'Здоровье', color: 0x50c070 },
  { key: 'wanted', label: 'Розыск', color: 0xe05050 },
];

type Add = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

/** Status panel across the top. `add` lets the map put it on its UI layer; `width` follows the window. */
export function createHud(scene: Phaser.Scene, state: GameState, opts: { width?: number; add?: Add } = {}): { update: () => void } {
  const width = opts.width ?? 480;
  const add: Add = opts.add ?? ((o) => o);
  const depth = 100;
  add(scene.add.rectangle(width / 2, 31, width, 62, 0x000000, 0.62).setDepth(depth));
  const clock = add(scene.add.text(8, 5, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setDepth(depth + 1));
  const money = add(scene.add.text(width - 8, 5, '', { fontFamily: FONT, fontSize: '16px', color: '#9be59b' }).setOrigin(1, 0).setDepth(depth + 1));

  const gap = 8;
  const bw = Math.min(150, (width - 16 - gap * (BARS.length - 1)) / BARS.length);
  const x0 = (width - (bw * BARS.length + gap * (BARS.length - 1))) / 2;
  const fills = BARS.map((b, i) => {
    const x = x0 + i * (bw + gap);
    add(scene.add.text(x, 26, b.label, { fontFamily: FONT, fontSize: '10px', color: '#cccccc' }).setDepth(depth + 1));
    add(scene.add.rectangle(x, 42, bw, 10, 0x333333).setOrigin(0, 0.5).setDepth(depth + 1));
    return add(scene.add.rectangle(x, 42, bw, 10, b.color).setOrigin(0, 0.5).setDepth(depth + 2));
  });

  const update = (): void => {
    clock.setText(`${clockText(state)} · ${SEASON_NAMES[seasonOf(state)]}`);
    money.setText(`${Math.round(state.money)} ₽`).setColor(state.money < 0 ? '#ff7070' : '#9be59b');
    BARS.forEach((b, i) => {
      const v = Math.max(0, Math.min(100, state[b.key]));
      fills[i]?.setSize(Math.max(1, (bw * v) / 100), 10);
      // a need in the red zone turns the bar red so the player notices without reading numbers
      const danger = b.key === 'wanted' ? v > 70 : v < 20;
      fills[i]?.setFillStyle(danger ? 0xff3030 : b.color);
    });
  };
  update();
  return { update };
}
