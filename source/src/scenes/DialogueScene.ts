import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { Dialogue, type DialogueLine } from '../dialogue';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { loadSave, writeSave } from '../save';

export class DialogueScene extends Phaser.Scene {
  private dialogue!: Dialogue;
  private characterId = '';
  private ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('dialogue');
  }

  private returnTo = 'menu';

  init(data: { characterId: string; returnTo?: string }): void {
    this.characterId = data.characterId;
    this.returnTo = data.returnTo ?? 'menu';
  }

  preload(): void {
    const ch = CHARACTERS.find((c) => c.id === this.characterId);
    if (ch?.portrait && !this.textures.exists(`portrait-${ch.id}`)) {
      this.load.svg(`portrait-${ch.id}`, ch.portrait, { width: 260, height: 260 });
    }
  }

  create(): void {
    const ch = CHARACTERS.find((c) => c.id === this.characterId);
    if (!ch?.ink) {
      this.scene.start('menu');
      return;
    }
    this.dialogue = new Dialogue(ch.ink);

    const key = `portrait-${ch.id}`;
    if (this.textures.exists(key)) {
      this.add.image(GAME_WIDTH / 2, 190, key).setDisplaySize(260, 260);
    } else {
      this.add.rectangle(GAME_WIDTH / 2, 190, 260, 260, ch.color);
      this.add.text(GAME_WIDTH / 2, 190, ch.name.charAt(0), { fontFamily: FONT, fontSize: '120px', color: '#ffffff' }).setOrigin(0.5);
    }
    this.add.text(GAME_WIDTH / 2, 345, ch.name, { fontFamily: FONT, fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);

    this.show(this.dialogue.next());
  }

  private show(line: DialogueLine): void {
    this.ui.forEach((o) => o.destroy());
    this.ui = [];
    const wrap = { fontFamily: FONT, fontSize: '20px', color: '#ffffff', wordWrap: { width: GAME_WIDTH - 40 } };
    this.ui.push(this.add.text(20, 385, line.text, wrap));

    if (line.ended) {
      this.finish();
      const back = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 60, GAME_WIDTH - 40, 56, 0x444444).setInteractive();
      back.on('pointerdown', () => this.scene.start(this.returnTo));
      this.ui.push(back, this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Назад', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5));
      return;
    }

    line.choices.forEach((text, i) => {
      const y = GAME_HEIGHT - 60 - (line.choices.length - 1 - i) * 72;
      const box = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 40, 64, 0x2b3a55).setInteractive();
      box.on('pointerdown', () => this.show(this.dialogue.next(i)));
      this.ui.push(box, this.add.text(GAME_WIDTH / 2, y, text, { fontFamily: FONT, fontSize: '17px', color: '#ffffff', align: 'center', wordWrap: { width: GAME_WIDTH - 70 } }).setOrigin(0.5));
    });
  }

  private finish(): void {
    const save = loadSave();
    if (!save.talked.includes(this.characterId)) save.talked.push(this.characterId);
    save.flags[`${this.characterId}_helped`] = this.dialogue.getFlag(`${this.characterId}_helped`);
    writeSave(save);
  }
}

