import type { PropertyRow } from '../../shared/types.js';
import { ALL_MODELS, type ModelScope, scopeRows } from './modelScope.js';
import type { ModelDbId } from './modelSet.js';
import { getSet, setIdOf } from './selectionSets.js';
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
