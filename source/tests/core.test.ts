import { describe, expect, it } from 'vitest';
import lev from '../src/content/ink/lev.ink?raw';
import { CHARACTERS } from '../src/content/characters';
import { Dialogue } from '../src/dialogue';
import { emptySave, loadSave, writeSave } from '../src/save';

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
  };
}

describe('dialogue', () => {
  it('walks lev to a consequence flag', () => {
    const d = new Dialogue(lev);
    const first = d.next();
    expect(first.choices.length).toBe(2);
    const second = d.next(0);
    expect(second.choices).toEqual(['Держи.', 'Нет, сам на мели.']);
    const end = d.next(0);
    expect(end.ended).toBe(true);
    expect(d.getFlag('lev_helped')).toBe(true);
  });

  it('refusing leaves the flag false', () => {
    const d = new Dialogue(lev);
    d.next();
    d.next(1);
    d.next(1);
    expect(d.getFlag('lev_helped')).toBe(false);
  });
});

describe('every written dialogue', () => {
  const talkable = CHARACTERS.filter((c) => c.ink);

  it('has one for each expected character', () => {
    expect(talkable.map((c) => c.id).sort()).toEqual(['anyaartem', 'bara', 'belka', 'bezuk', 'demon', 'diana', 'karina', 'korun', 'kryazh', 'lev', 'minyucha', 'petya', 'shatruha', 'timur']);
  });

  it.each(talkable.map((c) => [c.id, c.ink as string]))('%s: both choice paths reach the end and set the flag only on helping', (id, ink) => {
    for (const pick of [0, 1]) {
      const d = new Dialogue(ink);
      let line = d.next();
      let guard = 0;
      // first choice varies flavour only; the last choice is the one that decides the flag
      line = d.next(0);
      while (!line.ended && guard++ < 10) line = d.next(pick);
      expect(line.ended).toBe(true);
      expect(d.getFlag(`${id}_helped`)).toBe(pick === 0);
    }
  });
});

describe('save', () => {
  it('round-trips', () => {
    const s = memoryStorage();
    const data = emptySave();
    data.game.talked.push('lev');
    writeSave(data, s);
    expect(loadSave(s).game.talked).toEqual(['lev']);
  });

  it('falls back to a fresh save on garbage or wrong version', () => {
    // a fresh game gets a random season, so the comparison ignores it
    const fresh = (): unknown => { const e = emptySave(); delete e.game.season; return e; };
    const stripped = (data: ReturnType<typeof loadSave>): unknown => { const c = structuredClone(data); delete c.game.season; return c; };
    expect(stripped(loadSave(memoryStorage('not json')))).toEqual(fresh());
    expect(stripped(loadSave(memoryStorage(JSON.stringify({ version: 99, game: emptySave().game }))))).toEqual(fresh());
  });
});


