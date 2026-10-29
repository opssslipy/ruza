import Phaser from 'phaser';
import { FONT } from '../config';

export interface HookahResult { mood: number; health: number; energy: number; text: string }
interface Opts {
  scene: Phaser.Scene;
  width: number;
  height: number;
  onPuff: () => void; // smoke burst in the room
  onDone: (r: HookahResult) => void;
}

const FLAVORS = [
  { name: 'Двойное яблоко', hint: 'классика, спокойно', mood: 5, energy: 0, health: 0 },
  { name: 'Мята и лайм', hint: 'бодрит', mood: 4, energy: 3, health: 0 },
  { name: 'Арбуз со льдом', hint: 'сладко, но першит', mood: 6, energy: 0, health: -1 },
];

/** Hookah mini-game: pick a flavour, then three puffs by tapping when the marker is in the green zone. */
export class HookahGame {
  active = false;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private flavor = 0;
  private puffs = 0;
  private good = 0;
  private cough = 0;
  private pos = 0; // marker 0..1
  private dir = 1;
  private speed = 1.0;
  private zone = { a: 0.4, w: 0.22 };
  private marker: Phaser.GameObjects.Rectangle | null = null;
  private barX = 0;
  private barW = 0;
  private msg: Phaser.GameObjects.Text | null = null;
  private waiting = false;

  constructor(private o: Opts) {}

  open(): void {
    this.active = true;
    this.chooseFlavor();
  }

  private clear(): void { this.objs.forEach((x) => x.destroy()); this.objs = []; this.marker = null; this.msg = null; }
  private track<T extends Phaser.GameObjects.GameObject>(x: T): T { this.objs.push(x); return x; }

  private panel(title: string): { cx: number; top: number; pw: number } {
    const { scene, width: W, height: H } = this.o;
    const pw = Math.min(W - 20, 440), ph = 320;
    const cx = W / 2, top = H / 2 - ph / 2 - 20;
    this.track(scene.add.rectangle(cx, top + ph / 2, pw, ph, 0x151c2b, 0.97).setStrokeStyle(2, 0x7a4dff).setDepth(300));
    this.track(scene.add.text(cx, top + 26, title, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(301));
    return { cx, top, pw };
  }

  private button(cx: number, y: number, w: number, text: string, color: number, fn: () => void, h = 50): void {
    const { scene } = this.o;
    const b = this.track(scene.add.rectangle(cx, y, w, h, color).setStrokeStyle(1, 0xffffff, 0.5).setDepth(301).setInteractive({ useHandCursor: true }));
    this.track(scene.add.text(cx, y, text, { fontFamily: FONT, fontSize: '16px', color: '#fff', align: 'center', wordWrap: { width: w - 16 } }).setOrigin(0.5).setDepth(302));
    b.on('pointerdown', fn);
  }

  private chooseFlavor(): void {
    this.clear();
    const { cx, top, pw } = this.panel('Кальян: выбери вкус');
    FLAVORS.forEach((f, i) => this.button(cx, top + 90 + i * 66, pw - 40, `${f.name}\n${f.hint}`, 0x2b3a55, () => { this.flavor = i; this.startPuffs(); }, 56));
  }

  private startPuffs(): void {
    this.clear();
    this.puffs = 0; this.good = 0; this.cough = 0; this.speed = 1.0; this.waiting = false;
    this.round();
  }

  private round(): void {
    this.clear();
    const { scene } = this.o;
    const { cx, top, pw } = this.panel(`Затяжка ${this.puffs + 1} из 3`);
    this.track(scene.add.text(cx, top + 62, 'Жми «Тянуть», когда метка в зелёной зоне', { fontFamily: FONT, fontSize: '14px', color: '#c8cfe8', align: 'center', wordWrap: { width: pw - 30 } }).setOrigin(0.5).setDepth(301));
    this.barW = pw - 60;
    this.barX = cx - this.barW / 2;
    const y = top + 130;
    this.zone = { a: 0.15 + Math.random() * 0.55, w: Math.max(0.12, 0.24 - this.puffs * 0.04) };
    this.track(scene.add.rectangle(cx, y, this.barW, 28, 0x2a2f44).setStrokeStyle(2, 0x7a8ab4).setDepth(301));
    this.track(scene.add.rectangle(this.barX + (this.zone.a + this.zone.w / 2) * this.barW, y, this.zone.w * this.barW, 28, 0x3fcf7a).setDepth(302));
    this.marker = this.track(scene.add.rectangle(this.barX, y, 8, 40, 0xffffff).setStrokeStyle(2, 0x000000).setDepth(303));
    this.msg = this.track(scene.add.text(cx, top + 190, '', { fontFamily: FONT, fontSize: '17px', color: '#ffe08a', align: 'center', wordWrap: { width: pw - 30 } }).setOrigin(0.5).setDepth(301));
    this.button(cx, top + 262, pw - 60, 'ТЯНУТЬ  [E]', 0x7a4dff, () => this.press(), 56);
    this.pos = 0; this.dir = 1; this.speed = 1.0 + this.puffs * 0.35; this.waiting = false;
  }

  /** Called from the scene's update while the game is open. */
  update(dt: number): void {
    if (!this.active || !this.marker || this.waiting) return;
    this.pos += this.dir * this.speed * dt;
    if (this.pos > 1) { this.pos = 1; this.dir = -1; } else if (this.pos < 0) { this.pos = 0; this.dir = 1; }
    this.marker.x = this.barX + this.pos * this.barW;
  }

  press(): void {
    if (!this.active || !this.marker || this.waiting) return;
    const ok = this.pos >= this.zone.a && this.pos <= this.zone.a + this.zone.w;
    this.waiting = true;
    if (ok) { this.good += 1; this.o.onPuff(); this.msg?.setText('Ровная затяжка, дым колечками.'); }
    else { this.cough += 1; this.msg?.setText('Закашлялся. Все смотрят.'); }
    this.puffs += 1;
    this.o.scene.time.delayedCall(900, () => (this.puffs >= 3 ? this.summary() : this.round()));
  }

  private summary(): void {
    this.clear();
    const f = FLAVORS[this.flavor] ?? (FLAVORS[0] as (typeof FLAVORS)[number]);
    const mood = f.mood + this.good * 3 - this.cough * 2;
    const health = -1 + f.health - this.cough * 2;
    const energy = -3 + f.energy;
    const text = `${f.name}. Удачных затяжек ${this.good} из 3, закашлялся ${this.cough} раз.`;
    const { cx, top, pw } = this.panel('Кальян выкурен');
    this.track(this.o.scene.add.text(cx, top + 120, `${text}\n\nНастроение ${mood >= 0 ? '+' : ''}${mood}, здоровье ${health}, энергия ${energy}\n−600 ₽, прошло 1,5 часа`, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: pw - 40 } }).setOrigin(0.5).setDepth(301));
    this.button(cx, top + 262, pw - 60, 'Готово', 0x3a7a4a, () => { this.clear(); this.active = false; this.o.onDone({ mood, health, energy, text }); }, 54);
  }
}
