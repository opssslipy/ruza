import { describe, expect, it } from 'vitest';
import { buildGarage, buildClub, buildCinema, buildGym, buildHome, buildHospital, buildOffice, buildShop } from '../src/game/interiors2';
import { buildDym } from '../src/game/interiors';
import type { Room } from '../src/game/interiors';

// floor textures are drawn on a canvas; geometry is all this test needs, so a no-op 2D context is enough
const ctx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
(globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const BODY = 1.6; // same margin as InteriorScene
const SLACK = 0.8; // extra room so that steering on a diagonal does not jam the player on an edge

// the very same rule as InteriorScene.hits()
function hits(r: Room, x: number, z: number, body = BODY): boolean {
  const inDoor = x > 8.6 && x < 15.4;
  if (x < BODY + 1 || x > r.w - BODY - 1 || z < (r.minZ ?? 4) || z > (inDoor ? r.d + 1 : r.d - BODY)) return true;
  return r.colliders.some((b) => x > b.x0 - body && x < b.x1 + body && z > b.z0 - body && z < b.z1 + body);
}

/** Flood fill over a 0.5 m lattice from the spawn point; returns the set of reachable cells. */
function reachable(r: Room, body = BODY): Set<string> {
  const STEP = 0.5, seen = new Set<string>(), key = (i: number, j: number): string => `${i},${j}`;
  const q: [number, number][] = [[Math.round(r.spawn.x / STEP), Math.round(r.spawn.z / STEP)]];
  seen.add(key(q[0]![0], q[0]![1]));
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h] as [number, number];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const ni = i + di, nj = j + dj;
      if (seen.has(key(ni, nj)) || hits(r, ni * STEP, nj * STEP, body)) continue;
      seen.add(key(ni, nj)); q.push([ni, nj]);
    }
  }
  return seen;
}

const rooms: Record<string, () => Room> = {
  dym: buildDym, garage: buildGarage, club: buildClub, cinema: buildCinema, gym: buildGym, home: buildHome, hospital: buildHospital, office: buildOffice,
  pyaterochka: () => buildShop('pyaterochka'), shawarma: () => buildShop('shawarma'), pharmacy: () => buildShop('pharmacy'),
};

describe('every spot in every room can be reached on foot', () => {
  for (const [name, build] of Object.entries(rooms)) {
    for (const [label, body] of [['exactly like the game', BODY], ['with steering slack', BODY + SLACK]] as [string, number][]) it(`${name}: all action spots and the exit are within reach, ${label}`, () => {
      const r = build();
      const cells = reachable(r, body);
      const lost = r.spots.filter((s) => {
        for (const c of cells) {
          const [i, j] = c.split(',').map(Number) as [number, number];
          if (Math.hypot(i * 0.5 - s.x, j * 0.5 - s.z) < s.r) return false;
        }
        return true;
      }).map((s) => `${s.id}@${s.x},${s.z}`);
      expect(lost, `unreachable spots in ${name}`).toEqual([]);
    });
  }
});
