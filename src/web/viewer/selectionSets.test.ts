import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPersonal } from '../storage.js';
import { readSaved, upsertSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { filterByElementScope } from './propertyScope.js';
import { scopeElementItems } from './scopeItems.js';
import {
  deleteSet,
  getSet,
  listSets,
  MAX_SET_ELEMENTS,
  mergeSetData,
  mergeSets,
  migrateSelectionSet,
  migrateSelectionSets,
  renameSet,
  SELECTION_SET_KIND,
  type SelectionSetData,
  saveSelectionSet,
  selectSet,
  setIdOf,
  withSetLabels,
} from './selectionSets.js';
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

const stable = new Map([
  ['a:1', 'ext-1'],
  ['a:2', 'ext-2'],
]);

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

describe('selection sets', () => {
  it('captures model-aware items, deduplicated, and lists them', () => {
    expect(saveSelectionSet('  Walls  ', items)).toBe('ok');
    const [set] = listSets();
    expect(set?.name).toBe('Walls');
    expect(set?.items).toEqual([
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 2 },
      { modelId: 'b', dbId: 1 },
    ]);
    expect(readSaved(SELECTION_SET_KIND)).toHaveLength(1);
  });

  it('stores stable keys and keeps dbIds only as a fallback', () => {
    expect(saveSelectionSet('Walls', items, stable)).toBe('ok');
    const [set] = listSets();
    expect(set?.keys).toEqual([
      { modelId: 'a', dbId: 1, key: 'ext-1' },
      { modelId: 'a', dbId: 2, key: 'ext-2' },
    ]);
    expect(storedData(set?.id ?? '')).toEqual({
      models: { b: [1] },
      keys: {
        a: [
          { dbId: 1, key: 'ext-1' },
          { dbId: 2, key: 'ext-2' },
        ],
      },
    });
  });

  it('refuses empty and oversized selections', () => {
    expect(saveSelectionSet('x', [])).toBe('empty');
    const big = Array.from({ length: MAX_SET_ELEMENTS + 1 }, (_, dbId) => ({
      modelId: 'a',
      dbId,
    }));
    expect(saveSelectionSet('x', big)).toBe('too-big');
    expect(listSets()).toHaveLength(0);
  });

  it('renames and deletes', () => {
    saveSelectionSet('One', items);
    const id = listSets()[0]?.id ?? '';
    expect(renameSet(id, 'Two')).toBe(true);
    expect(getSet(id)?.name).toBe('Two');
    expect(renameSet(id, '  ')).toBe(false);
    expect(deleteSet(id)).toBe(true);
    expect(getSet(id)).toBeUndefined();
  });

  it('drops malformed stored data on read', () => {
    upsertSaved({
      id: 'bad',
      kind: SELECTION_SET_KIND,
      name: 'Bad',
      version: 1,
      updatedAt: 1,
      data: { models: { a: [1, 1.5, -1, 'x', 2], b: 'nope' } },
    });
    expect(getSet('bad')?.items).toEqual([
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ]);
  });

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

  it('is removed by forgetPersonal', () => {
    saveSelectionSet('Gone', items);
    forgetPersonal();
    expect(listSets()).toHaveLength(0);
  });

  it('labels sets and a deleted set', () => {
    saveSelectionSet('Walls', items);
    const sets = listSets();
    const labels = withSetLabels({ all: 'All' }, 'set:gone', sets);
    expect(labels['set:gone']).toBe('Deleted set (using all elements)');
    expect(Object.values(labels)).toContain('Set: Walls');
    expect(setIdOf('set:x')).toBe('x');
    expect(setIdOf('all')).toBeUndefined();
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
    await migrateSelectionSet(before, 'legacy');
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

describe('merging selection sets', () => {
  const firstItems = [
    { modelId: 'a', dbId: 1 },
    { modelId: 'a', dbId: 2 },
    { modelId: 'b', dbId: 1 },
  ];
  const secondItems = [
    { modelId: 'a', dbId: 1 },
    { modelId: 'a', dbId: 3 },
    { modelId: 'b', dbId: 1 },
    { modelId: 'b', dbId: 1 },
  ];
  const secondStable = new Map([
    ['a:1', 'ext-1'],
    ['a:3', 'ext-3'],
  ]);

  function saves() {
    saveSelectionSet('First', firstItems, stable);
    saveSelectionSet('Second', secondItems, secondStable);
    const [first, second] = listSets();
    if (!first || !second) throw new Error('missing sets');
    return { first, second };
  }

  it('unions keys and fallback dbIds without duplicates', () => {
    const { first, second } = saves();
    expect(mergeSets('Both', first.id, second.id, 'union')).toBe('ok');
    const merged = listSets().find((set) => set.name === 'Both');
    expect(
      merged?.keys.map((entry) => `${entry.modelId}:${entry.key}`),
    ).toEqual(['a:ext-1', 'a:ext-2', 'a:ext-3']);
    expect(
      merged?.items
        .filter((item) => item.modelId === 'b')
        .map((item) => item.dbId),
    ).toEqual([1]);
    expect(merged?.items).toHaveLength(4);
  });

  it('intersects only identities present in both sets', () => {
    const { first, second } = saves();
    expect(mergeSets('Shared', first.id, second.id, 'intersect')).toBe('ok');
    const merged = listSets().find((set) => set.name === 'Shared');
    expect(merged?.items).toEqual([
      { modelId: 'b', dbId: 1 },
      { modelId: 'a', dbId: 1 },
    ]);
    expect(merged?.keys.map((entry) => entry.key)).toEqual(['ext-1']);
  });

  it('reports an empty intersection and a missing set', () => {
    const { first } = saves();
    const other = saveSelectionSet('Only b', [{ modelId: 'b', dbId: 9 }]);
    const second = listSets().find((set) => set.name === 'Only b');
    expect(other).toBe('ok');
    expect(mergeSets('None', first.id, second?.id ?? '', 'intersect')).toBe(
      'empty',
    );
    expect(mergeSets('None', first.id, 'missing', 'intersect')).toBe('failed');
  });

  it('deduplicates repeated identities inside one merge input', () => {
    const data: SelectionSetData = {
      models: { a: [1, 1, 2] },
      keys: {
        b: [
          { dbId: 1, key: 'ext' },
          { dbId: 1, key: 'ext' },
        ],
      },
    };
    const merged = mergeSetData(data, data, 'union');
    expect(merged.models.a).toEqual([1, 2]);
    expect(merged.keys?.b).toHaveLength(1);
  });
});
