import type { ModelDbId } from './modelSet.js';
import type { ElementScope } from './propertyScope.js';
import { getSet, setIdOf } from './selectionSets.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

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
