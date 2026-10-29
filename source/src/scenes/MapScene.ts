import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { whereIs } from '../content/schedules';
import { venueById } from '../content/venues';
import { FONT } from '../config';
import { advance, applyEffect, type Season, describeEffect, isWeekday, MAX_WORK_ROUNDS, type Effect, type GameState } from '../game/state';
import { createHud } from '../game/hud';
import { DialogueBox } from '../game/dialogueBox';
import { S, type Landmark, type MapData } from '../game/mapData';
import { getState, persist } from '../game/store';
import { fovFor, type World3D } from '../game/world3d';
import { getWorld } from '../game/worldHolder';
import { hasInterior } from './InteriorScene';
import { music, sfx, stopMusic } from '../game/audio';
import { muteButton } from '../game/muteButton';
import { EVENTS, eventDue, resolveEvent, rollEvent, type EventDef } from '../game/events';
import { currentTargets, offerQuest, onTalk, onVisit, tickQuests } from '../game/quests';

// Game logic works in "map pixels" (3 px = 1 m) as before; the 3D world is told positions in metres (px / S).
const SPEED = 92; // px/s = about 30 m/s: crossing the old town takes ~20 s
const TALK_RANGE = 52;
const ENTER_RANGE = 120;
const GAME_MINUTES_PER_SECOND = 4;
const SQUARE_RADIUS = 28 * S; // the whole square, in map px: music and the hang-out button work inside it
const HANGOUT = 'hangout'; // enterTarget value for the square, which is not a venue

interface Npc { id: string; name: string; x: number; y: number; visible: boolean; index: number }

export class MapScene extends Phaser.Scene {
  private map!: MapData;
  private bits!: Uint8Array;
  private state!: GameState;
  private w3!: World3D;
  private px = 0;
  private py = 0;
  private npcs: Npc[] = [];
  private hud!: { update: () => void };
  private box!: DialogueBox;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private stick = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, id: -1 };
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private talkBtn!: Phaser.GameObjects.Container;
  private talkLabel!: Phaser.GameObjects.Text;
  private enterBtn!: Phaser.GameObjects.Container;
  private enterLabel!: Phaser.GameObjects.Text;
  private talkTarget: string | null = null;
  private enterTarget: string | null = null;
  private place!: Phaser.GameObjects.Text;
  private quest!: Phaser.GameObjects.Text;
  private questSig = '';
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private clockAcc = 0;
  private saveAcc = 0;
  private lastPlacement = -1;
  private pinch = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingResize = false;
  private evObjs: Phaser.GameObjects.GameObject[] = [];
  private evChoose: (() => void)[] = []; // what keys 1-3 do while a random event is on screen
  private get paused(): boolean { return this.box.active || this.evObjs.length > 0; }

  constructor() {
    super('map');
  }

  preload(): void {
    this.load.json('map', 'map.json');
    CHARACTERS.forEach((ch) => {
      if (ch.portrait && !this.textures.exists(`portrait-${ch.id}`)) this.load.svg(`portrait-${ch.id}`, ch.portrait, { width: 240, height: 240 });
    });
  }

  create(): void {
    this.state = getState();
    this.map = this.cache.json.get('map') as MapData;
    this.bits = Uint8Array.from(atob(this.map.blocked), (c) => c.charCodeAt(0));
    this.npcs = [];
    this.lastPlacement = -1;
    this.clockAcc = 0;
    this.cameras.main.transparent = true; // the 3D world shows through; Phaser draws only the interface

    this.w3 = getWorld(this.map);
    this.w3.setTitleMode(false);
    this.w3.show(true);

    const W = this.scale.width, H = this.scale.height;
    const home = this.landmark('home');
    const saved = this.registry.get('mapPos') as { x: number; y: number } | undefined;
    const start = saved ?? this.nearestFree(home.pos[0] * S, home.pos[1] * S);
    this.px = start.x; this.py = start.y;

    // camera height: shows about 110 m across the screen by default, much more when zoomed out
    const aspect = W / H;
    const tanH = Math.tan((fovFor(aspect) * Math.PI) / 360) * aspect;
    this.w3.setDistance((this.registry.get('dist') as number | undefined) ?? 150 / (2 * tanH));
    this.w3.teleportCamera(this.px / S, this.py / S);
    this.state.season ??= 'autumn'; // saves from before seasons
    this.w3.setSeason(this.state.season);
    this.w3.addFigure('stas', null);
    CHARACTERS.filter((c) => c.ink).forEach((ch, i) => {
      this.w3.addFigure(ch.id, ch.name);
      this.npcs.push({ id: ch.id, name: ch.name, x: 0, y: 0, visible: false, index: i });
    });

    this.buildSquareCrowd();
    this.buildUi(W, H);
    this.setupInput();
    this.placeFriends();
    stopMusic();
    muteButton(this, W - 26, 80);

    const onResize = (): void => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => (this.paused ? (this.pendingResize = true) : this.scene.restart()), 250);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.registry.set('mapPos', { x: this.px, y: this.py });
      this.registry.set('dist', this.w3.getDistance());
      for (const id of ['stas', ...this.npcs.map((n) => n.id)]) this.w3.setFigure(id, 0, 0, false);
      this.w3.show(false);
      stopMusic();
      persist();
    });

    if (new URLSearchParams(location.search).has('debug')) {
      // test hook for automated checks only; reachable with ?debug in the URL
      Object.assign(window, {
        __ruza: {
          state: this.state,
          teleport: (id: string) => { const l = this.landmark(id); const p = this.nearestFree(l.pos[0] * S, l.pos[1] * S); this.px = p.x; this.py = p.y; this.w3.teleportCamera(p.x / S, p.y / S); },
          talk: (id: string) => this.box.open(id),
          goto: (x: number, z: number) => { const p = this.nearestFree(x * S, z * S); this.px = p.x; this.py = p.y; this.w3.teleportCamera(x, z); },
          near: (id: string) => { const n = this.npcs.find((x) => x.id === id); if (n?.visible) { this.px = n.x + 24; this.py = n.y + 6; this.w3.teleportCamera(this.px / S, this.py / S); } return !!n?.visible; },
          view: () => ({ w: this.scale.width, h: this.scale.height, dist: this.w3.getDistance(), life: this.w3.streetStats() }),
          setDistance: (d: number) => this.w3.setDistance(d),
          ui: () => ({ enter: this.enterBtn.visible ? this.enterLabel.text : '', target: this.enterTarget }),
          enter: () => this.enterVenue(),
          pos: () => ({ x: this.px / S, z: this.py / S }),
          season: (s: Season) => { this.state.season = s; this.w3.setSeason(s); },
          event: (id: string) => { const ev = EVENTS.find((x) => x.id === id); if (ev) this.showEvent(ev); return !!ev; },
          eventOpen: () => this.evObjs.length > 0,
        },
      });
    }
  }

  /** Four small circles of bystanders on free ground around the square; they only show up in the evening. */
  private buildSquareCrowd(): void {
    const sq = this.landmark('square'), fo = this.landmark('fountain');
    const spots: { x: number; z: number; yaw: number }[] = [];
    // two circles on the square itself and two by the fountain next to it
    const centres: [Landmark, number, number][] = [[sq, 0.6, 11], [sq, 3.7, 11], [fo, 1.2, 9], [fo, 4.3, 9]];
    for (let g = 0; g < centres.length; g++) {
      const [lm, ga, rad] = centres[g] as [Landmark, number, number];
      const c = this.nearestFree(lm.pos[0] * S + Math.cos(ga) * rad * S, lm.pos[1] * S + Math.sin(ga) * rad * S);
      const n = g % 2 ? 3 : 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = this.nearestFree(c.x + Math.cos(a) * 2.6 * S, c.y + Math.sin(a) * 2.6 * S);
        spots.push({ x: p.x / S, z: p.y / S, yaw: Math.atan2(c.x / S - p.x / S, c.y / S - p.y / S) });
      }
    }
    this.w3.addBystanders(spots);
  }

  /** A random street event: a panel with the story and one button per reply; time and movement stand still meanwhile. */
  private showEvent(ev: EventDef): void {
    this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
    this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
    const W = this.scale.width, H = this.scale.height;
    const pw = Math.min(W - 24, 460), x = W / 2;
    const portrait = ev.who && this.textures.exists(`portrait-${ev.who}`) ? `portrait-${ev.who}` : null;
    const txt = (y: number, s: string, size: number, color: string, ox = 0, bold = false): Phaser.GameObjects.Text => this.track(this.add.text(x + ox, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, wordWrap: { width: pw - 36 - Math.abs(ox) * 2 } }).setOrigin(0.5, 0).setDepth(212));
    const rows = ev.options.length;
    const ph = 170 + rows * 54;
    const top = Math.max(70, H / 2 - ph / 2 - 20);
    this.track(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45).setDepth(209).setInteractive());
    this.track(this.add.rectangle(x, top + ph / 2, pw, ph, 0x151c2b, 0.98).setStrokeStyle(2, 0xffd23a).setDepth(210));
    if (portrait) this.track(this.add.image(x - pw / 2 + 52, top + 54, portrait).setDisplaySize(66, 66).setDepth(212));
    const shift = portrait ? 40 : 0;
    txt(top + 14, ev.title, 19, '#ffd23a', shift, true);
    const body = txt(top + 46, ev.text, 15, '#e8ecf8', shift);
    let y = top + Math.max(100, 46 + body.height + 18);
    ev.options.forEach((o, i) => {
      const poor = !!o.needsMoney && this.state.money < o.needsMoney;
      const b = this.track(this.add.rectangle(x, y + 22, pw - 28, 46, poor ? 0x3a3f4d : 0x2b3a55).setStrokeStyle(1, 0xffffff, poor ? 0.2 : 0.6).setDepth(211));
      this.track(this.add.text(x, y + 22, `${i + 1}. ${o.label}${poor ? '  (не хватает денег)' : ''}`, { fontFamily: FONT, fontSize: '15px', color: poor ? '#8a90a0' : '#ffffff', align: 'center', wordWrap: { width: pw - 44 } }).setOrigin(0.5).setDepth(212));
      if (!poor) {
        const pick = (): void => this.resolveEventChoice(ev, i);
        b.setInteractive({ useHandCursor: true }).on('pointerdown', pick);
        this.evChoose[i] = pick;
      }
      y += 54;
    });
    sfx.quest();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T { this.evObjs.push(o); return o; }

  private closeEvent(): void {
    this.evObjs.forEach((o) => o.destroy());
    this.evObjs = [];
    this.evChoose = [];
    persist();
  }

  private resolveEventChoice(ev: EventDef, i: number): void {
    const lines = resolveEvent(this.state, ev, i);
    this.closeEvent();
    sfx.click();
    this.showToast(lines);
  }

  /** People gather on the square after 17:00, and on weekend afternoons. */
  private squareBusy(): boolean {
    const h = this.state.minutes / 60;
    return h >= 17 || (!isWeekday(this.state) && h >= 13);
  }

  /** Standing around with the crowd: time passes, mood goes up, more with every friend who is there. */
  private hangOut(): void {
    const sq = this.landmark('square');
    const friends = this.npcs.filter((n) => n.visible && Phaser.Math.Distance.Between(n.x, n.y, sq.pos[0] * S, sq.pos[1] * S) < SQUARE_RADIUS).length;
    const roll = Math.random();
    const fx: Effect = { minutes: 60, mood: 8 + friends * 4, energy: -3, satiety: -4 };
    const lines = [friends ? `На площади ${friends} из твоих. Посидели, поболтали.` : 'Музыка, незнакомые лица, вечер. Просто постоял.'];
    if (roll < 0.25) { lines.push('Парень с гитарой играет что-то душевное, все подпевают.'); fx.mood = (fx.mood ?? 0) + 4; }
    else if (roll < 0.4) { lines.push('Кто-то угостил пивом. Приятно, но голова тяжелеет.'); fx.health = -1; fx.mood = (fx.mood ?? 0) + 3; }
    else if (roll < 0.5) { lines.push('Скинулись на шаурму для компании.'); fx.money = -150; fx.satiety = 10; }
    this.showToast([...lines, describeEffect(fx), ...applyEffect(this.state, fx), ...onVisit(this.state, 'square')]);
    sfx.good();
    persist();
  }

  private landmark(id: string): Landmark {
    const l = this.map.landmarks.find((m) => m.id === id);
    if (!l) throw new Error(`landmark ${id} missing from map.json`);
    return l;
  }

  /** Friends stand at the place their (draft) schedule says; recomputed every 10 game minutes. */
  private placeFriends(): void {
    const stamp = this.state.day * 144 + Math.floor(this.state.minutes / 10);
    if (stamp === this.lastPlacement) return;
    this.lastPlacement = stamp;
    for (const n of this.npcs) {
      const at = whereIs(n.id, this.state);
      const l = at ? this.map.landmarks.find((m) => m.id === at) : undefined;
      if (!l) { n.visible = false; this.w3.setFigure(n.id, 0, 0, false); continue; }
      const a = n.index * 2.1;
      const rad = 60 + (n.index % 3) * 26;
      const spot = this.nearestFree(l.pos[0] * S + Math.cos(a) * rad, l.pos[1] * S + Math.sin(a) * rad);
      n.x = spot.x; n.y = spot.y; n.visible = true;
      this.w3.setFigure(n.id, spot.x / S, spot.y / S, true);
    }
  }

  // --- collision ---------------------------------------------------------------------------------
  private blockedAt(px: number, py: number): boolean {
    const gx = Math.floor(px / S / this.map.cell), gy = Math.floor(py / S / this.map.cell);
    if (gx < 0 || gy < 0 || gx >= this.map.gridW || gy >= this.map.gridH) return true;
    const i = gy * this.map.gridW + gx;
    return ((this.bits[i >> 3] as number) & (1 << (i & 7))) !== 0;
  }

  private blockedBody(px: number, py: number): boolean {
    const r = 7;
    return this.blockedAt(px - r, py - r) || this.blockedAt(px + r, py - r) || this.blockedAt(px - r, py + r) || this.blockedAt(px + r, py + r);
  }

  private nearestFree(px: number, py: number): { x: number; y: number } {
    if (!this.blockedBody(px, py)) return { x: px, y: py };
    for (let r = 8; r < 600; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = px + Math.cos((a / 16) * Math.PI * 2) * r, y = py + Math.sin((a / 16) * Math.PI * 2) * r;
        if (!this.blockedBody(x, y)) return { x, y };
      }
    }
    return { x: px, y: py };
  }

  // --- UI ------------------------------------------------------------------------------------------
  private button(W: number, y: number, color: number): { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; c: Phaser.GameObjects.Container } {
    const bw = Math.min(W - 110, 300);
    const box = this.add.rectangle(0, 0, bw, 36, color).setStrokeStyle(2, 0xffffff, 0.6).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#fff' }).setOrigin(0.5);
    const c = this.add.container(W / 2, y, [box, label]).setDepth(110).setVisible(false);
    return { box, label, c };
  }

  private zoom(k: number): void {
    this.w3.setDistance(this.w3.getDistance() * k);
    this.registry.set('dist', this.w3.getDistance());
  }

  private buildUi(W: number, H: number): void {
    this.hud = createHud(this, this.state, { width: W });
    this.place = this.add.text(W / 2, 70, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(100);
    this.quest = this.add.text(W / 2, 92, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffd23a', stroke: '#000', strokeThickness: 4, align: 'center', wordWrap: { width: W - 90 } }).setOrigin(0.5, 0).setDepth(100);
    this.hint = this.add.text(W / 2, H - 104, '', { fontFamily: FONT, fontSize: '13px', color: '#ffe08a', stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: W - 20 } }).setOrigin(0.5).setDepth(100);
    this.add.text(8, H - 3, '© OpenStreetMap contributors', { fontFamily: FONT, fontSize: '10px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0, 1).setDepth(100);
    this.toast = this.add.text(W / 2, 120, '', { fontFamily: FONT, fontSize: '15px', color: '#fff', backgroundColor: '#000000cc', padding: { x: 10, y: 6 }, align: 'center', wordWrap: { width: Math.min(W - 40, 520) } }).setOrigin(0.5, 0).setDepth(120).setVisible(false);

    this.stickBase = this.add.circle(0, 0, 54, 0xffffff, 0.2).setDepth(105).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 26, 0xffffff, 0.5).setDepth(106).setVisible(false);

    const talk = this.button(W, H - 30, 0x2b3a55);
    this.talkBtn = talk.c; this.talkLabel = talk.label;
    talk.box.on('pointerdown', () => this.startTalk());
    const enter = this.button(W, H - 72, 0x2b6a3a);
    this.enterBtn = enter.c; this.enterLabel = enter.label;
    enter.box.on('pointerdown', () => this.enterVenue());

    const friends = this.add.rectangle(W - 52, 124, 90, 34, 0x2b3a55, 0.92).setStrokeStyle(2, 0xffffff, 0.5).setDepth(110).setInteractive({ useHandCursor: true });
    this.add.text(W - 52, 124, 'Друзья', { fontFamily: FONT, fontSize: '15px', color: '#fff' }).setOrigin(0.5).setDepth(111);
    friends.on('pointerdown', () => this.scene.start('menu'));

    // camera height buttons on the right edge
    [['+', 0.8, -34], ['−', 1.25, 34]].forEach(([label, k, dy]) => {
      const b = this.add.rectangle(W - 26, H / 2 + (dy as number), 40, 40, 0x2b3a55, 0.92).setStrokeStyle(2, 0xffffff, 0.5).setDepth(110).setInteractive({ useHandCursor: true });
      this.add.text(W - 26, H / 2 + (dy as number), label as string, { fontFamily: FONT, fontSize: '26px', color: '#fff' }).setOrigin(0.5).setDepth(111);
      b.on('pointerdown', () => this.zoom(k as number));
    });

    this.box = new DialogueBox({
      scene: this, width: W, height: H, add: (o) => o,
      onClose: (id, helped) => {
        this.afterTalk(id, helped);
        this.hud.update();
        if (this.pendingResize) { this.pendingResize = false; this.scene.restart(); }
      },
    });
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (e: KeyboardEvent) => { const n = Number(e.key); if (n >= 1 && n <= 3) this.evChoose[n - 1]?.(); });
    kb.on('keydown-E', () => {
      if (this.paused) return;
      if (this.talkTarget) this.startTalk();
      else if (this.enterTarget) this.enterVenue();
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.paused) this.zoom(dy > 0 ? 1.14 : 0.88);
    });
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.paused || over.length > 0 || this.stick.active) return;
      this.stick = { active: true, ox: p.x, oy: p.y, dx: 0, dy: 0, id: p.id };
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1, b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (this.pinch > 0 && Math.abs(d - this.pinch) > 2) this.zoom(this.pinch / d);
        this.pinch = d;
        this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
        this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
        return;
      }
      this.pinch = 0;
      if (!this.stick.active || p.id !== this.stick.id) return;
      const dx = p.x - this.stick.ox, dy = p.y - this.stick.oy;
      const len = Math.hypot(dx, dy), max = 54;
      const k = len > max ? max / len : 1;
      this.stick.dx = (dx * k) / max;
      this.stick.dy = (dy * k) / max;
      this.stickKnob.setPosition(this.stick.ox + dx * k, this.stick.oy + dy * k);
    });
    const release = (p: Phaser.Input.Pointer): void => {
      if (p.id !== this.stick.id) return;
      this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
      this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private startTalk(): void {
    if (!this.talkTarget || this.paused) return;
    this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
    this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
    this.box.open(this.talkTarget);
  }

  private enterVenue(): void {
    if (!this.enterTarget || this.paused) return;
    if (this.enterTarget === HANGOUT) { this.hangOut(); return; }
    this.registry.set('mapPos', { x: this.px, y: this.py });
    this.scene.start(hasInterior(this.enterTarget) ? 'interior' : 'venue', { venueId: this.enterTarget });
  }

  /** After a conversation: finish quest steps that wait for it, and let a friend hand out a new errand. */
  private afterTalk(id: string, helped: boolean): void {
    const msgs = onTalk(this.state, id);
    const q = helped ? offerQuest(this.state, id) : null;
    if (q) { msgs.push(`Новое задание: «${q.title}»`, q.intro); sfx.quest(); }
    this.showToast(msgs);
    persist();
  }

  /** The current step of the first quest in the top line, and a glowing beam over every target place. */
  private refreshQuests(): void {
    const t = currentTargets(this.state);
    const first = t[0];
    const who = first?.npc ? CHARACTERS.find((c) => c.id === first.npc)?.name : '';
    this.quest.setText(first ? `▶ ${first.text}${first.place || !first.npc ? '' : ` (найди: ${who})`}  ·  осталось ${first.hoursLeft} ч` : '');
    const pts = t.flatMap((x) => {
      const l = x.place ? this.map.landmarks.find((m) => m.id === x.place) : undefined;
      return l ? [{ x: l.pos[0], z: l.pos[1], label: x.text }] : [];
    });
    const sig = pts.map((p) => `${p.x},${p.z},${p.label}`).join('|');
    if (sig !== this.questSig) { this.questSig = sig; this.w3.setQuestMarkers(pts); }
  }

  private showToast(msgs: string[]): void {
    if (!msgs.length) return;
    this.toast.setText(msgs.join('\n')).setVisible(true);
    this.time.delayedCall(5000, () => this.toast.setVisible(false));
  }

  private objective(): string {
    const s = this.state;
    const h = s.minutes / 60;
    if (s.satiety < 35) return 'Голодно: Пятёрочка или шаурма (синие метки)';
    if (s.energy < 25) return 'Пора домой спать (⌂ Дом Стаса)';
    if (s.wanted > 60) return 'Розыск высокий: реши вопрос в отделе полиции';
    if (isWeekday(s) && h >= 10 && h < 19 && s.workedToday < MAX_WORK_ROUNDS && s.energy >= 15) return 'Работа: дома, с 10:00 до 19:00 (⌂)';
    return 'Найди друзей: список «Друзья» показывает, кто где';
  }

  private nightAlpha(): number {
    const h = this.state.minutes / 60;
    if (h < 5) return 0.62;
    if (h < 7) return 0.62 * (1 - (h - 5) / 2);
    if (h < 18) return 0;
    if (h < 21) return 0.45 * ((h - 18) / 3);
    return 0.45 + 0.17 * ((h - 21) / 3);
  }

  override update(_t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 100) / 1000;

    if (!this.paused && !this.state.ended && eventDue(this.state)) {
      const ev = rollEvent(this.state);
      if (ev) this.showEvent(ev);
    }
    if (!this.paused) {
      // clock: one real second is four game minutes (paused while talking)
      this.clockAcc += dt * GAME_MINUTES_PER_SECOND;
      while (this.clockAcc >= 1 && !this.state.ended) {
        this.clockAcc -= 1;
        this.showToast([...advance(this.state, 1), ...tickQuests(this.state)]);
      }
      if (this.state.ended) { persist(); this.scene.start('end'); return; }
      this.saveAcc += dt;
      if (this.saveAcc > 5) { this.saveAcc = 0; persist(); }
    }
    this.hud.update();
    this.refreshQuests();
    this.placeFriends();
    this.w3.setNight(this.nightAlpha());
    const busy = this.squareBusy();
    this.w3.setBystandersLevel(busy ? 2 : 1);
    this.hint.setText(this.paused ? '' : this.objective());

    let vx = 0, vy = 0;
    if (!this.paused) {
      vx = this.stick.dx; vy = this.stick.dy;
      if (this.keys.left.isDown || this.wasd.A.isDown) vx -= 1;
      if (this.keys.right.isDown || this.wasd.D.isDown) vx += 1;
      if (this.keys.up.isDown || this.wasd.W.isDown) vy -= 1;
      if (this.keys.down.isDown || this.wasd.S.isDown) vy += 1;
      const len = Math.hypot(vx, vy);
      if (len > 1) { vx /= len; vy /= len; }
      // axes are tested separately so the player slides along walls instead of sticking
      const nx = this.px + vx * SPEED * dt, ny = this.py + vy * SPEED * dt;
      if (!this.blockedBody(nx, this.py)) this.px = nx;
      if (!this.blockedBody(this.px, ny)) this.py = ny;
    }
    const moving = Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05;
    // the body turns to where he runs (0 = facing the camera)
    this.w3.setFigure('stas', this.px / S, this.py / S, true, moving, moving ? Math.atan2(vx, vy) : undefined);
    this.w3.setTarget(this.px / S, this.py / S);
    this.w3.update(dt);

    let near: Npc | null = null;
    let best = TALK_RANGE;
    for (const n of this.npcs) {
      if (!n.visible) continue;
      const d = Phaser.Math.Distance.Between(this.px, this.py, n.x, n.y);
      if (d < best) { best = d; near = n; }
    }
    this.talkTarget = near?.id ?? null;

    let closest = '';
    let cd = 80 * S;
    let venue: Landmark | null = null;
    let vd = ENTER_RANGE;
    for (const l of this.map.landmarks) {
      const d = Phaser.Math.Distance.Between(this.px, this.py, l.pos[0] * S, l.pos[1] * S);
      if (d < cd) { cd = d; closest = l.name; }
      if (d < vd && venueById(l.id)) { vd = d; venue = l; }
    }
    this.place.setText(closest);
    this.enterTarget = venue?.id ?? null;
    const sqm = this.landmark('square');
    const fom = this.landmark('fountain');
    const onSquare = Phaser.Math.Distance.Between(this.px, this.py, sqm.pos[0] * S, sqm.pos[1] * S) < SQUARE_RADIUS || Phaser.Math.Distance.Between(this.px, this.py, fom.pos[0] * S, fom.pos[1] * S) < 18 * S;
    // the square's music is only audible while the player is on it, and after the sound has been unlocked by a first tap
    music(busy && onSquare && !this.paused ? 'square' : '');
    const hang = busy && onSquare && !venue;
    if (hang) this.enterTarget = HANGOUT;

    const showKeys = !this.sys.game.device.input.touch;
    this.talkBtn.setVisible(!!near && !this.paused);
    this.enterBtn.setVisible((!!venue || hang) && !this.paused);
    if (near) this.talkLabel.setText(`Поговорить: ${near.name}${showKeys ? '   [E]' : ''}`);
    if (venue) this.enterLabel.setText(`Зайти: ${venue.name}${near ? '' : showKeys ? '   [E]' : ''}`);
    else if (hang) this.enterLabel.setText(`Потусоваться на площади${near ? '' : showKeys ? '   [E]' : ''}`);
  }
}
