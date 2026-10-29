import * as THREE from 'three';
import type { Look } from './sprites';
import type { Season } from './state';

/** The main football pitch from map.json: centre, direction of the long axis (radians), length and width in metres. */
export interface StadiumInfo { x: number; y: number; a: number; l: number; w: number }

const HOME = '#d23a3a', AWAY = '#2f6fd0', KEEPER_HOME = '#f2c230', KEEPER_AWAY = '#3fae5a';
const FAN_COLORS = [0xd23a3a, 0xf2f2f2, 0x2f6fd0, 0x1f1f24, 0xf2c230, 0x3fae5a, 0x8a4ac0];
const SKIN = [0xe8b996, 0xd9a07a, 0xf1c8a5, 0xc98c64];
const hash = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Kit and looks of the i-th player: team 0 plays in red, team 1 in blue, the keepers in their own colours. */
export function footballLook(id: string, i: number): Look {
  const team = i < 11 ? 0 : 1, gk = i % 11 === 0;
  return {
    id, skin: ['#e8b996', '#d9a07a', '#f1c8a5', '#c98c64'][Math.floor(hash(i + 1) * 4)] as string, hair: 'short', hairColor: ['#2a1d16', '#5a3a2a', '#8a6a48', '#14141a'][Math.floor(hash(i + 7) * 4)] as string,
    extra: 'none', pants: team === 0 ? '#f2f2f2' : '#14141a', mouth: 'smile', outfit: 'tank', build: hash(i + 11) < 0.3 ? 'muscular' : 'normal', shorts: true,
    c1: gk ? (team === 0 ? KEEPER_HOME : KEEPER_AWAY) : team === 0 ? HOME : AWAY, c2: '#ffffff', shoes: '#111111', hat: 'none', prop: 'none',
  };
}

const mat = (c: number, o = {}): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c, ...o });

/** Markings, goals, stands, floodlights, fans and the ball of the stadium. Local axes: x runs along the pitch (u), z across it (v). */
export class Stadium3D {
  readonly group = new THREE.Group();
  readonly ball: THREE.Mesh;
  private stripes: THREE.Mesh[] = [];
  private fans: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private fanData: { u: number; v: number; y: number; ph: number }[] = [];

  constructor(readonly info: StadiumInfo) {
    const { x, y, a, l, w } = info;
    this.group.position.set(x, 0, y);
    this.group.rotation.y = -a;
    this.group.renderOrder = 3;
    const add = (m: THREE.Object3D, order = 3): void => { m.renderOrder = order; this.group.add(m); };

    // mowing stripes, then the white lines on top
    for (let i = 0; i < 10; i += 2) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(l / 10, w), mat(0x6fb352, { depthWrite: false }));
      s.rotation.x = -Math.PI / 2; s.position.set(-l / 2 + (i + 0.5) * (l / 10), 0.07, 0);
      add(s, 2.2); this.stripes.push(s);
    }
    const white = mat(0xffffff, { depthWrite: false });
    const seg = (u0: number, v0: number, u1: number, v1: number, th = 0.55): void => {
      const len = Math.hypot(u1 - u0, v1 - v0), g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, th), white);
      m.rotation.x = -Math.PI / 2; g.add(m);
      g.position.set((u0 + u1) / 2, 0.09, (v0 + v1) / 2); g.rotation.y = -Math.atan2(v1 - v0, u1 - u0);
      add(g, 2.6);
    };
    const rect = (u0: number, v0: number, u1: number, v1: number): void => { seg(u0, v0, u1, v0); seg(u1, v0, u1, v1); seg(u1, v1, u0, v1); seg(u0, v1, u0, v0); };
    const su = l / 105, sv = w / 68;
    rect(-l / 2, -w / 2, l / 2, w / 2);
    seg(0, -w / 2, 0, w / 2);
    const circle = new THREE.Mesh(new THREE.RingGeometry(9.15 * sv - 0.28, 9.15 * sv + 0.28, 48), white);
    circle.rotation.x = -Math.PI / 2; circle.position.set(0, 0.09, 0); add(circle, 2.6);
    for (const side of [-1, 1]) {
      const g = side * l / 2;
      rect(g, -20.15 * sv, g - side * 16.5 * su, 20.15 * sv);
      rect(g, -9.15 * sv, g - side * 5.5 * su, 9.15 * sv);
      // goal: posts, crossbar and a see-through net
      const frame = mat(0xf4f4f4), net = mat(0xffffff, { transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
      for (const pv of [-6, 6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 0.4), frame); post.position.set(g, 2.2, pv); add(post, 4); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 12.4), frame); bar.position.set(g, 4.4, 0); add(bar, 4);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.4), net); back.rotation.y = Math.PI / 2; back.position.set(g + side * 3, 2.2, 0); add(back, 4);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), net); top.rotation.x = -Math.PI / 2; top.position.set(g + side * 1.5, 4.4, 0); add(top, 4);
    }

    // advertising boards along the touchlines, floodlight masts in the corners
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(l * 0.9, 1.1, 0.35), mat(side < 0 ? 0xe03a3a : 0x2f6fd0)); board.position.set(0, 0.55, side * (w / 2 + 2)); add(board, 4);
    }
    for (const [mu, mv] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 30, 6), mat(0x6b707c)); mast.position.set(mu * (l / 2 + 8), 15, mv * (w / 2 + 22)); add(mast, 4);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 1.2), mat(0xfff4c4)); lamp.position.set(mu * (l / 2 + 8), 30.6, mv * (w / 2 + 22)); lamp.rotation.y = mv * 0.5; add(lamp, 4);
    }

    // stands: three steps on each long side with a back wall; the fans stand on the steps
    const rowsU: number[] = [];
    for (let u = -0.38 * l; u <= 0.38 * l; u += 2.5) rowsU.push(u);
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 3; tier++) {
        const h = 1.6 * (tier + 1), vc = side * (w / 2 + 6 + 4.2 * tier + 2.1);
        const step = new THREE.Mesh(new THREE.BoxGeometry(0.84 * l, h, 4.2), mat(0x9aa0ab)); step.position.set(0, h / 2, vc); add(step, 5);
        for (const [half, color] of [[-1, 0xd23a3a], [1, 0x2f6fd0]] as [number, number][]) {
          const seats = new THREE.Mesh(new THREE.BoxGeometry(0.42 * l, 0.15, 3.0), mat(color)); seats.position.set(half * 0.21 * l, h + 0.08, vc); add(seats, 6);
        }
        for (const u of rowsU) this.fanData.push({ u: u + (hash(u * 3 + tier + side) - 0.5) * 0.8, v: vc + (hash(u + tier * 7) - 0.5) * 1.0, y: h + 1.6, ph: hash(u * 5 + side + tier) * 6.28 });
      }
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.84 * l, 6.4, 0.8), mat(0x7a808c)); wall.position.set(0, 3.2, side * (w / 2 + 6 + 12.6 + 0.4)); add(wall, 5);
    }

    // fans: a little body and a head each, drawn as two instanced meshes
    const n = this.fanData.length;
    this.fans = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 2.4, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.fans.setColorAt(i, c.set(FAN_COLORS[Math.floor(hash(i * 3 + 1) * FAN_COLORS.length)] as number));
      this.heads.setColorAt(i, c.set(SKIN[Math.floor(hash(i * 3 + 2) * SKIN.length)] as number));
    }
    this.fans.frustumCulled = false; this.heads.frustumCulled = false;
    this.fans.count = 0; this.heads.count = 0;
    add(this.fans, 7); add(this.heads, 7);

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfafafa }));
    this.ball.renderOrder = 35;
    this.ball.visible = false;
    this.group.add(this.ball);
  }

  /** Pitch-local (u, v) in metres to a world position (x, z). */
  toWorld(u: number, v: number): { x: number; z: number } {
    const { x, y, a } = this.info;
    return { x: x + u * Math.cos(a) - v * Math.sin(a), z: y + u * Math.sin(a) + v * Math.cos(a) };
  }

  /** Mowing stripes follow the season; under snow there are none. */
  setSeason(s: Season): void {
    const color = s === 'spring' ? 0x80c46a : s === 'summer' ? 0x6fb352 : s === 'autumn' ? 0x93ad58 : 0xdbe5ea;
    for (const m of this.stripes) { (m.material as THREE.MeshBasicMaterial).color.set(color); m.visible = s !== 'winter'; }
  }

  /** Fans fill the stands during a match; after a goal they jump. */
  update(t: number, crowd: boolean, cheer: number): void {
    const n = crowd ? this.fanData.length : 0;
    this.fans.count = n; this.heads.count = n;
    if (!n) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const f = this.fanData[i] as { u: number; v: number; y: number; ph: number };
      const bob = cheer > 0 ? Math.abs(Math.sin(t * 7 + f.ph)) * 1.1 : Math.sin(t * 1.6 + f.ph) * 0.08;
      m.makeTranslation(f.u, f.y + bob, f.v);
      this.fans.setMatrixAt(i, m);
      m.makeTranslation(f.u, f.y + 1.7 + bob, f.v);
      this.heads.setMatrixAt(i, m);
    }
    this.fans.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true;
    if (this.fans.instanceColor) this.fans.instanceColor.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
  }
}
