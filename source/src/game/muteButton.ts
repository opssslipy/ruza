import Phaser from 'phaser';
import { isMuted, setMuted, unlock } from './audio';
import { FONT } from '../config';

/** A small sound on/off switch in the corner. */
export function muteButton(scene: Phaser.Scene, x: number, y: number): void {
  const bg = scene.add.rectangle(x, y, 38, 30, 0x2b3a55, 0.9).setStrokeStyle(2, 0xffffff, 0.5).setDepth(110).setInteractive({ useHandCursor: true });
  const t = scene.add.text(x, y, '♪', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setDepth(111);
  const paint = (): void => { t.setAlpha(isMuted() ? 0.35 : 1); t.setText(isMuted() ? '♪̸' : '♪'); };
  paint();
  bg.on('pointerdown', () => { unlock(); setMuted(!isMuted()); paint(); });
}
