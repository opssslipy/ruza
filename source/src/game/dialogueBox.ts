import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { DIALOGUE_EFFECTS } from '../content/effects';
import { Dialogue, type DialogueLine } from '../dialogue';
import { FONT } from '../config';
import { applyEffect, describeEffect } from './state';
import { getState, persist } from './store';

type Add = <T extends Phaser.GameObjects.GameObject>(o: T) => T;
export interface BoxOpts {
  scene: Phaser.Scene;
  width: number;
  height: number;
  add: Add;
  onClose: (characterId: string, helped: boolean) => void;
}

/** Applies the consequence once per game day per character, so talking over and over cannot be farmed. Returns a short summary. */
export function finishDialogue(characterId: string, dialogue: Dialogue): string {
  const s = getState();
  if (!s.talked.includes(characterId)) s.talked.push(characterId);
  const effects = DIALOGUE_EFFECTS[characterId];
  let result = '';
  if (effects && s.talkedDay[characterId] !== s.day) {
    s.talkedDay[characterId] = s.day;
    const eff = dialogue.getFlag(`${characterId}_helped`) ? effects.yes : effects.no;
    const msgs = applyEffect(s, eff);
    result = [describeEffect(eff), ...msgs].filter(Boolean).join('\n');
  } else if (effects) {
    result = 'Сегодня вы уже обсудили всё важное.';
  }
  persist();
  return result;
}

/** Conversation panel pinned to the bottom of the screen over the game world (no separate screen). */
export class DialogueBox {
  active = false;
  helped = false;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private dialogue: Dialogue | null = null;
  private characterId = '';
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private pick: ((i: number) => void) | null = null;

  constructor(private o: BoxOpts) {}

  open(characterId: string): void {
    const ch = CHARACTERS.find((c) => c.id === characterId);
    if (!ch?.ink) return;
    this.characterId = characterId;
    this.dialogue = new Dialogue(ch.ink);
    this.active = true;
    this.keyHandler = (e: KeyboardEvent): void => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) this.pick?.(n - 1);
      else if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'e') this.pick?.(0);
    };
    this.o.scene.input.keyboard?.on('keydown', this.keyHandler);
    this.render(this.dialogue.next());
  }

  close(): void {
    this.clear();
    if (this.keyHandler) this.o.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.keyHandler = null;
    this.pick = null;
    this.active = false;
    this.o.onClose(this.characterId, this.helped);
  }

  private clear(): void {
    this.objs.forEach((x) => x.destroy());
    this.objs = [];
  }

  private render(line: DialogueLine, result = ''): void {
    this.clear();
    const { scene, width: W, height: H } = this.o;
    const ch = CHARACTERS.find((c) => c.id === this.characterId);
    if (!ch) return;
    const track = <T extends Phaser.GameObjects.GameObject>(x: T): T => { this.objs.push(x); return this.o.add(x); };
    const compact = W < 520;
    const pw = Math.min(W - 16, 640), px = (W - pw) / 2;
    const ps = compact ? 76 : 100, pad = 12, D = 300;

    const bodyText = result ? `${line.text}\n\n${result}` : line.text;
    const nameT = track(scene.add.text(0, 0, ch.name, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff' }).setDepth(D + 2));
    const bodyT = track(scene.add.text(0, 0, bodyText, { fontFamily: FONT, fontSize: compact ? '16px' : '18px', color: result ? '#ffe9a8' : '#ffffff', wordWrap: { width: pw - ps - pad * 3 } }).setDepth(D + 2));
    const headerH = Math.max(ps, nameT.height + 6 + bodyT.height);
    const labels = line.ended ? ['Закрыть'] : line.choices;
    const btnH = 46, gap = 8;
    const total = pad + headerH + 10 + labels.length * (btnH + gap) - gap + pad;
    const top = H - 12 - total;

    track(scene.add.rectangle(px + pw / 2, top + total / 2, pw, total, 0x151c2b, 0.97).setStrokeStyle(2, 0x4a6a9a).setDepth(D));
    const key = `portrait-${ch.id}`;
    if (scene.textures.exists(key)) track(scene.add.image(px + pad + ps / 2, top + pad + ps / 2, key).setDisplaySize(ps, ps).setDepth(D + 1));
    else track(scene.add.rectangle(px + pad + ps / 2, top + pad + ps / 2, ps, ps, ch.color).setDepth(D + 1));
    track(scene.add.rectangle(px + pad + ps / 2, top + pad + ps / 2, ps, ps).setStrokeStyle(2, 0xffffff, 0.5).setDepth(D + 1));
    const tx = px + pad * 2 + ps;
    nameT.setPosition(tx, top + pad);
    bodyT.setPosition(tx, top + pad + nameT.height + 6);

    labels.forEach((text, i) => {
      const y = top + pad + headerH + 10 + i * (btnH + gap);
      const box = track(scene.add.rectangle(px + pw / 2, y + btnH / 2, pw - pad * 2, btnH, line.ended ? 0x3a5a3a : 0x2b3a55).setStrokeStyle(1, 0x6a8ab4).setDepth(D + 1).setInteractive({ useHandCursor: true }));
      track(scene.add.text(px + pw / 2, y + btnH / 2, line.ended ? text : `${i + 1}. ${text}`, { fontFamily: FONT, fontSize: compact ? '15px' : '16px', color: '#ffffff', align: 'center', wordWrap: { width: pw - pad * 4 } }).setOrigin(0.5).setDepth(D + 2));
      box.on('pointerdown', () => this.choose(i, line));
    });
    this.pick = (i: number): void => { if (i < labels.length) this.choose(i, line); };
  }

  private choose(i: number, line: DialogueLine): void {
    if (!this.dialogue) return;
    if (line.ended) { this.close(); return; }
    const next = this.dialogue.next(i);
    if (next.ended) this.helped = this.dialogue.getFlag(`${this.characterId}_helped`);
    this.render(next, next.ended ? finishDialogue(this.characterId, this.dialogue) : '');
  }
}
