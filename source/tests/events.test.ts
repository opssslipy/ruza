import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game/state';
import { EVENTS, eventDue, resolveEvent, rollEvent } from '../src/game/events';
import { CHARACTERS } from '../src/content/characters';

describe('random events', () => {
  it('every event has at least two options and a real person when it names one', () => {
    for (const e of EVENTS) {
      expect(e.options.length, e.id).toBeGreaterThanOrEqual(2);
      if (e.who) expect(CHARACTERS.some((c) => c.id === e.who), e.id).toBe(true);
    }
  });

  it('is not due at once, but becomes due later', () => {
    const s = newGame();
    expect(eventDue(s)).toBe(false);
    s.minutes += 200;
    expect(eventDue(s)).toBe(true);
  });

  it('the police stop only happens to someone with a record', () => {
    const clean = newGame();
    clean.wanted = 0;
    for (let i = 0; i < 300; i++) expect(rollEvent(clean)?.id).not.toBe('cops_stop');
    const wanted = newGame();
    wanted.wanted = 30;
    const ids = new Set(Array.from({ length: 600 }, () => rollEvent(wanted)?.id));
    expect(ids.has('cops_stop')).toBe(true);
  });

  it('resolving applies the effect and schedules the next event', () => {
    const s = newGame();
    const ev = EVENTS.find((e) => e.id === 'wallet')!;
    const money = s.money;
    resolveEvent(s, ev, 1);
    expect(s.money).toBe(money + 800);
    expect(s.nextEventAt).toBeGreaterThan(s.day * 1440 + s.minutes);
  });
});
