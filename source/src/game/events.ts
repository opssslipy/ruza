import { applyEffect, describeEffect, isWeekday, type Effect, type GameState } from './state';

// Random street events: every couple of game hours something happens to Stas on the map and he picks a reply.
// DRAFT texts written from the town's types and the friends' roles only; the author can rewrite or add freely.
export interface EventOption { label: string; effect: Effect; result: string; needsMoney?: number }
export interface EventDef {
  id: string;
  title: string;
  text: string;
  /** friend whose portrait is shown, if the event is about a person */
  who?: string;
  weight?: number;
  when?: (s: GameState) => boolean;
  options: EventOption[];
}

const hour = (s: GameState): number => s.minutes / 60;

export const EVENTS: EventDef[] = [
  { id: 'granny', title: 'Бабушка с бидоном', text: 'Бабушка с тяжёлым бидоном: «Сынок, помоги донести до остановки, а то у меня спина».', when: (s) => hour(s) >= 8 && hour(s) < 20,
    options: [{ label: 'Помочь донести', effect: { energy: -5, mood: 6, money: 50, minutes: 20 }, result: 'Донёс. Бабушка дала полтинник и пожелала здоровья.' }, { label: 'Извините, тороплюсь', effect: { mood: -2, minutes: 2 }, result: 'Бабушка вздохнула. Стало как-то неловко.' }] },
  { id: 'wallet', title: 'Кошелёк на лавочке', text: 'На лавочке лежит чей-то кошелёк. Внутри наличные и паспорт. Рядом никого.',
    options: [{ label: 'Отнести в полицию', effect: { mood: 6, wanted: -3, minutes: 25 }, result: 'Дежурный записал твою фамилию и посмотрел с подозрением, но по-хорошему.' }, { label: 'Забрать деньги себе', effect: { money: 800, mood: 2, wanted: 5, minutes: 3 }, result: 'Деньги в кармане, а совесть как-то молчит. Пока.' }] },
  { id: 'cops_stop', title: 'Остановили менты', text: 'Двое в форме перегородили дорогу: «Гражданин, документы. Куда идём? Откуда?»', who: 'bara', when: (s) => s.wanted >= 12,
    options: [{ label: 'Показать документы', effect: { minutes: 25, mood: -3, wanted: -2 }, result: 'Проверили, ничего не нашли, отпустили. Минус полчаса.' }, { label: 'Решить вопрос (1000 ₽)', needsMoney: 1000, effect: { money: -1000, wanted: -8, minutes: 5 }, result: 'Купюра исчезла быстрее, чем ты сказал «мы же договорились».' }, { label: 'Дать дёру', effect: { energy: -10, wanted: 12, mood: -2, minutes: 8 }, result: 'Убежал. Но теперь они знают твоё лицо.' }] },
  { id: 'diana_call', title: 'Звонит Диана', text: '«Ты где?! Купи по дороге хлеб, памперсы и что-нибудь сладкое. Только не забудь, как в прошлый раз!»', who: 'diana',
    options: [{ label: 'Ладно, куплю (400 ₽)', needsMoney: 400, effect: { money: -400, mood: 2, minutes: 20 }, result: 'Купил всё. Диана написала «умничка». Редкое событие.' }, { label: 'Я занят, позже', effect: { mood: -8, minutes: 3 }, result: 'Диана бросила трубку. Вечером будет разговор.' }] },
  { id: 'rain', title: 'Начался дождь', text: 'С неба вдруг обрушился дождь. До ближайшего козырька метров сорок.',
    options: [{ label: 'Переждать под козырьком', effect: { minutes: 40, mood: -2 }, result: 'Простоял сорок минут и сухим остался. Зато время ушло.' }, { label: 'Бежать под дождём', effect: { health: -2, energy: -4, mood: 3, minutes: 5 }, result: 'Промок насквозь, но весело. Может, и заболею.' }] },
  { id: 'strange_deal', title: 'Шарики с рук', text: 'Незнакомец шепчет: «Есть кое-что для настроения. Недорого. Только тихо».',
    options: [{ label: 'Взять (300 ₽)', needsMoney: 300, effect: { money: -300, mood: 8, health: -2, wanted: 6, minutes: 10 }, result: 'Купил. Весело, но оглядываться стало привычкой.' }, { label: 'Отказаться', effect: { mood: 2, minutes: 2 }, result: 'Ушёл с гордым видом. Кошелёк цел.' }] },
  { id: 'dog', title: 'Собака увязалась', text: 'Рыжая дворняга бежит за тобой и виляет хвостом, будто вы старые друзья.',
    options: [{ label: 'Погладить и угостить', effect: { mood: 6, satiety: -2, minutes: 10 }, result: 'Собака счастлива, а у тебя на душе тепло.' }, { label: 'Не обращать внимания', effect: { minutes: 1 }, result: 'Собака проводила тебя до угла и отстала.' }] },
  { id: 'timur_car', title: 'Тимур на новой тачке', text: 'Рядом тормозит блестящая машина, Тимур невзначай облокотился на дверь: «Да так, купил. Подвезти?»', who: 'timur',
    options: [{ label: 'Прокатиться', effect: { mood: 8, minutes: 30, energy: 2 }, result: 'Прокатились с ветерком. Тимур смеялся всю дорогу и ни разу не сказал, сколько она стоит.' }, { label: 'Спасибо, пешком', effect: { mood: -1, minutes: 2 }, result: 'Тимур хмыкнул и уехал. Подкол в тишине.' }] },
  { id: 'karina_stroller', title: 'Карина с коляской', text: 'Карина катит коляску и сразу в атаку: «Стас! Ты пиво будешь? У меня как раз в сумке одно лишнее».', who: 'karina', when: (s) => hour(s) >= 11,
    options: [{ label: 'Давай по глотку', effect: { mood: 6, health: -1, minutes: 25 }, result: 'Сидели на лавке, Карина рассказала сюжет серии и про мужа.' }, { label: 'Не сейчас', effect: { mood: -1, minutes: 3 }, result: 'Карина пообещала предложить ещё раз. Она всегда обещает.' }] },
  { id: 'petya_car', title: 'Машина Пети', text: 'У тротуара стоит служебная машина, и сам Петя выходит из неё, поправляя фуражку. Заметил тебя.', who: 'petya', when: (s) => isWeekday(s) && hour(s) >= 9 && hour(s) < 19,
    options: [{ label: 'Поздороваться', effect: { mood: -4, wanted: 2, minutes: 5 }, result: 'Петя что-то записал в блокнот. Хуже уже не будет, наверное.' }, { label: 'Свернуть во двор', effect: { energy: -3, minutes: 6 }, result: 'Успел скрыться. Сердце колотится.' }] },
  { id: 'lev_job', title: 'Лев ищет работу', text: 'Лев выбегает навстречу и показывает объявление: «Стас, смотри, нужен менеджер! Как думаешь, возьмут?»', who: 'lev',
    options: [{ label: 'Конечно возьмут!', effect: { mood: 5, minutes: 10 }, result: 'Лев просиял и тут же пошутил про начальника. Хорошее настроение заразно.' }, { label: 'Ну такое', effect: { mood: -2, minutes: 8 }, result: 'Лев обиделся на минуту, потом пошутил про твоё лицо.' }] },
  { id: 'friend_money', title: 'Найденная купюра', text: 'Под ногами лежит сложенная купюра. Кажется, пятисотка.',
    options: [{ label: 'Поднять', effect: { money: 500, mood: 4, minutes: 1 }, result: 'Пятьсот рублей на дороге. День начинает нравиться.' }, { label: 'Пройти мимо', effect: { mood: 1, minutes: 1 }, result: 'Принципиальный ты человек.' }] },
];

const nowMin = (s: GameState): number => s.day * 1440 + s.minutes;

/** When the next event may happen; set on the first call and after every event. */
export function eventDue(s: GameState): boolean {
  s.nextEventAt ??= nowMin(s) + 80;
  return nowMin(s) >= s.nextEventAt;
}

export function rollEvent(s: GameState, rnd: () => number = Math.random): EventDef | null {
  const pool = EVENTS.filter((e) => !e.when || e.when(s));
  if (!pool.length) return null;
  const total = pool.reduce((a, e) => a + (e.weight ?? 1), 0);
  let r = rnd() * total;
  for (const e of pool) { r -= e.weight ?? 1; if (r <= 0) return e; }
  return pool[pool.length - 1] as EventDef;
}

/** Applies the chosen option; returns the messages to show. Schedules the next event 1.5 to 4 game hours later. */
export function resolveEvent(s: GameState, ev: EventDef, i: number, rnd: () => number = Math.random): string[] {
  const o = ev.options[i];
  s.nextEventAt = nowMin(s) + 90 + rnd() * 150;
  if (!o) return [];
  return [o.result, describeEffect(o.effect), ...applyEffect(s, o.effect)];
}
