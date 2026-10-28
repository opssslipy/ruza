import type { Effect } from '../game/state';

// What a finished conversation does to Stas. "yes" = he did what the friend asked (the ink flag `<id>_helped`).
export const DIALOGUE_EFFECTS: Record<string, { yes: Effect; no: Effect }> = {
  lev: { yes: { money: -500, mood: 5, minutes: 10 }, no: { mood: -3, minutes: 10 } },
  timur: { yes: { mood: 10, minutes: 20 }, no: { mood: 2, minutes: 10 } },
  diana: { yes: { mood: -3, energy: -5, minutes: 30 }, no: { mood: -12, minutes: 10 } },
  anyaartem: { yes: { mood: 10, minutes: 20 }, no: { mood: -2, minutes: 10 } },
  belka: { yes: { mood: 6, wanted: 6, minutes: 10 }, no: { mood: 2, minutes: 10 } },
  bara: { yes: { wanted: -12, mood: -5, minutes: 15 }, no: { wanted: 25, mood: -8, minutes: 15 } },
  shatruha: { yes: { mood: 10, energy: -6, minutes: 40 }, no: { mood: 3, minutes: 10 } },
  karina: { yes: { mood: 12, satiety: -5, health: -2, minutes: 60 }, no: { mood: -2, minutes: 10 } },
};
