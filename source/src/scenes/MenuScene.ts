import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { whereIs } from '../content/schedules';
import { venueById } from '../content/venues';
import { fitColumn } from '../game/layout';
import { FONT, GAME_WIDTH } from '../config';
import { clockText } from '../game/state';
import { getState } from '../game/store';

const COLS = 2;
const CARD_W = 214;
const CARD_H = 64;
const GAP = 8;
const OTHER_PLACES: Record<string, string> = { square: 'Площадь Партизан', stadium: 'Стадион', busstation: 'Автостанция', fountain: 'Фонтан' };

// Friends list as a phone book: it shows where each friend is right now, so Stas can go and find them.
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  preload(): void {
    CHARACTERS.forEach((ch) => {
      if (ch.portrait && !this.textures.exists(`portrait-${ch.id}`)) this.load.svg(`portrait-${ch.id}`, ch.portrait, { width: 240, height: 240 });
    });
  }

  create(): void {
    fitColumn(this);
    const s = getState();
    this.add.text(GAME_WIDTH / 2, 40, 'Друзья', { fontFamily: FONT, fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 80, `Где кто сейчас · ${clockText(s)}`, { fontFamily: FONT, fontSize: '16px', color: '#aaaaaa' }).setOrigin(0.5);

    const city = this.add.rectangle(GAME_WIDTH / 2, 790, GAME_WIDTH - 60, 54, 0x3a7a4a).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, 790, 'Вернуться в город', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    city.on('pointerdown', () => this.scene.start('map'));

    CHARACTERS.forEach((ch, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = GAME_WIDTH / 2 + (col - 0.5) * (CARD_W + GAP);
      const y = 130 + row * (CARD_H + GAP);
      const known = !!ch.ink;
      this.add.rectangle(x, y, CARD_W, CARD_H, ch.color, known ? 1 : 0.4);
      const key = `portrait-${ch.id}`;
      if (this.textures.exists(key)) this.add.image(x - CARD_W / 2 + 32, y, key).setDisplaySize(52, 52);
      else this.add.text(x - CARD_W / 2 + 32, y, ch.name.charAt(0), { fontFamily: FONT, fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);

      const at = known ? whereIs(ch.id, s) : null;
      const place = !known ? 'скоро в игре' : at ? venueById(at)?.name ?? OTHER_PLACES[at] ?? at : 'не в городе';
      const mark = s.talked.includes(ch.id) ? ' ✓' : '';
      this.add.text(x - CARD_W / 2 + 66, y - 10, `${ch.name}${mark}`, { fontFamily: FONT, fontSize: '17px', color: '#ffffff' }).setOrigin(0, 0.5);
      this.add.text(x - CARD_W / 2 + 66, y + 12, place, { fontFamily: FONT, fontSize: '13px', color: '#e8e8e8' }).setOrigin(0, 0.5);
    });
  }
}
