import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';

// 1 metre of the real map = S pixels. Characters are drawn oversized on purpose so they stay readable on a phone.
const S = 3;
const CHUNK = 900;
const SPEED = 110;
const TALK_RANGE = 46;

interface Line { w: number; p: number[] }
interface Landmark { id: string; name: string; pos: [number, number]; kind?: string }
interface MapData {
  width: number; height: number; cell: number; gridW: number; gridH: number; blocked: string;
  buildings: number[][]; roads: Line[]; rivers: Line[]; waters: number[][]; greens: number[][]; pitches: number[][];
  landmarks: Landmark[];
}

interface Chunk { g: Phaser.GameObjects.Graphics; x0: number; y0: number }

export class MapScene extends Phaser.Scene {
  private map!: MapData;
  private bits!: Uint8Array;
  private chunks: Chunk[] = [];
  private player!: Phaser.GameObjects.Container;
  private npcs: { id: string; name: string; sprite: Phaser.GameObjects.Container }[] = [];
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private stick = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, id: -1 };
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private talkBtn!: Phaser.GameObjects.Container;
  private talkLabel!: Phaser.GameObjects.Text;
  private talkTarget: string | null = null;
  private place!: Phaser.GameObjects.Text;

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
    this.map = this.cache.json.get('map') as MapData;
    this.bits = Uint8Array.from(atob(this.map.blocked), (c) => c.charCodeAt(0));
    this.cameras.main.setBackgroundColor('#3b4d36');
    this.drawWorld();

    const home = this.landmark('home');
    const saved = this.registry.get('mapPos') as { x: number; y: number } | undefined;
    const start = saved ?? this.nearestFree(home.pos[0] * S, home.pos[1] * S);
    this.player = this.makeToken('stas', start.x, start.y, 0xffd24a);
    this.player.setDepth(20);
    this.cameras.main.setBounds(0, 0, this.map.width * S, this.map.height * S);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.placeFriends();
    this.buildHud();
    this.setupInput();
  }

  // --- world drawing --------------------------------------------------------------------------
  private landmark(id: string): Landmark {
    const l = this.map.landmarks.find((m) => m.id === id);
    if (!l) throw new Error(`landmark ${id} missing from map.json`);
    return l;
  }

  private drawWorld(): void {
    const cols = Math.ceil((this.map.width * S) / CHUNK), rows = Math.ceil((this.map.height * S) / CHUNK);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const g = this.add.graphics().setDepth(0);
      this.chunks.push({ g, x0: cx * CHUNK, y0: cy * CHUNK });
    }
    const chunkAt = (px: number, py: number): Chunk | undefined => this.chunks[Math.floor(py / CHUNK) * cols + Math.floor(px / CHUNK)];
    const inView = (c: Chunk, pts: number[]): boolean => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const x = (pts[i] as number) * S, y = (pts[i + 1] as number) * S;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return maxX >= c.x0 - 40 && minX <= c.x0 + CHUNK + 40 && maxY >= c.y0 - 40 && minY <= c.y0 + CHUNK + 40;
    };
    const eachChunk = (pts: number[], draw: (g: Phaser.GameObjects.Graphics) => void): void => {
      void chunkAt;
      for (const c of this.chunks) if (inView(c, pts)) draw(c.g);
    };
    const poly = (g: Phaser.GameObjects.Graphics, pts: number[]): Phaser.Math.Vector2[] => {
      void g;
      const out: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < pts.length; i += 2) out.push(new Phaser.Math.Vector2((pts[i] as number) * S, (pts[i + 1] as number) * S));
      return out;
    };
    const stroke = (line: Line, color: number, extra: number): void => {
      eachChunk(line.p, (g) => {
        g.lineStyle(line.w * S + extra, color, 1);
        g.beginPath();
        for (let i = 0; i < line.p.length; i += 2) {
          const x = (line.p[i] as number) * S, y = (line.p[i + 1] as number) * S;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokePath();
      });
    };

    for (const p of this.map.greens) eachChunk(p, (g) => { g.fillStyle(0x4c7a40, 1); g.fillPoints(poly(g, p), true); });
    for (const p of this.map.pitches) eachChunk(p, (g) => { g.fillStyle(0x5d9a4c, 1); g.fillPoints(poly(g, p), true); });
    for (const p of this.map.waters) eachChunk(p, (g) => { g.fillStyle(0x2f5f8c, 1); g.fillPoints(poly(g, p), true); });
    for (const r of this.map.rivers) stroke(r, 0x2f5f8c, 0);
    for (const r of this.map.roads) stroke(r, 0x4b4b52, 4); // darker edge first
    for (const r of this.map.roads) stroke(r, 0x8d8d94, 0);
    for (const p of this.map.buildings) {
      eachChunk(p, (g) => {
        const pts = poly(g, p);
        g.fillStyle(0xb69b80, 1); g.fillPoints(pts, true);
        g.lineStyle(2, 0x6d5a48, 1); g.strokePoints(pts, true);
      });
    }

    const labelStyle = { fontFamily: FONT, fontSize: '15px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 };
    for (const l of this.map.landmarks) {
      const isHome = l.id === 'home';
      const isVenue = l.kind === 'venue';
      if (isVenue) this.add.circle(l.pos[0] * S, l.pos[1] * S, 7, 0x4aa3ff).setStrokeStyle(2, 0xffffff).setDepth(9);
      this.add.text(l.pos[0] * S, l.pos[1] * S - (isHome ? 34 : isVenue ? 20 : 10), isHome ? `⌂ ${l.name}` : l.name, { ...labelStyle, fontSize: isHome ? '17px' : '15px', color: isHome ? '#ffd24a' : isVenue ? '#9fd2ff' : '#ffffff' }).setOrigin(0.5).setDepth(10);
    }
  }

  // --- characters ------------------------------------------------------------------------------
  private makeToken(id: string, x: number, y: number, ring: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    c.add(this.add.circle(0, 0, 17, ring));
    const key = `portrait-${id}`;
    if (this.textures.exists(key)) c.add(this.add.image(0, 0, key).setDisplaySize(28, 28));
    else c.add(this.add.text(0, 0, id.charAt(0).toUpperCase(), { fontFamily: FONT, fontSize: '16px', color: '#fff' }).setOrigin(0.5));
    return c;
  }

  // Temporary placement: friends stand around the main square until schedules exist. This is game design, not a claim about the real town.
  private placeFriends(): void {
    const sq = this.landmark('square');
    const talkable = CHARACTERS.filter((c) => c.ink);
    talkable.forEach((ch, i) => {
      const a = (i / talkable.length) * Math.PI * 2;
      const spot = this.nearestFree((sq.pos[0] * S) + Math.cos(a) * 110, (sq.pos[1] * S) + Math.sin(a) * 110);
      const token = this.makeToken(ch.id, spot.x, spot.y, ch.color).setDepth(15);
      this.npcs.push({ id: ch.id, name: ch.name, sprite: token });
    });
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

  // --- HUD and input -------------------------------------------------------------------------------
  private buildHud(): void {
    this.place = this.add.text(GAME_WIDTH / 2, 18, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);
    this.add.text(8, GAME_HEIGHT - 16, '© OpenStreetMap contributors', { fontFamily: FONT, fontSize: '11px', color: '#dddddd', stroke: '#000', strokeThickness: 3 }).setOrigin(0, 1).setScrollFactor(0).setDepth(100);

    this.stickBase = this.add.circle(0, 0, 54, 0xffffff, 0.15).setScrollFactor(0).setDepth(100).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 26, 0xffffff, 0.45).setScrollFactor(0).setDepth(101).setVisible(false);

    const bg = this.add.rectangle(0, 0, GAME_WIDTH - 60, 54, 0x2b3a55).setInteractive({ useHandCursor: true });
    this.talkLabel = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '19px', color: '#fff' }).setOrigin(0.5);
    this.talkBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 130, [bg, this.talkLabel]).setScrollFactor(0).setDepth(110).setVisible(false);
    bg.on('pointerdown', () => this.startTalk());

    const friends = this.add.rectangle(GAME_WIDTH - 52, 24, 90, 34, 0x2b3a55, 0.9).setScrollFactor(0).setDepth(110).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH - 52, 24, 'Друзья', { fontFamily: FONT, fontSize: '16px', color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(111);
    friends.on('pointerdown', () => {
      this.registry.set('mapPos', { x: this.player.x, y: this.player.y });
      this.scene.start('menu');
    });
  }

  private setupInput(): void {
    this.keys = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.stick.active || this.talkBtn.visible && p.y > GAME_HEIGHT - 170 && p.y < GAME_HEIGHT - 90) return;
      this.stick = { active: true, ox: p.x, oy: p.y, dx: 0, dy: 0, id: p.id };
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
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
    if (!this.talkTarget) return;
    this.registry.set('mapPos', { x: this.player.x, y: this.player.y });
    this.scene.start('dialogue', { characterId: this.talkTarget, returnTo: 'map' });
  }

  override update(_t: number, dtMs: number): void {
    const dt = dtMs / 1000;
    let vx = this.stick.dx, vy = this.stick.dy;
    if (this.keys.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.keys.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.keys.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.keys.down.isDown || this.wasd.S.isDown) vy += 1;
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    // axes are tested separately so the player slides along walls instead of sticking
    const nx = this.player.x + vx * SPEED * dt, ny = this.player.y + vy * SPEED * dt;
    if (!this.blockedBody(nx, this.player.y)) this.player.x = nx;
    if (!this.blockedBody(this.player.x, ny)) this.player.y = ny;

    const view = this.cameras.main.worldView;
    for (const c of this.chunks) {
      c.g.setVisible(c.x0 + CHUNK >= view.x - 20 && c.x0 <= view.right + 20 && c.y0 + CHUNK >= view.y - 20 && c.y0 <= view.bottom + 20);
    }

    let near: { id: string; name: string } | null = null;
    let best = TALK_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y);
      if (d < best) { best = d; near = n; }
    }
    this.talkTarget = near?.id ?? null;
    this.talkBtn.setVisible(!!near);
    if (near) this.talkLabel.setText(`Поговорить: ${near.name}`);

    let closest = '';
    let cd = 80 * S;
    for (const l of this.map.landmarks) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, l.pos[0] * S, l.pos[1] * S);
      if (d < cd) { cd = d; closest = l.name; }
    }
    this.place.setText(closest);
  }
}
