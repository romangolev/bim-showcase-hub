import type { PropertyRow } from '../../shared/types.js';
import { ALL_MODELS, type ModelScope, scopeRows } from './modelScope.js';
import type { ModelDbId } from './modelSet.js';
import { getSet, setIdOf } from './selectionSets.js';

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
  rows: T[],
  scope: Partial<PropertyScope>,
  items: readonly ModelDbId[],
  primaryId?: string,
): T[] {
  const models = scope.models ?? ALL_MODELS;
  const elements = scope.elements ?? 'all';
  if (models === ALL_MODELS && elements === 'all') return rows;
  return filterByElementScope(
    scopeRows(rows, models),
    elements,
    items,
    primaryId,
  );
}
