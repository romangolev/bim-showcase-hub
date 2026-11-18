import { BSH_KEYS, defineRecord } from '../storage.js';

export const PINS_KEY = BSH_KEYS.preference.commandPins;
export const PIN_LIMIT = 8;

const PINS = defineRecord<string[]>({
  key: PINS_KEY,
  initial: [],
  sanitize: (raw) =>
    Array.isArray(raw)
      ? [
          ...new Set(
            raw.filter(
              (id): id is string => typeof id === 'string' && Boolean(id),
            ),
          ),
        ].slice(0, PIN_LIMIT)
      : [],
});

export interface PinChange {
  pinned: boolean;
  evicted: string | null;
}

export function readPins(): string[] {
  return PINS.read();
}

export function togglePin(id: string): PinChange {
  const pins = readPins();
  if (pins.includes(id)) {
    PINS.write(pins.filter((known) => known !== id));
    return { pinned: false, evicted: null };
  }
  const next = [id, ...pins];
  const evicted = next.length > PIN_LIMIT ? (next.pop() ?? null) : null;
  PINS.write(next);
  return { pinned: true, evicted };
}
