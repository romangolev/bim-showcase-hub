import type { PropertyRow } from '../../shared/types.js';
import {
  ALL_MODELS,
  type ModelScope,
  resolveScope,
  scopeRows,
} from './modelScope.js';
import type { ModelDbId } from './modelSet.js';
import { readLeafRows } from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export type ElementScope = 'all' | 'selected' | 'visible' | 'isolated';

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

export interface ReadPropertiesRequest {
  names: readonly string[];
  scope?: Partial<PropertyScope>;
}

export async function readProperties(
  adapter: ViewerAdapter,
  { names, scope }: ReadPropertiesRequest,
): Promise<PropertyRow[]> {
  const all = await readLeafRows(adapter, names);
  const models = adapter.getModels();
  const elements = scope?.elements ?? 'all';
  return filterByElementScope(
    scopeRows(all, resolveScope(scope?.models ?? ALL_MODELS, models)),
    elements,
    await scopeElementItems(adapter, elements),
    models[0]?.id,
  );
}
