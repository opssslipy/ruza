import Phaser from 'phaser';
import { FONT } from '../config';
import { S, type MapData } from '../game/mapData';
import { restart } from '../game/store';
import { fovFor } from '../game/world3d';
import { getWorld } from '../game/worldHolder';

const TITLE_FONT = `Impact, Haettenschweiler, "Arial Black", ${FONT}`;

interface Stage { cx: number; cz: number; ax: number; az: number; bx: number; bz: number }

/** Finds an open east-west street near the main square for the cars, with free ground south of it for the line-up. */
function pickStage(map: MapData, bits: Uint8Array): Stage {
  const blocked = (x: number, z: number): boolean => {
    const gx = Math.floor(x / map.cell), gy = Math.floor(z / map.cell);
    if (gx < 0 || gy < 0 || gx >= map.gridW || gy >= map.gridH) return true;
    const i = gy * map.gridW + gx;
    return ((bits[i >> 3] as number) & (1 << (i & 7))) !== 0;
  };
  const sq = map.landmarks.find((l) => l.id === 'square')?.pos ?? [map.width / 2, map.height / 2];
  let best: Stage | null = null;
  let bestScore = Infinity;
  for (const r of map.roads) {
    if (r.w < 6) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      let ax = r.p[i] as number, az = r.p[i + 1] as number, bx = r.p[i + 2] as number, bz = r.p[i + 3] as number;
      if (bx < ax) { [ax, bx] = [bx, ax]; [az, bz] = [bz, az]; }
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 45 || (bx - ax) / len < 0.9) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const dsq = Math.hypot(mx - sq[0], mz - sq[1]);
      if (dsq > 650) continue;
      // the whole strip between the line-up and the camera must be open ground, otherwise a house hides the heroes
      let bad = 0, total = 0;
      for (let x = mx - 36; x <= mx + 36; x += 4) for (let z = mz + 4; z <= mz + 60; z += 4) { total++; if (blocked(x, z)) bad++; }
      const score = (bad / total) * 8000 + dsq * 0.3;
      if (score < bestScore) { bestScore = score; best = { cx: mx, cz: mz, ax, az, bx, bz }; }
    }
  }
  return best ?? { cx: sq[0], cz: sq[1] - 12, ax: sq[0] - 40, az: sq[1] - 12, bx: sq[0] + 40, bz: sq[1] - 12 };
}

// Title screen: the real 3D town at dusk, cars cruising past, the gang lined up with cartoon pistols, and the name on top.
export class TitleScene extends Phaser.Scene {
  private t = 0;
  private started = false;

  constructor() {
    super('title');
  }

  preload(): void {
    this.load.json('map', 'map.json');
  }

  create(): void {
    this.started = false;
    this.cameras.main.transparent = true;
    const map = this.cache.json.get('map') as MapData;
    const bits = Uint8Array.from(atob(map.blocked), (c) => c.charCodeAt(0));
    const world = getWorld(map);
    const W = this.scale.width, H = this.scale.height;
    const portrait = W / H < 1;

    world.show(true);
    world.setTitleMode(true);
    world.setNight(0.3);
    const stage = pickStage(map, bits);
    const rowZ = stage.cz + 14;
    const lineup = portrait ? ['demon', 'belka', 'stas', 'diana', 'bara'] : ['bara', 'belka', 'demon', 'diana', 'stas', 'lev', 'timur', 'karina', 'petya'];
    const step = portrait ? 7.4 : 6.6;
    lineup.forEach((id, i) => {
      const off = (i - (lineup.length - 1) / 2) * step;
      world.addFigure(id, null);
      world.setFigure(id, stage.cx + off, rowZ + Math.abs(off) * 0.07, true, false, 0);
    });
    world.armFigure('demon');
    world.armFigure('bara');
    world.spawnCars([stage.ax - 50, stage.az], [stage.bx + 50, stage.bz], portrait ? 4 : 6);

    const tanH = Math.tan((fovFor(W / H) * Math.PI) / 360) * (W / H);
    const span = lineup.length * step + 14;
    const dist = span / (2 * tanH);
    world.setDistance(dist);
    world.setTreeExclusion({ x0: stage.cx - span, x1: stage.cx + span, z0: stage.cz - 12, z1: rowZ + dist * 0.9 });
    // looking at a point north of the line-up puts the heroes in the lower part of the screen, under the title
    const look = rowZ - (portrait ? 24 : 12);
    world.teleportCamera(stage.cx, look);
    world.setTarget(stage.cx, look);

    // darker bands behind the text so it reads over any street
    const veil = this.add.graphics().setDepth(1);
    veil.fillGradientStyle(0x0b0a14, 0x0b0a14, 0x0b0a14, 0x0b0a14, 0.78, 0.78, 0, 0).fillRect(0, 0, W, H * 0.42);
    veil.fillGradientStyle(0x0b0a14, 0x0b0a14, 0x0b0a14, 0x0b0a14, 0, 0, 0.8, 0.8).fillRect(0, H * 0.7, W, H * 0.3);

    const size = Math.min(W * 0.27, H * 0.19, 190);
    const title = this.add.text(W / 2, H * 0.12, 'РУЗА', { fontFamily: TITLE_FONT, fontSize: `${size}px`, color: '#ffd23a', stroke: '#8a1c1c', strokeThickness: Math.round(size * 0.13) }).setOrigin(0.5).setDepth(5);
    title.setShadow(0, size * 0.06, '#000000', 0, true, true);
    this.tweens.add({ targets: title, scale: 1.045, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const rw = Math.min(W * 0.8, 520), rh = Math.max(36, size * 0.3);
    const ribbon = this.add.container(W / 2, H * 0.12 + size * 0.62, [
      this.add.rectangle(0, 0, rw, rh, 0xe63b6f).setStrokeStyle(4, 0xffffff),
      this.add.text(0, 0, 'ГОРОД ЧУДЕС', { fontFamily: TITLE_FONT, fontSize: `${Math.round(rh * 0.68)}px`, fontStyle: 'italic', color: '#ffffff', stroke: '#6a1236', strokeThickness: 4 }).setOrigin(0.5),
    ]).setDepth(5).setAngle(-3);
    this.tweens.add({ targets: ribbon, angle: -1.5, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(W / 2, H * 0.12 + size * 0.62 + rh * 0.95, 'Неделя Стаса: банды, менты, девчонки, шаурма и долги', { fontFamily: FONT, fontSize: `${portrait ? 13 : 16}px`, color: '#ffe9a8', stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: W - 30 } }).setOrigin(0.5, 0).setDepth(5);

    // buttons: "Continue" appears only when there is a save
    let hasSave = false;
    try { hasSave = !!localStorage.getItem('ruza-save'); } catch { hasSave = false; }
    const bw = Math.min(W - 60, 360), by = H * 0.86;
    const button = (y: number, label: string, color: number, fn: () => void, h = 56): void => {
      const box = this.add.rectangle(W / 2, y, bw, h, color).setStrokeStyle(3, 0xffffff, 0.85).setDepth(6).setInteractive({ useHandCursor: true });
      this.add.text(W / 2, y, label, { fontFamily: TITLE_FONT, fontSize: `${Math.round(h * 0.46)}px`, color: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(7);
      box.on('pointerdown', fn);
    };
    if (hasSave) {
      button(by - 36, 'ПРОДОЛЖИТЬ', 0x2f9e4f, () => this.play(false));
      button(by + 34, 'НОВАЯ ИГРА', 0x3a3f5a, () => this.play(true), 44);
    } else {
      button(by, 'ИГРАТЬ', 0x2f9e4f, () => this.play(false), 64);
    }
    this.add.text(W / 2, H - 12, '© OpenStreetMap contributors  ·  игра для своих', { fontFamily: FONT, fontSize: '11px', color: '#cccccc', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(7);

    this.input.keyboard?.on('keydown-ENTER', () => this.play(false));
    this.input.keyboard?.on('keydown-SPACE', () => this.play(false));

    // debug hook for automated checks only (?debug)
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __ruzaTitle: { play: (fresh = false) => this.play(fresh), stage } });
  }

  private play(fresh: boolean): void {
    if (this.started) return;
    this.started = true;
    if (fresh) { this.registry.remove('mapPos'); this.registry.remove('dist'); restart(); }
    this.scene.start('map');
  }

  override update(_t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 100) / 1000;
    this.t += dt;
    const map = this.cache.json.get('map') as MapData;
    const world = getWorld(map);
    world.setYaw(Math.sin(this.t * 0.28) * 0.5);
    world.update(dt);
    void S;
  }
}
