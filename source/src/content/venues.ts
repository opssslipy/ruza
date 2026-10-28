import { isWeekday, MAX_WORK_ROUNDS, type Effect, type GameState } from '../game/state';

export interface VenueAction {
  label: string;
  effect: Effect;
  special?: 'work' | 'sleep';
  /** Returns the reason why the action is unavailable right now, or null when it is available. */
  blocked?: (s: GameState) => string | null;
}

export interface Venue {
  id: string; // same as the landmark id on the map
  name: string;
  floor: number;
  actions: VenueAction[];
}

const hour = (s: GameState): number => s.minutes / 60;
const after = (h: number) => (s: GameState): string | null => (hour(s) >= h ? null : `Открыто с ${h}:00`);
const needMoney = (price: number) => (s: GameState): string | null => (s.money >= price ? null : 'Не хватает денег');

export const VENUES: Venue[] = [
  {
    id: 'home', name: 'Дом Стаса', floor: 0x5a4a3a,
    actions: [
      { label: 'Поспать 8 часов', special: 'sleep', effect: { minutes: 480 }, blocked: (s) => (s.energy > 85 ? 'Спать не хочется' : null) },
      { label: 'Поесть из холодильника', effect: { satiety: 12, mood: -2, minutes: 15 } },
      {
        label: 'Работать (Skillbox, 5 звонков)', special: 'work', effect: {},
        blocked: (s) => (!isWeekday(s) ? 'По выходным не работаем' : hour(s) < 10 || hour(s) >= 19 ? 'Рабочее время 10:00 – 19:00' : s.workedToday >= MAX_WORK_ROUNDS ? 'На сегодня хватит' : s.energy < 15 ? 'Нет сил' : null),
      },
    ],
  },
  { id: 'pyaterochka', name: 'Пятёрочка', floor: 0x8a8f7a, actions: [
    { label: 'Купить еду (250 ₽)', effect: { money: -250, satiety: 40, minutes: 20 }, blocked: needMoney(250) },
    { label: 'Пиво (120 ₽)', effect: { money: -120, mood: 6, satiety: 3, health: -1, minutes: 10 }, blocked: needMoney(120) },
  ] },
  { id: 'shawarma', name: 'Шаурма', floor: 0x9a7a4a, actions: [
    { label: 'Шаурма (200 ₽)', effect: { money: -200, satiety: 45, mood: 5, minutes: 20 }, blocked: needMoney(200) },
  ] },
  { id: 'gym', name: 'Качалка', floor: 0x4a4f5a, actions: [
    { label: 'Тренировка (400 ₽)', effect: { money: -400, energy: -20, mood: 10, health: 6, satiety: -12, minutes: 90 }, blocked: (s) => (s.money < 400 ? 'Не хватает денег' : s.energy < 25 ? 'Нет сил' : null) },
  ] },
  { id: 'pharmacy', name: 'Аптека', floor: 0x7a9a9a, actions: [
    { label: 'Витамины (300 ₽)', effect: { money: -300, health: 8, minutes: 15 }, blocked: needMoney(300) },
  ] },
  { id: 'hospital', name: 'Больница', floor: 0x9aa7ae, actions: [
    { label: 'Обследование и капельница (1500 ₽)', effect: { money: -1500, health: 25, energy: 10, minutes: 180 }, blocked: needMoney(1500) },
  ] },
  { id: 'dym', name: 'The Дым', floor: 0x3b2f4a, actions: [
    { label: 'Кальян (600 ₽)', effect: { money: -600, mood: 15, energy: -3, health: -3, minutes: 90 }, blocked: (s) => after(16)(s) ?? needMoney(600)(s) },
  ] },
  { id: 'ruzvelt', name: 'Рузвельт', floor: 0x2d2540, actions: [
    { label: 'Погулять до утра (1500 ₽)', effect: { money: -1500, mood: 25, energy: -15, satiety: 10, health: -4, wanted: 3, minutes: 180 }, blocked: (s) => after(20)(s) ?? needMoney(1500)(s) },
  ] },
  { id: 'mixbar', name: 'Миксбар', floor: 0x45304a, actions: [
    { label: 'Коктейль (500 ₽)', effect: { money: -500, mood: 10, energy: -5, minutes: 45 }, blocked: (s) => after(18)(s) ?? needMoney(500)(s) },
  ] },
  { id: 'police', name: 'Отдел полиции', floor: 0x4a5668, actions: [
    { label: 'Решить вопрос (3000 ₽)', effect: { money: -3000, wanted: -25, mood: -5, minutes: 30 }, blocked: (s) => (s.wanted < 10 ? 'Вопросов к тебе нет' : needMoney(3000)(s)) },
  ] },
  { id: 'teatre', name: 'Театре', floor: 0x6a4a55, actions: [
    { label: 'Сходить на сеанс (350 ₽)', effect: { money: -350, mood: 10, energy: 3, minutes: 120 }, blocked: needMoney(350) },
  ] },
  { id: 'garages', name: 'Гаражи', floor: 0x555555, actions: [
    { label: 'Посидеть с пацанами', effect: { mood: 8, satiety: -4, minutes: 60 } },
  ] },
];

export function venueById(id: string): Venue | undefined {
  return VENUES.find((v) => v.id === id);
}
