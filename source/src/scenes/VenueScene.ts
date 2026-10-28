import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { peopleAt } from '../content/schedules';
import { venueById, type Venue } from '../content/venues';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { applyEffect, describeEffect, sleepAtHome } from '../game/state';
import { getState, persist } from '../game/store';
import { createHud } from '../game/hud';

// Simplified interior: a room with the people who are here right now and the things Stas can do. No walking inside yet.
export class VenueScene extends Phaser.Scene {
  private venue!: Venue;
  private hud!: { update: () => void };
  private note!: Phaser.GameObjects.Text;
  private actionUi: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('venue');
  }

  init(data: { venueId: string }): void {
    const v = venueById(data.venueId);
    if (!v) throw new Error(`unknown venue ${data.venueId}`);
    this.venue = v;
  }

  preload(): void {
    for (const ch of CHARACTERS) {
      if (ch.portrait && !this.textures.exists(`portrait-${ch.id}`)) this.load.svg(`portrait-${ch.id}`, ch.portrait, { width: 240, height: 240 });
    }
  }

  create(): void {
    const s = getState();
    this.cameras.main.setBackgroundColor('#14110f');
    this.hud = createHud(this, s);
    this.add.text(GAME_WIDTH / 2, 90, this.venue.name, { fontFamily: FONT, fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);

    // room
    this.add.rectangle(GAME_WIDTH / 2, 290, 440, 330, this.venue.floor);
    this.add.rectangle(GAME_WIDTH / 2, 140, 440, 36, 0x000000, 0.35);
    let seed = [...this.venue.id].reduce((a, c) => a + c.charCodeAt(0), 7);
    const rnd = (): number => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(70 + rnd() * 340, 200 + rnd() * 180, 56, 34, 0x000000, 0.28).setStrokeStyle(2, 0x000000, 0.3);
    }

    // people who are here now (from the schedules): tap to talk
    const ids = peopleAt(this.venue.id, s).filter((id) => CHARACTERS.find((c) => c.id === id)?.ink);
    ids.forEach((id, i) => {
      const ch = CHARACTERS.find((c) => c.id === id);
      if (!ch) return;
      const x = 60 + ((i % 4) * 120) + 60 * (Math.floor(i / 4) % 2), y = 215 + Math.floor(i / 4) * 105;
      const key = `portrait-${id}`;
      const ring = this.add.circle(x, y, 36, ch.color).setInteractive({ useHandCursor: true });
      if (this.textures.exists(key)) this.add.image(x, y, key).setDisplaySize(62, 62);
      this.add.text(x, y + 46, ch.name, { fontFamily: FONT, fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
      ring.on('pointerdown', () => {
        persist();
        this.scene.start('dialogue', { characterId: id, returnTo: 'venue', returnData: { venueId: this.venue.id } });
      });
    });
    if (!ids.length) this.add.text(GAME_WIDTH / 2, 300, 'Сейчас здесь никого из своих', { fontFamily: FONT, fontSize: '16px', color: '#cccccc' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 470, ids.length ? 'Нажми на друга, чтобы поговорить' : '', { fontFamily: FONT, fontSize: '13px', color: '#aaaaaa' }).setOrigin(0.5);

    this.note = this.add.text(GAME_WIDTH / 2, 515, '', { fontFamily: FONT, fontSize: '16px', color: '#ffe08a', align: 'center', wordWrap: { width: GAME_WIDTH - 40 } }).setOrigin(0.5);
    this.drawActions();
  }

  private drawActions(): void {
    this.actionUi.forEach((o) => o.destroy());
    this.actionUi = [];
    const s = getState();
    this.venue.actions.forEach((a, i) => {
      const y = 590 + i * 60;
      const reason = a.blocked?.(s) ?? null;
      const box = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 40, 52, reason ? 0x2a2a2a : 0x2b5a8a).setInteractive({ useHandCursor: true });
      const text = this.add.text(GAME_WIDTH / 2, y, reason ? `${a.label}  [${reason}]` : a.label, { fontFamily: FONT, fontSize: '15px', color: reason ? '#888888' : '#ffffff', align: 'center', wordWrap: { width: GAME_WIDTH - 60 } }).setOrigin(0.5);
      this.actionUi.push(box, text);
      box.on('pointerdown', () => (reason ? this.note.setText(reason) : this.run(i)));
    });
    const exit = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 46, GAME_WIDTH - 40, 52, 0x444444).setInteractive({ useHandCursor: true });
    const exitText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 46, 'Выйти на улицу', { fontFamily: FONT, fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    this.actionUi.push(exit, exitText);
    exit.on('pointerdown', () => {
      persist();
      this.scene.start('map');
    });
  }

  private run(i: number): void {
    const a = this.venue.actions[i];
    if (!a) return;
    const s = getState();
    if (a.special === 'work') {
      persist();
      this.scene.start('calls');
      return;
    }
    const msgs = a.special === 'sleep' ? sleepAtHome(s, 8) : applyEffect(s, a.effect);
    const summary = a.special === 'sleep' ? 'Проспал 8 часов: энергия восстановилась' : describeEffect(a.effect);
    this.note.setText([summary, ...msgs].filter(Boolean).join('\n'));
    persist();
    this.hud.update();
    if (s.ended) this.time.delayedCall(1200, () => this.scene.start('end'));
    else this.drawActions();
  }
}
