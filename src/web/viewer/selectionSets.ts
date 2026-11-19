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

const MAX_KEY_LENGTH = 512;

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

function elementId(item: { modelId: string; dbId: number }): string {
  return `${item.modelId}:${item.dbId}`;
}

function readData(raw: unknown): SelectionSetData {
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

function toSet(item: SavedKindItem<SelectionSetData>): SelectionSet {
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

export async function stableKeysFor(
  adapter: ViewerAdapter,
  items: readonly ModelDbId[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const read = adapter.getExternalIdMap;
  if (typeof read !== 'function') return out;
  const byModel = new Map<string, number[]>();
  for (const { modelId, dbId } of items) {
    const ids = byModel.get(modelId) ?? [];
    ids.push(dbId);
    byModel.set(modelId, ids);
  }
  for (const [modelId, ids] of byModel) {
    const map = (await externalMapFor(adapter, modelId)) ?? {};
    const byDbId = new Map<number, string>();
    for (const [key, dbId] of Object.entries(map)) {
      if (!byDbId.has(dbId)) byDbId.set(dbId, key);
    }
    for (const dbId of ids) {
      const key = byDbId.get(dbId);
      if (key) out.set(elementId({ modelId, dbId }), key);
    }
  }
  return out;
}

interface CachedMap {
  version: string | undefined;
  promise: Promise<Record<string, number> | null>;
}

const externalMaps = new WeakMap<ViewerAdapter, Map<string, CachedMap>>();

function cacheFor(adapter: ViewerAdapter): Map<string, CachedMap> {
  let cache = externalMaps.get(adapter);
  if (!cache) {
    const created = new Map<string, CachedMap>();
    cache = created;
    externalMaps.set(adapter, created);
    if (typeof adapter.onModelsChange === 'function') {
      adapter.onModelsChange((models) => {
        for (const id of [...created.keys()]) {
          const model = models.find((entry) => entry.id === id);
          if (model?.status !== 'ready') created.delete(id);
        }
      });
    }
  }
  return cache;
}

async function externalMapFor(
  adapter: ViewerAdapter,
  modelId: string,
): Promise<Record<string, number> | null> {
  const read = adapter.getExternalIdMap;
  if (typeof read !== 'function') return null;
  const cache = cacheFor(adapter);
  const model = adapter.getModels().find((entry) => entry.id === modelId);
  const cached = cache.get(modelId);
  if (cached && cached.version === model?.version) return cached.promise;
  const entry: CachedMap = {
    version: model?.version,
    promise: read.call(adapter, modelId).then(
      (map) => {
        if (Object.keys(map).length === 0) cache.delete(modelId);
        return map;
      },
      () => {
        if (cache.get(modelId) === entry) cache.delete(modelId);
        return null;
      },
    ),
  };
  cache.set(modelId, entry);
  return entry.promise;
}

function openModelIds(adapter: ViewerAdapter): Set<string> {
  return new Set(
    adapter
      .getModels()
      .filter((model) => model.status === 'ready')
      .map((model) => model.id),
  );
}

export async function migrateSelectionSet(
  adapter: ViewerAdapter,
  id: string,
): Promise<SelectionSet | undefined> {
  const item = SELECTION_SETS.get(id);
  if (!item) return undefined;
  const set = toSet(item);
  const data = readData(item.data);
  const open = openModelIds(adapter);
  const models: Record<string, number[]> = {};
  const keys: Record<string, { dbId: number; key: string }[]> = {
    ...(data.keys ?? {}),
  };
  let changed = false;
  for (const [modelId, ids] of Object.entries(data.models)) {
    if (!open.has(modelId) || ids.length === 0) {
      models[modelId] = [...ids];
      continue;
    }
    const map = (await externalMapFor(adapter, modelId)) ?? {};
    const byDbId = new Map<number, string>();
    for (const [key, dbId] of Object.entries(map)) {
      if (!byDbId.has(dbId)) byDbId.set(dbId, key);
    }
    const kept: number[] = [];
    const entries = keys[modelId] ?? [];
    const present = new Set(entries.map((entry) => entry.key));
    for (const dbId of ids) {
      const key = byDbId.get(dbId);
      if (!key || key.length > MAX_KEY_LENGTH) {
        kept.push(dbId);
        continue;
      }
      if (!present.has(key)) {
        present.add(key);
        entries.push({ dbId, key });
        keys[modelId] = entries;
        changed = true;
      }
    }
    if (kept.length > 0) models[modelId] = kept;
  }
  if (!changed) return set;
  const current = SELECTION_SETS.get(id);
  if (!current) return undefined;
  if (current.updatedAt !== item.updatedAt) return toSet(current);
  const next: SelectionSetData =
    Object.keys(keys).length > 0 ? { models, keys } : { models };
  const migrated = toSet({ ...item, data: next });
  SELECTION_SETS.save(item.name, next, id);
  const stored = SELECTION_SETS.get(id);
  return stored ? toSet(stored) : migrated;
}

export async function migrateSelectionSets(
  adapter: ViewerAdapter,
): Promise<number> {
  let changed = 0;
  for (const item of SELECTION_SETS.list()) {
    const before = JSON.stringify(item.data);
    await migrateSelectionSet(adapter, item.id);
    const after = SELECTION_SETS.get(item.id)?.data;
    if (after && JSON.stringify(after) !== before) changed += 1;
  }
  return changed;
}

export async function resolveSetItems(
  adapter: ViewerAdapter,
  set: SelectionSet,
): Promise<ModelDbId[]> {
  const open = openModelIds(adapter);
  const keyed = new Set(set.keys.map((entry) => elementId(entry)));
  const items: ModelDbId[] = [];
  const seen = new Set<string>();
  const push = (modelId: string, dbId: number) => {
    if (!open.has(modelId)) return;
    const id = elementId({ modelId, dbId });
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ modelId, dbId });
  };
  const order: string[] = [];
  for (const item of set.items) {
    if (!order.includes(item.modelId)) order.push(item.modelId);
  }
  for (const modelId of order) {
    const entries = set.keys.filter((entry) => entry.modelId === modelId);
    if (entries.length > 0) {
      const map = await externalMapFor(adapter, modelId);
      const readable = map !== null && Object.keys(map).length > 0;
      for (const entry of entries) {
        const dbId = map?.[entry.key];
        if (typeof dbId === 'number' && Number.isInteger(dbId)) {
          push(modelId, dbId);
        } else if (!readable) {
          push(modelId, entry.dbId);
        }
      }
    }
    for (const item of set.items) {
      if (item.modelId !== modelId) continue;
      if (keyed.has(elementId(item))) continue;
      push(modelId, item.dbId);
    }
  }
  return items;
}

export async function selectSet(
  adapter: ViewerAdapter,
  id: string,
): Promise<number> {
  const set = (await migrateSelectionSet(adapter, id)) ?? getSet(id);
  if (!set) return 0;
  const items = await resolveSetItems(adapter, set);
  if (items.length === 0) return 0;
  adapter.selectModelIds(items);
  return items.length;
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
