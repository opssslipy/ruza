import Phaser from 'phaser';
import { S, type MapData } from './mapData';

// The city is drawn once per 768 px chunk into a texture (cheap per frame, important on phones) and thrown away when far.
const CH = 768;
const ROOF = [0xe8e2d6, 0xdd9270, 0xf0d78c, 0xa9c8e8, 0xc9ccd0];
const GROUND = 0xdde4c6;
const PARK = 0xbfdc9a;
const PITCH = 0x9fd08a;
const WATER = 0x8fc3e6;
const WATER_EDGE = 0x6ea8d0;

const darken = (c: number, f: number): number => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Box = [number, number, number, number];
const boxOf = (p: number[], pad = 0): Box => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i] as number, y = p[i + 1] as number;
    a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y);
  }
  return [a - pad, b - pad, c + pad, d + pad];
};
const hits = (a: Box, x0: number, y0: number): boolean => a[2] >= x0 && a[0] <= x0 + CH && a[3] >= y0 && a[1] <= y0 + CH;

function inside(x: number, y: number, p: number[]): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i] as number, yi = p[i + 1] as number, xj = p[j] as number, yj = p[j + 1] as number;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

interface Bld { pts: Phaser.Math.Vector2[]; flat: number[]; k: number; h: number; box: Box; wins: { x: number; y: number }[]; sa: number }
interface Chunk { rt: Phaser.GameObjects.RenderTexture; lights: Phaser.GameObjects.RenderTexture }

export class WorldRenderer {
  private chunks = new Map<string, Chunk>();
  private bld: Bld[] = [];
  private greens: { p: number[]; box: Box; trees: { x: number; y: number }[] }[] = [];
  private roadBoxes: Box[] = [];
  private riverBoxes: Box[] = [];

  constructor(private scene: Phaser.Scene, private map: MapData, private layer: Phaser.GameObjects.Layer) {
    this.map.buildings.forEach((b, idx) => {
      const flat = b.p.map((v) => v * S);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < flat.length; i += 2) pts.push(new Phaser.Math.Vector2(flat[i] as number, flat[i + 1] as number));
      let sa = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i] as Phaser.Math.Vector2, c = pts[(i + 1) % pts.length] as Phaser.Math.Vector2; sa += a.x * c.y - c.x * a.y; }
      const h = Math.max(7, Math.min(40, b.l * 4.2));
      const bd: Bld = { pts, flat, k: b.k, h, box: boxOf(flat, h + 12), wins: [], sa };
      // windows on the south-facing walls (same positions are lit at night)
      const rows = Math.max(1, Math.min(3, Math.floor(b.l)));
      const r = rng(idx * 7919 + 13);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i] as Phaser.Math.Vector2, c = pts[(i + 1) % pts.length] as Phaser.Math.Vector2;
        const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy);
        const ny = sa > 0 ? -dx : dx; // outward normal y (see build-map notes)
        if (len < 14 || ny / len < 0.35) continue;
        for (let s = 8; s < len - 6; s += 13) {
          const x = a.x + (dx * s) / len, y = a.y + (dy * s) / len;
          for (let row = 0; row < rows; row++) if (r() < 0.85) bd.wins.push({ x, y: y - (h * (row + 0.55)) / rows });
        }
      }
      this.bld.push(bd);
    });
    this.map.greens.forEach((p, i) => {
      const flat = p.map((v) => v * S);
      const box = boxOf(flat);
      const r = rng(i * 104729 + 5);
      const trees: { x: number; y: number }[] = [];
      const want = Math.min(160, Math.floor(((box[2] - box[0]) * (box[3] - box[1])) / 2600));
      for (let n = 0, tries = 0; n < want && tries < want * 12; tries++) {
        const x = box[0] + r() * (box[2] - box[0]), y = box[1] + r() * (box[3] - box[1]);
        if (inside(x, y, flat)) { trees.push({ x, y }); n++; }
      }
      this.greens.push({ p: flat, box, trees });
    });
    this.roadBoxes = this.map.roads.map((l) => boxOf(l.p.map((v) => v * S), l.w * S));
    this.riverBoxes = this.map.rivers.map((l) => boxOf(l.p.map((v) => v * S), l.w * S));
  }

  /** Builds chunks that are near the view and drops those that are far away. Call every frame. */
  update(view: Phaser.Geom.Rectangle, lightsAlpha: number, first = false): void {
    const cx0 = Math.floor((view.x - 300) / CH), cx1 = Math.floor((view.right + 300) / CH);
    const cy0 = Math.floor((view.y - 300) / CH), cy1 = Math.floor((view.bottom + 300) / CH);
    let budget = first ? 99 : 1;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CH > this.map.width * S || cy * CH > this.map.height * S) continue;
      if (!this.chunks.has(`${cx},${cy}`) && budget > 0) { this.build(cx, cy); budget--; }
    }
    for (const [key, c] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      if (cx < cx0 - 2 || cx > cx1 + 2 || cy < cy0 - 2 || cy > cy1 + 2) { c.rt.destroy(); c.lights.destroy(); this.chunks.delete(key); }
      else c.lights.setAlpha(lightsAlpha);
    }
  }

  private build(cx: number, cy: number): void {
    const x0 = cx * CH, y0 = cy * CH;
    const g = this.scene.make.graphics({ x: -x0, y: -y0 }, false);
    const pv = (flat: number[]): Phaser.Math.Vector2[] => { const o: Phaser.Math.Vector2[] = []; for (let i = 0; i < flat.length; i += 2) o.push(new Phaser.Math.Vector2(flat[i] as number, flat[i + 1] as number)); return o; };
    const line = (p: number[], width: number, color: number, alpha = 1): void => {
      g.lineStyle(width, color, alpha);
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) { const x = (p[i] as number) * S, y = (p[i + 1] as number) * S; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokePath();
    };

    g.fillStyle(GROUND, 1); g.fillRect(x0, y0, CH, CH);
    for (const gr of this.greens) if (hits(gr.box, x0, y0)) { g.fillStyle(PARK, 1); g.fillPoints(pv(gr.p), true); }
    this.map.pitches.forEach((p) => { const f = p.map((v) => v * S); if (hits(boxOf(f), x0, y0)) { g.fillStyle(PITCH, 1); g.fillPoints(pv(f), true); g.lineStyle(2, 0xffffff, 0.7); g.strokePoints(pv(f), true); } });
    this.map.waters.forEach((p) => { const f = p.map((v) => v * S); if (hits(boxOf(f), x0, y0)) { g.fillStyle(WATER, 1); g.fillPoints(pv(f), true); } });
    this.map.rivers.forEach((l, i) => { if (hits(this.riverBoxes[i] as Box, x0, y0)) { line(l.p, l.w * S + 8, WATER_EDGE); line(l.p, l.w * S, WATER); } });

    // roads: edge, asphalt, centre dashes on wider streets; narrow ways are plain dirt paths
    const roads = this.map.roads.filter((_, i) => hits(this.roadBoxes[i] as Box, x0, y0));
    for (const l of roads) if (l.w > 3) line(l.p, l.w * S + 7, 0x9da2ad);
    for (const l of roads) line(l.p, l.w > 3 ? l.w * S : l.w * S + 2, l.w > 3 ? 0xc8ccd3 : 0xe9dcb8);
    for (const l of roads) {
      if (l.w < 6) continue;
      g.lineStyle(2, 0xffffff, 0.85);
      for (let i = 0; i + 3 < l.p.length; i += 2) {
        const ax = (l.p[i] as number) * S, ay = (l.p[i + 1] as number) * S, bx = (l.p[i + 2] as number) * S, by = (l.p[i + 3] as number) * S;
        const len = Math.hypot(bx - ax, by - ay);
        for (let t = 0; t < len; t += 30) { const t2 = Math.min(t + 16, len); g.beginPath(); g.moveTo(ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len); g.lineTo(ax + ((bx - ax) * t2) / len, ay + ((by - ay) * t2) / len); g.strokePath(); }
      }
    }

    const mine = this.bld.filter((b) => hits(b.box, x0, y0));
    // soft shadows first so they sit under every building
    g.fillStyle(0x000000, 0.2);
    for (const b of mine) g.fillPoints(b.pts.map((p) => new Phaser.Math.Vector2(p.x + 7, p.y + 8)), true);
    const north = new Phaser.Math.Vector2(0, 0);
    for (const b of mine) {
      const wall = darken(ROOF[b.k] as number, 0.72);
      g.fillStyle(wall, 1); g.fillPoints(b.pts, true);
      // wall quads: those facing north end up hidden under the roof, so all edges can be drawn without orientation tests
      for (let i = 0; i < b.pts.length; i++) {
        const a = b.pts[i] as Phaser.Math.Vector2, c = b.pts[(i + 1) % b.pts.length] as Phaser.Math.Vector2;
        g.fillStyle(wall, 1);
        g.fillPoints([a, c, north.clone().set(c.x, c.y - b.h), north.clone().set(a.x, a.y - b.h)], true);
      }
      for (const w of b.wins) { g.fillStyle(0x8fb4d4, 1); g.fillRect(w.x - 2.5, w.y - 2.5, 5, 5); }
      const roof = b.pts.map((p) => new Phaser.Math.Vector2(p.x, p.y - b.h));
      g.fillStyle(ROOF[b.k] as number, 1); g.fillPoints(roof, true);
      g.lineStyle(1.5, 0x000000, 0.28); g.strokePoints(roof, true);
    }
    // trees over everything except buildings, so parks read as parks
    for (const gr of this.greens) {
      if (!hits(gr.box, x0, y0)) continue;
      for (const t of gr.trees) {
        if (t.x < x0 - 20 || t.x > x0 + CH + 20 || t.y < y0 - 20 || t.y > y0 + CH + 20) continue;
        g.fillStyle(0x000000, 0.2); g.fillEllipse(t.x + 4, t.y + 6, 24, 12);
        g.fillStyle(0x4f9a4a, 1); g.fillCircle(t.x, t.y - 6, 11);
        g.lineStyle(1.5, 0x2f6b2f, 1); g.strokeCircle(t.x, t.y - 6, 11);
        g.fillStyle(0x7cc26e, 1); g.fillCircle(t.x - 3, t.y - 10, 5);
      }
    }

    const rt = this.scene.add.renderTexture(x0, y0, CH, CH).setOrigin(0, 0).setDepth(1);
    rt.draw(g);
    g.destroy();
    this.layer.add(rt);

    // night lights: the same windows, lit
    const lg = this.scene.make.graphics({ x: -x0, y: -y0 }, false);
    const r = rng(cx * 73856093 + cy * 19349663);
    for (const b of mine) for (const w of b.wins) {
      if (r() < 0.55) { lg.fillStyle(0xffd77a, 1); lg.fillRect(w.x - 2.5, w.y - 2.5, 5, 5); lg.fillStyle(0xffd77a, 0.25); lg.fillCircle(w.x, w.y, 7); }
    }
    const lights = this.scene.add.renderTexture(x0, y0, CH, CH).setOrigin(0, 0).setDepth(85).setAlpha(0);
    lights.draw(lg);
    lg.destroy();
    this.layer.add(lights);
    this.chunks.set(`${cx},${cy}`, { rt, lights });
  }
}
