import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game/state';
import { currentTargets, offerQuest, onAction, onTalk, onVisit, QUESTS, tickQuests } from '../src/game/quests';
import { CHARACTERS } from '../src/content/characters';

describe('quests', () => {
  it('every quest has a giver who exists and valid steps', () => {
    for (const q of QUESTS) {
      expect(CHARACTERS.some((c) => c.id === q.giver), q.id).toBe(true);
      expect(q.steps.length).toBeGreaterThan(0);
    }
  });

  it('a visit then a talk completes the quest and pays the reward once', () => {
    const s = newGame();
    const q = offerQuest(s, 'lev');
    expect(q?.id).toBe('lev_interview');
    expect(offerQuest(s, 'lev')).toBeNull(); // already active
    const money = s.money;
    expect(onVisit(s, 'teatre').join(' ')).toContain('Дальше');
    const done = onTalk(s, 'lev');
    expect(done.join(' ')).toContain('выполнено');
    expect(s.money).toBeGreaterThan(money);
    expect(s.quests?.done).toContain('lev_interview');
    expect(offerQuest(s, 'lev')).toBeNull(); // finished, not offered again
  });

  it('a venue action step only counts the right action', () => {
    const s = newGame();
    offerQuest(s, 'karina');
    expect(onAction(s, 'pyaterochka', 0)).toEqual([]);
    expect(onAction(s, 'pyaterochka', 1).join(' ')).toContain('Дальше');
  });

  it('an expired quest fails with a penalty', () => {
    const s = newGame();
    offerQuest(s, 'belka');
    const mood = s.mood;
    s.day = 3;
    const msgs = tickQuests(s);
    expect(msgs.join(' ')).toContain('провалено');
    expect(s.mood).toBeLessThan(mood);
    expect(s.quests?.failed).toContain('belka_shawarma');
  });

  it('targets point at the place of the current step', () => {
    const s = newGame();
    offerQuest(s, 'diana');
    expect(currentTargets(s)[0]?.place).toBe('pyaterochka');
    onVisit(s, 'pyaterochka');
    expect(currentTargets(s)[0]?.place).toBe('home');
  });

  it('at most three quests at a time', () => {
    const s = newGame();
    offerQuest(s, 'diana'); offerQuest(s, 'lev'); offerQuest(s, 'bara');
    expect(offerQuest(s, 'belka')).toBeNull();
  });
});
