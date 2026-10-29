import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FONT } from '../config';
import type { MapData } from './mapData';
import { addGun, buildRig, DESIGN_H, FACE_Y, pose, type Rig } from './figure3d';
import { LOOKS, type Look } from './sprites';
import { SEASON_COLORS, crownColor } from './seasons';
import { Match } from './football';
import { Stadium3D, footballLook } from './stadium3d';
import type { Season } from './state';
import { advanceWalker, makeCar, pickRoads, polyline, randomLook, sampleAt, type Walker } from './streetLife';

// Low-poly 3D town: OSM footprints extruded into houses, flat road ribbons, instanced trees and windows, billboard figures.
// Units are metres: x = east, z = south (map pixels / 3). Phaser keeps drawing the interface on a transparent canvas on top.

const ROOF = [0x8a8f9c, 0xb5483f, 0xcdb88a, 0x6f8aa8, 0x9a9da4];
const ROOF_BLOCK = [0x8a8f9c, 0x9a7f6a, 0x7f93a8, 0xa07a6a, 0x6f8a86];
const ROOF_HOUSE = [0xb5483f, 0x8a5a3a, 0x3f6f4a, 0x4a6fa5, 0x9a4a4a];
const WALL = [0xd9d0bf, 0xe6dccb, 0xe8d9b0, 0xcfd8e2, 0xcfcfcf];
const FOV = 32; // narrow lens: less perspective distortion at the edges of the screen
export const fovFor = (aspect: number): number => (aspect < 1 ? 48 : FOV);

interface Fig { sitting: boolean; rig: Rig | null; shadow: THREE.Mesh; tag: THREE.Sprite | null; visible: boolean; moving: boolean; x: number; z: number; yaw: number; targetYaw: number; t: number }
interface Tag { sprite: THREE.Sprite; px: number; kind: 'landmark' | 'shop' | 'name' | 'quest' }

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
  readonly city = new THREE.Group();
  private inInterior = false;
  private interior: THREE.Group | null = null;
  private idist = 52;
  private savedFog: THREE.Fog | null = null;
  private titleMode = false;
  private yaw = 0;
  private armed = new Set<string>();
  private cars: { g: THREE.Group; s: number; speed: number; lane: number; dir: number }[] = [];
  private carPath: THREE.Vector3[] = [];
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private figures = new Map<string, Fig>();
  private tags: Tag[] = [];
  private windows: THREE.InstancedMesh | null = null;
  private winLit: Uint8Array = new Uint8Array(0);
  private winMode = -1;
  private heads = new Map<string, HTMLImageElement | null>();
  private extraLooks = new Map<string, Look>();
  private traffic: { g: THREE.Group; w: Walker; lane: number }[] = [];
  private crowd: { id: string; w: Walker }[] = [];
  private ready: Promise<void>;
  private flatMats: { m: THREE.MeshBasicMaterial; base: THREE.Color; role?: string }[] = [];
  private season: Season = 'autumn';
  private skyDay = new THREE.Color(0xcfe3f1);
  private hemiGround = new THREE.Color(0xb9ac8c);
  private lastNight = 0;
  private stadium: Stadium3D | null = null;
  private match: Match | null = null;
  private matchRequested = false;
  private matchSeed = 1;
  private flakes: THREE.Points | null = null;
  private flakeSeed: Float32Array = new Float32Array(0);

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
    this.scene.add(this.hemi, this.sun, this.city);

    this.buildGround();
    this.buildBuildings();
    this.buildTrees();
    this.buildLabels();
    this.buildStreetLife();
    this.buildStadium();
    this.ready = this.loadFigures();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // --- flat ground layers ------------------------------------------------------------------------
  private flat(geo: THREE.BufferGeometry, color: number, order: number, role?: string): void {
    const mat = new THREE.MeshBasicMaterial({ color, depthWrite: false, side: THREE.DoubleSide });
    this.flatMats.push({ m: mat, base: new THREE.Color(color), role });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    this.city.add(m);
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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(m.width + 4000, m.height + 4000), (() => { const mat = new THREE.MeshBasicMaterial({ color: 0xece6d2, depthWrite: false, side: THREE.DoubleSide }); this.flatMats.push({ m: mat, base: new THREE.Color(0xece6d2), role: 'ground' }); return mat; })());
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(m.width / 2, 0, m.height / 2);
    ground.renderOrder = 0;
    this.city.add(ground);

    const merge = (geos: (THREE.BufferGeometry | null)[]): THREE.BufferGeometry | null => {
      const ok = geos.filter((g): g is THREE.BufferGeometry => g !== null).map((g) => g.toNonIndexed());
      return ok.length ? mergeGeometries(ok) : null;
    };
    const parks = merge(m.greens.map((p) => this.polyGeo(p, 0.02)));
    if (parks) this.flat(parks, 0xb9d98f, 1, 'parks');
    const pitches = merge(m.pitches.map((p) => this.polyGeo(p, 0.03)));
    if (pitches) this.flat(pitches, 0x9fd08a, 2, 'pitch');
    const waters = merge(m.waters.map((p) => this.polyGeo(p, 0.04)));
    if (waters) this.flat(waters, 0x72b5de, 3, 'water');
    const rv: number[] = [];
    for (const r of m.rivers) this.ribbon(r.p, r.w, 0.05, rv);
    if (rv.length) this.flat(this.posGeo(rv), 0x72b5de, 3, 'water');

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
    this.buildBridges();
  }

  /** Footbridges the map builder added over rivers: planks and two rails, walkable in the collision grid. */
  private buildBridges(): void {
    const deck = new THREE.MeshBasicMaterial({ color: 0x9a7a4e }), rail = new THREE.MeshBasicMaterial({ color: 0x5e452c });
    for (const b of this.map.bridges ?? []) {
      const g = new THREE.Group();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(b.l, 0.3, b.w), deck);
      plank.position.y = 0.22;
      g.add(plank);
      for (const side of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(b.l, 0.9, 0.22), rail);
        r.position.set(0, 0.75, side * (b.w / 2 - 0.1));
        g.add(r);
      }
      g.position.set(b.x, 0, b.y);
      g.rotation.y = -b.a; // local x runs across the river
      g.traverse((o) => { o.renderOrder = 9; });
      this.city.add(g);
    }
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
      this.city.add(mesh);
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
      this.city.add(im);
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
  private treePos: [number, number, number][] = [];
  private trunk: THREE.InstancedMesh | null = null;
  private crown: THREE.InstancedMesh | null = null;

  /** Places every tree; trees inside the rectangle are shrunk to nothing (the title screen keeps its line-up in view). */
  private applyTrees(ex: { x0: number; x1: number; z0: number; z1: number } | null): void {
    if (!this.trunk || !this.crown) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    this.treePos.forEach(([x, z, s], i) => {
      const hidden = ex !== null && x > ex.x0 && x < ex.x1 && z > ex.z0 && z < ex.z1;
      const k = hidden ? 0.0001 : s;
      m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(axis, hash(i) * 6.28), new THREE.Vector3(k, k, k));
      this.trunk?.setMatrixAt(i, m4);
      this.crown?.setMatrixAt(i, m4);
    });
    this.trunk.instanceMatrix.needsUpdate = true;
    this.crown.instanceMatrix.needsUpdate = true;
  }

  setTreeExclusion(ex: { x0: number; x1: number; z0: number; z1: number } | null): void { this.applyTrees(ex); }

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
    const c = new THREE.Color();
    pos.forEach((_p, i) => crown.setColorAt(i, crownColor(this.season, i, c)));
    this.treePos = pos;
    this.trunk = trunk;
    this.crown = crown;
    this.applyTrees(null);
    trunk.renderOrder = 22; crown.renderOrder = 22;
    this.city.add(trunk, crown);
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
    (kind === 'name' ? this.scene : this.city).add(s);
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
      this.city.add(m);
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
      this.heads.set(look.id, head);
      const f = this.figures.get(look.id);
      if (f) this.ensureRig(f, look.id);
    }));
  }

  /** Builds the 3D body once the portrait for its head has loaded. */
  private ensureRig(f: Fig, id: string): void {
    if (f.rig || !this.heads.has(id)) return;
    const look = LOOKS.find((l) => l.id === id) ?? this.extraLooks.get(id);
    if (!look) return;
    const rig = buildRig(look, this.heads.get(id) ?? null);
    rig.root.traverse((o) => { o.renderOrder = 30; });
    rig.face.renderOrder = 31;
    rig.root.visible = f.visible;
    rig.face.visible = f.visible;
    this.scene.add(rig.root, rig.face);
    f.rig = rig;
    if (this.armed.has(id)) addGun(rig);
  }

  /** Creates (once) a standing person; positions and walking are set with setFigure(). */
  addFigure(id: string, name: string | null): void {
    if (this.figures.has(id)) return;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 16;
    shadow.visible = false;
    const tag = name ? this.addTag(name, '#ffffff', 0, 0, 0, true, 'name') : null;
    if (tag) { tag.visible = false; (tag.material as THREE.SpriteMaterial).depthTest = false; tag.renderOrder = 50; }
    const fig: Fig = { sitting: false, rig: null, shadow, tag, visible: false, moving: false, x: 0, z: 0, yaw: 0, targetYaw: 0, t: 0 };
    this.figures.set(id, fig);
    this.scene.add(shadow);
    this.ensureRig(fig, id);
  }

  /** yaw: direction the person faces in radians (0 = towards the camera/south); omit to keep the current one. */
  setFigure(id: string, x: number, z: number, visible: boolean, moving = false, yaw?: number, sitting = false): void {
    const f = this.figures.get(id);
    if (!f) return;
    f.x = x; f.z = z; f.visible = visible; f.moving = moving; f.sitting = sitting;
    if (yaw !== undefined) f.targetYaw = yaw;
    f.shadow.position.set(x, 0.2, z);
    f.shadow.visible = visible;
    if (f.rig) { f.rig.root.visible = visible; f.rig.face.visible = visible; }
  }

  // --- street life: traffic and passers-by --------------------------------------------------------
  private buildStreetLife(): void {
    const sq = this.map.landmarks.find((l) => l.id === 'square')?.pos ?? [this.map.width / 2, this.map.height / 2];
    const seeded = (seed: number): (() => number) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
    const r = seeded(77);
    const colors = [0xd8352f, 0xf2c230, 0x2f7de1, 0xf2f2f2, 0x1f1f24, 0x3fae5a, 0xe86a1f, 0x8a8f9c];
    const mk = (l: { p: number[] }, speed: number, dir: number, s0: number): Walker => { const { cum, total } = polyline(l.p); return { path: l.p, cum, total, s: s0 * total, speed, dir }; };
    // cars: along the real streets near the centre, two lanes, back and forth
    const streets = pickRoads(this.map.roads, [sq[0], sq[1]], 70, 900, 650, 6, 14);
    for (let i = 0; i < Math.min(22, streets.length * 2); i++) {
      const l = streets[i % streets.length] as { p: number[]; w: number };
      const g = makeCar(colors[i % colors.length] as number);
      this.city.add(g);
      this.traffic.push({ g, w: mk(l, 7 + r() * 8, i % 2 === 0 ? 1 : -1, r()), lane: i % 2 === 0 ? 2.4 : -2.4 });
    }
    // passers-by: along footpaths and small streets
    const paths = pickRoads(this.map.roads, [sq[0], sq[1]], 40, 600, 500, 2, 6);
    for (let i = 0; i < Math.min(14, paths.length); i++) {
      const id = `ped${i}`;
      this.extraLooks.set(id, randomLook(id, r));
      this.heads.set(id, null);
      this.addFigure(id, null);
      this.crowd.push({ id, w: mk(paths[(i * 3) % paths.length] as { p: number[] }, 3.2 + r() * 1.6, r() < 0.5 ? 1 : -1, r()) });
    }
  }

  // --- bystanders: anonymous people who gather somewhere, e.g. the square in the evening ------------
  private bystanders: { id: string; x: number; z: number; yaw: number }[] = [];
  /** 0 = nobody, 1 = a few (daytime), 2 = everyone (evening) */
  private bystandersLevel = 0;

  /** The scene picks the spots (only it knows the free ground); here they only get a random look and a place. */
  addBystanders(spots: { x: number; z: number; yaw: number }[]): void {
    this.bystanders = [];
    let s = 4242;
    const r = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    spots.forEach((p, i) => {
      const id = `folk${i}`;
      this.extraLooks.set(id, randomLook(id, r));
      this.heads.set(id, null);
      this.addFigure(id, null);
      this.bystanders.push({ id, ...p });
    });
  }

  setBystandersLevel(level: 0 | 1 | 2): void { this.bystandersLevel = level; }

  // --- football at the stadium ---------------------------------------------------------------------
  private buildStadium(): void {
    const si = this.map.stadium;
    if (!si) return;
    this.stadium = new Stadium3D(si);
    this.stadium.setSeason(this.season);
    this.city.add(this.stadium.group);
    for (let i = 0; i < 22; i++) {
      const id = `pl${i}`;
      this.extraLooks.set(id, footballLook(id, i));
      this.heads.set(id, null);
      this.addFigure(id, null);
    }
  }

  /** A match is on (players, ball and fans appear) or not; a new match starts from the seed when it begins. */
  setMatchOn(on: boolean, seed: number): void { this.matchRequested = on; this.matchSeed = seed; if (!on) this.match = null; }
  matchScore(): [number, number] | null { return this.match ? [this.match.score[0], this.match.score[1]] : null; }

  private updateMatch(dt: number, show: boolean): void {
    const st = this.stadium;
    if (!st) return;
    const on = show && this.matchRequested;
    if (on && !this.match) {
      let s = this.matchSeed * 7919 + 13;
      this.match = new Match(st.info.l, st.info.w, () => { s = (s * 9301 + 49297) % 233280; return s / 233280; });
    }
    const m = this.match;
    if (m && on) m.step(Math.min(dt, 0.1));
    const c = Math.cos(st.info.a), sn = Math.sin(st.info.a);
    for (let i = 0; i < 22; i++) {
      const id = `pl${i}`;
      const p = m?.players[i];
      if (m && p && on) {
        const w = st.toWorld(p.u, p.v);
        this.setFigure(id, w.x, w.z, true, p.speed > 0.6, Math.atan2(p.hu * c - p.hv * sn, p.hu * sn + p.hv * c));
      } else this.setFigure(id, 0, 0, false);
    }
    if (m && on) { st.ball.position.set(m.ball.u, 0.95 + m.ball.h, m.ball.v); st.ball.visible = true; } else st.ball.visible = false;
    st.update(performance.now() / 1000, on, on && m ? m.cheer : 0);
  }

  streetStats(): { cars: number; walkers: number; first: { x: number; z: number } | null } {
    const c = this.traffic[0];
    return { cars: this.traffic.length, walkers: this.crowd.length, first: c ? { x: c.g.position.x, z: c.g.position.z } : null };
  }

  private updateStreetLife(dt: number): void {
    const carK = 1;
    for (const c of this.traffic) {
      advanceWalker(c.w, dt);
      const p = sampleAt(c.w, c.w.s), f = c.w.dir;
      c.g.position.set(p.x - p.dz * c.lane * f, 0, p.z + p.dx * c.lane * f);
      c.g.rotation.y = Math.atan2(p.dx * f, p.dz * f);
      c.g.scale.setScalar(carK);
    }
    const show = !this.inInterior && !this.titleMode;
    this.updateMatch(dt, show);
    this.bystanders.forEach((b, i) => this.setFigure(b.id, b.x, b.z, show && (this.bystandersLevel === 2 || (this.bystandersLevel === 1 && i % 2 === 0)), false, b.yaw));
    for (const c of this.crowd) {
      advanceWalker(c.w, dt);
      const p = sampleAt(c.w, c.w.s), f = c.w.dir;
      this.setFigure(c.id, p.x, p.z, show, true, Math.atan2(p.dx * f, p.dz * f));
    }
  }

  // --- quest markers: a glowing beam and a plate over every target ---------------------------------
  private questObjs: { beam: THREE.Mesh; tag: THREE.Sprite }[] = [];

  setQuestMarkers(list: { x: number; z: number; label: string }[]): void {
    for (const q of this.questObjs) {
      this.city.remove(q.beam, q.tag);
      const i = this.tags.findIndex((t) => t.sprite === q.tag);
      if (i >= 0) this.tags.splice(i, 1);
    }
    this.questObjs = [];
    for (const m of list) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 80, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(m.x, 40, m.z);
      beam.renderOrder = 45;
      this.city.add(beam);
      const tag = this.addTag('Задание: ' + m.label, '#ffd23a', m.x, 34, m.z, true, 'quest');
      this.questObjs.push({ beam, tag });
    }
  }

  // --- title screen: orbiting camera, cars on a street, armed heroes ------------------------------
  /** Recolours the town for a season and starts falling leaves or snow where the season has them. */
  setSeason(s: Season): void {
    this.season = s;
    const k = SEASON_COLORS[s];
    for (const f of this.flatMats) {
      const c = f.role ? k[f.role as 'ground' | 'parks' | 'pitch' | 'water'] : undefined;
      if (c !== undefined) f.base.set(c);
    }
    this.skyDay.set(k.sky);
    this.hemiGround.set(k.hemiGround);
    if (!this.inInterior) this.hemi.groundColor.copy(this.hemiGround);
    if (this.crown) {
      const c = new THREE.Color();
      for (let i = 0; i < this.treePos.length; i++) this.crown.setColorAt(i, crownColor(s, i, c));
      if (this.crown.instanceColor) this.crown.instanceColor.needsUpdate = true;
    }
    if (this.flakes) { this.city.remove(this.flakes); this.flakes.geometry.dispose(); this.flakes = null; }
    if (k.flake) {
      const n = 520, pos = new Float32Array(n * 3);
      this.flakeSeed = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos[i * 3] = (hash(i * 3 + 1) - 0.5) * 170; pos[i * 3 + 1] = hash(i * 3 + 2) * 60; pos[i * 3 + 2] = (hash(i * 3 + 3) - 0.5) * 170; this.flakeSeed[i] = hash(i + 77); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: k.flake, size: s === 'winter' ? 1.5 : 2.1, transparent: true, opacity: 0.9, depthWrite: false }));
      this.flakes.frustumCulled = false;
      this.flakes.renderOrder = 60;
      this.city.add(this.flakes);
    }
    this.stadium?.setSeason(s);
    this.setNight(this.lastNight);
  }

  private updateFlakes(dt: number): void {
    if (!this.flakes) return;
    this.flakes.visible = !this.inInterior;
    const p = this.flakes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fall = this.season === 'winter' ? 7 : 4.5, tx = this.smooth.x, tz = this.smooth.z, t = performance.now() / 1000;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const sd = this.flakeSeed[i] as number;
      y -= fall * (0.6 + sd * 0.8) * dt;
      x += Math.sin(t * (0.6 + sd) + i) * dt * (this.season === 'winter' ? 1.6 : 3.2);
      if (y < 0) y += 60;
      if (x - tx > 85) x -= 170; else if (x - tx < -85) x += 170;
      if (z - tz > 85) z -= 170; else if (z - tz < -85) z += 170;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  setTitleMode(on: boolean): void { this.titleMode = on; if (!on) { this.yaw = 0; this.clearCars(); this.applyTrees(null); } }
  setYaw(a: number): void { this.yaw = a; }

  armFigure(id: string): void {
    this.armed.add(id);
    const f = this.figures.get(id);
    if (f?.rig) addGun(f.rig);
  }

  clearCars(): void {
    for (const c of this.cars) this.city.remove(c.g);
    this.cars = [];
    this.carPath = [];
  }

  /** Cheerful low-poly cars drive back and forth along a straight street segment (x, z in metres). */
  spawnCars(a: [number, number], b: [number, number], count: number): void {
    this.clearCars();
    this.carPath = [new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1])];
    const colors = [0xd8352f, 0xf2c230, 0x2f7de1, 0xf2f2f2, 0x1f1f24, 0x3fae5a, 0xe86a1f];
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const body = new THREE.MeshLambertMaterial({ color: colors[i % colors.length], flatShading: true });
      const glass = new THREE.MeshLambertMaterial({ color: 0x8fb4d4, flatShading: true });
      const tyre = new THREE.MeshLambertMaterial({ color: 0x15151a, flatShading: true });
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      add(new THREE.BoxGeometry(2.1, 0.9, 4.4), body, 0, 0.85, 0);
      add(new THREE.BoxGeometry(1.8, 0.8, 2.3), glass, 0, 1.65, -0.15);
      add(new THREE.BoxGeometry(1.9, 0.12, 2.2), body, 0, 2.1, -0.15);
      for (const [x, z] of [[-1.1, 1.4], [1.1, 1.4], [-1.1, -1.4], [1.1, -1.4]] as [number, number][]) { const w = add(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), tyre, x, 0.5, z); w.rotation.z = Math.PI / 2; }
      for (const x of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.4, 0.25, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), x, 0.95, 2.2);
      g.traverse((o) => { o.renderOrder = 25; });
      this.city.add(g);
      this.cars.push({ g, s: (i / count) * 2, speed: 14 + (i % 3) * 5, lane: i % 2 === 0 ? 3.2 : -3.2, dir: i % 2 === 0 ? 1 : -1 });
    }
  }

  private updateCars(dt: number): void {
    if (this.carPath.length < 2) return;
    const a = this.carPath[0] as THREE.Vector3, b = this.carPath[1] as THREE.Vector3;
    const len = a.distanceTo(b);
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    for (const c of this.cars) {
      c.s += (c.speed * dt) / len;
      const t = c.s % 2; // 0..1 forward, 1..2 back
      const u = t < 1 ? t : 2 - t;
      const fwd = t < 1 ? 1 : -1;
      c.g.position.set(a.x + (b.x - a.x) * u - dz * c.lane * fwd, 0, a.z + (b.z - a.z) * u + dx * c.lane * fwd);
      c.g.rotation.y = Math.atan2(dx * fwd, dz * fwd);
    }
  }

  // --- inside a building ---------------------------------------------------------------------------
  /** Shows a room instead of the town: its own light, no fog, camera closer. */
  enterInterior(room: THREE.Group, bg: number, mood?: { sky: number; ground: number; i: number }): void {
    this.leaveInterior();
    this.interior = room;
    this.scene.add(room);
    this.city.visible = false;
    this.inInterior = true;
    this.savedFog = this.scene.fog as THREE.Fog | null;
    this.scene.fog = null;
    this.scene.background = new THREE.Color(bg);
    this.hemi.color.set(mood?.sky ?? 0xb7a4ff);
    this.hemi.groundColor.set(mood?.ground ?? 0x3a2a4a);
    this.hemi.intensity = mood?.i ?? 1.25;
    this.sun.intensity = 0.3;
    this.idist = 96;
    for (const f of this.figures.values()) { f.visible = false; if (f.rig) { f.rig.root.visible = false; f.rig.face.visible = false; } f.shadow.visible = false; if (f.tag) f.tag.visible = false; }
  }

  leaveInterior(): void {
    if (!this.inInterior) return;
    if (this.interior) {
      this.scene.remove(this.interior);
      this.interior.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
    }
    this.interior = null;
    this.inInterior = false;
    this.city.visible = true;
    if (this.savedFog) this.scene.fog = this.savedFog;
    this.hemi.groundColor.copy(this.hemiGround);
    for (const f of this.figures.values()) { f.visible = false; f.sitting = false; if (f.rig) { f.rig.root.visible = false; f.rig.face.visible = false; } f.shadow.visible = false; }
  }

  // --- camera, light, frame ----------------------------------------------------------------------
  setTarget(x: number, z: number): void { this.target.set(x, 0, z); }
  teleportCamera(x: number, z: number): void { this.target.set(x, 0, z); this.smooth.copy(this.target); }
  setDistance(d: number): void { if (this.inInterior) this.idist = Math.max(30, Math.min(120, d)); else this.dist = Math.max(45, Math.min(1500, d)); }
  getDistance(): number { return this.inInterior ? this.idist : this.dist; }

  /** night: 0 = day, 1 = deep night. */
  setNight(a: number): void {
    if (this.inInterior) return; // the room has its own light
    const k = Math.max(0, Math.min(1, a / 0.65));
    this.lastNight = a;
    const day = this.skyDay.clone(), night = new THREE.Color(0x0e1530);
    const sky = day.clone().lerp(night, k);
    this.scene.background = sky;
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(sky);
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
    this.camera.fov = fovFor(w / h);
    this.camera.updateProjectionMatrix();
  }

  show(on: boolean): void { this.canvas.style.display = on ? 'block' : 'none'; if (on) this.resize(); }
  whenReady(): Promise<void> { return this.ready; }

  update(dt: number): void {
    this.updateFlakes(dt);
    this.smooth.lerp(this.target, 1 - Math.exp(-dt * 6));
    const d = this.inInterior ? this.idist : this.dist;
    const pitch = this.inInterior ? THREE.MathUtils.degToRad(57) : this.titleMode ? THREE.MathUtils.degToRad(33) : this.pitch;
    this.camera.position.set(this.smooth.x + Math.sin(this.yaw) * Math.cos(pitch) * d, this.smooth.y + Math.sin(pitch) * d, this.smooth.z + Math.cos(this.yaw) * Math.cos(pitch) * d);
    this.camera.lookAt(this.smooth);
    if (this.scene.fog) { (this.scene.fog as THREE.Fog).near = d * 2.2; (this.scene.fog as THREE.Fog).far = d * 9; }

    // people keep a readable size however high the camera is
    const figH = this.inInterior ? 6.6 : this.titleMode ? 8.6 : 7.2; // real size: they do not grow when the camera zooms out
    const s = figH / DESIGN_H;
    const k = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hpx = this.canvas.clientHeight || window.innerHeight;
    const toCam = new THREE.Vector3();
    for (const f of this.figures.values()) {
      f.shadow.scale.setScalar(figH / 5.4);
      const rig = f.rig;
      if (rig) {
        let diff = f.targetYaw - f.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        f.yaw += diff * (1 - Math.exp(-dt * 12));
        f.t += dt * (f.moving ? 9 : 2);
        rig.root.position.set(f.x, 0, f.z);
        rig.root.rotation.y = f.yaw;
        rig.root.scale.setScalar(s);
        pose(rig, f.moving, f.t, f.sitting);
        const head = new THREE.Vector3(f.x, (FACE_Y + rig.bob.position.y) * s, f.z);
        toCam.copy(this.camera.position).sub(head).normalize();
        rig.face.position.copy(head).addScaledVector(toCam, 0.8 * s);
        rig.face.scale.setScalar(2.6 * s);
      }
      if (f.tag) {
        f.tag.visible = f.visible && d <= 700 && !this.titleMode;
        f.tag.position.set(f.x, figH + 1.2 * s, f.z);
        const ts = f.tag.userData as { aspect: number };
        const sy = (24 / hpx) * k;
        f.tag.scale.set(sy * ts.aspect, sy, 1);
      }
    }
    for (const t of this.tags) {
      if (t.kind === 'name') continue; // friends' name tags follow their figures above
      // far away only the important plates stay, otherwise the centre turns into a heap of labels
      t.sprite.visible = !this.titleMode && (t.kind === 'shop' ? d < 430 : true);
      const ts = t.sprite.userData as { aspect: number };
      const sy = (t.px / hpx) * k;
      t.sprite.scale.set(sy * ts.aspect, sy, 1);
    }
    this.updateCars(dt);
    this.updateStreetLife(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
