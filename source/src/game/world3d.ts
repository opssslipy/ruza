import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FONT } from '../config';
import type { MapData } from './mapData';
import { figureCanvas, FH, FW, LOOKS, type Look } from './sprites';

// Low-poly 3D town: OSM footprints extruded into houses, flat road ribbons, instanced trees and windows, billboard figures.
// Units are metres: x = east, z = south (map pixels / 3). Phaser keeps drawing the interface on a transparent canvas on top.

const ROOF = [0x8a8f9c, 0xb5483f, 0xcdb88a, 0x6f8aa8, 0x9a9da4];
const ROOF_BLOCK = [0x8a8f9c, 0x9a7f6a, 0x7f93a8, 0xa07a6a, 0x6f8a86];
const ROOF_HOUSE = [0xb5483f, 0x8a5a3a, 0x3f6f4a, 0x4a6fa5, 0x9a4a4a];
const WALL = [0xd9d0bf, 0xe6dccb, 0xe8d9b0, 0xcfd8e2, 0xcfcfcf];
const FIG_ASPECT = FW / FH;
const FOV = 45;

type Dir = 'down' | 'up' | 'left' | 'right';
interface Fig { sprite: THREE.Sprite; shadow: THREE.Mesh; tag: THREE.Sprite | null; tex: Record<string, THREE.Texture[]> | null; moving: boolean; dir: Dir; t: number }
interface Tag { sprite: THREE.Sprite; px: number; kind: 'landmark' | 'shop' | 'name' }

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export class World3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 6000);
  private target = new THREE.Vector3();
  private smooth = new THREE.Vector3();
  private dist = 140;
  private readonly pitch = THREE.MathUtils.degToRad(55);
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private figures = new Map<string, Fig>();
  private tags: Tag[] = [];
  private windows: THREE.InstancedMesh | null = null;
  private winLit: Uint8Array = new Uint8Array(0);
  private winMode = -1;
  private figTextures = new Map<string, Record<string, THREE.Texture[]>>();
  private ready: Promise<void>;
  private flatMats: { m: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];

  constructor(canvas: HTMLCanvasElement, private map: MapData) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0xcfe3f1);
    this.scene.background = new THREE.Color(0xcfe3f1);
    this.scene.fog = new THREE.Fog(0xcfe3f1, 400, 2400);
    this.hemi = new THREE.HemisphereLight(0xeaf2ff, 0xb9ac8c, 2.3);
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
    this.sun.position.set(-0.6, 1, 0.5);
    this.scene.add(this.hemi, this.sun);

    this.buildGround();
    this.buildBuildings();
    this.buildTrees();
    this.buildLabels();
    this.ready = this.loadFigures();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // --- flat ground layers ------------------------------------------------------------------------
  private flat(geo: THREE.BufferGeometry, color: number, order: number): void {
    const mat = new THREE.MeshBasicMaterial({ color, depthWrite: false, side: THREE.DoubleSide });
    this.flatMats.push({ m: mat, base: new THREE.Color(color) });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    this.scene.add(m);
  }

  private polyGeo(p: number[], y: number): THREE.BufferGeometry | null {
    try {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector2(p[i] as number, -(p[i + 1] as number)));
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
      g.rotateX(-Math.PI / 2);
      g.translate(0, y, 0);
      return g;
    } catch { return null; }
  }

  private ribbon(p: number[], w: number, y: number, pos: number[]): void {
    const n = p.length / 2;
    if (n < 2) return;
    const L: [number, number][] = [], R: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = (p[b * 2] as number) - (p[a * 2] as number), tz = (p[b * 2 + 1] as number) - (p[a * 2 + 1] as number);
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const x = p[i * 2] as number, z = p[i * 2 + 1] as number;
      L.push([x - tz * w / 2, z + tx * w / 2]); R.push([x + tz * w / 2, z - tx * w / 2]);
    }
    for (let i = 0; i + 1 < n; i++) {
      const a = L[i] as [number, number], b = R[i] as [number, number], c = L[i + 1] as [number, number], d = R[i + 1] as [number, number];
      pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], b[0], y, b[1], d[0], y, d[1], c[0], y, c[1]);
    }
  }

  private posGeo(pos: number[]): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // ribbons are built facing down in some winding orders: force normals up so the lighting is even
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
  }

  private buildGround(): void {
    const m = this.map;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(m.width + 4000, m.height + 4000), (() => { const mat = new THREE.MeshBasicMaterial({ color: 0xece6d2, depthWrite: false, side: THREE.DoubleSide }); this.flatMats.push({ m: mat, base: new THREE.Color(0xece6d2) }); return mat; })());
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(m.width / 2, 0, m.height / 2);
    ground.renderOrder = 0;
    this.scene.add(ground);

    const merge = (geos: (THREE.BufferGeometry | null)[]): THREE.BufferGeometry | null => {
      const ok = geos.filter((g): g is THREE.BufferGeometry => g !== null).map((g) => g.toNonIndexed());
      return ok.length ? mergeGeometries(ok) : null;
    };
    const parks = merge(m.greens.map((p) => this.polyGeo(p, 0.02)));
    if (parks) this.flat(parks, 0xb9d98f, 1);
    const pitches = merge(m.pitches.map((p) => this.polyGeo(p, 0.03)));
    if (pitches) this.flat(pitches, 0x9fd08a, 2);
    const waters = merge(m.waters.map((p) => this.polyGeo(p, 0.04)));
    if (waters) this.flat(waters, 0x72b5de, 3);
    const rv: number[] = [];
    for (const r of m.rivers) this.ribbon(r.p, r.w, 0.05, rv);
    if (rv.length) this.flat(this.posGeo(rv), 0x72b5de, 3);

    // roads: grey casing, lighter fill; tracks are pale dirt paths
    const cas: number[] = [], big: number[] = [], mid: number[] = [], small: number[] = [], path: number[] = [];
    for (const r of m.roads) {
      if (r.w > 3) this.ribbon(r.p, r.w + 1.6, 0.06, cas);
      this.ribbon(r.p, r.w > 3 ? r.w : r.w + 0.6, r.w >= 9 ? 0.07 : r.w >= 5 ? 0.08 : r.w > 3 ? 0.09 : 0.1, r.w >= 9 ? big : r.w >= 5 ? mid : r.w > 3 ? small : path);
    }
    if (cas.length) this.flat(this.posGeo(cas), 0xa6a89f, 4);
    if (big.length) this.flat(this.posGeo(big), 0xc7c9cf, 5);
    if (mid.length) this.flat(this.posGeo(mid), 0xd4d3cc, 6);
    if (small.length) this.flat(this.posGeo(small), 0xdcd6c2, 7);
    if (path.length) this.flat(this.posGeo(path), 0xd8cca8, 8);
  }

  // --- houses and windows ------------------------------------------------------------------------
  private buildBuildings(): void {
    const geos: THREE.BufferGeometry[] = [];
    const win: number[] = []; // x, y, z, yaw per window
    let id = 0;
    for (const b of this.map.buildings) {
      id++;
      const h = Math.max(3.4, Math.min(42, b.l * 3.1));
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < b.p.length; i += 2) pts.push(new THREE.Vector2(b.p[i] as number, -(b.p[i + 1] as number)));
      let g: THREE.ExtrudeGeometry;
      try { g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h, bevelEnabled: false }); } catch { continue; }
      g.rotateX(-Math.PI / 2);
      const roof = new THREE.Color(b.k === 1 ? (ROOF_HOUSE[Math.floor(hash(id) * ROOF_HOUSE.length)] as number) : b.k === 0 ? (ROOF_BLOCK[Math.floor(hash(id + 3) * ROOF_BLOCK.length)] as number) : (ROOF[b.k] as number));
      const wall = new THREE.Color(WALL[b.k] as number).multiplyScalar(0.92 + hash(id + 7) * 0.12);
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
      const col = new Float32Array(nrm.count * 3);
      for (let i = 0; i < nrm.count; i++) {
        const c = nrm.getY(i) > 0.5 ? roof : wall;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const ni = g.index ? g.toNonIndexed() : g;
      ni.deleteAttribute('uv');
      geos.push(ni);

      // windows on walls longer than 6 m (facing out of the polygon)
      let area = 0;
      const n = b.p.length / 2;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += (b.p[i * 2] as number) * (b.p[j * 2 + 1] as number) - (b.p[j * 2] as number) * (b.p[i * 2 + 1] as number); }
      const rows = Math.max(1, Math.min(6, Math.floor(b.l)));
      for (let i = 0; i < n && win.length < 4 * 28000; i++) {
        const j = (i + 1) % n;
        const ax = b.p[i * 2] as number, az = b.p[i * 2 + 1] as number, bx = b.p[j * 2] as number, bz = b.p[j * 2 + 1] as number;
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
        if (len < 6) continue;
        const nx = (area > 0 ? dz : -dz) / len, nz = (area > 0 ? -dx : dx) / len;
        const yaw = Math.atan2(nx, nz);
        for (let s = 2.4; s < len - 1.8; s += 4.4) {
          for (let r = 0; r < rows; r++) win.push(ax + (dx * s) / len + nx * 0.08, 1.7 + r * 3.1, az + (dz * s) / len + nz * 0.08, yaw);
        }
      }
    }
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(geos) as THREE.BufferGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.renderOrder = 20;
      this.scene.add(mesh);
    }
    const count = win.length / 4;
    if (count) {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.7), new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      this.winLit = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), win[i * 4 + 3] as number);
        p.set(win[i * 4] as number, win[i * 4 + 1] as number, win[i * 4 + 2] as number);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
        this.winLit[i] = hash(i * 31 + 5) < 0.5 ? 1 : 0;
      }
      im.renderOrder = 21;
      this.windows = im;
      this.scene.add(im);
      this.paintWindows(0);
    }
  }

  /** Window colours: pale glass by day, some of them lit warm at night. */
  private paintWindows(mode: number): void {
    if (!this.windows || mode === this.winMode) return;
    this.winMode = mode;
    const c = new THREE.Color();
    for (let i = 0; i < this.winLit.length; i++) {
      if (mode === 0) c.set(0x8fb0cc); else c.set(this.winLit[i] ? 0xffd27a : 0x2b3248);
      this.windows.setColorAt(i, c);
    }
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
  }

  // --- trees ---------------------------------------------------------------------------------------
  private blockedAt(x: number, z: number): boolean {
    const gx = Math.floor(x / this.map.cell), gy = Math.floor(z / this.map.cell);
    if (gx < 0 || gy < 0 || gx >= this.map.gridW || gy >= this.map.gridH) return true;
    const i = gy * this.map.gridW + gx;
    return (((this.bits ??= Uint8Array.from(atob(this.map.blocked), (ch) => ch.charCodeAt(0)))[i >> 3] as number) & (1 << (i & 7))) !== 0;
  }
  private bits: Uint8Array | null = null;

  private roadMask(): (x: number, z: number) => boolean {
    const C = 3, gw = Math.ceil(this.map.width / C) + 1, gh = Math.ceil(this.map.height / C) + 1;
    const m = new Uint8Array(gw * gh);
    for (const r of this.map.roads) {
      const half = r.w / 2 + 1.5;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] as number, az = r.p[i + 1] as number, bx = r.p[i + 2] as number, bz = r.p[i + 3] as number;
        const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / (C * 0.6)));
        for (let s = 0; s <= steps; s++) {
          const cx = ax + ((bx - ax) * s) / steps, cz = az + ((bz - az) * s) / steps;
          for (let gx = Math.floor((cx - half) / C); gx <= Math.floor((cx + half) / C); gx++) for (let gz = Math.floor((cz - half) / C); gz <= Math.floor((cz + half) / C); gz++) if (gx >= 0 && gz >= 0 && gx < gw && gz < gh) m[gz * gw + gx] = 1;
        }
      }
    }
    return (x, z) => { const gx = Math.floor(x / C), gz = Math.floor(z / C); return gx < 0 || gz < 0 || gx >= gw || gz >= gh ? true : m[gz * gw + gx] === 1; };
  }

  private buildTrees(): void {
    const pos: [number, number, number][] = [];
    const onRoad = this.roadMask();
    const inside = (x: number, z: number, p: number[]): boolean => {
      let c = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const xi = p[i] as number, zi = p[i + 1] as number, xj = p[j] as number, zj = p[j + 1] as number;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    this.map.greens.forEach((p, gi) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i] as number); x1 = Math.max(x1, p[i] as number); z0 = Math.min(z0, p[i + 1] as number); z1 = Math.max(z1, p[i + 1] as number); }
      const want = Math.min(700, Math.floor(((x1 - x0) * (z1 - z0)) / 200));
      for (let n = 0, t = 0; n < want && t < want * 8; t++) {
        const x = x0 + hash(gi * 9973 + t * 2) * (x1 - x0), z = z0 + hash(gi * 9973 + t * 2 + 1) * (z1 - z0);
        if (inside(x, z, p) && !this.blockedAt(x, z) && !onRoad(x, z)) { pos.push([x, z, 1.1 + hash(t + gi) * 0.8]); n++; }
      }
    });
    // yard trees next to houses and blocks, so the town is leafy like a real one
    this.map.buildings.forEach((b, i) => {
      if (pos.length > 6500) return;
      if (b.k === 1 ? hash(i * 3 + 1) > 0.8 : b.k === 0 ? hash(i * 3 + 2) > 0.9 : b.k === 4 ? hash(i * 3 + 4) > 0.15 : hash(i * 3 + 5) > 0.5) return;
      let cx = 0, cz = 0;
      const n = b.p.length / 2;
      for (let k = 0; k < n; k++) { cx += b.p[k * 2] as number; cz += b.p[k * 2 + 1] as number; }
      cx /= n; cz /= n;
      const a = hash(i * 7) * Math.PI * 2, r = (b.k === 0 ? 14 : 9) + hash(i * 11) * 5;
      for (let t = 0; t < 2; t++) {
        const aa = a + t * 2.4, rr = r + t * 4;
        const x = cx + Math.cos(aa) * rr, z = cz + Math.sin(aa) * rr;
        if (!this.blockedAt(x, z) && !onRoad(x, z)) pos.push([x, z, 1.0 + hash(i + t * 5) * 0.8]);
      }
    });
    if (!pos.length) return;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 5).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: 0x6a4a30 }), pos.length);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.7, 7, 6).translate(0, 5.4, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), pos.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    pos.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i) * 6.28), new THREE.Vector3(s, s, s));
      trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4);
      crown.setColorAt(i, c.setHSL(0.33 + hash(i + 3) * 0.04, 0.45, 0.2 + hash(i + 9) * 0.1));
    });
    trunk.renderOrder = 22; crown.renderOrder = 22;
    this.scene.add(trunk, crown);
  }

  // --- labels (street names on the ground, name plates in the air) ------------------------------------
  private plate(text: string, color: string, bold: boolean): { tex: THREE.CanvasTexture; w: number; h: number } {
    const font = `${bold ? 'bold ' : ''}26px ${FONT}`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.font = font;
    const tw = Math.ceil(g.measureText(text).width);
    c.width = tw + 64; c.height = 52;
    const g2 = c.getContext('2d') as CanvasRenderingContext2D;
    g2.font = font;
    g2.fillStyle = 'rgba(22,28,46,0.86)';
    g2.beginPath(); g2.roundRect(2, 2, c.width - 4, 48, 24); g2.fill();
    g2.fillStyle = color; g2.beginPath(); g2.arc(26, 26, 9, 0, Math.PI * 2); g2.fill();
    g2.strokeStyle = '#ffffff'; g2.lineWidth = 3; g2.stroke();
    g2.fillStyle = '#ffffff'; g2.textBaseline = 'middle'; g2.fillText(text, 46, 27);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, w: c.width, h: c.height };
  }

  private addTag(text: string, color: string, x: number, y: number, z: number, bold = true, kind: Tag['kind'] = 'landmark'): THREE.Sprite {
    const p = this.plate(text, color, bold);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: p.tex, sizeAttenuation: false, depthWrite: false, transparent: true }));
    s.center.set(0.5, 0);
    s.position.set(x, y, z);
    s.renderOrder = 40;
    s.userData = { aspect: p.w / p.h };
    this.tags.push({ sprite: s, px: bold ? 26 : 20, kind });
    this.scene.add(s);
    return s;
  }

  private buildLabels(): void {
    for (const l of this.map.landmarks) {
      const isHome = l.id === 'home', isVenue = l.kind === 'venue';
      this.addTag(isHome ? `Дом Стаса` : l.name, isHome ? '#ffb020' : isVenue ? '#2f7de1' : '#6fbf73', l.pos[0], 9, l.pos[1], true);
    }
    for (const sh of this.map.shops) {
      const name = sh.name.length > 22 ? `${sh.name.slice(0, 21)}…` : sh.name;
      this.addTag(name, '#8a96ae', sh.pos[0], 6, sh.pos[1], false, 'shop');
    }
    // street names flat on the ground along the road
    for (const s of this.map.streets) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      const font = `${s.big ? 'bold ' : ''}34px ${FONT}`;
      g.font = font;
      c.width = Math.ceil(g.measureText(s.n).width) + 12; c.height = 48;
      const g2 = c.getContext('2d') as CanvasRenderingContext2D;
      g2.font = font; g2.textBaseline = 'middle'; g2.lineJoin = 'round';
      g2.lineWidth = 6; g2.strokeStyle = 'rgba(246,244,238,0.9)'; g2.strokeText(s.n, 6, 25);
      g2.fillStyle = s.r ? '#3b86c0' : '#4a5260'; g2.fillText(s.n, 6, 25);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const h = s.big ? 8 : 6.5, w = (h * c.width) / c.height;
      const lm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      this.flatMats.push({ m: lm, base: new THREE.Color(0xffffff) });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lm);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = s.a; // along the road
      m.position.set(s.x, 0.15, s.y);
      m.renderOrder = 15;
      this.scene.add(m);
    }
  }

  // --- figures -------------------------------------------------------------------------------------
  private async loadFigures(): Promise<void> {
    await Promise.all(LOOKS.map(async (look: Look) => {
      const head = await new Promise<HTMLImageElement | null>((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = `portraits/${look.id}.svg`;
      });
      const tex: Record<string, THREE.Texture[]> = {};
      for (const dir of ['down', 'up', 'left'] as const) {
        tex[dir] = [0, 1, 2].map((f) => {
          const t = new THREE.CanvasTexture(figureCanvas(look, head, dir, f, 2));
          t.colorSpace = THREE.SRGBColorSpace;
          return t;
        });
      }
      this.figTextures.set(look.id, tex);
      const fig = this.figures.get(look.id);
      if (fig) { fig.tex = tex; this.applyFrame(fig, 0); }
    }));
  }

  private applyFrame(f: Fig, frame: number): void {
    if (!f.tex) return;
    const dir = f.dir === 'right' ? 'left' : f.dir;
    const t = (f.tex[dir] as THREE.Texture[])[frame] as THREE.Texture;
    const mat = f.sprite.material as THREE.SpriteMaterial;
    if (mat.map !== t) { mat.map = t; mat.needsUpdate = true; }
    f.sprite.userData.flip = f.dir === 'right' ? -1 : 1;
  }

  /** Creates (once) a standing figure; returns the id for the setters below. */
  addFigure(id: string, name: string | null): void {
    if (this.figures.has(id)) return;
    const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: true });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0.04);
    sprite.renderOrder = 30;
    sprite.visible = false;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 16;
    shadow.visible = false;
    const tag = name ? this.addTag(name, '#ffffff', 0, 0, 0, true, 'name') : null;
    if (tag) { tag.visible = false; (tag.material as THREE.SpriteMaterial).depthTest = false; tag.renderOrder = 50; }
    const fig: Fig = { sprite, shadow, tag, tex: this.figTextures.get(id) ?? null, moving: false, dir: 'down', t: 0 };
    this.figures.set(id, fig);
    this.scene.add(sprite, shadow);
    this.applyFrame(fig, 0);
  }

  setFigure(id: string, x: number, z: number, visible: boolean, moving = false, dir: Dir = 'down'): void {
    const f = this.figures.get(id);
    if (!f) return;
    f.sprite.position.set(x, 0, z);
    f.shadow.position.set(x, 0.2, z);
    f.sprite.visible = visible && !!f.tex;
    f.shadow.visible = visible;
    if (f.tag) f.tag.visible = visible;
    f.moving = moving;
    if (f.dir !== dir) { f.dir = dir; this.applyFrame(f, 0); }
  }

  // --- camera, light, frame ----------------------------------------------------------------------
  setTarget(x: number, z: number): void { this.target.set(x, 0, z); }
  teleportCamera(x: number, z: number): void { this.target.set(x, 0, z); this.smooth.copy(this.target); }
  setDistance(d: number): void { this.dist = Math.max(45, Math.min(1500, d)); }
  getDistance(): number { return this.dist; }

  /** night: 0 = day, 1 = deep night. */
  setNight(a: number): void {
    const k = Math.max(0, Math.min(1, a / 0.65));
    const day = new THREE.Color(0xcfe3f1), night = new THREE.Color(0x0e1530);
    const sky = day.clone().lerp(night, k);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.hemi.intensity = 2.3 - 1.5 * k;
    this.hemi.color.set(0xeaf2ff).lerp(new THREE.Color(0x4a5a90), k);
    this.sun.intensity = 2.4 - 2.1 * k;
    for (const f of this.flatMats) f.m.color.copy(f.base).multiplyScalar(1 - 0.72 * k).lerp(new THREE.Color(0x1a2450), 0.18 * k);
    this.paintWindows(k > 0.3 ? 1 : 0);
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 58 : FOV; // portrait phones need a wider lens to see enough of the street
    this.camera.updateProjectionMatrix();
  }

  show(on: boolean): void { this.canvas.style.display = on ? 'block' : 'none'; if (on) this.resize(); }
  whenReady(): Promise<void> { return this.ready; }

  update(dt: number): void {
    this.smooth.lerp(this.target, 1 - Math.exp(-dt * 6));
    const d = this.dist;
    this.camera.position.set(this.smooth.x, this.smooth.y + Math.sin(this.pitch) * d, this.smooth.z + Math.cos(this.pitch) * d);
    this.camera.lookAt(this.smooth);
    (this.scene.fog as THREE.Fog).near = d * 2.2;
    (this.scene.fog as THREE.Fog).far = d * 9;

    // figures keep a readable size however high the camera is
    const figH = Math.max(5.2, d * 0.07);
    const k = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hpx = this.canvas.clientHeight || window.innerHeight;
    for (const f of this.figures.values()) {
      const flip = (f.sprite.userData.flip as number | undefined) ?? 1;
      f.sprite.scale.set(figH * FIG_ASPECT * flip, figH, 1);
      f.shadow.scale.setScalar(figH / 5.2);
      if (f.moving) { f.t += dt * 8; this.applyFrame(f, [1, 0, 2, 0][Math.floor(f.t) % 4] as number); } else if (f.t !== 0) { f.t = 0; this.applyFrame(f, 0); }
      if (f.tag) {
        f.tag.visible = f.sprite.visible && d <= 700;
        f.tag.position.set(f.sprite.position.x, figH + 0.8, f.sprite.position.z);
        const ts = f.tag.userData as { aspect: number };
        const sy = (24 / hpx) * k;
        f.tag.scale.set(sy * ts.aspect, sy, 1);
      }
    }
    for (const t of this.tags) {
      if (t.kind === 'name') continue; // friends' name tags follow their figures above
      // far away only the important plates stay, otherwise the centre turns into a heap of labels
      t.sprite.visible = t.kind === 'shop' ? d < 430 : true;
      const ts = t.sprite.userData as { aspect: number };
      const sy = (t.px / hpx) * k;
      t.sprite.scale.set(sy * ts.aspect, sy, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
