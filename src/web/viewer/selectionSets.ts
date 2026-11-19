import { useMemo } from 'react';
import { isRecord } from '../../shared/guards.js';
import {
  defineSavedKind,
  type SavedKindItem,
  useSavedKindItems,
} from '../store/savedKinds.js';
import type { ModelDbId } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const SELECTION_SET_KIND = 'selection-set';
export const MAX_SET_ELEMENTS = 10_000;
export const SET_SCOPE_PREFIX = 'set:';
export const DELETED_SET_LABEL = 'Deleted set (using all elements)';

export interface SelectionSet {
  id: string;
  name: string;
  updatedAt: number;
  items: ModelDbId[];
}

export type SaveSetResult = 'ok' | 'empty' | 'too-big' | 'failed';

export type SelectionSetData = { models: Record<string, number[]> };

function readItems(raw: unknown): ModelDbId[] {
  if (!isRecord(raw) || !isRecord(raw.models)) return [];
  const items: ModelDbId[] = [];
  for (const [modelId, ids] of Object.entries(raw.models)) {
    if (!Array.isArray(ids)) continue;
    const seen = new Set<number>();
    for (const id of ids) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ modelId, dbId: id });
      if (items.length >= MAX_SET_ELEMENTS) return items;
    }
  }
  return items;
}

function dataOf(items: readonly ModelDbId[]): SelectionSetData {
  const models: Record<string, number[]> = {};
  const seen = new Set<string>();
  for (const { modelId, dbId } of items) {
    const key = `${modelId}:${dbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ids = models[modelId] ?? [];
    ids.push(dbId);
    models[modelId] = ids;
  }
  return { models };
}

export const SELECTION_SETS = defineSavedKind<SelectionSetData>({
  kind: SELECTION_SET_KIND,
  version: 1,
  label: 'Selection set',
  sanitize: (raw) => (isRecord(raw) ? dataOf(readItems(raw)) : null),
});

function toSet(item: SavedKindItem<SelectionSetData>): SelectionSet {
  return {
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
    items: readItems(item.data),
  };
}

export function listSets(): SelectionSet[] {
  return SELECTION_SETS.list().map(toSet);
}

export function getSet(id: string): SelectionSet | undefined {
  return listSets().find((set) => set.id === id);
}

export function useSelectionSets(): SelectionSet[] {
  const items = useSavedKindItems(SELECTION_SETS);
  return useMemo(() => items.map(toSet), [items]);
}

export function saveSelectionSet(
  name: string,
  items: readonly ModelDbId[],
): SaveSetResult {
  const data = dataOf(items);
  const count = Object.values(data.models).reduce(
    (sum, ids) => sum + ids.length,
    0,
  );
  if (count === 0) return 'empty';
  if (count > MAX_SET_ELEMENTS) return 'too-big';
  return SELECTION_SETS.save(name, data) ? 'ok' : 'failed';
}

export function renameSet(id: string, name: string): boolean {
  return SELECTION_SETS.rename(id, name);
}

export function deleteSet(id: string): boolean {
  return SELECTION_SETS.remove(id);
}

export function selectSet(adapter: ViewerAdapter, id: string): number {
  const set = getSet(id);
  if (!set) return 0;
  const open = new Set(
    adapter
      .getModels()
      .filter((model) => model.status === 'ready')
      .map((model) => model.id),
  );
  const items = set.items.filter((item) => open.has(item.modelId));
  if (items.length === 0) return 0;
  adapter.selectModelIds(items);
  return items.length;
}

export function setIdOf(scope: string): string | undefined {
  return scope.startsWith(SET_SCOPE_PREFIX)
    ? scope.slice(SET_SCOPE_PREFIX.length)
    : undefined;
}

export function setScopeOf(id: string): `set:${string}` {
  return `${SET_SCOPE_PREFIX}${id}`;
}

export function withSetLabels(
  base: Record<string, string>,
  value: string,
  sets: readonly SelectionSet[],
  prefix = 'Set: ',
): Record<string, string> {
  const labels: Record<string, string> = { ...base };
  for (const set of sets) labels[setScopeOf(set.id)] = `${prefix}${set.name}`;
  if (setIdOf(value) !== undefined && !(value in labels)) {
    labels[value] = DELETED_SET_LABEL;
  }
  return labels;
}
