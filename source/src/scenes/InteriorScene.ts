import Phaser from 'phaser';
import { CHARACTERS } from '../content/characters';
import { peopleAt } from '../content/schedules';
import { FONT } from '../config';
import { DialogueBox } from '../game/dialogueBox';
import { HookahGame } from '../game/hookahGame';
import { createHud } from '../game/hud';
import { buildDym, type Box, type Room, type Seat, type Spot } from '../game/interiors';
import { buildClub, buildCinema, buildGarage, buildGym, buildHome, buildHospital, buildOffice, buildShop } from '../game/interiors2';
import { venueById, type VenueAction } from '../content/venues';
import { music, sfx, stopMusic } from '../game/audio';
import { muteButton } from '../game/muteButton';
import { TimingGame, type TimingConfig } from '../game/timingGame';
import type { Effect } from '../game/state';
import { currentTargets, offerQuest, onAction, onTalk, onVisit, tickQuests } from '../game/quests';
import type { MapData } from '../game/mapData';
import { advance, applyEffect, describeEffect, sleepAtHome, type GameState } from '../game/state';
import { getState, persist } from '../game/store';
import { getWorld } from '../game/worldHolder';
import type { World3D } from '../game/world3d';

/** Every venue has a walk-in 3D room; the flat room screen (VenueScene) is no longer used. */
const BUILDERS: Record<string, () => Room> = {
  dym: buildDym,
  pyaterochka: () => buildShop('pyaterochka'),
  shawarma: () => buildShop('shawarma'),
  pharmacy: () => buildShop('pharmacy'),
  gym: buildGym,
  ruzvelt: buildClub,
  mixbar: buildClub,
  home: buildHome,
  police: buildOffice,
  hospital: buildHospital,
  teatre: buildCinema,
  garages: buildGarage,
};
export const hasInterior = (id: string): boolean => id in BUILDERS;

// Mini-games that decorate the plain venue action: the score adds a bonus (or a penalty) to the action's own effect.
interface GameDef { cfg: TimingConfig; bonus: (good: number, rounds: number) => Effect }
const GAMES: Record<string, GameDef> = {
  gym: { cfg: { title: 'Подход со штангой', intro: 'Жми, когда метка в зелёной зоне: чистое повторение', verb: 'ЖАТЬ', rounds: 5, goodText: 'Чисто!', badText: 'Не вышло, штанга тяжёлая' }, bonus: (g, n) => ({ mood: g * 2, health: g, energy: -(n - g) * 2 }) },
  ruzvelt: { cfg: { title: 'Танцпол', intro: 'Лови ритм: жми в зелёной зоне, пока играет музыка', verb: 'ТАНЦЕВАТЬ', rounds: 6, goodText: 'В такт!', badText: 'Мимо ритма' }, bonus: (g, n) => ({ mood: g * 4 - (n - g) }) },
  mixbar: { cfg: { title: 'Танцпол', intro: 'Лови ритм: жми в зелёной зоне', verb: 'ТАНЦЕВАТЬ', rounds: 4, goodText: 'В такт!', badText: 'Мимо ритма' }, bonus: (g, n) => ({ mood: g * 4 - (n - g) }) },
};
const MUSIC: Record<string, string> = { dym: 'lounge', ruzvelt: 'club', mixbar: 'club' };
const sumEffects = (a: Effect, b: Effect): Effect => ({
  money: (a.money ?? 0) + (b.money ?? 0), satiety: (a.satiety ?? 0) + (b.satiety ?? 0), energy: (a.energy ?? 0) + (b.energy ?? 0), mood: (a.mood ?? 0) + (b.mood ?? 0),
  health: (a.health ?? 0) + (b.health ?? 0), wanted: (a.wanted ?? 0) + (b.wanted ?? 0), minutes: (a.minutes ?? 0) + (b.minutes ?? 0),
});

const SPEED = 15; // metres per second
const BODY = 1.6;
const TALK_RANGE = 9;
const GAME_MINUTES_PER_SECOND = 4;

interface Npc { id: string; name: string; x: number; z: number; yaw: number; seat: Seat | null; tx: number; tz: number; wait: number; moving: boolean }

export class InteriorScene extends Phaser.Scene {
  private venueId = 'dym';
  private room!: Room;
  private state!: GameState;
  private w3!: World3D;
  private px = 0;
  private pz = 0;
  private yaw = 0;
  private npcs: Npc[] = [];
  private hud!: { update: () => void };
  private box!: DialogueBox;
  private hookah!: HookahGame;
  private timing!: TimingGame;
  private pending: { a: VenueAction; idx: number; g: GameDef } | null = null;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private stick = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, id: -1 };
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private talkBtn!: Phaser.GameObjects.Container;
  private talkLabel!: Phaser.GameObjects.Text;
  private useBtn!: Phaser.GameObjects.Container;
  private useLabel!: Phaser.GameObjects.Text;
  private place!: Phaser.GameObjects.Text;
  private quest!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private talkTarget: string | null = null;
  private useTarget: Spot | null = null;
  private clockAcc = 0;
  private saveAcc = 0;
  private pinch = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super('interior');
  }

  init(data: { venueId: string }): void {
    this.venueId = data.venueId;
  }

  preload(): void {
    this.load.json('map', 'map.json');
    CHARACTERS.forEach((ch) => {
      if (ch.portrait && !this.textures.exists(`portrait-${ch.id}`)) this.load.svg(`portrait-${ch.id}`, ch.portrait, { width: 240, height: 240 });
    });
  }

  create(): void {
    this.state = getState();
    this.cameras.main.transparent = true;
    const build = BUILDERS[this.venueId];
    if (!build) { this.scene.start('map'); return; }
    this.room = build();
    // spots tied to a venue action take their text from it
    const venue = venueById(this.venueId);
    for (const s of this.room.spots) if (s.action !== undefined) s.label = venue?.actions[s.action]?.label ?? '';
    this.w3 = getWorld(this.cache.json.get('map') as MapData);
    this.w3.setTitleMode(false);
    this.w3.show(true);
    this.w3.enterInterior(this.room.group, this.room.bg, this.room.mood);
    this.npcs = [];
    this.clockAcc = 0;

    this.px = this.room.spawn.x; this.pz = this.room.spawn.z;
    this.w3.teleportCamera(this.px, this.pz - 6);
    this.w3.addFigure('stas', null);

    // who is here now: the first of them take the sofas, the others walk around
    const here = peopleAt(this.venueId, this.state).filter((id) => CHARACTERS.find((c) => c.id === id)?.ink);
    const freeSeats = Phaser.Utils.Array.Shuffle([...this.room.seats]);
    const sitting = Math.min(freeSeats.length, Math.ceil(here.length * 0.65));
    here.forEach((id, i) => {
      const ch = CHARACTERS.find((c) => c.id === id);
      if (!ch) return;
      this.w3.addFigure(id, ch.name);
      const seat = i < sitting ? (freeSeats[i] as Seat) : null;
      const wp = Phaser.Utils.Array.GetRandom(this.room.wander);
      this.npcs.push({ id, name: ch.name, x: seat ? seat.x : wp.x, z: seat ? seat.z : wp.z, yaw: seat ? seat.yaw : 0, seat, tx: wp.x, tz: wp.z, wait: Math.random() * 3, moving: false });
    });

    this.buildUi(this.scale.width, this.scale.height);
    this.setupInput();
    this.showToast(onVisit(this.state, this.venueId));
    muteButton(this, this.scale.width - 26, 80);
    music(MUSIC[this.venueId] ?? '');

    const onResize = (): void => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => (this.box.active || this.hookah.active || this.timing.active ? undefined : this.scene.restart()), 250);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      for (const id of ['stas', ...this.npcs.map((n) => n.id)]) this.w3.setFigure(id, 0, 0, false);
      this.w3.leaveInterior();
      stopMusic();
      persist();
    });

    if (new URLSearchParams(location.search).has('debug')) {
      Object.assign(window, {
        __ruzaIn: {
          state: this.state,
          teleport: (x: number, z: number) => { this.px = x; this.pz = z; },
          spots: () => this.room.spots.map((s) => ({ id: s.id, x: s.x, z: s.z })),
          npcs: () => this.npcs.map((n) => ({ id: n.id, sitting: !!n.seat })),
          use: () => this.useSpot(),
          talk: (id: string) => this.box.open(id),
          press: () => { this.timing.press(); this.hookah.press(); },
          setDistance: (d: number) => this.w3.setDistance(d),
        },
      });
    }
  }

  // --- movement and collisions ----------------------------------------------------------------
  private hits(x: number, z: number): boolean {
    const { w, d, colliders } = this.room;
    const inDoor = x > 8.6 && x < 15.4;
    if (x < BODY + 1 || x > w - BODY - 1 || z < (this.room.minZ ?? 4) || z > (inDoor ? d + 1 : d - BODY)) return true;
    for (const b of colliders as Box[]) if (x > b.x0 - BODY && x < b.x1 + BODY && z > b.z0 - BODY && z < b.z1 + BODY) return true;
    return false;
  }

  // --- UI ------------------------------------------------------------------------------------------
  private button(W: number, y: number, color: number): { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; c: Phaser.GameObjects.Container } {
    const bw = Math.min(W - 60, 420);
    const box = this.add.rectangle(0, 0, bw, 50, color).setStrokeStyle(2, 0xffffff, 0.6).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#fff' }).setOrigin(0.5);
    const c = this.add.container(W / 2, y, [box, label]).setDepth(110).setVisible(false);
    return { box, label, c };
  }

  private buildUi(W: number, H: number): void {
    this.hud = createHud(this, this.state, { width: W });
    this.place = this.add.text(W / 2, 70, venueById(this.venueId)?.name ?? '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#e8d8ff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(100);
    this.quest = this.add.text(W / 2, 94, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffd23a', stroke: '#000', strokeThickness: 4, align: 'center', wordWrap: { width: W - 90 } }).setOrigin(0.5, 0).setDepth(100);
    this.hint = this.add.text(W / 2, H - 38, '', { fontFamily: FONT, fontSize: '13px', color: '#ffe08a', stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: W - 20 } }).setOrigin(0.5).setDepth(100);
    this.toast = this.add.text(W / 2, 110, '', { fontFamily: FONT, fontSize: '15px', color: '#fff', backgroundColor: '#000000cc', padding: { x: 10, y: 6 }, align: 'center', wordWrap: { width: Math.min(W - 40, 520) } }).setOrigin(0.5, 0).setDepth(120).setVisible(false);
    this.stickBase = this.add.circle(0, 0, 54, 0xffffff, 0.2).setDepth(105).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 26, 0xffffff, 0.5).setDepth(106).setVisible(false);

    const talk = this.button(W, H - 130, 0x2b3a55);
    this.talkBtn = talk.c; this.talkLabel = talk.label;
    talk.box.on('pointerdown', () => this.startTalk());
    const use = this.button(W, H - 190, 0x7a3fb0);
    this.useBtn = use.c; this.useLabel = use.label;
    use.box.on('pointerdown', () => this.useSpot());

    [['+', 0.85, -34], ['−', 1.18, 34]].forEach(([label, k, dy]) => {
      const b = this.add.rectangle(W - 26, H / 2 + (dy as number), 40, 40, 0x2b3a55, 0.92).setStrokeStyle(2, 0xffffff, 0.5).setDepth(110).setInteractive({ useHandCursor: true });
      this.add.text(W - 26, H / 2 + (dy as number), label as string, { fontFamily: FONT, fontSize: '26px', color: '#fff' }).setOrigin(0.5).setDepth(111);
      b.on('pointerdown', () => this.w3.setDistance(this.w3.getDistance() * (k as number)));
    });

    this.box = new DialogueBox({ scene: this, width: W, height: H, add: (o) => o, onClose: (id, helped) => {
        const msgs = onTalk(this.state, id);
        const q = helped ? offerQuest(this.state, id) : null;
        if (q) msgs.push(`Новое задание: «${q.title}»`, q.intro);
        this.showToast(msgs);
        persist();
        this.hud.update();
      },
    });
    this.timing = new TimingGame({
      scene: this, width: W, height: H, onGood: () => this.room.burst(this.px, this.pz),
      onDone: (r) => {
        const p = this.pending;
        this.pending = null;
        if (!p) return;
        const eff = sumEffects(p.a.effect, p.g.bonus(r.good, r.rounds));
        const msgs = applyEffect(this.state, eff);
        this.showToast([`${r.good} из ${r.rounds} удачно`, describeEffect(eff), ...msgs, ...onAction(this.state, this.venueId, p.idx)]);
        sfx.coin();
        persist(); this.hud.update();
      },
    });
    this.hookah = new HookahGame({
      scene: this, width: W, height: H,
      onPuff: () => { sfx.puff(); this.room.burst(this.px, this.pz); },
      onDone: (r) => {
        const eff = { money: -600, mood: r.mood, health: r.health, energy: r.energy, minutes: 90 };
        const msgs = applyEffect(this.state, eff);
        this.showToast([describeEffect(eff), ...msgs]);
        sfx.coin();
        persist();
        this.hud.update();
      },
    });
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    const act = (): void => {
      if (this.timing.active) { this.timing.press(); return; }
      if (this.hookah.active) { this.hookah.press(); return; }
      if (this.box.active) return;
      if (this.talkTarget) this.startTalk();
      else if (this.useTarget) this.useSpot();
    };
    kb.on('keydown-E', act);
    kb.on('keydown-SPACE', () => { if (this.timing.active) this.timing.press(); else if (this.hookah.active) this.hookah.press(); });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => { if (!this.box.active) this.w3.setDistance(this.w3.getDistance() * (dy > 0 ? 1.12 : 0.89)); });
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.box.active || this.hookah.active || this.timing.active || over.length > 0 || this.stick.active) return;
      this.stick = { active: true, ox: p.x, oy: p.y, dx: 0, dy: 0, id: p.id };
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1, b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (this.pinch > 0 && Math.abs(d - this.pinch) > 2) this.w3.setDistance(this.w3.getDistance() * (this.pinch / d));
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
      this.stick.dx = (dx * k) / max; this.stick.dy = (dy * k) / max;
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
    if (!this.talkTarget || this.box.active || this.hookah.active || this.timing.active) return;
    this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
    this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
    this.box.open(this.talkTarget);
  }

  private showToast(msgs: string[]): void {
    const text = msgs.filter(Boolean).join('\n');
    if (!text) return;
    this.toast.setText(text).setVisible(true);
    this.time.delayedCall(5000, () => this.toast.setVisible(false));
  }

  private useSpot(): void {
    const s = this.useTarget;
    if (!s || this.box.active || this.hookah.active || this.timing.active) return;
    const hour = this.state.minutes / 60;
    if (s.id === 'exit') { persist(); this.scene.start('map'); return; }
    if (s.id === 'bar') {
      if (this.state.money < 500) { this.showToast(['Не хватает денег']); sfx.bad(); return; }
      const eff = { money: -500, mood: 10, energy: -5, minutes: 45 };
      this.showToast([describeEffect(eff), ...applyEffect(this.state, eff)]);
      persist(); this.hud.update();
      return;
    }
    if (s.action !== undefined) {
      // a plain venue action: price, effect and time come from content/venues.ts
      const a = venueById(this.venueId)?.actions[s.action];
      if (!a) return;
      const reason = a.blocked?.(this.state) ?? null;
      if (reason) { this.showToast([reason]); return; }
      if (a.special === 'work') { persist(); this.scene.start('calls'); return; }
      const game = GAMES[this.venueId];
      if (game && !a.special) {
        this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
        this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
        this.pending = { a, idx: s.action, g: game };
        this.timing.open(game.cfg);
        return;
      }
      const msgs = a.special === 'sleep' ? sleepAtHome(this.state, 8) : applyEffect(this.state, a.effect);
      this.showToast([a.special === 'sleep' ? 'Проспал 8 часов: энергия восстановилась' : describeEffect(a.effect), ...msgs, ...onAction(this.state, this.venueId, s.action)]);
      persist(); this.hud.update();
      return;
    }
    if (s.id === 'hookah') {
      if (hour < 16) { this.showToast(['Кальянная открыта с 16:00']); return; }
      if (this.state.money < 600) { this.showToast(['Не хватает денег на кальян (600 ₽)']); return; }
      this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0;
      this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
      this.hookah.open();
    }
  }

  // --- frame -----------------------------------------------------------------------------------------
  override update(_t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 100) / 1000;
    const busy = this.box.active || this.hookah.active || this.timing.active;

    if (!busy) {
      this.clockAcc += dt * GAME_MINUTES_PER_SECOND;
      while (this.clockAcc >= 1 && !this.state.ended) { this.clockAcc -= 1; this.showToast([...advance(this.state, 1), ...tickQuests(this.state)]); }
      if (this.state.ended) { persist(); this.scene.start('end'); return; }
      this.saveAcc += dt;
      if (this.saveAcc > 5) { this.saveAcc = 0; persist(); }
    }
    if (this.state.ended) return;
    this.hud.update();
    const qt = currentTargets(this.state)[0];
    this.quest.setText(qt ? `▶ ${qt.text}  ·  осталось ${qt.hoursLeft} ч` : '');
    this.hookah.update(dt);
    this.timing.update(dt);
    this.room.update(dt);

    let vx = 0, vz = 0;
    if (!busy) {
      vx = this.stick.dx; vz = this.stick.dy;
      if (this.keys.left.isDown || this.wasd.A.isDown) vx -= 1;
      if (this.keys.right.isDown || this.wasd.D.isDown) vx += 1;
      if (this.keys.up.isDown || this.wasd.W.isDown) vz -= 1;
      if (this.keys.down.isDown || this.wasd.S.isDown) vz += 1;
      const len = Math.hypot(vx, vz);
      if (len > 1) { vx /= len; vz /= len; }
      const nx = this.px + vx * SPEED * dt, nz = this.pz + vz * SPEED * dt;
      if (!this.hits(nx, this.pz)) this.px = nx;
      if (!this.hits(this.px, nz)) this.pz = nz;
    }
    const moving = Math.abs(vx) > 0.05 || Math.abs(vz) > 0.05;
    if (moving) this.yaw = Math.atan2(vx, vz);
    this.w3.setFigure('stas', this.px, this.pz, true, moving, moving ? this.yaw : undefined);
    this.w3.setTarget(this.px, this.pz - 6);

    // friends: some sit on the sofas, the others stroll and stop to chat
    for (const n of this.npcs) {
      if (n.seat) { this.w3.setFigure(n.id, n.seat.x, n.seat.z, true, false, n.seat.yaw, true); continue; }
      if (n.wait > 0) { n.wait -= dt; n.moving = false; }
      else {
        const dx = n.tx - n.x, dz = n.tz - n.z, dist = Math.hypot(dx, dz);
        if (dist < 0.8) {
          const wp = Phaser.Utils.Array.GetRandom(this.room.wander);
          n.tx = wp.x + (Math.random() - 0.5) * 4; n.tz = wp.z + (Math.random() - 0.5) * 3;
          n.wait = 2 + Math.random() * 6; n.moving = false;
        } else {
          const step = Math.min(dist, 6 * dt);
          const nx = n.x + (dx / dist) * step, nz = n.z + (dz / dist) * step;
          if (!this.hits(nx, nz)) { n.x = nx; n.z = nz; n.yaw = Math.atan2(dx, dz); n.moving = true; } else { n.wait = 0.5; n.tx = n.x; n.tz = n.z; }
        }
      }
      this.w3.setFigure(n.id, n.x, n.z, true, n.moving, n.yaw);
    }
    this.w3.update(dt);

    // buttons: talk to someone close, use the nearest spot
    let near: Npc | null = null;
    let best = TALK_RANGE;
    for (const n of this.npcs) {
      const px = n.seat ? n.seat.x : n.x, pz = n.seat ? n.seat.z : n.z;
      const d = Math.hypot(px - this.px, pz - this.pz);
      if (d < best) { best = d; near = n; }
    }
    this.talkTarget = near?.id ?? null;
    let spot: Spot | null = null;
    let sd = Infinity;
    for (const s of this.room.spots) {
      const d = Math.hypot(s.x - this.px, s.z - this.pz);
      if (d < s.r && d < sd) { sd = d; spot = s; }
    }
    this.useTarget = spot;
    const showKeys = !this.sys.game.device.input.touch;
    this.talkBtn.setVisible(!!near && !busy);
    this.useBtn.setVisible(!!spot && !busy);
    if (near) this.talkLabel.setText(`Поговорить: ${near.name}${showKeys ? '   [E]' : ''}`);
    if (spot) this.useLabel.setText(`${spot.label}${near ? '' : showKeys ? '   [E]' : ''}`);
    this.hint.setText(busy ? '' : this.venueId === 'dym' ? 'Подойди к столику: кальян. К бару: напиток. Дверь слева внизу.' : 'Походи по залу: у нужных мест появится кнопка действия. Выход слева внизу.');
  }
}
