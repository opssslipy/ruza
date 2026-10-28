import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { FONT, GAME_WIDTH } from '../config';
import { loadSave } from '../save';

const COLS = 2;
const CARD_W = 214;
const CARD_H = 64;
const GAP = 8;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  preload(): void {
    CHARACTERS.forEach((ch) => {
      if (ch.portrait) this.load.svg(`portrait-${ch.id}`, ch.portrait, { width: 240, height: 240 });
    });
  }

  create(): void {
    const save = loadSave();
    this.add.text(GAME_WIDTH / 2, 50, 'Руза', { fontFamily: FONT, fontSize: '40px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 92, 'Этап 0: поговори с друзьями', { fontFamily: FONT, fontSize: '18px', color: '#aaaaaa' }).setOrigin(0.5);

    const city = this.add.rectangle(GAME_WIDTH / 2, 790, GAME_WIDTH - 60, 54, 0x3a7a4a).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, 790, 'Выйти в город', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    city.on('pointerdown', () => this.scene.start('map'));

    CHARACTERS.forEach((ch, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = GAME_WIDTH / 2 + (col - 0.5) * (CARD_W + GAP);
      const y = 150 + row * (CARD_H + GAP);
      const talkable = !!ch.ink;
      const card = this.add.rectangle(x, y, CARD_W, CARD_H, ch.color, talkable ? 1 : 0.4);
      if (talkable) card.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('dialogue', { characterId: ch.id }));

      const key = `portrait-${ch.id}`;
      if (this.textures.exists(key)) this.add.image(x - CARD_W / 2 + 32, y, key).setDisplaySize(52, 52);
      else this.add.text(x - CARD_W / 2 + 32, y, ch.name.charAt(0), { fontFamily: FONT, fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);

      const mark = save.talked.includes(ch.id) ? ' ✓' : talkable ? '' : '\nскоро';
      this.add.text(x - CARD_W / 2 + 66, y, `${ch.name}${mark}`, { fontFamily: FONT, fontSize: '18px', color: '#ffffff' }).setOrigin(0, 0.5);
    });
  }
}

