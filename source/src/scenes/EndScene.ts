import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { endingText } from '../game/state';
import { getState, persist, restart } from '../game/store';

export class EndScene extends Phaser.Scene {
  constructor() {
    super('end');
  }

  create(): void {
    const s = getState();
    persist();
    const { title, text } = endingText(s.ended ?? 'week', s);
    const bad = s.ended !== 'week';
    this.cameras.main.setBackgroundColor(bad ? '#1a0e0e' : '#0e1a12');
    this.add.text(GAME_WIDTH / 2, 220, title, { fontFamily: FONT, fontSize: '34px', color: bad ? '#ff8a8a' : '#9be59b', align: 'center', wordWrap: { width: GAME_WIDTH - 50 } }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 380, text, { fontFamily: FONT, fontSize: '19px', color: '#ffffff', align: 'center', wordWrap: { width: GAME_WIDTH - 60 } }).setOrigin(0.5, 0);
    this.add.text(GAME_WIDTH / 2, 560, `Дней прожито: ${Math.min(s.day + 1, 7)}   Вырубался: ${s.passOuts}`, { fontFamily: FONT, fontSize: '16px', color: '#aaaaaa' }).setOrigin(0.5);

    const btn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 120, GAME_WIDTH - 80, 60, 0x3a7a4a).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 120, 'Начать заново', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
    btn.on('pointerdown', () => {
      this.registry.remove('mapPos');
      restart();
      this.scene.start('map');
    });
  }
}
