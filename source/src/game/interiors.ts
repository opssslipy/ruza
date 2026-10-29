import * as THREE from 'three';

// Low-poly rooms for the 3D interiors. Units are the same "game metres" as the town (people are about 6 m tall).
// A room is open on the camera side (south) like a diorama; the player walks inside it and bumps into the colliders.
export interface Box { x0: number; z0: number; x1: number; z1: number }
export interface Seat { x: number; z: number; yaw: number }
export interface Spot { id: string; x: number; z: number; r: number; label: string; action?: number }
export interface Room {
  group: THREE.Group;
  bg: number;
  /** light inside: hemisphere sky and ground colours and strength */
  mood?: { sky: number; ground: number; i: number };
  w: number;
  d: number;
  /** the player cannot walk north of this line (the bar side of a room) */
  minZ?: number;
  spawn: { x: number; z: number };
  colliders: Box[];
  seats: Seat[];
  spots: Spot[];
  wander: { x: number; z: number }[];
  update: (dt: number) => void;
  /** a puff of smoke at the emitter nearest to (x, z) */
  burst: (x: number, z: number) => void;
}

export const lam = (c: THREE.ColorRepresentation): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
export const glow = (c: THREE.ColorRepresentation): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c });

export function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
export const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);

export function plankTexture(base: string, line: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = line;
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 32, 256, 3);
  for (let i = 0; i < 8; i++) g.fillRect(((i * 97) % 256), i * 32, 3, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Hookah lounge "The Дым": back bar, sofas around low tables with hookahs, neon, drifting smoke. */
export function buildDym(): Room {
  const W = 60, D = 40;
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const seats: Seat[] = [];
  const spots: Spot[] = [];

  // floor and rug
  const planks = plankTexture('#3a2a22', '#241a15');
  planks.repeat.set(10, 7);
  const floor = add(g, new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: planks }), W / 2, 0, D / 2);
  floor.rotation.x = -Math.PI / 2;
  const rug = add(g, new THREE.PlaneGeometry(46, 26), lam(0x5a1f3a), W / 2, 0.05, 27);
  rug.rotation.x = -Math.PI / 2;

  // walls: a tall back wall with neon, low side walls so the camera can see in
  add(g, box(W + 2, 13, 1), lam(0x2a1d3d), W / 2, 6.5, -0.5);
  add(g, box(W - 8, 0.45, 0.4), glow(0xff3fb4), W / 2, 10.2, 0.1);
  add(g, box(W - 14, 0.45, 0.4), glow(0x37d6ff), W / 2, 5.4, 0.1);
  for (const x of [-0.5, W + 0.5]) add(g, box(1, 4, D), lam(0x2a1d3d), x, 2, D / 2);
  for (const x of [-0.5, W + 0.5]) add(g, box(1.2, 0.4, D), glow(0x7a4dff), x, 4.1, D / 2);
  // low front wall with a doorway on the left
  add(g, box(W - 20, 1.4, 1), lam(0x2a1d3d), 10 + (W - 20) / 2 + 6, 0.7, D + 0.5);
  add(g, box(0.9, 7, 0.9), lam(0x4a3a6a), 8.2, 3.5, D);
  add(g, box(0.9, 7, 0.9), lam(0x4a3a6a), 15.8, 3.5, D);
  add(g, box(8.6, 0.9, 0.9), glow(0x3cff8a), 12, 7.2, D);

  // bar with bottle shelf
  add(g, box(34, 3.6, 4.4), lam(0x5a3a24), 30, 1.8, 7.5);
  add(g, box(34.8, 0.5, 5.2), lam(0x7a5232), 30, 3.85, 7.5);
  add(g, box(34, 5.4, 1.2), lam(0x3a2a1a), 30, 6.4, 1.6);
  const bottle = [0x3dd17a, 0xe0a23a, 0xd9424f, 0x4aa3ff, 0xb06af0];
  for (let i = 0; i < 17; i++) {
    add(g, new THREE.CylinderGeometry(0.4, 0.46, 1.8, 6), lam(bottle[i % bottle.length] as number), 14 + i * 2, 9.8, 1.7);
    add(g, new THREE.CylinderGeometry(0.4, 0.46, 1.8, 6), lam(bottle[(i + 2) % bottle.length] as number), 14 + i * 2, 7.3, 1.7);
  }
  colliders.push({ x0: 12, z0: 4.8, x1: 48, z1: 10.2 });
  for (let i = 0; i < 7; i++) {
    add(g, new THREE.CylinderGeometry(0.25, 0.25, 2.2, 6), lam(0x2b2b33), 15 + i * 5, 1.1, 12.8);
    add(g, new THREE.CylinderGeometry(1.4, 1.4, 0.6, 10), lam(0xb03a4a), 15 + i * 5, 2.4, 12.8);
  }

  // lounge groups: low round table with a hookah, a sofa on each side
  const tables: [number, number][] = [[13, 22], [30, 22], [47, 22], [30, 33]];
  const emitters: { x: number; z: number }[] = [];
  for (const [tx, tz] of tables) {
    add(g, new THREE.CylinderGeometry(3, 3, 0.45, 12), lam(0x6a4a33), tx, 2.5, tz);
    add(g, new THREE.CylinderGeometry(0.5, 0.9, 2.3, 8), lam(0x2b2b33), tx, 1.15, tz);
    add(g, new THREE.CylinderGeometry(0.75, 0.9, 1.8, 8), new THREE.MeshLambertMaterial({ color: 0x37d6c0, flatShading: true, transparent: true, opacity: 0.85 }), tx, 3.6, tz);
    add(g, new THREE.CylinderGeometry(0.14, 0.14, 2.6, 6), lam(0xc9ccd2), tx, 5.7, tz);
    add(g, new THREE.CylinderGeometry(0.85, 0.55, 0.7, 8), lam(0xd0a53a), tx, 7.2, tz);
    const hose = add(g, new THREE.TorusGeometry(1.1, 0.07, 5, 12, Math.PI * 1.2), lam(0xd9424f), tx + 1.2, 4.3, tz + 0.4);
    hose.rotation.set(Math.PI / 2.3, 0.4, 0.6);
    emitters.push({ x: tx, z: tz });
    for (const side of [-1, 1]) {
      const sx = tx + side * 5.8;
      add(g, box(3, 1.3, 7.4), lam(side < 0 ? 0x7a3fb0 : 0x2f7de1), sx, 0.65, tz);
      add(g, box(0.9, 3, 7.4), lam(side < 0 ? 0x6a3498 : 0x2565b8), sx + side * 1.5, 2.3, tz);
      colliders.push({ x0: sx - 1.9, z0: tz - 4, x1: sx + 1.9, z1: tz + 4 });
      for (const dz of [-1.8, 1.8]) seats.push({ x: sx, z: tz + dz, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    colliders.push({ x0: tx - 3.2, z0: tz - 3.2, x1: tx + 3.2, z1: tz + 3.2 });
    spots.push({ id: 'hookah', x: tx, z: tz, r: 8.5, label: 'Кальян (600 ₽)' });
  }

  // decoration: plants, hanging lamps, coloured lights
  for (const [px, pz] of [[3.5, 14], [56.5, 14], [3.5, 36], [56.5, 36]] as [number, number][]) {
    add(g, new THREE.CylinderGeometry(1.3, 1, 1.8, 8), lam(0x6a4a33), px, 0.9, pz);
    add(g, new THREE.ConeGeometry(2.4, 6, 6), lam(0x2f8a4a), px, 4.7, pz);
    colliders.push({ x0: px - 1.6, z0: pz - 1.6, x1: px + 1.6, z1: pz + 1.6 });
  }
  const lights: [number, number, number][] = [[13, 22, 0xff4fc0], [30, 22, 0x4fd6ff], [47, 22, 0xffb04f]];
  for (const [lx, lz, c] of lights) {
    add(g, new THREE.CylinderGeometry(0.08, 0.08, 6, 4), lam(0x222222), lx, 13, lz);
    add(g, new THREE.SphereGeometry(1.1, 8, 6), glow(c), lx, 9.8, lz);
    const pl = new THREE.PointLight(c, 90, 38, 1.6);
    pl.position.set(lx, 9, lz);
    g.add(pl);
  }

  // smoke: soft puffs rising from every hookah
  const per = 36;
  const pos = new Float32Array(emitters.length * per * 3);
  const life = new Float32Array(emitters.length * per);
  const seed = (e: number, i: number, boost = false): void => {
    const k = (e * per + i) * 3;
    const em = emitters[e] as { x: number; z: number };
    pos[k] = em.x + (Math.random() - 0.5) * 1.4;
    pos[k + 1] = 7.6 + (boost ? Math.random() * 1.2 : 0);
    pos[k + 2] = em.z + (Math.random() - 0.5) * 1.4;
    life[e * per + i] = boost ? 0.9 : Math.random();
  };
  for (let e = 0; e < emitters.length; e++) for (let i = 0; i < per; i++) { seed(e, i); pos[(e * per + i) * 3 + 1] = 7.6 + Math.random() * 7; }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ map: softDot(), size: 3.6, transparent: true, opacity: 0.42, depthWrite: false, color: 0xe6dcff }));
  smoke.frustumCulled = false;
  g.add(smoke);

  // bar spot and the door
  spots.push({ id: 'bar', x: 30, z: 16.5, r: 11, label: 'Бар: коктейль (500 ₽)' });
  spots.push({ id: 'exit', x: 12, z: 37.5, r: 6, label: 'Выйти на улицу' });

  return {
    group: g, bg: 0x0d0a16, w: W, d: D, minZ: 12, spawn: { x: 14, z: 31 }, colliders, seats, spots,
    wander: [[24, 17], [38, 17], [8, 28], [52, 28], [22, 38], [46, 38], [30, 28]].map(([x, z]) => ({ x: x as number, z: z as number })),
    update(dt: number): void {
      for (let e = 0; e < emitters.length; e++) for (let i = 0; i < per; i++) {
        const j = e * per + i, k = j * 3;
        pos[k + 1] = (pos[k + 1] as number) + dt * (2.2 + (life[j] as number) * 1.2);
        pos[k] = (pos[k] as number) + Math.sin((pos[k + 1] as number) * 0.7 + j) * dt * 0.8;
        if ((pos[k + 1] as number) > 15) seed(e, i);
      }
      smokeGeo.attributes.position!.needsUpdate = true;
    },
    burst(x: number, z: number): void {
      let best = 0, bd = Infinity;
      emitters.forEach((em, i) => { const d = Math.hypot(em.x - x, em.z - z); if (d < bd) { bd = d; best = i; } });
      for (let i = 0; i < per; i++) seed(best, i, true);
    },
  };
}
