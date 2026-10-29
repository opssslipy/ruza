import Phaser from 'phaser';
import { CALLS, CALLS_PER_ROUND, PAY_PER_SUCCESS, type Call } from '../content/calls';
import { fitColumn } from '../game/layout';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { applyEffect } from '../game/state';
import { getState, persist } from '../game/store';
import { createHud } from '../game/hud';

// Skillbox work: five cold calls. Each good reply earns commission; the round costs time, energy and nerves.
export class CallScene extends Phaser.Scene {
  private queue: Call[] = [];
  private ok = 0;
  private ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('calls');
  }

  create(): void {
    fitColumn(this);
    this.queue = Phaser.Utils.Array.Shuffle([...CALLS]).slice(0, CALLS_PER_ROUND);
    this.ok = 0;
    this.cameras.main.setBackgroundColor('#1b2230');
    createHud(this, getState());
    this.next();
  }

  private clear(): void {
    this.ui.forEach((o) => o.destroy());
    this.ui = [];
  }

  private next(): void {
    this.clear();
    const call = this.queue.shift();
    if (!call) return this.finish();
    const idx = CALLS_PER_ROUND - this.queue.length;
    this.ui.push(this.add.text(GAME_WIDTH / 2, 96, `Звонок ${idx} из ${CALLS_PER_ROUND}`, { fontFamily: FONT, fontSize: '16px', color: '#9fb4d8' }).setOrigin(0.5));
    this.ui.push(this.add.text(24, 140, `Клиент: «${call.client}»`, { fontFamily: FONT, fontSize: '21px', color: '#ffffff', wordWrap: { width: GAME_WIDTH - 48 } }));
    // shuffle visually but remember which one is right
    const order = Phaser.Utils.Array.Shuffle(call.options.map((text, i) => ({ text, good: i === call.good })));
    order.forEach((opt, i) => {
      const y = 430 + i * 118;
      const box = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 40, 104, 0x2b3a55).setInteractive({ useHandCursor: true });
      const label = this.add.text(GAME_WIDTH / 2, y, opt.text, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: GAME_WIDTH - 70 } }).setOrigin(0.5);
      this.ui.push(box, label);
      box.on('pointerdown', () => this.answer(opt.good));
    });
  }

  private answer(good: boolean): void {
    if (good) this.ok += 1;
    this.clear();
    this.ui.push(this.add.text(GAME_WIDTH / 2, 300, good ? 'Продажа! Клиент записался.' : 'Клиент бросил трубку.', { fontFamily: FONT, fontSize: '24px', color: good ? '#9be59b' : '#ff8a8a', align: 'center', wordWrap: { width: GAME_WIDTH - 60 } }).setOrigin(0.5));
    this.time.delayedCall(900, () => this.next());
  }

  private finish(): void {
    const s = getState();
    const earned = this.ok * PAY_PER_SUCCESS;
    s.workedToday += 1;
    const msgs = applyEffect(s, { money: earned, energy: -10, mood: this.ok >= 3 ? 2 : -6, minutes: 120 });
    persist();
    this.clear();
    const lines = [`Успешных звонков: ${this.ok} из ${CALLS_PER_ROUND}`, `Комиссия: +${earned} ₽`, 'Прошло два часа, ты устал.', ...msgs];
    this.ui.push(this.add.text(GAME_WIDTH / 2, 330, lines.join('\n'), { fontFamily: FONT, fontSize: '20px', color: '#ffffff', align: 'center', wordWrap: { width: GAME_WIDTH - 60 } }).setOrigin(0.5));
    const back = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 100, GAME_WIDTH - 80, 60, 0x3a7a4a).setInteractive({ useHandCursor: true });
    this.ui.push(back, this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100, 'Вернуться', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5));
    back.on('pointerdown', () => this.scene.start(s.ended ? 'end' : 'interior', { venueId: 'home' }));
  }
}

