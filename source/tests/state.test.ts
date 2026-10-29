import { describe, expect, it } from 'vitest';
import { advance, applyEffect, HOUSEHOLD_COST, newGame, sleepAtHome, START_MONEY } from '../src/game/state';
import { peopleAt, whereIs } from '../src/content/schedules';
import { VENUES } from '../src/content/venues';
import { DIALOGUE_EFFECTS } from '../src/content/effects';
import { CALLS } from '../src/content/calls';
import { CHARACTERS } from '../src/content/characters';

describe('needs and time', () => {
  it('starts not yet hungry on Monday morning, but not full either', () => {
    const s = newGame();
    expect(s.satiety).toBeGreaterThanOrEqual(35);
    expect(s.satiety).toBeLessThan(70);
    expect(s.day).toBe(0);
    expect(s.money).toBe(START_MONEY);
  });

  it('doing nothing makes Stas starve and pass out within two days', () => {
    const s = newGame();
    const msgs = advance(s, 2 * 24 * 60);
    expect(s.satiety).toBe(0);
    expect(s.passOuts).toBeGreaterThan(0);
    expect(msgs.some((m) => m.includes('вырубился'))).toBe(true);
    expect(s.health).toBeLessThan(90);
  });

  it('doing nothing for the whole week ends with the banka ending, not with a happy week', () => {
    const s = newGame();
    advance(s, 7 * 24 * 60);
    expect(s.ended).toBe('banka');
  });

  it('charges household money at midnight', () => {
    const s = newGame();
    s.minutes = 23 * 60 + 59;
    const msgs = advance(s, 2);
    expect(s.day).toBe(1);
    expect(s.money).toBe(START_MONEY - HOUSEHOLD_COST);
    expect(msgs[0]).toContain('Дом и семья');
  });

  it('a week survived ends with the week ending', () => {
    const s = newGame();
    s.day = 6; s.minutes = 23 * 60 + 59; s.satiety = 100; s.energy = 100;
    advance(s, 5);
    expect(s.ended).toBe('week');
  });

  it('sleeping restores energy', () => {
    const s = newGame();
    s.energy = 10;
    sleepAtHome(s, 8);
    expect(s.energy).toBeGreaterThan(80);
  });

  it('wanted 100 means arrest', () => {
    const s = newGame();
    applyEffect(s, { wanted: 100 });
    expect(s.ended).toBe('arrested');
  });

  it('money is not infinite: a normal day of eating and household costs is not covered by doing nothing', () => {
    const s = newGame();
    s.minutes = 23 * 60 + 59;
    advance(s, 2);
    expect(s.money).toBeLessThan(START_MONEY);
  });
});

describe('content consistency', () => {
  const landmarkIds = ['home', 'square', 'fountain', 'busstation', 'stadium', 'ruzvelt', 'dym', 'gym', 'police', 'pyaterochka', 'shawarma', 'hospital', 'mixbar', 'teatre', 'pharmacy', 'garages'];

  it('every venue exists as a landmark', () => {
    for (const v of VENUES) expect(landmarkIds).toContain(v.id);
  });

  it('every dialogue character has effects and a schedule', () => {
    const s = newGame();
    for (const c of CHARACTERS.filter((x) => x.ink)) {
      expect(DIALOGUE_EFFECTS[c.id], c.id).toBeDefined();
      let found = false;
      for (let m = 0; m < 24 * 60 * 7 && !found; m += 30) {
        s.day = Math.floor(m / 1440); s.minutes = m % 1440;
        if (whereIs(c.id, s)) found = true;
      }
      expect(found, `${c.id} never appears in town`).toBe(true);
    }
  });

  it('schedule places are real landmarks', () => {
    const s = newGame();
    for (const c of CHARACTERS.filter((x) => x.ink)) {
      for (let m = 0; m < 24 * 60 * 7; m += 60) {
        s.day = Math.floor(m / 1440); s.minutes = m % 1440;
        const at = whereIs(c.id, s);
        if (at) expect(landmarkIds, `${c.id} at ${at}`).toContain(at);
      }
    }
  });

  it('peopleAt agrees with whereIs', () => {
    const s = newGame();
    s.day = 1; s.minutes = 20 * 60;
    for (const id of peopleAt('dym', s)) expect(whereIs(id, s)).toBe('dym');
  });

  it('every call has a valid best answer', () => {
    for (const c of CALLS) {
      expect(c.good).toBeGreaterThanOrEqual(0);
      expect(c.good).toBeLessThan(c.options.length);
    }
    expect(CALLS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('balance: a sensible player survives the week without constant hunger', () => {
  it('eating when "hungry" (< 35) and sleeping at night: at most 3 meals a day, never fainting, healthy at the end', () => {
    const s = newGame();
    s.money = 1_000_000; // money is balanced by work calls elsewhere; this test is about the needs only
    let meals = 0, maxDailyMeals = 0, dayMeals = 0, lastDay = 0, minSat = 100;
    for (let guard = 0; guard < 7 * 24 * 60 && !s.ended; guard++) {
      advance(s, 1);
      if (s.day !== lastDay) { lastDay = s.day; maxDailyMeals = Math.max(maxDailyMeals, dayMeals); dayMeals = 0; }
      minSat = Math.min(minSat, s.satiety);
      if (s.satiety < 35) { applyEffect(s, { satiety: 40, minutes: 20 }); meals++; dayMeals++; }
      if (s.minutes >= 23 * 60 && s.minutes < 23 * 60 + 5) sleepAtHome(s, 8);
    }
    expect(s.ended).toBe('week');
    expect(s.passOuts).toBe(0);
    expect(s.health).toBeGreaterThan(80);
    expect(maxDailyMeals).toBeLessThanOrEqual(3);
    expect(meals).toBeLessThanOrEqual(7 * 3);
    expect(minSat).toBeGreaterThan(20);
  });
});
