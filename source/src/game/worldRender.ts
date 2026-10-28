import Phaser from 'phaser';
import { FONT } from '../config';
import { S, type MapData } from './mapData';

// Flat "city map" look (light ground, white roads with grey casings, beige buildings, house numbers), drawn once per 768 px
// chunk into a texture (cheap per frame, important on phones) and thrown away when far. Zoomed out, chunks are baked at half size.
const CH = 768;
const GROUND = 0xf3f1ea;
const PARK = 0xd8ebc4;
const PITCH = 0xdcefca;
const WATER = 0xbfe0f5;
const WATER_EDGE = 0xa6d2ee;
// 0 apartments, 1 house, 2 public, 3 commercial, 4 other
const BLD = [0xe2dcd0, 0xeee8de, 0xf0e2b8, 0xdfe7f1, 0xe6e6e6];
const BLD_EDGE = 0xc3bba9;

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

interface Bld { pts: Phaser.Math.Vector2[]; k: number; box: Box; n?: string; cx: number; cy: number; w: number; lights: { x: number; y: number }[] }
interface Chunk { rt: Phaser.GameObjects.RenderTexture; lights: Phaser.GameObjects.RenderTexture }

export class WorldRenderer {
  private chunks = new Map<string, Chunk>();
  private bld: Bld[] = [];
  private greens: { p: number[]; box: Box }[] = [];
  private roadBoxes: Box[] = [];
  private riverBoxes: Box[] = [];
  private lod = 1;

  constructor(private scene: Phaser.Scene, private map: MapData, private layer: Phaser.GameObjects.Layer) {
    this.map.buildings.forEach((b, idx) => {
      const flat = b.p.map((v) => v * S);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < flat.length; i += 2) pts.push(new Phaser.Math.Vector2(flat[i] as number, flat[i + 1] as number));
      const box = boxOf(flat, 14);
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
      const w = box[2] - box[0] - 28;
      const r = rng(idx * 7919 + 13);
      const lights: { x: number; y: number }[] = [];
      const want = Math.min(3, Math.ceil(((box[2] - box[0] - 28) * (box[3] - box[1] - 28)) / 1800));
      for (let n = 0, tries = 0; n < want && tries < 30; tries++) {
        const x = box[0] + 14 + r() * (box[2] - box[0] - 28), y = box[1] + 14 + r() * (box[3] - box[1] - 28);
        if (inside(x, y, flat)) { lights.push({ x, y }); n++; }
      }
      this.bld.push({ pts, k: b.k, box, n: b.n, cx, cy, w, lights });
    });
    this.greens = this.map.greens.map((p) => { const f = p.map((v) => v * S); return { p: f, box: boxOf(f) }; });
    this.roadBoxes = this.map.roads.map((l) => boxOf(l.p.map((v) => v * S), l.w * S));
    this.riverBoxes = this.map.rivers.map((l) => boxOf(l.p.map((v) => v * S), l.w * S));
  }

  /** Half-size baking when zoomed out saves memory on phones; crossing the threshold rebuilds the visible chunks. */
  setLod(lod: number): void {
    if (lod === this.lod) return;
    this.lod = lod;
    for (const c of this.chunks.values()) { c.rt.destroy(); c.lights.destroy(); }
    this.chunks.clear();
  }

  /** Builds chunks that are near the view and drops those that are far away. Call every frame. */
  update(view: Phaser.Geom.Rectangle, lightsAlpha: number, first = false): void {
    const cx0 = Math.floor((view.x - 200) / CH), cx1 = Math.floor((view.right + 200) / CH);
    const cy0 = Math.floor((view.y - 200) / CH), cy1 = Math.floor((view.bottom + 200) / CH);
    let budget = first ? 99 : 2;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CH > this.map.width * S || cy * CH > this.map.height * S) continue;
      if (!this.chunks.has(`${cx},${cy}`) && budget > 0) { this.build(cx, cy); budget--; }
    }
    for (const [key, c] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      if (cx < cx0 - 1 || cx > cx1 + 1 || cy < cy0 - 1 || cy > cy1 + 1) { c.rt.destroy(); c.lights.destroy(); this.chunks.delete(key); }
      else c.lights.setAlpha(lightsAlpha);
    }
  }

  private build(cx: number, cy: number): void {
    const r = this.lod;
    const x0 = cx * CH, y0 = cy * CH;
    const size = Math.ceil(CH * r);
    const g = this.scene.make.graphics({ x: -x0 * r, y: -y0 * r }, false).setScale(r);
    const pv = (flat: number[]): Phaser.Math.Vector2[] => { const o: Phaser.Math.Vector2[] = []; for (let i = 0; i < flat.length; i += 2) o.push(new Phaser.Math.Vector2(flat[i] as number, flat[i + 1] as number)); return o; };
    const line = (p: number[], width: number, color: number): void => {
      g.lineStyle(width, color, 1);
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) { const x = (p[i] as number) * S, y = (p[i + 1] as number) * S; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokePath();
    };

    g.fillStyle(GROUND, 1); g.fillRect(x0, y0, CH, CH);
    for (const gr of this.greens) if (hits(gr.box, x0, y0)) { g.fillStyle(PARK, 1); g.fillPoints(pv(gr.p), true); }
    this.map.pitches.forEach((p) => { const f = p.map((v) => v * S); if (hits(boxOf(f), x0, y0)) { g.fillStyle(PITCH, 1); g.fillPoints(pv(f), true); g.lineStyle(2, 0xb9d9a2, 1); g.strokePoints(pv(f), true); } });
    this.map.waters.forEach((p) => { const f = p.map((v) => v * S); if (hits(boxOf(f), x0, y0)) { g.fillStyle(WATER, 1); g.fillPoints(pv(f), true); } });
    this.map.rivers.forEach((l, i) => { if (hits(this.riverBoxes[i] as Box, x0, y0)) { line(l.p, l.w * S + 6, WATER_EDGE); line(l.p, l.w * S, WATER); } });

    // roads like a city map: casing first, then the fill; wide streets blue-grey, ordinary ones white, tracks pale
    const roads = this.map.roads.filter((_, i) => hits(this.roadBoxes[i] as Box, x0, y0));
    const casing = (w: number): [number, number] => (w >= 9 ? [0x9aa6c4, 5] : w >= 5 ? [0xc6c9d2, 4] : w > 3 ? [0xd8d4c6, 3] : [0xe3dcc4, 0]);
    const fill = (w: number): number => (w >= 9 ? 0xc3cde6 : w >= 5 ? 0xffffff : w > 3 ? 0xfbf9f1 : 0xece6d2);
    for (const l of roads) { const [c, e] = casing(l.w); if (e) line(l.p, l.w * S + e * 2, c); }
    for (const l of roads) line(l.p, l.w > 3 ? l.w * S : l.w * S + 1, fill(l.w));

    const mine = this.bld.filter((b) => hits(b.box, x0, y0));
    for (const b of mine) {
      g.fillStyle(BLD[b.k] as number, 1); g.fillPoints(b.pts, true);
      g.lineStyle(1.5, BLD_EDGE, 1); g.strokePoints(b.pts, true);
    }

    const rt = this.scene.add.renderTexture(x0, y0, size, size).setOrigin(0, 0).setScale(1 / r).setDepth(1);
    rt.draw(g);
    g.destroy();

    // house numbers only when baked at full size (zoomed in), small grey text in the middle of each house
    if (r === 1) {
      const t = this.scene.make.text({ x: 0, y: 0, text: '', style: { fontFamily: FONT, fontSize: '12px', color: '#8a8578' } }, false).setOrigin(0.5);
      for (const b of mine) {
        if (!b.n || b.w < 26 || b.cx < x0 || b.cx > x0 + CH || b.cy < y0 || b.cy > y0 + CH) continue;
        t.setText(b.n);
        rt.draw(t, b.cx - x0, b.cy - y0);
      }
      t.destroy();
    }
    this.layer.add(rt);

    // night lights: a few lit windows per house
    const lr = r * 0.5; // lights never need full detail
    const lsize = Math.ceil(CH * lr);
    const lg = this.scene.make.graphics({ x: -x0 * lr, y: -y0 * lr }, false).setScale(lr);
    for (const b of mine) for (const w of b.lights) {
      lg.fillStyle(0xffd77a, 0.28); lg.fillCircle(w.x, w.y, 9);
      lg.fillStyle(0xffd77a, 1); lg.fillRect(w.x - 3, w.y - 3, 6, 6);
    }
    const lights = this.scene.add.renderTexture(x0, y0, lsize, lsize).setOrigin(0, 0).setScale(1 / lr).setDepth(85).setAlpha(0);
    lights.draw(lg);
    lg.destroy();
    this.layer.add(lights);
    this.chunks.set(`${cx},${cy}`, { rt, lights });
  }
}
