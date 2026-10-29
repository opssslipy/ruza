// Pure game logic: no Phaser here, so it can be tested and tuned without a browser.

export type EndingId = 'banka' | 'arrested' | 'broke' | 'week';
export type SleepMode = 'awake' | 'sleep' | 'faint';

export interface GameState {
  day: number; // 0 = Monday
  minutes: number; // since midnight
  satiety: number;
  energy: number;
  mood: number;
  health: number;
  wanted: number; // "розыск": 100 means arrest
  money: number;
  talked: string[];
  talkedDay: Record<string, number>;
  workedToday: number;
  passOuts: number;
  ended: EndingId | null;
  nextEventAt?: number;
  quests?: { active: { id: string; step: number; until: number }[]; done: string[]; failed: string[] };
}

export interface Effect {
  money?: number;
  satiety?: number;
  energy?: number;
  mood?: number;
  health?: number;
  wanted?: number;
  minutes?: number;
}

export const START_MONEY = 3000;
export const HOUSEHOLD_COST = 700; // charged every midnight: family, bills
export const MAX_WORK_ROUNDS = 4;
export const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export function newGame(): GameState {
  return {
    day: 0, minutes: 8 * 60 + 30,
    satiety: 55, energy: 70, mood: 60, health: 90, wanted: 0, money: START_MONEY,
    talked: [], talkedDay: {}, workedToday: 0, passOuts: 0, ended: null, quests: { active: [], done: [], failed: [] },
  };
}

export function isWeekday(s: GameState): boolean {
  return s.day < 5;
}

export function clockText(s: GameState): string {
  const h = Math.floor(s.minutes / 60), m = Math.floor(s.minutes % 60);
  return `${DAY_NAMES[Math.min(s.day, 6)]} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Moves time forward minute by minute, applying hunger, tiredness, midnight costs and endings. Returns messages worth showing. */
export function advance(s: GameState, mins: number, mode: SleepMode = 'awake'): string[] {
  const msgs: string[] = [];
  for (let i = 0; i < mins && !s.ended; i++) {
    s.minutes += 1;
    if (mode === 'awake') {
      // tuned so that one meal lasts about half a game day: hunger below 35 shows after ~8 hours without food
      s.satiety = clamp(s.satiety - 0.04);
      s.energy = clamp(s.energy - 0.05);
      s.mood = clamp(s.mood - (s.satiety < 20 || s.energy < 20 ? 0.06 : 0.01));
    } else {
      s.satiety = clamp(s.satiety - 0.02);
      s.energy = clamp(s.energy + (mode === 'sleep' ? 0.2 : 0.08));
    }
    if (s.satiety <= 0 || (mode === 'awake' && s.energy <= 0)) s.health = clamp(s.health - 0.06);
    else if (s.satiety > 50 && s.energy > 40) s.health = clamp(s.health + 0.01);

    if (s.minutes >= 24 * 60) {
      s.minutes = 0;
      s.day += 1;
      s.workedToday = 0;
      s.money -= HOUSEHOLD_COST;
      msgs.push(`Ночь прошла. Дом и семья: −${HOUSEHOLD_COST} ₽`);
      if (s.day >= 7) { s.ended = 'week'; break; }
    }
    if (mode === 'awake' && s.energy <= 0) {
      msgs.push('Стас вырубился там, где стоял. Очнулся в чужом дворе, без пятисот рублей.');
      s.passOuts += 1;
      s.money -= 500;
      s.mood = clamp(s.mood - 15);
      s.health = clamp(s.health - 10);
      s.energy = 5;
      msgs.push(...advance(s, 420, 'faint'));
    }
    if (s.health <= 0) s.ended = 'banka';
    else if (s.wanted >= 100) s.ended = 'arrested';
    else if (s.money <= -3000) s.ended = 'broke';
  }
  return msgs;
}

export function applyEffect(s: GameState, e: Effect): string[] {
  s.money += e.money ?? 0;
  s.satiety = clamp(s.satiety + (e.satiety ?? 0));
  s.energy = clamp(s.energy + (e.energy ?? 0));
  s.mood = clamp(s.mood + (e.mood ?? 0));
  s.health = clamp(s.health + (e.health ?? 0));
  s.wanted = clamp(s.wanted + (e.wanted ?? 0));
  if (s.health <= 0 && !s.ended) s.ended = 'banka';
  else if (s.wanted >= 100 && !s.ended) s.ended = 'arrested';
  return e.minutes ? advance(s, e.minutes) : [];
}

export function sleepAtHome(s: GameState, hours = 8): string[] {
  return advance(s, hours * 60, 'sleep');
}

export function describeEffect(e: Effect): string {
  const part = (label: string, v: number | undefined, unit = ''): string | null => (v ? `${label} ${v > 0 ? '+' : '−'}${Math.abs(v)}${unit}` : null);
  return [part('деньги', e.money, ' ₽'), part('сытость', e.satiety), part('энергия', e.energy), part('настроение', e.mood), part('здоровье', e.health), part('розыск', e.wanted)]
    .filter((x): x is string => x !== null)
    .join(', ');
}

export function endingText(id: EndingId, s: GameState): { title: string; text: string } {
  switch (id) {
    case 'banka': return { title: 'Потрачено', text: 'Здоровье кончилось раньше, чем неделя. Друзья потом долго вспоминали, каким он был.' };
    case 'arrested': return { title: 'Стаса задержали', text: 'Розыск дошёл до предела. Бара сказал, что это ничего личного, а Петя довольно улыбнулся.' };
    case 'broke': return { title: 'Стас на мели', text: 'Долги выросли так, что дом и семья остались без денег. Выкручиваться больше нечем.' };
    case 'week': return { title: 'Неделя пройдена', text: `Стас дожил до воскресенья. Денег осталось ${Math.round(s.money)} ₽, настроение ${Math.round(s.mood)}, здоровье ${Math.round(s.health)}.` };
  }
}
