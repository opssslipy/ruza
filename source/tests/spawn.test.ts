import { describe, expect, it } from 'vitest';
import { buildGarage, buildClub, buildCinema, buildGym, buildHome, buildHospital, buildOffice, buildShop } from '../src/game/interiors2';
import { buildDym } from '../src/game/interiors';

// floor textures are drawn on a canvas; geometry is all this test needs, so a no-op 2D context is enough
const ctx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
(globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const BODY = 1.6; // same margin as InteriorScene

const rooms = { dym: buildDym, garage: buildGarage, club: buildClub, cinema: buildCinema, gym: buildGym, home: buildHome, hospital: buildHospital, office: buildOffice, pyaterochka: () => buildShop('pyaterochka'), shawarma: () => buildShop('shawarma'), pharmacy: () => buildShop('pharmacy') };

describe('interior spawn points', () => {
  for (const [name, build] of Object.entries(rooms)) {
    it(`${name}: the player does not spawn inside a collider`, () => {
      const r = build();
      const { x, z } = r.spawn;
      const hit = r.colliders.some((b) => x > b.x0 - BODY && x < b.x1 + BODY && z > b.z0 - BODY && z < b.z1 + BODY);
      expect(hit).toBe(false);
    });
  }
});

