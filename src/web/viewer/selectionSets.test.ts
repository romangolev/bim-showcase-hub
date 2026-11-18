import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPersonal } from '../storage.js';
import { readSaved, upsertSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  deleteSet,
  getSet,
  listSets,
  MAX_SET_ELEMENTS,
  renameSet,
  SELECTION_SET_KIND,
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

  it('selects only items of open models', () => {
    saveSelectionSet('Mixed', items);
    const selectModelIds = vi.fn();
    const adapter = {
      getModels: () => [{ id: 'a', status: 'ready' }],
      selectModelIds,
    } as unknown as ViewerAdapter;
    expect(selectSet(adapter, listSets()[0]?.id ?? '')).toBe(2);
    expect(selectModelIds).toHaveBeenCalledWith([
      { modelId: 'a', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ]);
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
