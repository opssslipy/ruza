import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game/state';
import { matchOn } from '../src/game/football';

const at = (season: 'spring' | 'summer' | 'autumn' | 'winter', day: number, hour: number): boolean => {
  const s = newGame();
  s.season = season; s.day = day; s.minutes = hour * 60;
  return matchOn(s);
};

describe('match schedule', () => {
  it('weekday evenings, 17:30 to 20:00', () => {
    expect(at('summer', 1, 18)).toBe(true);
    expect(at('summer', 1, 17)).toBe(false);
    expect(at('summer', 1, 20.5)).toBe(false);
    expect(at('summer', 1, 12)).toBe(false);
  });

  it('weekend afternoons, 12:00 to 18:00', () => {
    expect(at('autumn', 5, 12.5)).toBe(true);
    expect(at('autumn', 6, 17.5)).toBe(true);
    expect(at('autumn', 6, 19)).toBe(false);
    expect(at('autumn', 5, 9)).toBe(false);
  });

  it('never in winter: the pitch lies under snow', () => {
    for (const day of [0, 3, 5, 6]) for (const h of [10, 13, 15, 18, 19]) expect(at('winter', day, h)).toBe(false);
  });
});
