import { newGame, type GameState } from './game/state';

const KEY = 'ruza-save';
const VERSION = 2;

export interface SaveData {
  version: number;
  game: GameState;
}

export function emptySave(): SaveData {
  return { version: VERSION, game: newGame() };
}

// Storage can throw (private mode, blocked site data), so the game must keep working without it.
export function loadSave(storage: Pick<Storage, 'getItem'> = localStorage): SaveData {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return emptySave();
    const parsed: unknown = JSON.parse(raw);
    if (isSaveData(parsed) && parsed.version === VERSION) return parsed;
  } catch {
    // fall through to a fresh save
  }
  return emptySave();
}

export function writeSave(data: SaveData, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore: progress just won't persist
  }
}

function isSaveData(v: unknown): v is SaveData {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const g = o.game as Record<string, unknown> | undefined;
  return typeof o.version === 'number' && typeof g === 'object' && g !== null && typeof g.day === 'number' && typeof g.money === 'number' && Array.isArray(g.talked);
}
