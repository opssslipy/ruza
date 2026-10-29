import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { whereIs } from '../content/schedules';
import { venueById } from '../content/venues';
import { FONT } from '../config';
import { advance, isWeekday, MAX_WORK_ROUNDS, type GameState } from '../game/state';
import { createHud } from '../game/hud';
import { DialogueBox } from '../game/dialogueBox';
import { S, type Landmark, type MapData } from '../game/mapData';
import { getState, persist } from '../game/store';
import { fovFor, type World3D } from '../game/world3d';
import { getWorld } from '../game/worldHolder';
import { hasInterior } from './InteriorScene';

// Game logic works in "map pixels" (3 px = 1 m) as before; the 3D world is told positions in metres (px / S).
const SPEED = 92; // px/s = about 30 m/s: crossing the old town takes ~20 s
const TALK_RANGE = 52;
const ENTER_RANGE = 120;
const GAME_MINUTES_PER_SECOND = 4;

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
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private clockAcc = 0;
  private saveAcc = 0;
  private lastPlacement = -1;
  private pinch = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingResize = false;

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
    this.w3.addFigure('stas', null);
    CHARACTERS.filter((c) => c.ink).forEach((ch, i) => {
      this.w3.addFigure(ch.id, ch.name);
      this.npcs.push({ id: ch.id, name: ch.name, x: 0, y: 0, visible: false, index: i });
    });

    this.buildUi(W, H);
    this.setupInput();
    this.placeFriends();

    const onResize = (): void => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => (this.box.active ? (this.pendingResize = true) : this.scene.restart()), 250);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.registry.set('mapPos', { x: this.px, y: this.py });
      this.registry.set('dist', this.w3.getDistance());
      for (const id of ['stas', ...this.npcs.map((n) => n.id)]) this.w3.setFigure(id, 0, 0, false);
      this.w3.show(false);
      persist();
    });

    if (new URLSearchParams(location.search).has('debug')) {
      // test hook for automated checks only; reachable with ?debug in the URL
      Object.assign(window, {
        __ruza: {
          state: this.state,
          teleport: (id: string) => { const l = this.landmark(id); const p = this.nearestFree(l.pos[0] * S, l.pos[1] * S); this.px = p.x; this.py = p.y; this.w3.teleportCamera(p.x / S, p.y / S); },
          talk: (id: string) => this.box.open(id),
          near: (id: string) => { const n = this.npcs.find((x) => x.id === id); if (n?.visible) { this.px = n.x + 24; this.py = n.y + 6; this.w3.teleportCamera(this.px / S, this.py / S); } return !!n?.visible; },
          view: () => ({ w: this.scale.width, h: this.scale.height, dist: this.w3.getDistance() }),
          setDistance: (d: number) => this.w3.setDistance(d),
        },
      });
    }
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
    const bw = Math.min(W - 60, 420);
    const box = this.add.rectangle(0, 0, bw, 50, color).setStrokeStyle(2, 0xffffff, 0.6).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#fff' }).setOrigin(0.5);
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
    this.hint = this.add.text(W / 2, H - 38, '', { fontFamily: FONT, fontSize: '13px', color: '#ffe08a', stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: W - 20 } }).setOrigin(0.5).setDepth(100);
    this.add.text(8, H - 14, '© OpenStreetMap contributors', { fontFamily: FONT, fontSize: '10px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0, 1).setDepth(100);
    this.toast = this.add.text(W / 2, 120, '', { fontFamily: FONT, fontSize: '15px', color: '#fff', backgroundColor: '#000000cc', padding: { x: 10, y: 6 }, align: 'center', wordWrap: { width: Math.min(W - 40, 520) } }).setOrigin(0.5, 0).setDepth(120).setVisible(false);

    this.stickBase = this.add.circle(0, 0, 54, 0xffffff, 0.2).setDepth(105).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 26, 0xffffff, 0.5).setDepth(106).setVisible(false);

    const talk = this.button(W, H - 130, 0x2b3a55);
    this.talkBtn = talk.c; this.talkLabel = talk.label;
    talk.box.on('pointerdown', () => this.startTalk());
    const enter = this.button(W, H - 190, 0x2b6a3a);
    this.enterBtn = enter.c; this.enterLabel = enter.label;
    enter.box.on('pointerdown', () => this.enterVenue());

    const friends = this.add.rectangle(W - 52, H - 80, 90, 34, 0x2b3a55, 0.92).setStrokeStyle(2, 0xffffff, 0.5).setDepth(110).setInteractive({ useHandCursor: true });
    this.add.text(W - 52, H - 80, 'Друзья', { fontFamily: FONT, fontSize: '15px', color: '#fff' }).setOrigin(0.5).setDepth(111);
    friends.on('pointerdown', () => this.scene.start('menu'));

    // camera height buttons on the right edge
    [['+', 0.8, -34], ['−', 1.25, 34]].forEach(([label, k, dy]) => {
      const b = this.add.rectangle(W - 26, H / 2 + (dy as number), 40, 40, 0x2b3a55, 0.92).setStrokeStyle(2, 0xffffff, 0.5).setDepth(110).setInteractive({ useHandCursor: true });
      this.add.text(W - 26, H / 2 + (dy as number), label as string, { fontFamily: FONT, fontSize: '26px', color: '#fff' }).setOrigin(0.5).setDepth(111);
      b.on('pointerdown', () => this.zoom(k as number));
    });

    this.box = new DialogueBox({
      scene: this, width: W, height: H, add: (o) => o,
      onClose: () => {
        this.hud.update();
        if (this.pendingResize) { this.pendingResize = false; this.scene.restart(); }
      },
    });
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    kb.on('keydown-E', () => {
      if (this.box.active) return;
      if (this.talkTarget) this.startTalk();
      else if (this.enterTarget) this.enterVenue();
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.box.active) this.zoom(dy > 0 ? 1.14 : 0.88);
    });
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.box.active || over.length > 0 || this.stick.active) return;
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
    if (!this.talkTarget || this.box.active) return;
    this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
    this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
    this.box.open(this.talkTarget);
  }

  private enterVenue(): void {
    if (!this.enterTarget || this.box.active) return;
    this.registry.set('mapPos', { x: this.px, y: this.py });
    this.scene.start(hasInterior(this.enterTarget) ? 'interior' : 'venue', { venueId: this.enterTarget });
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

    if (!this.box.active) {
      // clock: one real second is four game minutes (paused while talking)
      this.clockAcc += dt * GAME_MINUTES_PER_SECOND;
      while (this.clockAcc >= 1 && !this.state.ended) {
        this.clockAcc -= 1;
        this.showToast(advance(this.state, 1));
      }
      if (this.state.ended) { persist(); this.scene.start('end'); return; }
      this.saveAcc += dt;
      if (this.saveAcc > 5) { this.saveAcc = 0; persist(); }
    }
    this.hud.update();
    this.placeFriends();
    this.w3.setNight(this.nightAlpha());
    this.hint.setText(this.box.active ? '' : this.objective());

    let vx = 0, vy = 0;
    if (!this.box.active) {
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

    const showKeys = !this.sys.game.device.input.touch;
    this.talkBtn.setVisible(!!near && !this.box.active);
    this.enterBtn.setVisible(!!venue && !this.box.active);
    if (near) this.talkLabel.setText(`Поговорить: ${near.name}${showKeys ? '   [E]' : ''}`);
    if (venue) this.enterLabel.setText(`Зайти: ${venue.name}${near ? '' : showKeys ? '   [E]' : ''}`);
  }
}
