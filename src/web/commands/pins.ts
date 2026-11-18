import { defineRecord } from '../storage.js';

export const PINS_KEY = 'bsh.commands.pinned.v1';
export const PIN_LIMIT = 8;

const PINS = defineRecord<string[]>({
  key: PINS_KEY,
  initial: [],
  sanitize: (raw) =>
    Array.isArray(raw)
      ? raw
          .filter((id): id is string => typeof id === 'string' && Boolean(id))
          .slice(0, PIN_LIMIT)
      : [],
});

export function readPins(): string[] {
  return PINS.read();
}

export function isPinned(id: string): boolean {
  return readPins().includes(id);
}

export function togglePin(id: string): boolean {
  const pins = readPins();
  const next = pins.includes(id)
    ? pins.filter((known) => known !== id)
    : [id, ...pins].slice(0, PIN_LIMIT);
  PINS.write(next);
  return next.includes(id);
}
