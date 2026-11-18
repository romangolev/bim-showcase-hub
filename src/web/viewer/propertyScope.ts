import type { PropertyRow } from '../../shared/types.js';
import {
  ALL_MODELS,
  type ModelScope,
  resolveScope,
  scopeRows,
  unavailableModels,
} from './modelScope.js';
import type { ModelDbId } from './modelSet.js';
import type { ReadOptions } from './propertyReads.js';
import { getSet, setIdOf } from './selectionSets.js';
import { readLeafRows } from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export type BaseElementScope = 'all' | 'selected' | 'visible' | 'isolated';
export type ElementScope = BaseElementScope | `set:${string}`;

export const ELEMENT_SCOPES: readonly BaseElementScope[] = [
  'all',
  'selected',
  'visible',
  'isolated',
];

const SET_SCOPE = /^set:[A-Za-z0-9_-]{1,64}$/;

export function sanitizeElementScope(raw: unknown): ElementScope {
  if (typeof raw === 'string' && SET_SCOPE.test(raw)) {
    return raw as ElementScope;
  }
  return ELEMENT_SCOPES.find((scope) => scope === raw) ?? 'all';
}

export function resolveElementScope(scope: ElementScope): ElementScope {
  const id = setIdOf(scope);
  return id !== undefined && !getSet(id) ? 'all' : scope;
}

export function scopeNoteFor(scope: ElementScope): string | undefined {
  return resolveElementScope(scope) === scope
    ? undefined
    : 'The saved selection set no longer exists, so all elements were used';
}

export interface PropertyScope {
  models: ModelScope;
  elements: ElementScope;
}

export async function scopeElementItems(
  adapter: ViewerAdapter,
  elements: ElementScope,
): Promise<ModelDbId[]> {
  if (elements === 'selected') return adapter.getModelSelection();
  if (elements === 'isolated') return adapter.getIsolated();
  if (elements === 'visible') return adapter.getVisible();
  const id = setIdOf(elements);
  return id === undefined ? [] : (getSet(id)?.items ?? []);
}

export function filterByElementScope<
  T extends { modelId?: string | undefined; dbId: number },
>(
  rows: readonly T[],
  elements: ElementScope,
  items: readonly ModelDbId[],
  primaryId?: string,
): T[] {
  if (elements === 'all') return [...rows];
  const keep = new Set(items.map((item) => `${item.modelId}:${item.dbId}`));
  return rows.filter((row) =>
    keep.has(`${row.modelId ?? primaryId}:${row.dbId}`),
  );
}

export function applyScope<T extends PropertyRow>(
  rows: readonly T[],
  scope: Partial<PropertyScope>,
  items: readonly ModelDbId[],
  primaryId?: string,
): T[] {
  return filterByElementScope(
    scopeRows(rows, scope.models ?? ALL_MODELS),
    scope.elements ?? 'all',
    items,
    primaryId,
  );
}

export type FailurePolicy = 'throw' | 'report';

export interface ScopedRowsRequest extends ReadOptions {
  names: readonly string[];
  scope?: Partial<PropertyScope>;
  onFailure?: FailurePolicy;
}

export interface ScopedRows {
  rows: PropertyRow[];
  total: number;
  failed: string[];
  scopeNote?: string;
}

export async function readScopedRows(
  adapter: ViewerAdapter,
  { names, scope, onFailure = 'throw', ...options }: ScopedRowsRequest,
): Promise<ScopedRows> {
  const models = adapter.getModels();
  const model = resolveScope(scope?.models ?? ALL_MODELS, models);
  let failed: string[] = [];
  const read = await readLeafRows(adapter, names, {
    ...options,
    ...(model === ALL_MODELS ? {} : { modelIds: [model] }),
    onFailed: (failedNames) => {
      failed = failedNames;
    },
  });
  if (onFailure === 'throw') {
    const known = new Set(
      unavailableModels(adapter.getModels()).map((m) => m.name),
    );
    const unexpected = failed.filter((name) => !known.has(name));
    if (unexpected.length > 0) {
      throw new Error(`Could not read properties of ${unexpected.join(', ')}`);
    }
  }
  const requested = scope?.elements ?? 'all';
  const elements = resolveElementScope(requested);
  const items = await scopeElementItems(adapter, elements);
  const scopeNote = scopeNoteFor(requested);
  return {
    rows: applyScope(read, { elements }, items, models[0]?.id),
    total: read.length,
    failed,
    ...(scopeNote ? { scopeNote } : {}),
  };
}
