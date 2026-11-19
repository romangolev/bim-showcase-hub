import type { SavedKindItem } from '../store/savedKinds.js';
import type { ModelDbId } from './modelSet.js';
import type { ElementScope } from './propertyScope.js';
import {
  elementId,
  MAX_KEY_LENGTH,
  readData,
  SELECTION_SETS,
  type SelectionSet,
  type SelectionSetData,
  setIdOf,
  toSet,
} from './selectionSets.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

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

interface Migrated {
  item: SavedKindItem<SelectionSetData>;
  set: SelectionSet;
  next: SelectionSetData | undefined;
}

async function migrated(
  adapter: ViewerAdapter,
  id: string,
): Promise<Migrated | undefined> {
  const item = SELECTION_SETS.get(id);
  if (!item) return undefined;
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
  if (!changed) return { item, set: toSet(item), next: undefined };
  const next: SelectionSetData =
    Object.keys(keys).length > 0 ? { models, keys } : { models };
  return { item, set: toSet({ ...item, data: next }), next };
}

async function resolveItems(
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

export async function resolveSet(
  adapter: ViewerAdapter,
  id: string,
): Promise<ModelDbId[] | undefined> {
  const result = await migrated(adapter, id);
  return result ? resolveItems(adapter, result.set) : undefined;
}

export async function scopeElementItems(
  adapter: ViewerAdapter,
  elements: ElementScope,
): Promise<ModelDbId[]> {
  if (elements === 'selected') return adapter.getModelSelection();
  if (elements === 'isolated') return adapter.getIsolated();
  if (elements === 'visible') return adapter.getVisible();
  const id = setIdOf(elements);
  return id === undefined ? [] : ((await resolveSet(adapter, id)) ?? []);
}

export async function migrateSelectionSet(
  adapter: ViewerAdapter,
  id: string,
): Promise<SelectionSet | undefined> {
  const result = await migrated(adapter, id);
  if (!result) return undefined;
  const { item, set, next } = result;
  if (!next) return set;
  const current = SELECTION_SETS.get(id);
  if (!current) return undefined;
  if (current.updatedAt !== item.updatedAt) return toSet(current);
  SELECTION_SETS.save(item.name, next, id);
  const stored = SELECTION_SETS.get(id);
  return stored ? toSet(stored) : set;
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

export async function selectSet(
  adapter: ViewerAdapter,
  id: string,
): Promise<number> {
  const set = await migrateSelectionSet(adapter, id);
  if (!set) return 0;
  const items = await resolveItems(adapter, set);
  if (items.length === 0) return 0;
  adapter.selectModelIds(items);
  return items.length;
}
