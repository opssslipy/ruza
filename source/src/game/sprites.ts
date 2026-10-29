import Phaser from 'phaser';
import looks from '../content/looks.json';

// Chibi figures: a cartoon body in a costume invented from the character's description, topped with the character's own
// portrait as the head (the photo for friends who gave one). Everything is drawn once into a small canvas atlas per character.
export interface Look {
  id: string; skin: string; hair: string; hairColor: string; extra: string; pants: string; mouth: string;
  outfit: string; c1: string; c2: string; tie?: string; shoes: string; hat: string; hatColor?: string; prop: string; chain?: boolean; bun?: boolean;
}
export const LOOKS = looks as unknown as Look[];

export const FW = 72;
export const FH = 104;
const OUT = '#2a1f1a';
const DIRS = ['down', 'up', 'left'] as const;
export type Dir = (typeof DIRS)[number];

type Ctx = CanvasRenderingContext2D;

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function paint(c: Ctx, fill: string, lw = 2): void {
  c.fillStyle = fill; c.fill();
  c.lineWidth = lw; c.strokeStyle = OUT; c.stroke();
}
function poly(c: Ctx, pts: [number, number][], fill: string, lw = 2): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  paint(c, fill, lw);
}
const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

function drawFigure(c: Ctx, look: Look, head: CanvasImageSource | null, dir: Dir, frame: number): void {
  const sw = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const bob = frame === 0 ? 0 : -1.5;
  const skirt = look.outfit === 'dress' || look.outfit === 'robe';
  const legColor = skirt ? look.skin : look.pants;

  // ground shadow
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(36, 100, 21, 5, 0, 0, Math.PI * 2); c.fill();

  // ---- legs
  if (dir === 'left') {
    for (const [x, col] of [[36 - 5 - sw * 7, shade(legColor, 0.8)], [36 - 5 + sw * 7, legColor]] as [number, string][]) {
      rr(c, x, 80, 10, 20, 3); paint(c, col);
      rr(c, x - 3, 94, 14, 6, 3); paint(c, look.shoes);
    }
  } else {
    for (const [x, lift] of [[36 - 13, sw === 1 ? 5 : 0], [36 + 2, sw === -1 ? 5 : 0]] as [number, number][]) {
      rr(c, x, 80, 11, 20 - lift, 3); paint(c, legColor);
      rr(c, x - 1, 94 - lift, 13, 6, 3); paint(c, look.shoes);
    }
  }

  c.save();
  c.translate(0, bob);

  // ---- back accessories (behind the torso)
  if (look.prop === 'backpack') { rr(c, 36 - 17, 56, 34, 28, 6); paint(c, '#3d4a3a'); }

  // ---- arms (sleeves + hands); drawn before the torso for side view, after for front view
  const sleeve = look.outfit === 'overalls' ? look.c2 : look.outfit === 'dress' ? look.c1 : look.c1;
  const arm = (x: number, dy: number): void => {
    rr(c, x, 57 + dy, 9, 23, 4); paint(c, sleeve);
    c.beginPath(); c.arc(x + 4.5, 82 + dy, 4.6, 0, Math.PI * 2); paint(c, look.skin);
  };
  if (dir === 'left') arm(36 - 4 - sw * 6, 0);

  // ---- torso
  const tw = dir === 'left' ? 24 : 32;
  const tx = 36 - tw / 2;
  if (look.outfit === 'dress') {
    rr(c, tx + 2, 54, tw - 4, 26, 7); paint(c, look.c1);
    poly(c, [[36 - 15, 74], [36 + 15, 74], [36 + 23, 95], [36 - 23, 95]], look.c1);
  } else if (look.outfit === 'robe') {
    rr(c, tx - 2, 54, tw + 4, 40, 9); paint(c, look.c1);
  } else {
    rr(c, tx, 54, tw, 28, 7); paint(c, look.c1);
  }

  if (dir !== 'up') {
    switch (look.outfit) {
      case 'suit':
        poly(c, [[36 - 7, 55], [36 + 7, 55], [36, 70]], look.c2, 1.5);
        poly(c, [[36 + (look.id === 'lev' ? 3 : 0), 57], [36 + 3 + (look.id === 'lev' ? 3 : 0), 61], [36 + 1 + (look.id === 'lev' ? 5 : 0), 74], [36 - 1 + (look.id === 'lev' ? 2 : 0), 74], [36 - 3 + (look.id === 'lev' ? 3 : 0), 61]], look.tie ?? '#aa3333', 1.5);
        c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.moveTo(36 - 7, 55); c.lineTo(36 - 2, 78); c.moveTo(36 + 7, 55); c.lineTo(36 + 2, 78); c.stroke();
        break;
      case 'jacket':
        c.strokeStyle = look.c2; c.lineWidth = 2; c.beginPath(); c.moveTo(36, 56); c.lineTo(36, 82); c.stroke();
        c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.moveTo(36 - 9, 55); c.lineTo(36 - 3, 62); c.moveTo(36 + 9, 55); c.lineTo(36 + 3, 62); c.stroke();
        break;
      case 'hoodie':
        c.beginPath(); c.ellipse(36, 56, 13, 5, 0, 0, Math.PI * 2); paint(c, shade(look.c1, 0.75), 1.5);
        rr(c, 36 - 10, 70, 20, 9, 3); paint(c, shade(look.c1, 0.82), 1.5);
        c.strokeStyle = look.c2; c.lineWidth = 1.2; c.beginPath(); c.moveTo(36 - 4, 58); c.lineTo(36 - 4, 66); c.moveTo(36 + 4, 58); c.lineTo(36 + 4, 66); c.stroke();
        if (look.prop === 'stars') { c.fillStyle = look.c2; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillText('★', 36 - 8, 68); c.fillText('★', 36 + 8, 64); c.fillText('★', 36 + 2, 78); }
        break;
      case 'uniform':
        rr(c, 36 - 17, 54, 11, 4, 1); paint(c, look.c2, 1); rr(c, 36 + 6, 54, 11, 4, 1); paint(c, look.c2, 1);
        for (const y of [61, 68, 75]) { c.beginPath(); c.arc(36, y, 1.8, 0, Math.PI * 2); c.fillStyle = look.c2; c.fill(); }
        poly(c, [[36 - 3, 55], [36 + 3, 55], [36 + 1, 66], [36 - 1, 66]], '#111111', 1);
        break;
      case 'overalls':
        rr(c, 36 - 11, 60, 22, 22, 3); paint(c, shade(look.c1, 0.9), 1.5);
        c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.moveTo(36 - 9, 60); c.lineTo(36 - 12, 55); c.moveTo(36 + 9, 60); c.lineTo(36 + 12, 55); c.stroke();
        if (look.prop === 'bolt') poly(c, [[36 + 2, 62], [36 - 5, 72], [36 - 1, 72], [36 - 3, 80], [36 + 5, 69], [36 + 1, 69]], '#ffd23a', 1);
        break;
      case 'robe':
        poly(c, [[36 - 7, 55], [36 + 7, 55], [36, 70]], look.c2, 1.5);
        rr(c, tx - 2, 72, tw + 4, 5, 1); paint(c, look.c2, 1.5);
        break;
      default:
        break;
    }
  }

  // arms in front view
  if (dir !== 'left') { arm(36 - 25, sw * 3); arm(36 + 16, -sw * 3); }

  // props on the body
  if (dir !== 'up') {
    if (look.prop === 'chain' || look.chain) { c.strokeStyle = look.prop === 'chain' ? '#f0c040' : '#d8d8d8'; c.lineWidth = 3; c.beginPath(); c.arc(36, 55, 9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    if (look.prop === 'mug') { const mx = dir === 'left' ? 36 - 4 - sw * 6 + 6 : 36 + 22; rr(c, mx, 76, 10, 11, 2); paint(c, '#ffffff', 1.5); c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.arc(mx + 11, 81, 3, -Math.PI / 2, Math.PI / 2); c.stroke(); }
    if (look.prop === 'wbbag') { rr(c, 36 - 33, 72, 15, 17, 3); paint(c, '#8b2fa8', 1.5); c.fillStyle = '#ffffff'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.fillText('WB', 36 - 25.5, 83); }
    if (look.prop === 'bags') { rr(c, 36 - 31, 82, 11, 13, 2); paint(c, '#f4f4f4', 1.5); rr(c, 36 + 20, 82, 11, 13, 2); paint(c, '#f7c6d8', 1.5); }
    if (look.prop === 'keys') { c.fillStyle = '#111'; rr(c, 36 + 8, 76, 4, 8, 1); c.fill(); c.fillStyle = '#d33'; c.beginPath(); c.arc(36 + 10, 87, 2, 0, Math.PI * 2); c.fill(); }
  }

  // ---- head
  const hx = 36, hy = 30, hr = 24;
  c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2);
  if (dir === 'up' || !head) {
    paint(c, look.hair === 'bald' ? look.skin : look.hairColor, 2.5);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(hx - 6, hy - 8, 9, 6, -0.5, 0, Math.PI * 2); c.fill();
  } else {
    c.save(); c.clip();
    c.drawImage(head, hx - hr - 3, hy - hr - 3, (hr + 3) * 2, (hr + 3) * 2);
    c.restore();
    c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
  }

  // ---- hats over the head
  const hc = look.hatColor ?? look.c1;
  if (look.hat === 'cap') {
    c.beginPath(); c.arc(hx, hy - 3, hr + 0.5, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); paint(c, hc);
    if (dir !== 'up') { rr(c, hx - (dir === 'left' ? 30 : 20), hy - 8, dir === 'left' ? 30 : 40, 5, 2); paint(c, shade(hc, 0.85), 1.5); }
  } else if (look.hat === 'helmet') {
    c.beginPath(); c.arc(hx, hy - 3, hr + 1, Math.PI, Math.PI * 2); c.closePath(); paint(c, hc);
    rr(c, hx - hr - 3, hy - 5, (hr + 3) * 2, 5, 2); paint(c, shade(hc, 0.85), 1.5);
    rr(c, hx - 3, hy - hr - 3, 6, 12, 2); paint(c, shade(hc, 0.9), 1.2);
  } else if (look.hat === 'peaked') {
    rr(c, hx - hr + 1, hy - hr - 2, (hr - 1) * 2, 15, 4); paint(c, hc);
    rr(c, hx - hr - 1, hy - 10, (hr + 1) * 2, 6, 2); paint(c, look.c2, 1.5);
    if (dir !== 'up') { rr(c, hx - hr, hy - 5, hr * 2, 5, 2); paint(c, '#111111', 1.5); c.beginPath(); c.arc(hx, hy - 15, 3, 0, Math.PI * 2); c.fillStyle = look.c2; c.fill(); }
  }
  c.restore();
}

/** Builds the sprite atlas and walk animations for every character. `portrait-<id>` textures must be loaded first. */
export function ensureSprites(scene: Phaser.Scene): void {
  for (const look of LOOKS) {
    const key = `fig-${look.id}`;
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, FW * 3, FH * 3);
    if (!tex) continue;
    const ctx = tex.getContext();
    const hasHead = scene.textures.exists(`portrait-${look.id}`);
    const head = hasHead ? (scene.textures.get(`portrait-${look.id}`).getSourceImage() as CanvasImageSource) : null;
    DIRS.forEach((dir, row) => {
      for (let f = 0; f < 3; f++) {
        ctx.save();
        ctx.translate(f * FW, row * FH);
        ctx.beginPath(); ctx.rect(0, 0, FW, FH); ctx.clip();
        drawFigure(ctx, look, head, dir, f);
        ctx.restore();
        tex.add(`${dir}-${f}`, 0, f * FW, row * FH, FW, FH);
      }
    });
    tex.refresh();
    for (const dir of DIRS) {
      if (scene.anims.exists(`${look.id}-${dir}`)) continue;
      scene.anims.create({
        key: `${look.id}-${dir}`,
        frames: [1, 0, 2, 0].map((f) => ({ key, frame: `${dir}-${f}` })),
        frameRate: 8,
        repeat: -1,
      });
    }
  }
}

/** One figure frame on its own canvas (used by the 3D world); `scale` 2 keeps the billboard sharp when it is close to the camera. */
export function figureCanvas(look: Look, head: CanvasImageSource | null, dir: Dir, frame: number, scale = 2): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FW * scale;
  cv.height = FH * scale;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  drawFigure(ctx, look, head, dir, frame);
  return cv;
}
