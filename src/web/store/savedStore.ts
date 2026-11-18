import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord } from '../storage.js';

export const SAVED_KEY = BSH_KEYS.personal.saved;
export const SAVED_FORMAT = 'bsh-saved';
export const SAVED_VERSION = 1;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_ITEMS = 500;
export const MAX_ITEM_BYTES = 100_000;
export const MAX_NAME_LENGTH = 80;

const KIND = /^[a-z][a-z0-9-]{0,31}$/;
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface SavedItem {
  id: string;
  kind: string;
  name: string;
  version: number;
  updatedAt: number;
  data: Record<string, unknown>;
}

export interface ImportResult {
  items: SavedItem[];
  accepted: number;
  rejected: number;
  error?: string;
}

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!BLOCKED_KEYS.has(key)) out[key] = clean(entry);
  }
  return out;
}

export function sanitizeItem(raw: unknown): SavedItem | null {
  if (!isRecord(raw)) return null;
  const { id, kind, name, version, updatedAt, data } = raw;
  if (typeof id !== 'string' || !id || id.length > 64) return null;
  if (typeof kind !== 'string' || !KIND.test(kind)) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (!isRecord(data)) return null;
  const item: SavedItem = {
    id,
    kind,
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    version:
      typeof version === 'number' && Number.isInteger(version) && version > 0
        ? version
        : 1,
    updatedAt:
      typeof updatedAt === 'number' && Number.isFinite(updatedAt)
        ? updatedAt
        : 0,
    data: clean(data) as Record<string, unknown>,
  };
  return JSON.stringify(item).length > MAX_ITEM_BYTES ? null : item;
}

function sanitizeItems(raw: unknown): SavedItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: SavedItem[] = [];
  for (const entry of raw) {
    const item = sanitizeItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

const SAVED = defineRecord<SavedItem[]>({
  key: SAVED_KEY,
  initial: [],
  sanitize: (raw) => sanitizeItems(isRecord(raw) ? raw.items : undefined),
  codec: {
    encode: (items) => JSON.stringify({ version: SAVED_VERSION, items }),
    decode: (text) => JSON.parse(text),
  },
});

export function readSaved(kind?: string): SavedItem[] {
  const items = [...SAVED.read()];
  return kind === undefined ? items : items.filter((i) => i.kind === kind);
}

function persist(items: SavedItem[]): boolean {
  return SAVED.write(items);
}

export function upsertSaved(item: SavedItem): boolean {
  const next = sanitizeItem(item);
  if (!next) return false;
  const items = readSaved();
  const index = items.findIndex((existing) => existing.id === next.id);
  if (index >= 0) items[index] = next;
  else if (items.length >= MAX_ITEMS) return false;
  else items.push(next);
  return persist(items);
}

export function removeSaved(id: string): boolean {
  return persist(readSaved().filter((item) => item.id !== id));
}

export function exportSaved(kind?: string): string {
  return JSON.stringify(
    { format: SAVED_FORMAT, version: SAVED_VERSION, items: readSaved(kind) },
    null,
    2,
  );
}

export function importSaved(text: string): ImportResult {
  const current = readSaved();
  const fail = (error: string): ImportResult => ({
    items: current,
    accepted: 0,
    rejected: 0,
    error,
  });
  if (text.length > MAX_IMPORT_BYTES) return fail('File is too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('Not valid JSON.');
  }
  if (
    !isRecord(parsed) ||
    parsed.format !== SAVED_FORMAT ||
    !Array.isArray(parsed.items)
  ) {
    return fail('Not a saved-items file.');
  }
  if (typeof parsed.version !== 'number' || parsed.version > SAVED_VERSION) {
    return fail('This file was saved by a newer version of the app.');
  }
  const incoming = sanitizeItems(parsed.items);
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  const merged = [...byId.values()].slice(0, MAX_ITEMS);
  if (!persist(merged)) return fail('Could not save to this browser.');
  return {
    items: merged,
    accepted: incoming.length,
    rejected: parsed.items.length - incoming.length,
  };
}
