const KEY = 'ruza-save';
const VERSION = 1;

export interface SaveData {
  version: number;
  flags: Record<string, boolean>;
  talked: string[];
}

export function emptySave(): SaveData {
  return { version: VERSION, flags: {}, talked: [] };
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
  return typeof o.version === 'number' && typeof o.flags === 'object' && o.flags !== null && Array.isArray(o.talked);
}
