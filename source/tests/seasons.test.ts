import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame, SEASONS, seasonOf } from '../src/game/state';
import { EVENTS, rollEvent } from '../src/game/events';
import { SEASON_COLORS, crownColor } from '../src/game/seasons';

describe('seasons', () => {
  it('a new game picks every season sooner or later and keeps it in the state', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(newGame().season as string);
    expect([...seen].sort()).toEqual([...SEASONS].sort());
  });

  it('a save from before seasons counts as autumn', () => {
    const old = newGame();
    delete old.season;
    expect(seasonOf(old)).toBe('autumn');
  });

  it('winter has no rain and summer has no snow; every season has plenty of events to roll', () => {
    for (const season of SEASONS) {
      const s = newGame();
      s.season = season;
      s.minutes = 12 * 60;
      const ids = new Set<string>();
      for (let i = 0; i < 1500; i++) { const e = rollEvent(s); if (e) ids.add(e.id); }
      expect(ids.size, season).toBeGreaterThanOrEqual(9);
      if (season === 'winter') { expect(ids.has('rain')).toBe(false); expect(ids.has('snowfall')).toBe(true); }
      if (season !== 'winter') { expect(ids.has('snowfall')).toBe(false); expect(ids.has('ice')).toBe(false); }
    }
    expect(EVENTS.filter((e) => e.seasons).length).toBeGreaterThanOrEqual(7);
  });

  it('palettes differ between seasons: winter ground is the lightest, autumn crowns are warm, winter crowns are pale', () => {
    const lum = (n: number): number => new THREE.Color(n).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(lum(SEASON_COLORS.winter.ground)).toBeGreaterThan(lum(SEASON_COLORS.summer.ground));
    expect(lum(SEASON_COLORS.winter.pitch)).toBeGreaterThan(lum(SEASON_COLORS.summer.pitch));
    const hsl = { h: 0, s: 0, l: 0 };
    let warm = 0;
    for (let i = 0; i < 200; i++) { crownColor('autumn', i, new THREE.Color()).getHSL(hsl); if (hsl.h < 0.2) warm++; }
    expect(warm).toBeGreaterThan(100);
    crownColor('winter', 5, new THREE.Color()).getHSL(hsl);
    expect(hsl.l).toBeGreaterThan(0.55);
    crownColor('summer', 5, new THREE.Color()).getHSL(hsl);
    expect(hsl.l).toBeLessThan(0.35);
  });
});
