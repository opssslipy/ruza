import Phaser from 'phaser';
import { FONT } from '../config';
import { sfx } from './audio';

export interface TimingConfig {
  title: string;
  intro: string;
  verb: string; // button text
  rounds: number;
  goodText: string;
  badText: string;
}
export interface TimingResult { good: number; rounds: number }
interface Opts {
  scene: Phaser.Scene;
  width: number;
  height: number;
  onGood: () => void;
  onDone: (r: TimingResult) => void;
}

/** A short rhythm game: a marker sweeps a bar, tap when it is inside the green zone; the score decides the bonus. */
export class TimingGame {
  active = false;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private cfg!: TimingConfig;
  private round = 0;
  private good = 0;
  private pos = 0;
  private dir = 1;
  private speed = 1;
  private zone = { a: 0.4, w: 0.22 };
  private marker: Phaser.GameObjects.Rectangle | null = null;
  private msg: Phaser.GameObjects.Text | null = null;
  private barX = 0;
  private barW = 0;
  private waiting = false;

  constructor(private o: Opts) {}

  open(cfg: TimingConfig): void {
    this.cfg = cfg;
    this.active = true;
    this.round = 0; this.good = 0;
    this.next();
  }

  private clear(): void { this.objs.forEach((x) => x.destroy()); this.objs = []; this.marker = null; this.msg = null; }
  private track<T extends Phaser.GameObjects.GameObject>(x: T): T { this.objs.push(x); return x; }

  private next(): void {
    this.clear();
    const { scene, width: W, height: H } = this.o;
    const pw = Math.min(W - 20, 440), ph = 320;
    const cx = W / 2, top = H / 2 - ph / 2 - 20;
    this.track(scene.add.rectangle(cx, top + ph / 2, pw, ph, 0x151c2b, 0.97).setStrokeStyle(2, 0x7a4dff).setDepth(300));
    this.track(scene.add.text(cx, top + 26, `${this.cfg.title}: ${this.round + 1} из ${this.cfg.rounds}`, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(301));
    this.track(scene.add.text(cx, top + 62, this.cfg.intro, { fontFamily: FONT, fontSize: '14px', color: '#c8cfe8', align: 'center', wordWrap: { width: pw - 30 } }).setOrigin(0.5).setDepth(301));
    this.barW = pw - 60; this.barX = cx - this.barW / 2;
    const y = top + 130;
    this.zone = { a: 0.12 + Math.random() * 0.6, w: Math.max(0.12, 0.26 - this.round * 0.02) };
    this.track(scene.add.rectangle(cx, y, this.barW, 28, 0x2a2f44).setStrokeStyle(2, 0x7a8ab4).setDepth(301));
    this.track(scene.add.rectangle(this.barX + (this.zone.a + this.zone.w / 2) * this.barW, y, this.zone.w * this.barW, 28, 0x3fcf7a).setDepth(302));
    this.marker = this.track(scene.add.rectangle(this.barX, y, 8, 40, 0xffffff).setStrokeStyle(2, 0x000000).setDepth(303));
    this.msg = this.track(scene.add.text(cx, top + 190, `Удачно: ${this.good}`, { fontFamily: FONT, fontSize: '17px', color: '#ffe08a', align: 'center', wordWrap: { width: pw - 30 } }).setOrigin(0.5).setDepth(301));
    const b = this.track(scene.add.rectangle(cx, top + 262, pw - 60, 56, 0x7a4dff).setStrokeStyle(1, 0xffffff, 0.5).setDepth(301).setInteractive({ useHandCursor: true }));
    this.track(scene.add.text(cx, top + 262, `${this.cfg.verb}  [E]`, { fontFamily: FONT, fontSize: '17px', color: '#fff' }).setOrigin(0.5).setDepth(302));
    b.on('pointerdown', () => this.press());
    this.pos = 0; this.dir = 1; this.speed = 1.0 + this.round * 0.18; this.waiting = false;
  }

  update(dt: number): void {
    if (!this.active || !this.marker || this.waiting) return;
    this.pos += this.dir * this.speed * dt;
    if (this.pos > 1) { this.pos = 1; this.dir = -1; } else if (this.pos < 0) { this.pos = 0; this.dir = 1; }
    this.marker.x = this.barX + this.pos * this.barW;
  }

  press(): void {
    if (!this.active || !this.marker || this.waiting) return;
    this.waiting = true;
    const ok = this.pos >= this.zone.a && this.pos <= this.zone.a + this.zone.w;
    if (ok) { this.good += 1; this.o.onGood(); sfx.good(); } else sfx.bad();
    this.msg?.setText(ok ? this.cfg.goodText : this.cfg.badText);
    this.round += 1;
    this.o.scene.time.delayedCall(700, () => {
      if (this.round >= this.cfg.rounds) { this.clear(); this.active = false; this.o.onDone({ good: this.good, rounds: this.cfg.rounds }); } else this.next();
    });
  }
}
