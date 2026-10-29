import * as THREE from 'three';
import type { Look } from './sprites';

// A low-poly 3D person: a body in the costume invented for the character and built to the described figure (slim, normal,
// muscular), and a big head that is the character's photo (a disc that always turns to the camera, so the face is readable).
// Units are "design metres", scaled by the world.
export const DESIGN_H = 6.2;
const HEAD_Y = 4.95;

interface Build { chest: number; waist: number; hip: number; arm: number; leg: number; shoulder: number }
const BUILDS: Record<string, Build> = {
  normal: { chest: 1.0, waist: 0.96, hip: 1.02, arm: 0.34, leg: 0.42, shoulder: 1.3 },
  slim: { chest: 0.82, waist: 0.58, hip: 0.86, arm: 0.25, leg: 0.34, shoulder: 1.02 },
  muscular: { chest: 1.32, waist: 1.0, hip: 1.0, arm: 0.5, leg: 0.5, shoulder: 1.75 },
};

export interface Rig {
  root: THREE.Group; // yaw and position
  bob: THREE.Group; // up and down while walking
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  face: THREE.Sprite;
  armed: boolean; // right arm raised with a cartoon pistol (title screen)
}

const lam = (c: THREE.ColorRepresentation): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const col = (c: string, f: number): THREE.Color => new THREE.Color(c).multiplyScalar(f);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

/** Skin with dark ink drawn on it (sleeve tattoos). */
function tattooMaterial(skin: string, seed: number): THREE.MeshLambertMaterial {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = skin; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(30,30,48,0.9)'; g.fillStyle = 'rgba(30,30,48,0.9)';
  let s = seed;
  const r = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.moveTo(r() * 128, r() * 128);
    g.bezierCurveTo(r() * 128, r() * 128, r() * 128, r() * 128, r() * 128, r() * 128);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(r() * 128, r() * 128, 4 + r() * 8, 0, Math.PI * 2); g.fill(); }
  g.fillRect(0, 50, 128, 10); g.fillRect(0, 88, 128, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t, flatShading: true });
}

const PHOTO_IDS = new Set(['lev', 'timur', 'diana', 'anyaartem', 'belka', 'karina']);

/** The head disc: the portrait clipped to a circle with a dark rim. */
function headTexture(img: HTMLImageElement | null, skin: string, photo: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fillStyle = skin; g.fill();
  g.save(); g.clip();
  // photos are already cropped to the face; the drawn portraits are cropped tight so their dark background does not show
  if (img) { if (photo) g.drawImage(img, 8, 8, 240, 240); else g.drawImage(img, 66, 74, 108, 108, 8, 8, 240, 240); }
  if (!img) { g.fillStyle = '#2a1f1a'; g.beginPath(); g.arc(92, 112, 9, 0, 7); g.arc(164, 112, 9, 0, 7); g.fill(); g.lineWidth = 8; g.strokeStyle = '#7a3b2e'; g.beginPath(); g.arc(128, 150, 34, 0.2, Math.PI - 0.2); g.stroke(); }
  g.restore();
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2);
  g.lineWidth = 10; g.strokeStyle = '#2a1f1a'; g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRig(look: Look, headImg: HTMLImageElement | null): Rig {
  const B = BUILDS[look.build ?? 'normal'] ?? (BUILDS.normal as Build);
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const skin = lam(look.skin), c1 = lam(look.c1), c2 = lam(look.c2), pants = lam(look.pants), shoes = lam(look.shoes);
  const dark = lam(col(look.c1, 0.7)), gold = lam(0xe0b53a), sole = lam(0xf2f2f2);
  const dress = look.outfit === 'dress', robe = look.outfit === 'robe', overalls = look.outfit === 'overalls';
  const tank = look.outfit === 'tank', fitted = look.outfit === 'fitted';
  const bareLegs = dress || robe;
  const legMat = bareLegs ? skin : pants;
  const ink = look.tattoos ? tattooMaterial(look.skin, look.id.length * 977) : skin;

  // legs swing from the hip; shorts end above the knee, sneakers have a white sole
  const hipX = Math.max(0.42, B.hip * 0.55);
  const leg = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 1.75, 0);
    if (look.shorts) {
      g.add(mesh(new THREE.CylinderGeometry(B.leg, B.leg * 0.95, 0.85, 8), legMat, 0, -0.42, 0));
      g.add(mesh(new THREE.CylinderGeometry(B.leg * 0.8, B.leg * 0.72, 0.65, 8), skin, 0, -1.17, 0));
    } else {
      g.add(mesh(new THREE.CylinderGeometry(B.leg, B.leg * 0.9, 1.5, 8), legMat, 0, -0.75, 0));
    }
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.34, 1.35), shoes, 0, -1.5, 0.22));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 1.42), sole, 0, -1.69, 0.22));
    return g;
  };
  const legL = leg(-hipX), legR = leg(hipX);
  bob.add(legL, legR);

  // torso: a lathe profile gives a real waist (thin for slim builds, broad chest for muscular ones)
  const torsoMat = overalls ? c2 : c1;
  const profile = [[B.hip * 1.02, 1.75], [B.hip * 1.05, 2.05], [B.waist, 2.55], [B.chest, 3.1], [B.chest * 0.93, 3.45], [0.5, 3.66]].map(([r, y]) => new THREE.Vector2(r as number, y as number));
  const lathe = (m: THREE.Material): THREE.Mesh => { const t = mesh(new THREE.LatheGeometry(profile, 14), m); t.scale.z = 0.7; return t; };
  if (robe) {
    const r = mesh(new THREE.CylinderGeometry(1.05, 1.4, 3.1, 12), c1, 0, 2.15, 0); r.scale.z = 0.78; bob.add(r);
    const belt = mesh(new THREE.CylinderGeometry(1.14, 1.14, 0.26, 12), c2, 0, 2.6, 0); belt.scale.z = 0.8; bob.add(belt);
  } else if (dress) {
    bob.add(lathe(c1));
    bob.add(mesh(new THREE.CylinderGeometry(B.hip * 1.0, 1.75, 1.5, 14), c1, 0, 1.95, 0));
  } else {
    bob.add(lathe(torsoMat));
  }
  if (fitted) { // pants waistband and a lighter neckline
    const band = mesh(new THREE.CylinderGeometry(B.hip * 1.06, B.hip * 1.06, 0.22, 14), pants, 0, 1.9, 0); band.scale.z = 0.7; bob.add(band);
    bob.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.1), lam(look.c2), 0, 3.5, 0.5));
  }
  if (tank) { const hem = mesh(new THREE.CylinderGeometry(B.hip * 1.07, B.hip * 1.07, 0.18, 14), pants, 0, 1.82, 0); hem.scale.z = 0.7; bob.add(hem); }

  switch (look.outfit) {
    case 'suit':
      bob.add(mesh(new THREE.BoxGeometry(0.95, 1.1, 0.1), c2, 0, 3.0, 0.72));
      bob.add(mesh(new THREE.BoxGeometry(0.24, 1.2, 0.1), lam(look.tie ?? '#aa3333'), look.id === 'lev' ? 0.1 : 0, 2.9, 0.8));
      break;
    case 'jacket':
      bob.add(mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), c2, 0, 2.6, 0.72));
      bob.add(mesh(new THREE.BoxGeometry(1.5, 0.3, 0.6), dark, 0, 3.52, 0.25));
      break;
    case 'hoodie': {
      const hood = mesh(new THREE.TorusGeometry(0.85, 0.3, 6, 12), dark, 0, 3.5, 0); hood.rotation.x = Math.PI / 2; bob.add(hood);
      bob.add(mesh(new THREE.BoxGeometry(1.4, 0.6, 0.1), dark, 0, 2.1, 0.72));
      if (look.prop === 'stars') for (const [x, y] of [[-0.5, 3.0], [0.55, 2.75], [0, 2.4]] as [number, number][]) bob.add(mesh(new THREE.OctahedronGeometry(0.22), c2, x, y, 0.76));
      break;
    }
    case 'uniform':
      for (const x of [-0.85, 0.85]) bob.add(mesh(new THREE.BoxGeometry(0.75, 0.15, 0.55), gold, x, 3.58, 0));
      for (const y of [3.1, 2.7, 2.3]) bob.add(mesh(new THREE.SphereGeometry(0.11, 6, 5), gold, 0, y, 0.74));
      bob.add(mesh(new THREE.BoxGeometry(0.2, 0.9, 0.08), lam(0x111111), 0, 3.0, 0.78));
      break;
    case 'overalls':
      bob.add(mesh(new THREE.BoxGeometry(1.45, 1.2, 0.12), c1, 0, 2.4, 0.72));
      for (const x of [-0.55, 0.55]) bob.add(mesh(new THREE.BoxGeometry(0.26, 1.35, 0.1), c1, x, 3.1, 0.66));
      if (look.prop === 'bolt') { const b = mesh(new THREE.BoxGeometry(0.3, 0.85, 0.05), lam(0xffd23a), 0.05, 2.5, 0.8); b.rotation.z = 0.45; bob.add(b); }
      break;
    default:
      break;
  }

  // arms swing from the shoulder: sleeves first, bare (inked) skin below; tank tops and short sleeves leave the arms free
  const sleeveLen = tank ? 0 : fitted ? 0.45 : 1.4;
  const sleeveMat = overalls ? c2 : c1;
  const arm = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 3.3, 0);
    const r = B.arm;
    if (sleeveLen > 0) g.add(mesh(new THREE.CylinderGeometry(r, r * 0.92, sleeveLen, 8), sleeveMat, 0, -sleeveLen / 2, 0));
    const bare = 1.4 - sleeveLen;
    if (bare > 0) g.add(mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.8, bare, 8), ink, 0, -sleeveLen - bare / 2, 0));
    g.add(mesh(new THREE.SphereGeometry(r + 0.06, 8, 6), skin, 0, -1.5, 0));
    return g;
  };
  const armL = arm(-B.shoulder), armR = arm(B.shoulder);
  bob.add(armL, armR);

  // props
  if (look.prop === 'chain' || look.chain) { const c = mesh(new THREE.TorusGeometry(0.72, 0.07, 5, 14), lam(look.prop === 'chain' ? 0xf0c040 : 0xd8d8d8), 0, 3.45, 0.15); c.rotation.x = Math.PI / 2; bob.add(c); }
  if (look.prop === 'mug') armR.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 10), lam(0xffffff), 0.1, -1.75, 0.4));
  if (look.prop === 'wbbag') { bob.add(mesh(new THREE.BoxGeometry(0.5, 1.0, 0.9), lam(0x8b2fa8), -B.shoulder - 0.45, 2.0, 0.1)); bob.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), lam(0xffffff), -B.shoulder - 0.72, 2.1, 0.1)); }
  if (look.prop === 'bags') { armL.add(mesh(new THREE.BoxGeometry(0.4, 0.75, 0.6), lam(0xf4f4f4), 0, -1.95, 0.1)); armR.add(mesh(new THREE.BoxGeometry(0.4, 0.75, 0.6), lam(0xf7c6d8), 0, -1.95, 0.1)); }
  if (look.prop === 'keys') { bob.add(mesh(new THREE.BoxGeometry(0.22, 0.4, 0.08), lam(0x111111), 0.8, 1.95, 0.74)); bob.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), lam(0xdd3333), 0.8, 1.7, 0.74)); }
  if (look.prop === 'backpack') bob.add(mesh(new THREE.BoxGeometry(1.7, 2.0, 0.85), lam(0x3d4a3a), 0, 2.7, -0.95));

  // hats sit on top of the head
  const hat = lam(look.hatColor ?? look.c1);
  if (look.hat === 'cap') {
    bob.add(mesh(new THREE.SphereGeometry(1.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, HEAD_Y + 0.45, 0));
    bob.add(mesh(new THREE.BoxGeometry(1.6, 0.1, 1.0), hat, 0, HEAD_Y + 0.5, 1.0));
  } else if (look.hat === 'helmet') {
    bob.add(mesh(new THREE.SphereGeometry(1.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, HEAD_Y + 0.4, 0));
    bob.add(mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 14), hat, 0, HEAD_Y + 0.4, 0));
    bob.add(mesh(new THREE.BoxGeometry(0.26, 0.2, 2.2), lam(col(look.hatColor ?? '#f2c230', 0.85)), 0, HEAD_Y + 1.7, 0));
  } else if (look.hat === 'peaked') {
    bob.add(mesh(new THREE.CylinderGeometry(1.2, 1.35, 0.7, 14), hat, 0, HEAD_Y + 1.0, 0));
    bob.add(mesh(new THREE.CylinderGeometry(1.38, 1.38, 0.22, 14), c2, 0, HEAD_Y + 0.7, 0));
    bob.add(mesh(new THREE.BoxGeometry(1.6, 0.1, 0.75), lam(0x111111), 0, HEAD_Y + 0.62, 1.05));
    bob.add(mesh(new THREE.SphereGeometry(0.17, 6, 5), gold, 0, HEAD_Y + 1.0, 1.28));
  }

  // the face disc always turns to the camera
  const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTexture(headImg, look.skin, PHOTO_IDS.has(look.id)), transparent: true, alphaTest: 0.05, depthWrite: true }));
  face.center.set(0.5, 0.5);
  return { root, bob, armL, armR, legL, legR, face, armed: false };
}

/** Walk cycle: legs and arms swing against each other, the body bobs. t is in radians. */
export function pose(rig: Rig, walking: boolean, t: number, sitting = false): void {
  if (sitting) { // legs forward, hands on the knees, a little breathing
    rig.legL.rotation.x = -1.45; rig.legR.rotation.x = -1.45;
    rig.armL.rotation.x = -0.55; rig.armR.rotation.x = rig.armed ? -1.4 : -0.55;
    rig.bob.position.y = -0.45 + Math.sin(t * 0.8) * 0.03;
    return;
  }
  const s = walking ? Math.sin(t) : 0;
  rig.legL.rotation.x = s * 0.75;
  rig.legR.rotation.x = -s * 0.75;
  rig.armL.rotation.x = -s * 0.65;
  rig.armR.rotation.x = s * 0.65;
  rig.bob.position.y = walking ? Math.abs(Math.cos(t)) * 0.16 : Math.sin(t * 0.3) * 0.04;
  if (rig.armed) rig.armR.rotation.x = -1.4;
}

/** A chunky cartoon pistol in the right hand, arm held forward. Stylised toy shape, only for the title screen. */
export function addGun(rig: Rig): void {
  if (rig.armed) return;
  rig.armed = true;
  const g = new THREE.Group();
  g.position.set(0, -1.5, 0);
  const metal = lam(0x2b2f36), grip = lam(0x6a4a2a);
  g.add(mesh(new THREE.BoxGeometry(0.3, 1.4, 0.4), metal, 0, -0.8, 0.05));
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.4, 0.66), grip, 0, -0.1, -0.38));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), lam(0xffd23a), 0, -1.55, 0.3));
  rig.armR.add(g);
}

export const FACE_Y = HEAD_Y;
