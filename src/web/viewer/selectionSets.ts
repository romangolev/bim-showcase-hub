import { useMemo } from 'react';
import { isRecord } from '../../shared/guards.js';
import { usePersisted } from '../storage.js';
import {
  MAX_NAME_LENGTH,
  removeSaved,
  SAVED,
  type SavedItem,
  upsertSaved,
} from '../store/savedStore.js';
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

function toSet(item: SavedItem): SelectionSet {
  return {
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
    items: readItems(item.data),
  };
}

function dataOf(items: readonly ModelDbId[]): Record<string, unknown> {
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

export function listSets(): SelectionSet[] {
  return SAVED.read()
    .filter((item) => item.kind === SELECTION_SET_KIND)
    .map(toSet);
}

export function getSet(id: string): SelectionSet | undefined {
  return listSets().find((set) => set.id === id);
}

export function useSelectionSets(): SelectionSet[] {
  const [saved] = usePersisted(SAVED);
  return useMemo(
    () => saved.filter((item) => item.kind === SELECTION_SET_KIND).map(toSet),
    [saved],
  );
}

function newId(): string {
  return `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveSelectionSet(
  name: string,
  items: readonly ModelDbId[],
): SaveSetResult {
  const data = dataOf(items);
  const count = Object.values(data.models as Record<string, number[]>).reduce(
    (sum, ids) => sum + ids.length,
    0,
  );
  if (count === 0) return 'empty';
  if (count > MAX_SET_ELEMENTS) return 'too-big';
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return 'failed';
  const ok = upsertSaved({
    id: newId(),
    kind: SELECTION_SET_KIND,
    name: trimmed,
    version: 1,
    updatedAt: Date.now(),
    data,
  });
  return ok ? 'ok' : 'failed';
}

export function renameSet(id: string, name: string): boolean {
  const item = SAVED.read().find(
    (entry) => entry.id === id && entry.kind === SELECTION_SET_KIND,
  );
  const trimmed = name.trim();
  if (!item || !trimmed) return false;
  return upsertSaved({ ...item, name: trimmed, updatedAt: Date.now() });
}

export function deleteSet(id: string): boolean {
  return removeSaved(id);
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
