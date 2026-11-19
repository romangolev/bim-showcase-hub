import { useMemo } from 'react';
import { isRecord } from '../../shared/guards.js';
import {
  defineSavedKind,
  type SavedKindItem,
  useSavedKindItems,
} from '../store/savedKinds.js';
import type { ModelDbId } from './modelSet.js';

export const SELECTION_SET_KIND = 'selection-set';
export const MAX_SET_ELEMENTS = 10_000;
export const SET_SCOPE_PREFIX = 'set:';
export const DELETED_SET_LABEL = 'Deleted set (using all elements)';

export const MAX_KEY_LENGTH = 512;

export interface SelectionSetKey {
  modelId: string;
  dbId: number;
  key: string;
}

export interface SelectionSet {
  id: string;
  name: string;
  updatedAt: number;
  items: ModelDbId[];
  keys: SelectionSetKey[];
}

export type SaveSetResult = 'ok' | 'empty' | 'too-big' | 'failed';
export type MergeMode = 'union' | 'intersect';

export interface SelectionSetData {
  models: Record<string, number[]>;
  keys?: Record<string, { dbId: number; key: string }[]>;
  [field: string]: unknown;
}

export type StableKeys = ReadonlyMap<string, string>;

export function elementId(item: { modelId: string; dbId: number }): string {
  return `${item.modelId}:${item.dbId}`;
}

export function readData(raw: unknown): SelectionSetData {
  if (!isRecord(raw)) return { models: {} };
  const models: Record<string, number[]> = {};
  const keys: Record<string, { dbId: number; key: string }[]> = {};
  const keyed = new Set<string>();
  let total = 0;
  if (isRecord(raw.keys)) {
    for (const [modelId, entries] of Object.entries(raw.keys)) {
      if (!Array.isArray(entries) || total >= MAX_SET_ELEMENTS) continue;
      const seen = new Set<string>();
      const list: { dbId: number; key: string }[] = [];
      for (const entry of entries) {
        if (total >= MAX_SET_ELEMENTS) break;
        if (!isRecord(entry)) continue;
        const { dbId, key } = entry;
        if (typeof dbId !== 'number' || !Number.isInteger(dbId) || dbId < 0) {
          continue;
        }
        if (typeof key !== 'string') continue;
        const clean = key.trim();
        if (!clean || clean.length > MAX_KEY_LENGTH || seen.has(clean)) {
          continue;
        }
        seen.add(clean);
        keyed.add(elementId({ modelId, dbId }));
        list.push({ dbId, key: clean });
        total += 1;
      }
      if (list.length > 0) keys[modelId] = list;
    }
  }
  if (isRecord(raw.models)) {
    for (const [modelId, ids] of Object.entries(raw.models)) {
      if (!Array.isArray(ids) || total >= MAX_SET_ELEMENTS) continue;
      const seen = new Set<number>();
      const list: number[] = [];
      for (const id of ids) {
        if (total >= MAX_SET_ELEMENTS) break;
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) {
          continue;
        }
        if (seen.has(id) || keyed.has(elementId({ modelId, dbId: id }))) {
          continue;
        }
        seen.add(id);
        list.push(id);
        total += 1;
      }
      if (list.length > 0) models[modelId] = list;
    }
  }
  return Object.keys(keys).length > 0 ? { models, keys } : { models };
}

function dataOf(
  items: readonly ModelDbId[],
  stable?: StableKeys,
): SelectionSetData {
  const models: Record<string, number[]> = {};
  const keys: Record<string, { dbId: number; key: string }[]> = {};
  const seen = new Set<string>();
  for (const { modelId, dbId } of items) {
    const id = elementId({ modelId, dbId });
    if (seen.has(id)) continue;
    seen.add(id);
    const key = stable?.get(id)?.trim();
    if (key && key.length <= MAX_KEY_LENGTH) {
      const list = keys[modelId] ?? [];
      list.push({ dbId, key });
      keys[modelId] = list;
    } else {
      const ids = models[modelId] ?? [];
      ids.push(dbId);
      models[modelId] = ids;
    }
  }
  return Object.keys(keys).length > 0 ? { models, keys } : { models };
}

function countOf(data: SelectionSetData): number {
  let count = 0;
  for (const ids of Object.values(data.models)) count += ids.length;
  for (const entries of Object.values(data.keys ?? {})) count += entries.length;
  return count;
}

export const SELECTION_SETS = defineSavedKind<SelectionSetData>({
  kind: SELECTION_SET_KIND,
  version: 1,
  label: 'Selection set',
  sanitize: (raw) => (isRecord(raw) ? readData(raw) : null),
});

export function toSet(item: SavedKindItem<SelectionSetData>): SelectionSet {
  const data = readData(item.data);
  const items: ModelDbId[] = [];
  const keys: SelectionSetKey[] = [];
  for (const [modelId, ids] of Object.entries(data.models)) {
    for (const dbId of ids) items.push({ modelId, dbId });
  }
  for (const [modelId, entries] of Object.entries(data.keys ?? {})) {
    for (const entry of entries) {
      items.push({ modelId, dbId: entry.dbId });
      keys.push({ modelId, ...entry });
    }
  }
  return {
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
    items,
    keys,
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

export function saveSetData(
  name: string,
  data: SelectionSetData,
): SaveSetResult {
  const count = countOf(data);
  if (count === 0) return 'empty';
  if (count > MAX_SET_ELEMENTS) return 'too-big';
  return SELECTION_SETS.save(name, data) ? 'ok' : 'failed';
}

export function saveSelectionSet(
  name: string,
  items: readonly ModelDbId[],
  stable?: StableKeys,
): SaveSetResult {
  return saveSetData(name, dataOf(items, stable));
}

export function mergeSetData(
  first: SelectionSetData,
  second: SelectionSetData,
  mode: MergeMode,
): SelectionSetData {
  const identitiesOf = (data: SelectionSetData) => {
    const out: { modelId: string; dbId: number; key?: string }[] = [];
    for (const [modelId, ids] of Object.entries(data.models)) {
      for (const dbId of ids) out.push({ modelId, dbId });
    }
    for (const [modelId, entries] of Object.entries(data.keys ?? {})) {
      for (const entry of entries) out.push({ modelId, ...entry });
    }
    return out;
  };
  const identityOf = (entry: {
    modelId: string;
    dbId: number;
    key?: string;
  }) =>
    entry.key === undefined
      ? `d:${entry.modelId}:${entry.dbId}`
      : `k:${entry.modelId}:${entry.key}`;
  const left = identitiesOf(first);
  const right = identitiesOf(second);
  const kept: typeof left = [];
  const seen = new Set<string>();
  if (mode === 'union') {
    for (const entry of [...left, ...right]) {
      if (kept.length >= MAX_SET_ELEMENTS) break;
      const id = identityOf(entry);
      if (seen.has(id)) continue;
      seen.add(id);
      kept.push(entry);
    }
  } else {
    const inLeft = new Map(left.map((entry) => [identityOf(entry), entry]));
    for (const entry of right) {
      if (kept.length >= MAX_SET_ELEMENTS) break;
      const id = identityOf(entry);
      const match = inLeft.get(id);
      if (!match || seen.has(id)) continue;
      seen.add(id);
      kept.push(match);
    }
  }
  const models: Record<string, number[]> = {};
  const keys: Record<string, { dbId: number; key: string }[]> = {};
  for (const entry of kept) {
    if (entry.key === undefined) {
      const ids = models[entry.modelId] ?? [];
      ids.push(entry.dbId);
      models[entry.modelId] = ids;
    } else {
      const entries = keys[entry.modelId] ?? [];
      entries.push({ dbId: entry.dbId, key: entry.key });
      keys[entry.modelId] = entries;
    }
  }
  return Object.keys(keys).length > 0 ? { models, keys } : { models };
}

export function mergeSets(
  name: string,
  firstId: string,
  secondId: string,
  mode: MergeMode,
): SaveSetResult {
  const first = SELECTION_SETS.get(firstId);
  const second = SELECTION_SETS.get(secondId);
  if (!first || !second) return 'failed';
  return saveSetData(
    name,
    mergeSetData(readData(first.data), readData(second.data), mode),
  );
}

export function renameSet(id: string, name: string): boolean {
  return SELECTION_SETS.rename(id, name);
}

export function deleteSet(id: string): boolean {
  return SELECTION_SETS.remove(id);
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
