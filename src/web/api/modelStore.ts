import { isStringArray, type ModelContext } from './modelContext.js';

export const MODEL_STORE_KEY = 'bsh.models.recent';
export const MODEL_STORE_LIMIT = 50;

interface StoredModel extends ModelContext {
  urn: string;
}

function isStored(value: unknown): value is StoredModel {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.urn === 'string' &&
    (entry.file === undefined || typeof entry.file === 'string') &&
    (entry.v === undefined || typeof entry.v === 'string') &&
    (entry.trail === undefined || isStringArray(entry.trail)) &&
    (entry.crumbs === undefined || isStringArray(entry.crumbs))
  );
}

function readAll(): StoredModel[] {
  try {
    const raw = window.localStorage.getItem(MODEL_STORE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStored) : [];
  } catch {
    return [];
  }
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
  const entry: StoredModel = { urn };
  if (context.file) entry.file = context.file;
  if (context.v) entry.v = context.v;
  if (context.crumbs?.length) entry.crumbs = [...context.crumbs];
  if (context.trail?.length) entry.trail = [...context.trail];
  const next = [
    entry,
    ...readAll().filter((stored) => stored.urn !== urn),
  ].slice(0, MODEL_STORE_LIMIT);
  try {
    window.localStorage.setItem(MODEL_STORE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

export function recallModel(urn: string): ModelContext | null {
  const found = readAll().find((stored) => stored.urn === urn);
  if (!found) {
    return null;
  }
  const { urn: _urn, ...context } = found;
  return context;
}
