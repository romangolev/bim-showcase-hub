import {
  type ModelContext,
  parseModelContext,
} from '../../api/modelContext.js';
import { PINNED_KEY } from '../../api/modelStore.js';
import { defineRecord, usePersisted } from '../../storage.js';

export interface Pin extends ModelContext {
  urn: string;
}

export const MAX_PINS = 50;

export function sanitizePins(raw: unknown): Pin[] {
  if (!Array.isArray(raw)) return [];
  const pins = new Map<string, Pin>();
  for (const item of raw) {
    const urn = typeof item === 'string' ? item : (item as Pin | null)?.urn;
    if (typeof urn !== 'string' || urn === '' || pins.has(urn)) continue;
    const { with: _with, ...context } = parseModelContext(
      typeof item === 'string' ? {} : item,
    );
    pins.set(urn, { urn, ...context });
  }
  return [...pins.values()].slice(0, MAX_PINS);
}

const NO_PINS: Pin[] = [];

const PINS = defineRecord<Pin[]>({
  key: PINNED_KEY,
  initial: NO_PINS,
  sanitize: sanitizePins,
});

export function usePins() {
  const [pins, setPins] = usePersisted(PINS);
  const toggle = (urn: string, context: ModelContext) =>
    setPins((current) =>
      current.some((pin) => pin.urn === urn)
        ? current.filter((pin) => pin.urn !== urn)
        : [{ urn, ...context }, ...current].slice(0, MAX_PINS),
    );
  return { pins, toggle };
}
