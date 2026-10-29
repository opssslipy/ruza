import * as THREE from 'three';
import type { Look } from './sprites';

// A low-poly 3D person: chunky body in the costume invented for the character, and a big head that is the character's photo
// (a disc that always turns to the camera, so the face is always readable). Units are "design metres", scaled by the world.
export const DESIGN_H = 6.2;
const HEAD_Y = 4.95;

export interface Rig {
  root: THREE.Group; // yaw and position
  bob: THREE.Group; // up and down while walking
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  face: THREE.Sprite;
}

const lam = (c: THREE.ColorRepresentation): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const col = (c: string, f: number): THREE.Color => new THREE.Color(c).multiplyScalar(f);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

/** The head disc: the portrait clipped to a circle with a dark rim. */
const PHOTO_IDS = new Set(['lev', 'timur', 'diana', 'anyaartem', 'belka', 'karina']);

function headTexture(img: HTMLImageElement | null, skin: string, photo: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fillStyle = skin; g.fill();
  g.save(); g.clip();
  // photos are already cropped to the face; the drawn portraits are cropped tight so their dark background does not show
  if (img) { if (photo) g.drawImage(img, 8, 8, 240, 240); else g.drawImage(img, 66, 74, 108, 108, 8, 8, 240, 240); }
  g.restore();
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2);
  g.lineWidth = 10; g.strokeStyle = '#2a1f1a'; g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRig(look: Look, headImg: HTMLImageElement | null): Rig {
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const skin = lam(look.skin), c1 = lam(look.c1), c2 = lam(look.c2), pants = lam(look.pants), shoes = lam(look.shoes);
  const dark = lam(col(look.c1, 0.7)), gold = lam(0xe0b53a);
  const dress = look.outfit === 'dress', robe = look.outfit === 'robe', overalls = look.outfit === 'overalls';
  const legMat = dress || robe ? skin : pants;

  // legs swing from the hip
  const leg = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 1.75, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.44, 0.4, 1.5, 8), legMat, 0, -0.75, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.42, 1.3), shoes, 0, -1.54, 0.22));
    return g;
  };
  const legL = leg(-0.55), legR = leg(0.55);
  bob.add(legL, legR);

  // torso and what it wears
  const sleeve = overalls ? c2 : c1;
  if (robe) {
    const r = mesh(new THREE.CylinderGeometry(1.05, 1.4, 3.1, 12), c1, 0, 2.15, 0); r.scale.z = 0.78; bob.add(r);
    const belt = mesh(new THREE.CylinderGeometry(1.14, 1.14, 0.26, 12), c2, 0, 2.6, 0); belt.scale.z = 0.8; bob.add(belt);
  } else if (dress) {
    const t = mesh(new THREE.CylinderGeometry(0.9, 0.98, 1.3, 12), c1, 0, 2.9, 0); t.scale.z = 0.72; bob.add(t);
    bob.add(mesh(new THREE.CylinderGeometry(0.98, 1.75, 1.5, 14), c1, 0, 1.95, 0));
  } else {
    const t = mesh(new THREE.CylinderGeometry(0.98, 1.06, 1.9, 12), overalls ? c2 : c1, 0, 2.65, 0); t.scale.z = 0.7; bob.add(t);
  }
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

  // arms swing from the shoulder
  const arm = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 3.3, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.34, 0.3, 1.4, 8), sleeve, 0, -0.7, 0));
    g.add(mesh(new THREE.SphereGeometry(0.38, 8, 6), skin, 0, -1.5, 0));
    return g;
  };
  const armL = arm(-1.3), armR = arm(1.3);
  bob.add(armL, armR);

  // props
  if (look.prop === 'chain' || look.chain) { const c = mesh(new THREE.TorusGeometry(0.72, 0.07, 5, 14), lam(look.prop === 'chain' ? 0xf0c040 : 0xd8d8d8), 0, 3.45, 0.15); c.rotation.x = Math.PI / 2; bob.add(c); }
  if (look.prop === 'mug') armR.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 10), lam(0xffffff), 0.1, -1.75, 0.4));
  if (look.prop === 'wbbag') { bob.add(mesh(new THREE.BoxGeometry(0.5, 1.15, 1.0), lam(0x8b2fa8), -1.7, 2.0, 0.1)); bob.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.55), lam(0xffffff), -1.97, 2.1, 0.1)); }
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
  return { root, bob, armL, armR, legL, legR, face };
}

/** Walk cycle: legs and arms swing against each other, the body bobs. t is in radians. */
export function pose(rig: Rig, walking: boolean, t: number): void {
  const s = walking ? Math.sin(t) : 0;
  rig.legL.rotation.x = s * 0.75;
  rig.legR.rotation.x = -s * 0.75;
  rig.armL.rotation.x = -s * 0.65;
  rig.armR.rotation.x = s * 0.65;
  rig.bob.position.y = walking ? Math.abs(Math.cos(t)) * 0.16 : Math.sin(t * 0.3) * 0.04;
}

export const FACE_Y = HEAD_Y;
