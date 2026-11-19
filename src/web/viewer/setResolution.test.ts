import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSaved, renameSaved, upsertSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { filterByElementScope } from './propertyScope.js';
import {
  listSets,
  SELECTION_SET_KIND,
  type SelectionSetData,
  saveSelectionSet,
} from './selectionSets.js';
import {
  migrateSelectionSet,
  migrateSelectionSets,
  resolveSet,
  scopeElementItems,
  selectSet,
} from './setResolution.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

beforeEach(() => {
  installMemoryStorage();
});

const items = [
  { modelId: 'a', dbId: 1 },
  { modelId: 'a', dbId: 2 },
  { modelId: 'b', dbId: 1 },
  { modelId: 'a', dbId: 1 },
];

function fakeAdapter(
  maps: Record<string, Record<string, number>>,
  selectModelIds = vi.fn(),
): ViewerAdapter {
  return {
    getModels: () =>
      Object.keys(maps).map((id) => ({ id, status: 'ready' as const })),
    getExternalIdMap: async (modelId: string) => maps[modelId] ?? {},
    selectModelIds,
  } as unknown as ViewerAdapter;
}

function storedData(id: string): SelectionSetData {
  return readSaved(SELECTION_SET_KIND).find((item) => item.id === id)
    ?.data as SelectionSetData;
}

describe('selecting a set', () => {
  it('selects only items of open models', async () => {
    saveSelectionSet('Mixed', items);
    const selectModelIds = vi.fn();
    const adapter = {
      getModels: () => [{ id: 'a', status: 'ready' }],
      selectModelIds,
    } as unknown as ViewerAdapter;
    expect(await selectSet(adapter, listSets()[0]?.id ?? '')).toBe(2);
    expect(selectModelIds).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ]);
  });

  it('leaves the selection alone when none of its models are open', async () => {
    saveSelectionSet('Walls', items);
    const selectModelIds = vi.fn();
    const adapter = {
      getModels: () => [{ id: 'z', status: 'ready' }],
      selectModelIds,
    } as unknown as ViewerAdapter;
    expect(await selectSet(adapter, listSets()[0]?.id ?? '')).toBe(0);
    expect(selectModelIds).not.toHaveBeenCalled();
  });
});

describe('stable selection set keys', () => {
  it('migrates a dbId set to external ids on read', async () => {
    upsertSaved({
      id: 'legacy',
      kind: SELECTION_SET_KIND,
      name: 'Walls',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1, 2] } },
    });
    const before = fakeAdapter({ a: { 'ext-1': 1, 'ext-2': 2 } });
    expect(await migrateSelectionSet(before, 'legacy')).toMatchObject({
      keys: [
        { modelId: 'a', dbId: 1, key: 'ext-1' },
        { modelId: 'a', dbId: 2, key: 'ext-2' },
      ],
    });
    expect(storedData('legacy')).toEqual({
      models: {},
      keys: {
        a: [
          { dbId: 1, key: 'ext-1' },
          { dbId: 2, key: 'ext-2' },
        ],
      },
    });
    expect(await migrateSelectionSets(before)).toBe(0);
  });

  it('skips the migration when the set changes while ids load', async () => {
    upsertSaved({
      id: 'race',
      kind: SELECTION_SET_KIND,
      name: 'Walls',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1] } },
    });
    const adapter = {
      getModels: () => [{ id: 'a', status: 'ready' as const }],
      getExternalIdMap: async () => {
        renameSaved(SELECTION_SET_KIND, 'race', 'Renamed');
        return { 'ext-1': 1 };
      },
    } as unknown as ViewerAdapter;
    const result = await migrateSelectionSet(adapter, 'race');
    expect(result?.name).toBe('Renamed');
    expect(storedData('race')).toEqual({ models: { a: [1] } });
  });

  it('keeps dbIds when the model has no mapping', async () => {
    upsertSaved({
      id: 'plain',
      kind: SELECTION_SET_KIND,
      name: 'Sheet',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1, 2] } },
    });
    const selectModelIds = vi.fn();
    const adapter = fakeAdapter({ a: {} }, selectModelIds);
    expect(await selectSet(adapter, 'plain')).toBe(2);
    expect(selectModelIds).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ]);
    expect(storedData('plain')).toEqual({ models: { a: [1, 2] } });
  });

  it('selects the new dbIds after a re-translation', async () => {
    upsertSaved({
      id: 'legacy',
      kind: SELECTION_SET_KIND,
      name: 'Walls',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1, 2] } },
    });
    const before = fakeAdapter({ a: { 'ext-1': 1, 'ext-2': 2 } });
    await migrateSelectionSet(before, 'legacy');
    const selectModelIds = vi.fn();
    const after = fakeAdapter(
      { a: { 'ext-1': 101, 'ext-2': 102 } },
      selectModelIds,
    );
    expect(await selectSet(after, 'legacy')).toBe(2);
    expect(selectModelIds).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 101 },
      { modelId: 'a', dbId: 102 },
    ]);
  });

  it('applies the set scope through the new dbIds', async () => {
    upsertSaved({
      id: 'legacy',
      kind: SELECTION_SET_KIND,
      name: 'Walls',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1, 2] } },
    });
    const before = fakeAdapter({ a: { 'ext-1': 1, 'ext-2': 2 } });
    expect(await scopeElementItems(before, 'set:legacy')).toEqual([
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ]);
    await migrateSelectionSet(before, 'legacy');
    expect(storedData('legacy').keys?.a).toHaveLength(2);
    const after = fakeAdapter({ a: { 'ext-1': 101, 'ext-2': 102 } });
    const elements = await scopeElementItems(after, 'set:legacy');
    expect(elements).toEqual([
      { modelId: 'a', dbId: 101 },
      { modelId: 'a', dbId: 102 },
    ]);
    const rows = [
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 101 },
      { modelId: 'a', dbId: 102 },
    ];
    expect(
      filterByElementScope(rows, 'set:legacy', elements, 'a').map(
        (row) => row.dbId,
      ),
    ).toEqual([101, 102]);
  });
});

describe('set resolution', () => {
  it('skips a keyed element missing from a readable map', async () => {
    upsertSaved({
      id: 'gone',
      kind: SELECTION_SET_KIND,
      name: 'Gone',
      version: 1,
      updatedAt: 1,
      data: {
        models: {},
        keys: {
          a: [
            { dbId: 1, key: 'ext-1' },
            { dbId: 2, key: 'ext-2' },
          ],
        },
      },
    });
    const adapter = fakeAdapter({ a: { 'ext-1': 11, 'ext-9': 2 } });
    expect(await scopeElementItems(adapter, 'set:gone')).toEqual([
      { modelId: 'a', dbId: 11 },
    ]);
  });

  it('keeps the stored dbId when the map cannot be read', async () => {
    upsertSaved({
      id: 'err',
      kind: SELECTION_SET_KIND,
      name: 'Err',
      version: 1,
      updatedAt: 1,
      data: { models: {}, keys: { a: [{ dbId: 2, key: 'ext-2' }] } },
    });
    const adapter = {
      getModels: () => [{ id: 'a', status: 'ready' as const }],
      getExternalIdMap: async () => {
        throw new Error('boom');
      },
    } as unknown as ViewerAdapter;
    expect(await scopeElementItems(adapter, 'set:err')).toEqual([
      { modelId: 'a', dbId: 2 },
    ]);
  });

  it('reads the external id map once per model until the version changes', async () => {
    upsertSaved({
      id: 'c',
      kind: SELECTION_SET_KIND,
      name: 'C',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1] } },
    });
    const read = vi.fn(async () => ({ 'ext-1': 1 }));
    let version = 'v1';
    const adapter = {
      getModels: () => [{ id: 'a', status: 'ready' as const, version }],
      getExternalIdMap: read,
    } as unknown as ViewerAdapter;
    await scopeElementItems(adapter, 'set:c');
    await scopeElementItems(adapter, 'set:c');
    expect(read).toHaveBeenCalledTimes(1);
    version = 'v2';
    await scopeElementItems(adapter, 'set:c');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reports a missing set as not found and an empty set as empty', async () => {
    upsertSaved({
      id: 'empty',
      kind: SELECTION_SET_KIND,
      name: 'Empty',
      version: 1,
      updatedAt: 1,
      data: { models: {} },
    });
    const adapter = fakeAdapter({ a: { 'ext-1': 1 } });
    expect(await resolveSet(adapter, 'nope')).toBeUndefined();
    expect(await resolveSet(adapter, 'empty')).toEqual([]);
    expect(await scopeElementItems(adapter, 'set:nope')).toEqual([]);
    expect(await selectSet(adapter, 'nope')).toBe(0);
  });

  it('resolves keyed, raw and mixed sets', async () => {
    upsertSaved({
      id: 'mixed',
      kind: SELECTION_SET_KIND,
      name: 'Mixed',
      version: 1,
      updatedAt: 1,
      data: {
        models: { a: [5] },
        keys: { a: [{ dbId: 1, key: 'ext-1' }] },
      },
    });
    const adapter = fakeAdapter({ a: { 'ext-1': 101 } });
    expect(await resolveSet(adapter, 'mixed')).toEqual([
      { modelId: 'a', dbId: 101 },
      { modelId: 'a', dbId: 5 },
    ]);
  });

  it('drops elements of a model that is not ready', async () => {
    upsertSaved({
      id: 'two',
      kind: SELECTION_SET_KIND,
      name: 'Two',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1], b: [2] } },
    });
    const adapter = {
      getModels: () => [
        { id: 'a', status: 'ready' as const },
        { id: 'b', status: 'loading' as const },
      ],
      getExternalIdMap: async () => ({}),
    } as unknown as ViewerAdapter;
    expect(await resolveSet(adapter, 'two')).toEqual([
      { modelId: 'a', dbId: 1 },
    ]);
  });

  it('does not write on a read but persists on select', async () => {
    upsertSaved({
      id: 'legacy',
      kind: SELECTION_SET_KIND,
      name: 'Walls',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1, 2] } },
    });
    const adapter = fakeAdapter({ a: { 'ext-1': 1, 'ext-2': 2 } });
    const stored = JSON.stringify(readSaved(SELECTION_SET_KIND));
    expect(await resolveSet(adapter, 'legacy')).toHaveLength(2);
    expect(await scopeElementItems(adapter, 'set:legacy')).toHaveLength(2);
    expect(JSON.stringify(readSaved(SELECTION_SET_KIND))).toBe(stored);
    expect(await selectSet(adapter, 'legacy')).toBe(2);
    expect(storedData('legacy').keys?.a).toHaveLength(2);
  });

  it('shares one map read between concurrent calls', async () => {
    upsertSaved({
      id: 'c',
      kind: SELECTION_SET_KIND,
      name: 'C',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1] } },
    });
    const read = vi.fn(async () => ({ 'ext-1': 1 }));
    const adapter = {
      getModels: () => [{ id: 'a', status: 'ready' as const, version: 'v1' }],
      getExternalIdMap: read,
    } as unknown as ViewerAdapter;
    await Promise.all([resolveSet(adapter, 'c'), resolveSet(adapter, 'c')]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('evicts the cached map when a model stops being ready', async () => {
    upsertSaved({
      id: 'c',
      kind: SELECTION_SET_KIND,
      name: 'C',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1] } },
    });
    const read = vi.fn(async () => ({ 'ext-1': 1 }));
    let listener: (models: { id: string; status: string }[]) => void = () => {};
    const adapter = {
      getModels: () => [{ id: 'a', status: 'ready' as const, version: 'v1' }],
      getExternalIdMap: read,
      onModelsChange: (fn: typeof listener) => {
        listener = fn;
      },
    } as unknown as ViewerAdapter;
    await resolveSet(adapter, 'c');
    listener([{ id: 'a', status: 'loading' }]);
    await resolveSet(adapter, 'c');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
