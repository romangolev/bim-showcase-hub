import { type ModelContext, parseModelContext } from './modelContext.js';

export const MODEL_STORE_KEY = 'bsh.models.recent';
export const MODEL_STORE_LIMIT = 50;

interface StoredModel extends ModelContext {
  urn: string;
}

function readAll(): StoredModel[] {
  try {
    const raw = window.localStorage.getItem(MODEL_STORE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      const urn = (entry as { urn?: unknown } | null)?.urn;
      return typeof urn === 'string' && urn
        ? [{ urn, ...parseModelContext(entry) }]
        : [];
    });
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
  const { with: _with, ...single } = parseModelContext(context);
  const entry: StoredModel = { urn, ...single };
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
  const { urn: _urn, with: _with, ...context } = found;
  return context;
}
