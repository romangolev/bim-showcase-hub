import type { PropertyRow } from '../../shared/types.js';
import {
  ALL_MODELS,
  type ModelScope,
  resolveScope,
  unavailableModels,
} from './modelScope.js';
import type { ModelDbId } from './modelSet.js';
import type { ReadOptions } from './propertyReads.js';
import { readLeafRows } from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export type ElementScope = 'all' | 'selected' | 'visible' | 'isolated';

export const ELEMENT_SCOPES: readonly ElementScope[] = [
  'all',
  'selected',
  'visible',
  'isolated',
];

export function sanitizeElementScope(raw: unknown): ElementScope {
  return ELEMENT_SCOPES.find((scope) => scope === raw) ?? 'all';
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
  return [];
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

export interface ReadPropertiesRequest extends ReadOptions {
  names: readonly string[];
  scope?: Partial<PropertyScope>;
}

export async function readProperties(
  adapter: ViewerAdapter,
  { names, scope, ...options }: ReadPropertiesRequest,
): Promise<PropertyRow[]> {
  const models = adapter.getModels();
  const model = resolveScope(scope?.models ?? ALL_MODELS, models);
  const failed: string[] = [];
  const rows = await readLeafRows(adapter, names, {
    ...options,
    ...(model === ALL_MODELS ? {} : { modelIds: [model] }),
    onFailed: (names) => failed.push(...names),
  });
  const known = new Set(
    unavailableModels(adapter.getModels()).map((model) => model.name),
  );
  const unexpected = failed.filter((name) => !known.has(name));
  if (unexpected.length > 0) {
    throw new Error(`Could not read properties of ${unexpected.join(', ')}`);
  }
  const elements = scope?.elements ?? 'all';
  return filterByElementScope(
    rows,
    elements,
    await scopeElementItems(adapter, elements),
    models[0]?.id,
  );
}
