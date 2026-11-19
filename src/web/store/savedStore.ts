import { useMemo } from 'react';
import { isRecord } from '../../shared/guards.js';
import {
  BSH_KEYS,
  defineRecord,
  getStorageAdapter,
  usePersisted,
} from '../storage.js';
import {
  prepareSavedData,
  SAVED_KIND_PATTERN,
  savedKindVersions,
} from './savedKindRegistry.js';

export const SAVED_KEY = BSH_KEYS.personal.saved;
export const SAVED_FORMAT = 'bsh-saved';
export const SAVED_VERSION = 2;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_ITEMS = 500;
export const MAX_ITEM_BYTES = 100_000;
export const MAX_TOTAL_BYTES = 4_000_000;
export const MAX_NAME_LENGTH = 80;

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
  older: number;
  dropped: number;
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
  if (typeof kind !== 'string' || !SAVED_KIND_PATTERN.test(kind)) return null;
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
  return item;
}

function fits(item: SavedItem): boolean {
  return JSON.stringify(item).length <= MAX_ITEM_BYTES;
}

function normalizeItem(item: SavedItem): SavedItem | null {
  const prepared = prepareSavedData(item.kind, item.data, item.version);
  if (!prepared) return null;
  return { ...item, version: prepared.version, data: prepared.data };
}

function totalBytes(items: readonly SavedItem[]): number {
  return JSON.stringify({ version: SAVED_VERSION, items }).length;
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
  }
  return items;
}

export const SAVED = defineRecord<SavedItem[]>({
  key: SAVED_KEY,
  initial: [],
  cache: true,
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

function storedFromNewerBuild(): boolean {
  const text = getStorageAdapter().get('local', SAVED_KEY);
  if (text === null) return false;
  try {
    const { version } = JSON.parse(text) as { version?: unknown };
    return typeof version === 'number' && version > SAVED_VERSION;
  } catch {
    return false;
  }
}

function persist(items: SavedItem[]): boolean {
  if (storedFromNewerBuild()) return false;
  if (totalBytes(items) > MAX_TOTAL_BYTES) return false;
  return SAVED.write(items);
}

export function savedBytes(): number {
  return totalBytes(readSaved());
}

export function useSavedItems(kind: string): SavedItem[] {
  const [saved] = usePersisted(SAVED);
  return useMemo(
    () => saved.filter((item) => item.kind === kind),
    [saved, kind],
  );
}

export function newSavedId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getSaved(id: string): SavedItem | undefined {
  return readSaved().find((item) => item.id === id);
}

export function upsertSaved(item: SavedItem): boolean {
  const structural = sanitizeItem(item);
  if (!structural) return false;
  const next = normalizeItem(structural);
  if (!next || !fits(next)) return false;
  const items = readSaved();
  const index = items.findIndex((existing) => existing.id === next.id);
  if (index >= 0) {
    if (items[index]?.kind !== next.kind) return false;
    items[index] = next;
  } else if (items.length >= MAX_ITEMS) return false;
  else items.push(next);
  return persist(items);
}

export function renameSaved(kind: string, id: string, name: string): boolean {
  const item = readSaved(kind).find((entry) => entry.id === id);
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!item || !trimmed) return false;
  if (trimmed === item.name) return true;
  return upsertSaved({ ...item, name: trimmed, updatedAt: Date.now() });
}

export function removeSaved(id: string): boolean {
  const items = readSaved();
  const kept = items.filter((item) => item.id !== id);
  return kept.length === items.length || persist(kept);
}

export function moveSaved(id: string, delta: -1 | 1): boolean {
  const items = readSaved();
  const index = items.findIndex((item) => item.id === id);
  const kind = items[index]?.kind;
  if (index < 0 || kind === undefined) return false;
  let target = index + delta;
  while (items[target] && items[target]?.kind !== kind) target += delta;
  const swap = items[target];
  const item = items[index];
  if (!swap || !item) return false;
  items[target] = item;
  items[index] = swap;
  return persist(items);
}

export function clearSaved(): boolean {
  return persist([]);
}

export function exportSaved(kind?: string): string {
  return JSON.stringify(
    {
      format: SAVED_FORMAT,
      version: SAVED_VERSION,
      kinds: savedKindVersions(),
      items: readSaved(kind),
    },
    null,
    2,
  );
}

function prepareIncoming(raw: unknown): SavedItem | null {
  const structural = sanitizeItem(raw);
  if (!structural) return null;
  const normalized = normalizeItem(structural);
  if (!normalized || !fits(normalized)) return null;
  return normalized;
}

export function importSaved(text: string): ImportResult {
  const current = readSaved();
  const fail = (error: string): ImportResult => ({
    items: current,
    accepted: 0,
    rejected: 0,
    older: 0,
    dropped: 0,
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
    !Array.isArray(parsed.items) ||
    typeof parsed.version !== 'number' ||
    !Number.isInteger(parsed.version) ||
    parsed.version < 1
  ) {
    return fail('Not a saved-items file.');
  }
  if (parsed.version > SAVED_VERSION) {
    return fail('This file was saved by a newer version of the app.');
  }
  let incoming: SavedItem[];
  try {
    const seen = new Set<string>();
    incoming = [];
    for (const entry of parsed.items) {
      const prepared = prepareIncoming(entry);
      if (!prepared || seen.has(prepared.id)) continue;
      seen.add(prepared.id);
      incoming.push(prepared);
    }
  } catch {
    return fail('Not a saved-items file.');
  }
  const byId = new Map(current.map((item) => [item.id, item]));
  let accepted = 0;
  let clashes = 0;
  let older = 0;
  let dropped = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (existing && existing.kind !== item.kind) clashes += 1;
    else if (existing && existing.updatedAt > item.updatedAt) older += 1;
    else if (!existing && byId.size >= MAX_ITEMS) dropped += 1;
    else {
      byId.set(item.id, item);
      accepted += 1;
    }
  }
  const merged = [...byId.values()];
  if (storedFromNewerBuild()) {
    return fail('Saved items were written by a newer version of the app.');
  }
  if (totalBytes(merged) > MAX_TOTAL_BYTES) {
    return fail('Saved items would exceed the 4 MB browser budget.');
  }
  if (!persist(merged)) return fail('Could not save to this browser.');
  return {
    items: merged,
    accepted,
    rejected: parsed.items.length - incoming.length + clashes,
    older,
    dropped,
  };
}

export interface SavedStore {
  list(kind?: string): SavedItem[];
  get(id: string): SavedItem | undefined;
  put(item: SavedItem): boolean;
  rename(kind: string, id: string, name: string): boolean;
  remove(id: string): boolean;
  move(id: string, delta: -1 | 1): boolean;
  clear(): boolean;
  bytes(): number;
  export(kind?: string): string;
  import(text: string): ImportResult;
}

export const savedStore: SavedStore = {
  list: readSaved,
  get: getSaved,
  put: upsertSaved,
  rename: renameSaved,
  remove: removeSaved,
  move: moveSaved,
  clear: clearSaved,
  bytes: savedBytes,
  export: exportSaved,
  import: importSaved,
};
