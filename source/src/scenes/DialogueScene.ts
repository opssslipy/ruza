import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { DIALOGUE_EFFECTS } from '../content/effects';
import { Dialogue, type DialogueLine } from '../dialogue';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { applyEffect, describeEffect } from '../game/state';
import { getState, persist } from '../game/store';

export class DialogueScene extends Phaser.Scene {
  private dialogue!: Dialogue;
  private characterId = '';
  private returnTo = 'menu';
  private returnData: object = {};
  private ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('dialogue');
  }

  init(data: { characterId: string; returnTo?: string; returnData?: object }): void {
    this.characterId = data.characterId;
    this.returnTo = data.returnTo ?? 'menu';
    this.returnData = data.returnData ?? {};
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

  private show(line: DialogueLine, extra = ''): void {
    this.ui.forEach((o) => o.destroy());
    this.ui = [];
    const wrap = { fontFamily: FONT, fontSize: '20px', color: '#ffffff', wordWrap: { width: GAME_WIDTH - 40 } };
    this.ui.push(this.add.text(20, 385, line.text, wrap));

    if (line.ended) {
      const result = this.finish();
      if (result) this.ui.push(this.add.text(20, 560, result, { fontFamily: FONT, fontSize: '16px', color: '#ffe08a', wordWrap: { width: GAME_WIDTH - 40 } }));
      const back = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 60, GAME_WIDTH - 40, 56, 0x444444).setInteractive();
      back.on('pointerdown', () => this.leave());
      this.ui.push(back, this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Назад', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5));
      return;
    }

    void extra;
    line.choices.forEach((text, i) => {
      const y = GAME_HEIGHT - 60 - (line.choices.length - 1 - i) * 72;
      const box = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 40, 64, 0x2b3a55).setInteractive();
      box.on('pointerdown', () => this.show(this.dialogue.next(i)));
      this.ui.push(box, this.add.text(GAME_WIDTH / 2, y, text, { fontFamily: FONT, fontSize: '17px', color: '#ffffff', align: 'center', wordWrap: { width: GAME_WIDTH - 70 } }).setOrigin(0.5));
    });
  }

  /** Applies the consequence once per game day per character, so talking over and over cannot be farmed. */
  private finish(): string {
    const s = getState();
    if (!s.talked.includes(this.characterId)) s.talked.push(this.characterId);
    const effects = DIALOGUE_EFFECTS[this.characterId];
    let result = '';
    if (effects && s.talkedDay[this.characterId] !== s.day) {
      s.talkedDay[this.characterId] = s.day;
      const eff = this.dialogue.getFlag(`${this.characterId}_helped`) ? effects.yes : effects.no;
      const msgs = applyEffect(s, eff);
      result = [describeEffect(eff), ...msgs].filter(Boolean).join('\n');
    } else if (effects) {
      result = 'Сегодня вы уже обсудили всё важное.';
    }
    persist();
    return result;
  }

  private leave(): void {
    const s = getState();
    this.scene.start(s.ended ? 'end' : this.returnTo, this.returnData);
  }
}
