// DRAFT schedules, written by the developer from the characters' temperaments. They are game design,
// NOT facts about where real people go. The author should edit this file to match the friends' real habits.
import { isWeekday, type GameState } from '../game/state';

interface Slot {
  when: 'weekday' | 'weekend' | 'all';
  from: number; // hour, inclusive
  to: number; // hour, exclusive
  at: string; // landmark id
}

const SCHEDULES: Record<string, Slot[]> = {
  lev: [
    { when: 'weekday', from: 11, to: 15, at: 'teatre' },
    { when: 'weekday', from: 15, to: 19, at: 'square' },
    { when: 'weekday', from: 19, to: 24, at: 'dym' },
    { when: 'weekend', from: 13, to: 24, at: 'square' },
  ],
  timur: [
    { when: 'weekday', from: 9, to: 19, at: 'garages' },
    { when: 'weekday', from: 19, to: 24, at: 'ruzvelt' },
    { when: 'weekend', from: 12, to: 20, at: 'garages' },
    { when: 'weekend', from: 20, to: 24, at: 'ruzvelt' },
  ],
  diana: [
    { when: 'all', from: 7, to: 10, at: 'home' },
    { when: 'weekday', from: 12, to: 14, at: 'pyaterochka' },
    { when: 'all', from: 19, to: 23, at: 'home' },
  ],
  anyaartem: [
    { when: 'weekday', from: 9, to: 17, at: 'pharmacy' },
    { when: 'all', from: 17, to: 22, at: 'square' },
  ],
  belka: [
    { when: 'weekday', from: 17, to: 24, at: 'dym' },
    { when: 'weekend', from: 12, to: 14, at: 'garages' },
    { when: 'weekend', from: 14, to: 24, at: 'dym' },
  ],
  bara: [
    { when: 'weekday', from: 9, to: 18, at: 'police' },
    { when: 'all', from: 21, to: 24, at: 'ruzvelt' },
  ],
  shatruha: [
    { when: 'weekday', from: 10, to: 19, at: 'pyaterochka' },
    { when: 'all', from: 19, to: 22, at: 'square' },
  ],
  // Karina is on maternity leave: she is out almost all day, every day (draft, the author can reshuffle)
  karina: [
    { when: 'all', from: 9, to: 13, at: 'square' },
    { when: 'all', from: 13, to: 16, at: 'stadium' },
    { when: 'all', from: 16, to: 21, at: 'pyaterochka' },
  ],
};

/** Landmark id where the character is right now, or null when they are not out in town. */
export function whereIs(id: string, s: GameState): string | null {
  const hour = s.minutes / 60;
  const weekday = isWeekday(s);
  for (const slot of SCHEDULES[id] ?? []) {
    const day = slot.when === 'all' || (slot.when === 'weekday') === weekday;
    if (day && hour >= slot.from && hour < slot.to) return slot.at;
  }
  return null;
}

export function peopleAt(placeId: string, s: GameState): string[] {
  return Object.keys(SCHEDULES).filter((id) => whereIs(id, s) === placeId);
}
