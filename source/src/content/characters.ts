import anyaartemInk from './ink/anyaartem.ink?raw';
import baraInk from './ink/bara.ink?raw';
import belkaInk from './ink/belka.ink?raw';
import demonInk from './ink/demon.ink?raw';
import dianaInk from './ink/diana.ink?raw';
import bezukInk from './ink/bezuk.ink?raw';
import karinaInk from './ink/karina.ink?raw';
import korunInk from './ink/korun.ink?raw';
import kryazhInk from './ink/kryazh.ink?raw';
import levInk from './ink/lev.ink?raw';
import minyuchaInk from './ink/minyucha.ink?raw';
import petyaInk from './ink/petya.ink?raw';
import shatruhaInk from './ink/shatruha.ink?raw';
import timurInk from './ink/timur.ink?raw';

export interface Character {
  id: string;
  name: string;
  /** Path under public/ to a portrait that really exists; when omitted a placeholder is drawn. */
  portrait?: string;
  color: number;
  ink?: string;
}

// Portraits come from tools/make-portraits.mjs: stylised drafts, not likenesses; prototypes must approve them.
export const CHARACTERS: Character[] = [
  { id: 'lev', portrait: 'portraits/lev.svg', name: 'Лев', color: 0x4a7bd1, ink: levInk },
  { id: 'timur', portrait: 'portraits/timur.svg', name: 'Тимур', color: 0x6b7a5e, ink: timurInk },
  { id: 'diana', portrait: 'portraits/diana.svg', name: 'Диана', color: 0xd16a9a, ink: dianaInk },
  { id: 'anyaartem', portrait: 'portraits/anyaartem.svg', name: 'Артем', color: 0x888888, ink: anyaartemInk },
  { id: 'belka', portrait: 'portraits/belka.svg', name: 'Белка', color: 0x8a5a3a, ink: belkaInk },
  { id: 'karina', portrait: 'portraits/karina.svg', name: 'Карина', color: 0x6a3fa0, ink: karinaInk },
  { id: 'stas', name: 'Стас', portrait: 'portraits/stas.svg', color: 0x546a8a },
  { id: 'demon', name: 'Демон', portrait: 'portraits/demon.svg', color: 0x3a2424, ink: demonInk },
  { id: 'korun', name: 'Корюн', portrait: 'portraits/korun.svg', color: 0x3f4a2e, ink: korunInk },
  { id: 'bara', name: 'Бара', portrait: 'portraits/bara.svg', color: 0x2c4a7a, ink: baraInk },
  { id: 'bezuk', name: 'Безук', portrait: 'portraits/bezuk.svg', color: 0x3b5278, ink: bezukInk },
  { id: 'petya', name: 'Петя', portrait: 'portraits/petya.svg', color: 0x6b4a2f, ink: petyaInk },
  { id: 'kryazh', name: 'Кряж', portrait: 'portraits/kryazh.svg', color: 0x5a5a5a, ink: kryazhInk },
  { id: 'shatruha', name: 'Шатруха', portrait: 'portraits/shatruha.svg', color: 0x8a4f78, ink: shatruhaInk },
  { id: 'minyucha', name: 'Минюча', portrait: 'portraits/minyucha.svg', color: 0x3f7a70, ink: minyuchaInk },
];



