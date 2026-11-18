import type { PropertyRow } from '../../shared/types.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { formatValue } from './modelSummary.js';

export type ElementAction = 'select' | 'isolate' | 'hide' | 'zoom';

export const ELEMENT_ACTIONS: readonly ElementAction[] = [
  'select',
  'isolate',
  'hide',
  'zoom',
];

export const ACTION_LABELS: Record<ElementAction, string> = {
  select: 'Select',
  isolate: 'Isolate',
  hide: 'Hide',
  zoom: 'Select and zoom',
};

export function sanitizeAction(raw: unknown): ElementAction {
  return ELEMENT_ACTIONS.find((action) => action === raw) ?? 'select';
}

export function itemsWithValues(
  rows: readonly PropertyRow[],
  property: string,
  labels: ReadonlySet<string>,
): ModelDbId[] {
  const items: ModelDbId[] = [];
  for (const row of rows) {
    if (row.modelId === undefined) continue;
    if (labels.has(formatValue(row.properties[property]))) {
      items.push({ modelId: row.modelId, dbId: row.dbId });
    }
  }
  return items;
}

export function runElementAction(
  adapter: ViewerAdapter,
  action: ElementAction,
  items: readonly ModelDbId[],
): void {
  if (items.length === 0) return;
  if (action === 'isolate') {
    adapter.isolateModelIds(items);
    return;
  }
  if (action === 'hide') {
    adapter.hideModelIds(items);
    return;
  }
  adapter.selectModelIds(items);
  if (action === 'zoom') adapter.fitToView(items);
}

export function showAllElements(adapter: ViewerAdapter): void {
  adapter.showAll();
}
