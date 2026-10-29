import * as THREE from 'three';
import { add, box, glow, lam, plankTexture, type Box, type Room, type Seat, type Spot } from './interiors';

// The other venues. Every room is 60 x 40 with the door at the front left, so the walking rules are shared.
// Spots with an `action` index run the matching action of the venue (see content/venues.ts).

const W0 = 60, D0 = 40;
const WANDER = [[24, 18], [38, 18], [10, 28], [50, 28], [22, 36], [46, 36], [30, 28]].map(([x, z]) => ({ x: x as number, z: z as number }));
const colors = [0xd04a4a, 0x4a90d0, 0xe0c040, 0x5ab05a, 0xe08a3a, 0xb06af0];

interface Shell { g: THREE.Group; colliders: Box[]; spots: Spot[] }

function shell(floor: number, wall: number, trim: number, floorTex?: [string, string]): Shell {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const spots: Spot[] = [{ id: 'exit', x: 12, z: 37.5, r: 6, label: 'Выйти на улицу' }];
  let fl: THREE.Mesh;
  if (floorTex) {
    const tex = plankTexture(floorTex[0], floorTex[1]);
    tex.repeat.set(10, 7);
    fl = add(g, new THREE.PlaneGeometry(W0, D0), new THREE.MeshLambertMaterial({ map: tex }), W0 / 2, 0, D0 / 2);
  } else {
    fl = add(g, new THREE.PlaneGeometry(W0, D0), lam(floor), W0 / 2, 0, D0 / 2);
  }
  fl.rotation.x = -Math.PI / 2;
  add(g, box(W0 + 2, 13, 1), lam(wall), W0 / 2, 6.5, -0.5);
  add(g, box(W0 - 6, 0.5, 0.4), glow(trim), W0 / 2, 10.4, 0.1);
  for (const x of [-0.5, W0 + 0.5]) { add(g, box(1, 4, D0), lam(wall), x, 2, D0 / 2); add(g, box(1.2, 0.4, D0), glow(trim), x, 4.1, D0 / 2); }
  add(g, box(W0 - 20, 1.4, 1), lam(wall), 10 + (W0 - 20) / 2 + 6, 0.7, D0 + 0.5);
  add(g, box(0.9, 7, 0.9), lam(0x4a4a5a), 8.2, 3.5, D0);
  add(g, box(0.9, 7, 0.9), lam(0x4a4a5a), 15.8, 3.5, D0);
  add(g, box(8.6, 0.9, 0.9), glow(0x3cff8a), 12, 7.2, D0);
  return { g, colliders, spots };
}

function finish(s: Shell, bg: number, mood: Room['mood'], extra?: (dt: number) => void, seats: Seat[] = [], spawn = { x: 14, z: 31 }): Room {
  return { group: s.g, bg, mood, w: W0, d: D0, minZ: 4, spawn, colliders: s.colliders, seats, spots: s.spots, wander: WANDER, update: extra ?? (() => {}), burst: () => {} };
}

const solid = (s: Shell, w: number, h: number, d: number, c: number, x: number, y: number, z: number, collide = true): THREE.Mesh => {
  const m = add(s.g, box(w, h, d), lam(c), x, y, z);
  if (collide) s.colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  return m;
};

/** Pyaterochka, shawarma stand and pharmacy share one shop layout with different fittings. */
export function buildShop(kind: string): Room {
  const trim = kind === 'pyaterochka' ? 0xe3262f : kind === 'shawarma' ? 0xf2a23a : 0x3fae8a;
  const s = shell(kind === 'shawarma' ? 0xd9c9a8 : 0xd6dad2, 0xe9eef0, trim);
  if (kind === 'pyaterochka') {
    for (const [z, x0, x1] of [[14, 14, 46], [22, 22, 52], [30, 22, 44]] as [number, number, number][]) {
      const w = x1 - x0;
      solid(s, w, 5, 2.4, 0xb8bcc4, (x0 + x1) / 2, 2.5, z);
      for (let i = 0; i < Math.floor(w / 2.2); i++) for (let l = 0; l < 3; l++) add(s.g, box(1.7, 1.1, 2.6), lam(colors[(i + l) % colors.length] as number), x0 + 1.4 + i * 2.2, 1 + l * 1.5, z);
    }
    solid(s, 30, 8, 2.6, 0xaed4ea, 30, 4, 2.2);
    solid(s, 10, 3, 4, 0x6a6a72, 52, 1.5, 33);
    add(s.g, box(9, 0.4, 3), glow(0xe3262f), 52, 3.3, 33);
    s.spots.push({ id: 'a0', x: 30, z: 18, r: 9, label: '', action: 0 }, { id: 'a1', x: 30, z: 7, r: 9, label: '', action: 1 });
    return finish(s, 0x15181c, { sky: 0xffffff, ground: 0x9aa09a, i: 2.1 });
  }
  if (kind === 'shawarma') {
    solid(s, 30, 3.4, 4, 0x8a5a33, 30, 1.7, 10);
    add(s.g, box(30.6, 0.5, 4.8), lam(0xd0a060), 30, 3.65, 10);
    const spit = add(s.g, new THREE.CylinderGeometry(1.6, 1.2, 6, 10), lam(0xb0713a), 22, 7, 5);
    add(s.g, new THREE.CylinderGeometry(0.15, 0.15, 8, 6), lam(0xc9ccd2), 22, 7, 5);
    add(s.g, box(34, 4, 0.4), glow(0xffd23a), 30, 11, 0.2);
    for (const [x, z] of [[20, 26], [34, 24], [46, 28]] as [number, number][]) {
      add(s.g, new THREE.CylinderGeometry(2, 2, 0.4, 10), lam(0x6a4a33), x, 4.2, z);
      add(s.g, new THREE.CylinderGeometry(0.4, 0.5, 4, 6), lam(0x2b2b33), x, 2, z);
      s.colliders.push({ x0: x - 2.2, z0: z - 2.2, x1: x + 2.2, z1: z + 2.2 });
    }
    s.colliders.push({ x0: 14, z0: 7.5, x1: 46, z1: 12.5 });
    s.spots.push({ id: 'a0', x: 30, z: 17, r: 11, label: '', action: 0 });
    return finish(s, 0x1a1410, { sky: 0xfff0d8, ground: 0x8a7a5a, i: 1.9 }, (dt) => { spit.rotation.y += dt * 1.6; });
  }
  solid(s, 36, 3.4, 3, 0xdfe6ea, 30, 1.7, 12);
  for (let i = 0; i < 8; i++) for (let l = 0; l < 3; l++) add(s.g, box(3.4, 1.4, 1.6), lam(colors[(i + l) % colors.length] as number), 14.5 + i * 4.4, 3 + l * 1.9, 1.5);
  solid(s, 40, 8, 1.2, 0xf4f6f8, 30, 4, 0.8, false);
  add(s.g, box(1.2, 4, 0.4), glow(0x3cff8a), 30, 9.5, 1.5);
  add(s.g, box(4, 1.2, 0.4), glow(0x3cff8a), 30, 9.5, 1.5);
  s.spots.push({ id: 'a0', x: 30, z: 18, r: 10, label: '', action: 0 });
  return finish(s, 0x15181c, { sky: 0xffffff, ground: 0x9aa09a, i: 2.1 });
}

export function buildGym(): Room {
  const s = shell(0x5a606c, 0x6a727e, 0x37d6ff);
  add(s.g, box(46, 9, 0.3), new THREE.MeshLambertMaterial({ color: 0x9ac8e0, flatShading: true, transparent: true, opacity: 0.55 }), 30, 6, 0.2);
  for (let i = 0; i < 3; i++) {
    solid(s, 5, 1, 11, 0x2a2f38, 14 + i * 12, 0.5, 11);
    add(s.g, box(4, 0.3, 9), lam(0x4a525e), 14 + i * 12, 1.1, 11);
    add(s.g, box(0.5, 6, 0.5), lam(0x15151a), 12 + i * 12, 3.5, 6);
    add(s.g, box(0.5, 6, 0.5), lam(0x15151a), 16 + i * 12, 3.5, 6);
  }
  solid(s, 3.4, 1.8, 9, 0x6a2a2a, 30, 0.9, 25);
  add(s.g, new THREE.CylinderGeometry(0.28, 0.28, 12, 8), lam(0xc9ccd2), 30, 5.6, 25).rotation.z = Math.PI / 2;
  for (const x of [24.5, 35.5]) add(s.g, new THREE.CylinderGeometry(1.6, 1.6, 0.8, 10), lam(0x222226), x, 5.6, 25).rotation.z = Math.PI / 2;
  solid(s, 1, 6, 1, 0x2a2f38, 26, 3, 22);
  solid(s, 1, 6, 1, 0x2a2f38, 34, 3, 22);
  solid(s, 12, 3, 3, 0x2a2f38, 50, 1.5, 28);
  for (let i = 0; i < 5; i++) add(s.g, new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), lam(0x15151a), 45 + i * 2.4, 3.8, 28);
  s.spots.push({ id: 'a0', x: 30, z: 25, r: 12, label: '', action: 0 });
  return finish(s, 0x0e1116, { sky: 0xeaf2ff, ground: 0x7a8088, i: 2.6 });
}

/** Night club Рузвельт and Mixbar: a dance floor of glowing tiles, a DJ booth and flashing lights. */
export function buildClub(): Room {
  const s = shell(0x1a1424, 0x241a38, 0xff3fb4);
  const tiles: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const m = add(s.g, new THREE.PlaneGeometry(4.8, 4.8), new THREE.MeshBasicMaterial({ color: 0x6a3fc0 }), 17 + i * 5.2 + 1, 0.06, 17 + j * 5.2 + 1);
    m.rotation.x = -Math.PI / 2;
    tiles.push(m);
  }
  solid(s, 20, 3, 5, 0x2a2f38, 30, 1.5, 6);
  add(s.g, box(20, 0.4, 5.4), glow(0x37d6ff), 30, 3.2, 6);
  for (const x of [14, 46]) { solid(s, 4, 8, 3.4, 0x15151a, x, 4, 4.5); add(s.g, new THREE.CircleGeometry(1.4, 12), glow(0xb0b0ff), x, 4, 6.3); }
  solid(s, 3, 3.6, 22, 0x5a3a24, 56, 1.8, 24);
  const lights = [0xff4fc0, 0x4fd6ff, 0xffb04f].map((c, i) => {
    const pl = new THREE.PointLight(c, 80, 40, 1.5);
    pl.position.set(16 + i * 14, 9, 22);
    s.g.add(pl);
    add(s.g, new THREE.SphereGeometry(0.9, 8, 6), glow(c), 16 + i * 14, 9, 22);
    return pl;
  });
  s.spots.push({ id: 'a0', x: 30, z: 24, r: 13, label: '', action: 0 });
  let t = 0;
  return finish(s, 0x08060f, { sky: 0x8a78ff, ground: 0x2a1a44, i: 1.3 }, (dt) => {
    t += dt;
    tiles.forEach((m, i) => { (m.material as THREE.MeshBasicMaterial).color.setHSL((t * 0.35 + i * 0.07) % 1, 0.8, 0.45 + 0.1 * Math.sin(t * 6 + i)); });
    lights.forEach((l, i) => { l.intensity = 60 + 40 * Math.sin(t * 5 + i * 2); });
  });
}

export function buildHome(): Room {
  const s = shell(0xb48a5a, 0xf1e6d0, 0xffb020, ['#b48a5a', '#8a6540']);
  solid(s, 11, 2, 14, 0xc9d8f0, 10, 1, 9);
  add(s.g, box(11, 0.6, 4), lam(0xffffff), 10, 2.3, 4);
  solid(s, 14, 3, 5, 0x8a4a4a, 34, 1.5, 12);
  add(s.g, box(14, 3.6, 1), lam(0x7a3a3a), 34, 3.2, 9.5);
  add(s.g, box(16, 9, 0.6), lam(0x15151a), 34, 6.5, 0.3);
  solid(s, 10, 2.6, 6, 0x6a4a33, 48, 1.3, 30);
  add(s.g, box(4, 0.3, 3), lam(0x3a4a6a), 48, 3.2, 30);
  add(s.g, box(4, 2.4, 0.2), glow(0x6a9aff), 48, 4.4, 28.4);
  solid(s, 6, 11, 5, 0xe8eef2, 53, 5.5, 5);
  solid(s, 12, 1.4, 8, 0x8a2a3a, 26, 0.7, 26, false);
  s.spots.push({ id: 'a0', x: 10, z: 15.5, r: 9, label: '', action: 0 }, { id: 'a1', x: 53, z: 11.5, r: 8, label: '', action: 1 }, { id: 'a2', x: 48, z: 26, r: 8, label: '', action: 2 });
  return finish(s, 0x120f0c, { sky: 0xfff0d8, ground: 0x9a7a5a, i: 2.0 });
}

export function buildOffice(): Room {
  const s = shell(0x8a9099, 0xb8c0cc, 0x4a7aff);
  for (const x of [18, 36]) { solid(s, 9, 2.6, 4.4, 0x6a5a4a, x, 1.3, 20); add(s.g, box(3.4, 2.2, 0.3), glow(0x6a9aff), x, 3.8, 18.6); }
  for (let i = 0; i < 12; i++) add(s.g, box(0.35, 9, 0.35), lam(0x2a2a30), 44 + i * 1.3, 4.5, 8);
  add(s.g, box(16, 0.5, 0.5), lam(0x2a2a30), 51, 9, 8);
  solid(s, 16, 1, 1, 0x2a2a30, 51, 0.5, 8);
  solid(s, 6, 8, 1.6, 0x6a6a72, 6, 4, 4);
  add(s.g, box(10, 5, 0.3), lam(0xf4f0e0), 30, 7, 0.3);
  s.spots.push({ id: 'a0', x: 27, z: 24, r: 11, label: '', action: 0 });
  return finish(s, 0x10141c, { sky: 0xe8f0ff, ground: 0x7a8090, i: 1.9 });
}

export function buildHospital(): Room {
  const s = shell(0xe8eef2, 0xf4f8fa, 0x3fae8a);
  for (let i = 0; i < 3; i++) { solid(s, 9, 1.6, 14, 0xffffff, 16 + i * 14, 0.8, 12); add(s.g, box(9, 0.5, 8), lam(0x7ab0d8), 16 + i * 14, 1.9, 15); }
  solid(s, 18, 3, 4, 0xdfe6ea, 46, 1.5, 32);
  add(s.g, box(1.4, 6, 0.4), glow(0xd03030), 30, 9, 0.3);
  add(s.g, box(6, 1.4, 0.4), glow(0xd03030), 30, 9, 0.3);
  s.spots.push({ id: 'a0', x: 30, z: 20, r: 12, label: '', action: 0 });
  return finish(s, 0x10181c, { sky: 0xffffff, ground: 0xaab4ba, i: 2.1 });
}

export function buildCinema(): Room {
  const s = shell(0x3a1a22, 0x2a1220, 0xe03a3a);
  add(s.g, box(36, 12, 0.5), glow(0xf2f4ff), 30, 7, 0.4);
  const seats: Seat[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
    const x = 14 + c * 4.6, z = 17 + r * 5;
    add(s.g, box(3.2, 1.3, 3), lam(0x9a2a3a), x, 0.65, z);
    add(s.g, box(3.2, 3, 0.8), lam(0x7a1a2a), x, 1.9, z + 1.3);
    if (r > 0) seats.push({ x, z, yaw: Math.PI });
  }
  // two blocks of seats with an aisle between them
  s.colliders.push({ x0: 11, z0: 15, x1: 28, z1: 36.5 }, { x0: 32, z0: 15, x1: 49, z1: 36.5 });
  s.spots.push({ id: 'a0', x: 30, z: 20, r: 9, label: '', action: 0 });
  return finish(s, 0x08060a, { sky: 0xffc0c0, ground: 0x5a2a32, i: 1.7 }, undefined, seats, { x: 30, z: 34 });
}

export function buildGarage(): Room {
  const s = shell(0x6a6a6a, 0x8a8a8a, 0xe0a23a);
  solid(s, 9, 2.4, 16, 0xb04040, 20, 1.2, 22);
  add(s.g, box(7.6, 1.8, 8), new THREE.MeshLambertMaterial({ color: 0x8fb4d4, flatShading: true }), 20, 3.3, 21);
  for (const [x, z] of [[15.8, 17], [24.2, 17], [15.8, 27], [24.2, 27]] as [number, number][]) add(s.g, new THREE.CylinderGeometry(1.7, 1.7, 1.2, 10), lam(0x15151a), x, 1.7, z).rotation.z = Math.PI / 2;
  solid(s, 3, 9, 20, 0x555a62, 54, 4.5, 20);
  for (let i = 0; i < 4; i++) add(s.g, new THREE.CylinderGeometry(1.6, 1.6, 3.4, 10), lam(i % 2 ? 0x3a5a8a : 0x8a3a3a), 40 + (i % 2) * 4, 1.7, 8 + Math.floor(i / 2) * 5);
  s.colliders.push({ x0: 38, z0: 6, x1: 46, z1: 15 });
  const seats: Seat[] = [{ x: 36, z: 30, yaw: -Math.PI / 2 }, { x: 36, z: 34, yaw: -Math.PI / 2 }];
  for (const z of [30, 34]) add(s.g, box(3, 1.4, 3), lam(0x6a4a33), 37.5, 0.7, z);
  s.spots.push({ id: 'a0', x: 38, z: 26, r: 13, label: '', action: 0 });
  return finish(s, 0x0e0e10, { sky: 0xffe6b0, ground: 0x6a5a40, i: 1.9 }, undefined, seats, { x: 8, z: 33 }); // the default spawn sits inside the car's collision margin
}
