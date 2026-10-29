import * as THREE from 'three';
import type { Line } from './mapData';
import type { Look } from './sprites';

// Ambient life on the streets: cars drive along real roads and passers-by stroll along real paths (back and forth, no spawning).
export interface Walker { path: number[]; cum: number[]; total: number; s: number; speed: number; dir: number }

export function polyline(p: number[]): { cum: number[]; total: number } {
  const cum = [0];
  for (let i = 0; i + 3 < p.length; i += 2) cum.push((cum[cum.length - 1] as number) + Math.hypot((p[i + 2] as number) - (p[i] as number), (p[i + 3] as number) - (p[i + 1] as number)));
  return { cum, total: cum[cum.length - 1] as number };
}

/** Position and heading at distance s along the polyline. */
export function sampleAt(w: Walker, s: number): { x: number; z: number; dx: number; dz: number } {
  const n = w.cum.length;
  let i = 1;
  while (i < n - 1 && (w.cum[i] as number) < s) i++;
  const a = i - 1;
  const seg = (w.cum[i] as number) - (w.cum[a] as number) || 1;
  const t = Math.max(0, Math.min(1, (s - (w.cum[a] as number)) / seg));
  const ax = w.path[a * 2] as number, az = w.path[a * 2 + 1] as number, bx = w.path[i * 2] as number, bz = w.path[i * 2 + 1] as number;
  const len = Math.hypot(bx - ax, bz - az) || 1;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / len, dz: (bz - az) / len };
}

export function advanceWalker(w: Walker, dt: number): void {
  w.s += w.dir * w.speed * dt;
  if (w.s > w.total) { w.s = w.total; w.dir = -1; } else if (w.s < 0) { w.s = 0; w.dir = 1; }
}

export function makeCar(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x8fb4d4, flatShading: true });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x15151a, flatShading: true });
  const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  put(new THREE.BoxGeometry(2.1, 0.9, 4.4), body, 0, 0.85, 0);
  put(new THREE.BoxGeometry(1.8, 0.8, 2.3), glass, 0, 1.65, -0.15);
  put(new THREE.BoxGeometry(1.9, 0.12, 2.2), body, 0, 2.1, -0.15);
  for (const [x, z] of [[-1.1, 1.4], [1.1, 1.4], [-1.1, -1.4], [1.1, -1.4]] as [number, number][]) { const w = put(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), tyre, x, 0.5, z); w.rotation.z = Math.PI / 2; }
  for (const x of [-0.7, 0.7]) put(new THREE.BoxGeometry(0.4, 0.25, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), x, 0.95, 2.2);
  g.traverse((o) => { o.renderOrder = 25; });
  return g;
}

const SKIN = ['#f2c9a8', '#e8b996', '#d9a07e', '#cf9570', '#f0c4a4'];
const TOPS = ['#4a6a9a', '#8a4a4a', '#3f7a5a', '#6a5a8a', '#c9a23a', '#3a3a44', '#b0603a'];
const PANTS = ['#2e3548', '#26262c', '#3a3a44', '#3f4a5a', '#5a4a3a'];

/** A random passer-by: costume, colours and hat are drawn from small palettes. */
export function randomLook(id: string, r: () => number): Look {
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)] as T;
  const female = r() < 0.45;
  return {
    id, skin: pick(SKIN), hair: female ? 'long' : 'short', hairColor: pick(['#2a1d16', '#5a3a2a', '#8a6a48', '#14141a']), extra: 'none', pants: pick(PANTS), mouth: 'smile',
    outfit: female ? pick(['dress', 'jacket', 'hoodie']) : pick(['jacket', 'hoodie', 'suit']), build: female ? 'slim' : pick(['normal', 'normal', 'muscular']),
    c1: pick(TOPS), c2: '#f0f0f0', tie: '#8a2a2a', shoes: '#222222', hat: r() < 0.2 ? 'cap' : 'none', hatColor: pick(TOPS), prop: 'none',
  };
}

export function pickRoads(roads: Line[], center: [number, number], minLen: number, maxLen: number, radius: number, widthMin: number, widthMax: number): Line[] {
  return roads
    .filter((l) => l.w >= widthMin && l.w <= widthMax)
    .map((l) => ({ l, pl: polyline(l.p) }))
    .filter(({ l, pl }) => pl.total >= minLen && Math.hypot((l.p[0] as number) - center[0], (l.p[1] as number) - center[1]) < radius && pl.total <= maxLen)
    .map(({ l }) => l);
}
