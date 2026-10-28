import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { peopleAt } from '../content/schedules';
import { venueById, type Venue } from '../content/venues';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { DialogueBox } from '../game/dialogueBox';
import { createHud } from '../game/hud';
import { fitColumn } from '../game/layout';
import { ensureSprites } from '../game/sprites';
import { applyEffect, describeEffect, sleepAtHome } from '../game/state';
import { getState, persist } from '../game/store';

const RX = 20, RY = 125, RW = 440, RH = 330;

type Kind = 'bar' | 'shop' | 'gym' | 'home' | 'office' | 'medical' | 'culture' | 'garage';
const KIND: Record<string, Kind> = {
  dym: 'bar', ruzvelt: 'bar', mixbar: 'bar', pyaterochka: 'shop', shawarma: 'shop', pharmacy: 'shop', gym: 'gym', home: 'home',
  police: 'office', hospital: 'medical', teatre: 'culture', garages: 'garage',
};

// Simplified interior: a room with the people who are here right now and the things Stas can do. No walking inside yet.
export class VenueScene extends Phaser.Scene {
  private venue!: Venue;
  private hud!: { update: () => void };
  private note!: Phaser.GameObjects.Text;
  private actionUi: Phaser.GameObjects.GameObject[] = [];
  private box!: DialogueBox;

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
    fitColumn(this);
    ensureSprites(this);
    this.hud = createHud(this, s);
    this.add.text(GAME_WIDTH / 2, 90, this.venue.name, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    this.drawRoom(KIND[this.venue.id] ?? 'shop');

    // people who are here now (from the schedules): tap to talk
    const ids = peopleAt(this.venue.id, s).filter((id) => CHARACTERS.find((c) => c.id === id)?.ink);
    ids.forEach((id, i) => {
      const ch = CHARACTERS.find((c) => c.id === id);
      if (!ch) return;
      const x = RX + 70 + (i % 4) * 100, y = RY + 215 + Math.floor(i / 4) * 12;
      const spr = this.add.sprite(x, y, `fig-${id}`, 'down-0').setScale(0.85).setOrigin(0.5, 0.96).setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: spr, y: y - 2, duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.add.text(x, y + 6, ch.name, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0);
      spr.on('pointerdown', () => { if (!this.box.active) this.openDialogue(id); });
    });
    this.add.sprite(RX + RW / 2, RY + RH - 8, 'fig-stas', 'up-0').setScale(0.85).setOrigin(0.5, 0.96);
    this.add.text(GAME_WIDTH / 2, RY + RH + 22, ids.length ? 'Нажми на друга, чтобы поговорить' : 'Сейчас здесь никого из своих', { fontFamily: FONT, fontSize: '13px', color: '#aaaaaa' }).setOrigin(0.5);

    this.note = this.add.text(GAME_WIDTH / 2, 515, '', { fontFamily: FONT, fontSize: '16px', color: '#ffe08a', align: 'center', wordWrap: { width: GAME_WIDTH - 40 } }).setOrigin(0.5);
    this.drawActions();

    this.box = new DialogueBox({
      scene: this, width: GAME_WIDTH, height: GAME_HEIGHT, add: (o) => o,
      onClose: () => {
        this.hud.update();
        if (getState().ended) this.scene.start('end');
        else this.drawActions();
      },
    });
  }

  private openDialogue(id: string): void {
    this.actionUi.forEach((o) => o.destroy());
    this.actionUi = [];
    this.note.setText('');
    this.box.open(id);
  }

  // --- room decoration ----------------------------------------------------------------------------
  private R(x: number, y: number, w: number, h: number, color: number, alpha = 1, line?: number): Phaser.GameObjects.Rectangle {
    const r = this.add.rectangle(RX + x, RY + y, w, h, color, alpha).setOrigin(0, 0);
    if (line !== undefined) r.setStrokeStyle(2, line, 0.6);
    return r;
  }
  private C(x: number, y: number, rad: number, color: number): Phaser.GameObjects.Arc {
    return this.add.circle(RX + x, RY + y, rad, color).setStrokeStyle(2, 0x000000, 0.35);
  }

  private drawRoom(kind: Kind): void {
    const floor = this.venue.floor;
    this.add.rectangle(RX, RY, RW, RH, floor).setOrigin(0, 0);
    for (let x = 0; x < RW; x += 40) this.R(x, 0, 1, RH, 0x000000, 0.08);
    for (let y = 0; y < RH; y += 40) this.R(0, y, RW, 1, 0x000000, 0.08);
    this.R(0, 0, RW, 22, 0x000000, 0.35); // back wall
    switch (kind) {
      case 'bar':
        this.R(30, 4, 380, 10, 0x2a1d14);
        for (let i = 0; i < 14; i++) this.R(36 + i * 27, 0, 8, 12, [0x3da35d, 0xd0a030, 0xb04040, 0x4a90d0][i % 4] as number);
        this.R(30, 34, 380, 26, 0x6b4426, 1, 0x2a1d14);
        for (let i = 0; i < 7; i++) this.C(56 + i * 56, 78, 9, 0x8a2a2a);
        for (const [x, y] of [[90, 170], [230, 200], [360, 160]] as [number, number][]) {
          this.C(x, y, 24, 0x7a5232);
          for (let a = 0; a < 4; a++) this.C(x + Math.cos((a * Math.PI) / 2 + 0.7) * 34, y + Math.sin((a * Math.PI) / 2 + 0.7) * 34, 8, 0x3b3b4a);
        }
        if (this.venue.id === 'ruzvelt') for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) this.R(150 + i * 28, 250 + j * 24, 26, 22, (i + j) % 2 ? 0x6a3fc0 : 0x2fa0c0, 0.55);
        break;
      case 'shop':
        for (let i = 0; i < 3; i++) {
          this.R(30, 50 + i * 62, 250, 24, 0x9a8a6a, 1, 0x4a3a2a);
          for (let j = 0; j < 10; j++) this.R(36 + j * 24, 53 + i * 62, 16, 12, [0xd04a4a, 0x4a90d0, 0xe0c040, 0x5ab05a][(i + j) % 4] as number);
        }
        this.R(320, 50, 100, 200, 0x6a5a4a, 1, 0x2a1d14);
        this.R(338, 70, 34, 22, 0x2a2a2a);
        if (this.venue.id === 'pharmacy') { this.R(380, 4, 34, 14, 0xffffff); this.R(392, 2, 10, 18, 0xd03030); this.R(384, 8, 26, 6, 0xd03030); }
        if (this.venue.id === 'shawarma') { this.C(370, 150, 16, 0xb0713a); this.R(362, 120, 16, 60, 0x6a4020, 0.8); }
        break;
      case 'gym':
        this.R(30, 4, 380, 12, 0x9ac8e0, 0.8);
        for (let i = 0; i < 3; i++) { this.R(40 + i * 110, 36, 70, 120, 0x2a2f38, 1, 0x000000); this.R(48 + i * 110, 44, 54, 90, 0x4a525e); }
        this.R(50, 230, 130, 14, 0x6a2a2a); this.R(60, 220, 110, 8, 0x333333);
        this.R(260, 232, 140, 8, 0x444444); this.C(260, 236, 14, 0x222222); this.C(400, 236, 14, 0x222222);
        break;
      case 'home':
        this.R(30, 40, 110, 150, 0xcfd8e8, 1, 0x4a5a7a); this.R(36, 46, 98, 30, 0xffffff);
        this.R(200, 50, 150, 56, 0x8a4a4a, 1, 0x3a1a1a); this.R(210, 6, 130, 12, 0x111111);
        this.R(240, 170, 100, 60, 0x7a5a3a, 1, 0x3a2a1a); this.R(266, 180, 40, 26, 0x4a5a7a);
        this.R(380, 40, 44, 70, 0xe8eef2, 1, 0x7a8a9a);
        break;
      case 'office':
        for (let i = 0; i < 2; i++) { this.R(40 + i * 130, 60, 110, 50, 0x6a5a4a, 1, 0x2a1d14); this.R(70 + i * 130, 70, 30, 20, 0x2a3a4a); }
        this.R(300, 40, 120, 170, 0x2a2a2a, 0.5, 0x000000);
        for (let i = 0; i < 9; i++) this.R(310 + i * 12, 40, 3, 170, 0x9a9a9a);
        this.R(40, 200, 90, 30, 0x4a5a7a);
        break;
      case 'medical':
        for (let i = 0; i < 3; i++) { this.R(30 + i * 135, 50, 100, 56, 0xffffff, 1, 0x7a8a9a); this.R(30 + i * 135, 70, 100, 36, 0x7ab0d8); }
        this.C(220, 220, 26, 0xffffff); this.R(214, 200, 12, 40, 0xd03030); this.R(200, 214, 40, 12, 0xd03030);
        break;
      case 'culture':
        this.R(50, 6, 340, 14, 0xeeeeee);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) this.R(48 + c * 40, 70 + r * 50, 30, 26, 0x9a3a4a, 1, 0x3a1a1a);
        break;
      case 'garage':
        this.R(50, 60, 160, 90, 0xb04040, 1, 0x3a1a1a); this.R(75, 72, 110, 28, 0x9ac8e0); this.C(80, 152, 14, 0x222222); this.C(180, 152, 14, 0x222222);
        this.R(290, 40, 120, 210, 0x555555, 1, 0x222222);
        for (let i = 0; i < 4; i++) this.C(60 + i * 44, 230, 14, i % 2 ? 0x3a5a8a : 0x8a3a3a);
        break;
    }
  }

  // --- actions ----------------------------------------------------------------------------------------
  private drawActions(): void {
    this.actionUi.forEach((o) => o.destroy());
    this.actionUi = [];
    const s = getState();
    this.venue.actions.forEach((a, i) => {
      const y = 590 + i * 60;
      const reason = a.blocked?.(s) ?? null;
      const box = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 40, 52, reason ? 0x2a2a2a : 0x2b5a8a).setStrokeStyle(1, 0xffffff, 0.3).setInteractive({ useHandCursor: true });
      const text = this.add.text(GAME_WIDTH / 2, y, reason ? `${a.label}  [${reason}]` : a.label, { fontFamily: FONT, fontSize: '15px', color: reason ? '#888888' : '#ffffff', align: 'center', wordWrap: { width: GAME_WIDTH - 60 } }).setOrigin(0.5);
      this.actionUi.push(box, text);
      box.on('pointerdown', () => (reason ? this.note.setText(reason) : this.run(i)));
    });
    const exit = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 46, GAME_WIDTH - 40, 52, 0x444444).setStrokeStyle(1, 0xffffff, 0.3).setInteractive({ useHandCursor: true });
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
