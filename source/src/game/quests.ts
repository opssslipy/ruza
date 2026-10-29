import { applyEffect, describeEffect, type Effect, type GameState } from './state';
import { whereIs } from '../content/schedules';

// Small errands the friends hand out. A quest is a list of steps (visit a place, use a venue action, talk to someone);
// while one is active its target glows on the map. Everything here is plain logic, so it can be tested without a browser.

export type Step =
  | { kind: 'visit'; place: string; text: string }
  | { kind: 'action'; place: string; action: number; text: string }
  | { kind: 'talk'; npc: string; text: string };

export interface QuestDef {
  id: string;
  giver: string;
  title: string;
  intro: string;
  steps: Step[];
  /** game hours until it expires */
  hours: number;
  reward: Effect;
  fail: Effect;
}

export interface ActiveQuest { id: string; step: number; until: number }
export interface QuestState { active: ActiveQuest[]; done: string[]; failed: string[] }

// DRAFT errands built from the characters' roles only; the author can rewrite them freely.
export const QUESTS: QuestDef[] = [
  { id: 'diana_parcel', giver: 'diana', title: 'Посылка для Дианы', intro: 'Диана просит забрать её заказ в Пятёрочке и принести домой.', hours: 10,
    steps: [{ kind: 'visit', place: 'pyaterochka', text: 'Забрать посылку в Пятёрочке' }, { kind: 'visit', place: 'home', text: 'Отнести посылку домой' }],
    reward: { mood: 8, money: 300, minutes: 0 }, fail: { mood: -12 } },
  { id: 'lev_interview', giver: 'lev', title: 'Собеседование Льва', intro: 'Лев идёт на очередное собеседование и просит подстраховать.', hours: 8,
    steps: [{ kind: 'visit', place: 'teatre', text: 'Прийти в Театре поддержать Льва' }, { kind: 'talk', npc: 'lev', text: 'Поговорить со Львом' }],
    reward: { mood: 10, money: 400 }, fail: { mood: -6 } },
  { id: 'bara_eyes', giver: 'bara', title: 'Глаза и уши', intro: 'Бара просит посмотреть, кто крутится у Рузвельта вечером.', hours: 12,
    steps: [{ kind: 'visit', place: 'ruzvelt', text: 'Заглянуть в Рузвельт' }, { kind: 'talk', npc: 'bara', text: 'Рассказать Баре' }],
    reward: { wanted: -10, mood: -2 }, fail: { wanted: 8 } },
  { id: 'belka_shawarma', giver: 'belka', title: 'Шаурма для Белки', intro: 'Белка проголодался и просит принести шаурму.', hours: 6,
    steps: [{ kind: 'action', place: 'shawarma', action: 0, text: 'Купить шаурму' }, { kind: 'talk', npc: 'belka', text: 'Отдать шаурму Белке' }],
    reward: { money: 500, mood: 6 }, fail: { mood: -3 } },
  { id: 'karina_beer', giver: 'karina', title: 'Пивка для Карины', intro: 'Карина просит принести пиво из Пятёрочки, пока не вернулся муж.', hours: 8,
    steps: [{ kind: 'action', place: 'pyaterochka', action: 1, text: 'Купить пиво в Пятёрочке' }, { kind: 'talk', npc: 'karina', text: 'Отдать пиво Карине' }],
    reward: { mood: 12, health: -1 }, fail: { mood: -3 } },
  { id: 'timur_car', giver: 'timur', title: 'Новая тачка Тимура', intro: 'Тимур зовёт посмотреть на его новую машину у гаражей. Как бы невзначай.', hours: 10,
    steps: [{ kind: 'visit', place: 'garages', text: 'Посмотреть машину у гаражей' }, { kind: 'talk', npc: 'timur', text: 'Похвалить Тимура' }],
    reward: { mood: 12 }, fail: { mood: -2 } },
];

export const questById = (id: string): QuestDef | undefined => QUESTS.find((q) => q.id === id);
const now = (s: GameState): number => s.day * 1440 + s.minutes;

export function ensureQuests(s: GameState): QuestState {
  s.quests ??= { active: [], done: [], failed: [] };
  return s.quests;
}

/** A friend offers an errand after a conversation went well. Returns the new quest, or null. */
export function offerQuest(s: GameState, giver: string): QuestDef | null {
  const q = ensureQuests(s);
  if (q.active.length >= 3) return null;
  const def = QUESTS.find((d) => d.giver === giver && !q.active.some((a) => a.id === d.id) && !q.done.includes(d.id) && !q.failed.includes(d.id));
  if (!def) return null;
  q.active.push({ id: def.id, step: 0, until: now(s) + def.hours * 60 });
  return def;
}

function complete(s: GameState, a: ActiveQuest, def: QuestDef, msgs: string[]): void {
  const q = ensureQuests(s);
  q.active = q.active.filter((x) => x.id !== a.id);
  q.done.push(def.id);
  msgs.push(`Задание выполнено: «${def.title}»`, describeEffect(def.reward), ...applyEffect(s, def.reward));
}

function advanceMatching(s: GameState, match: (st: Step) => boolean): string[] {
  const msgs: string[] = [];
  for (const a of [...ensureQuests(s).active]) {
    const def = questById(a.id);
    const st = def?.steps[a.step];
    if (!def || !st || !match(st)) continue;
    a.step += 1;
    if (a.step >= def.steps.length) complete(s, a, def, msgs);
    else msgs.push(`Дальше: ${(def.steps[a.step] as Step).text}`);
  }
  return msgs;
}

export const onVisit = (s: GameState, place: string): string[] => advanceMatching(s, (st) => st.kind === 'visit' && st.place === place);
export const onAction = (s: GameState, place: string, action: number): string[] => advanceMatching(s, (st) => st.kind === 'action' && st.place === place && st.action === action);
export const onTalk = (s: GameState, npc: string): string[] => advanceMatching(s, (st) => st.kind === 'talk' && st.npc === npc);

/** Expires quests whose time ran out and applies the penalty. */
export function tickQuests(s: GameState): string[] {
  const q = ensureQuests(s);
  const msgs: string[] = [];
  for (const a of [...q.active]) {
    if (now(s) <= a.until) continue;
    const def = questById(a.id);
    q.active = q.active.filter((x) => x.id !== a.id);
    q.failed.push(a.id);
    if (def) msgs.push(`Задание провалено: «${def.title}»`, describeEffect(def.fail), ...applyEffect(s, def.fail));
  }
  return msgs;
}

export interface Target { quest: string; text: string; place: string | null; npc: string | null; hoursLeft: number }

/** The current step of every active quest, with where to go (a landmark id, or null when a person is not out in town). */
export function currentTargets(s: GameState): Target[] {
  return ensureQuests(s).active.flatMap((a) => {
    const def = questById(a.id);
    const st = def?.steps[a.step];
    if (!def || !st) return [];
    const place = st.kind === 'talk' ? whereIs(st.npc, s) : st.place;
    return [{ quest: def.title, text: st.text, place, npc: st.kind === 'talk' ? st.npc : null, hoursLeft: Math.max(0, Math.round((a.until - now(s)) / 60)) }];
  });
}
