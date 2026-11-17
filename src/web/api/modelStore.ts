import { BSH_KEYS, readJson, writeJson } from '../storage.js';
import { type ModelContext, parseModelContext } from './modelContext.js';

export const MODEL_STORE_KEY = BSH_KEYS.personal.recentModels;
export const MODEL_STORE_LIMIT = 50;
export const PINNED_KEY = BSH_KEYS.personal.pinned;

interface StoredModel extends ModelContext {
  urn: string;
}

function readAll(): StoredModel[] {
  const parsed = readJson<unknown>(MODEL_STORE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry: unknown) => {
    const urn = (entry as { urn?: unknown } | null)?.urn;
    return typeof urn === 'string' && urn
      ? [{ urn, ...parseModelContext(entry) }]
      : [];
  });
}

let storeVersion = 0;
const storeListeners = new Set<() => void>();

function notifyStore(): void {
  storeVersion += 1;
  for (const listener of [...storeListeners]) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === MODEL_STORE_KEY) notifyStore();
}

export function subscribeModelStore(listener: () => void): () => void {
  if (storeListeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
    if (storeListeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function modelStoreVersion(): number {
  return storeVersion;
}

export function hasModelContext(context: ModelContext): boolean {
  return Boolean(
    context.file ||
      context.v ||
      context.trail?.length ||
      context.crumbs?.length,
  );
}

export function rememberModel(urn: string, context: ModelContext): void {
  if (!urn || !hasModelContext(context)) {
    return;
  }
  const { with: _with, ...single } = parseModelContext(context);
  const entry: StoredModel = { urn, ...single };
  const next = [
    entry,
    ...readAll().filter((stored) => stored.urn !== urn),
  ].slice(0, MODEL_STORE_LIMIT);
  if (writeJson(MODEL_STORE_KEY, next)) notifyStore();
}

export function listRecentModels(): StoredModel[] {
  return readAll();
}

export function recallModel(urn: string): ModelContext | null {
  const found = readAll().find((stored) => stored.urn === urn);
  if (!found) {
    return null;
  }
  const { urn: _urn, with: _with, ...context } = found;
  return context;
}
