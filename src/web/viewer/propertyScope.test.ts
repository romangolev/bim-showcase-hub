import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import {
  filterByElementScope,
  readScopedRows,
  sanitizeElementScope,
} from './propertyScope.js';
import { deleteSet, listSets, saveSelectionSet } from './selectionSets.js';

beforeEach(() => {
  installMemoryStorage();
});

async function combined() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
  return adapter;
}

describe('filterByElementScope', () => {
  const rows = [
    { modelId: 'a', dbId: 1 },
    { modelId: 'b', dbId: 1 },
    { dbId: 2 },
  ];

  it('keeps everything for all and nothing for an empty item list', () => {
    expect(filterByElementScope(rows, 'all', [])).toHaveLength(3);
    expect(filterByElementScope(rows, 'isolated', [])).toEqual([]);
  });

  it('matches model and element, falling back to the primary model', () => {
    const items = [
      { modelId: 'b', dbId: 1 },
      { modelId: 'a', dbId: 2 },
    ];
    expect(filterByElementScope(rows, 'selected', items, 'a')).toEqual([
      { modelId: 'b', dbId: 1 },
      { dbId: 2 },
    ]);
  });
});

describe('readScopedRows', () => {
  it('reads every model by default and narrows to one model', async () => {
    const adapter = await combined();
    const { rows: all } = await readScopedRows(adapter, {
      names: ['Category'],
    });
    const { rows: one } = await readScopedRows(adapter, {
      names: ['Category'],
      scope: { models: 'urn-a' },
    });
    expect(new Set(all.map((row) => row.modelId))).toEqual(
      new Set(['urn-a', 'urn-b']),
    );
    expect(one.length).toBe(all.length / 2);
    expect(one.every((row) => row.modelId === 'urn-a')).toBe(true);
    adapter.destroy();
  });

  it('fails when a model cannot be read instead of dropping its rows', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
    vi.spyOn(adapter, 'getLeafProperties').mockImplementation(
      async (names, modelIds) => {
        if (modelIds?.includes('urn-b')) throw new Error('timeout');
        return [{ dbId: 1, name: 'El', properties: { [names[0] ?? '']: 'x' } }];
      },
    );
    await expect(
      readScopedRows(adapter, { names: ['Category'] }),
    ).rejects.toThrow(/Could not read properties of/);
    adapter.destroy();
  });

  it('reports failed models instead of throwing under the report policy', async () => {
    const adapter = await combined();
    vi.spyOn(adapter, 'getLeafProperties').mockImplementation(
      async (names, modelIds) => {
        if (modelIds?.includes('urn-b')) throw new Error('timeout');
        return [{ dbId: 1, name: 'El', properties: { [names[0] ?? '']: 'x' } }];
      },
    );
    const read = await readScopedRows(adapter, {
      names: ['Category'],
      onFailure: 'report',
    });
    expect(read.failed).toHaveLength(1);
    expect(read.rows).toHaveLength(1);
    adapter.destroy();
  });

  it('keeps only selected elements', async () => {
    const adapter = await combined();
    const { rows: all } = await readScopedRows(adapter, {
      names: ['Category'],
    });
    const first = all[0];
    if (!first?.modelId) throw new Error('no rows');
    adapter.selectModelIds([{ modelId: first.modelId, dbId: first.dbId }]);
    const { rows: picked } = await readScopedRows(adapter, {
      names: ['Category'],
      scope: { elements: 'selected' },
    });
    expect(picked).toHaveLength(1);
    expect(picked[0]?.dbId).toBe(first.dbId);
    adapter.destroy();
  });
});

describe('set scope', () => {
  it('sanitizes set ids and rejects other strings', () => {
    expect(sanitizeElementScope('set:ss-1_a')).toBe('set:ss-1_a');
    expect(sanitizeElementScope('set:')).toBe('all');
    expect(sanitizeElementScope('set:a b')).toBe('all');
    expect(sanitizeElementScope('sets:x')).toBe('all');
  });

  it('exports only the set, across models, and honours the model scope', async () => {
    const adapter = await combined();
    const { rows: all } = await readScopedRows(adapter, {
      names: ['Category'],
    });
    const a = all.find((row) => row.modelId === 'urn-a');
    const b = all.find((row) => row.modelId === 'urn-b');
    if (!a?.modelId || !b?.modelId) throw new Error('no rows');
    saveSelectionSet('Pair', [
      { modelId: a.modelId, dbId: a.dbId },
      { modelId: b.modelId, dbId: b.dbId },
    ]);
    const scope = `set:${listSets()[0]?.id}` as const;
    const both = await readScopedRows(adapter, {
      names: ['Category'],
      scope: { elements: scope },
    });
    expect(both.rows.map((row) => row.modelId).sort()).toEqual([
      'urn-a',
      'urn-b',
    ]);
    expect(both.scopeNote).toBeUndefined();
    const one = await readScopedRows(adapter, {
      names: ['Category'],
      scope: { elements: scope, models: 'urn-b' },
    });
    expect(one.rows).toHaveLength(1);
    expect(one.rows[0]?.modelId).toBe('urn-b');
    adapter.destroy();
  });

  it('falls back to all elements with a note when the set is gone', async () => {
    const adapter = await combined();
    const { rows: all } = await readScopedRows(adapter, {
      names: ['Category'],
    });
    const first = all[0];
    if (!first?.modelId) throw new Error('no rows');
    saveSelectionSet('One', [{ modelId: first.modelId, dbId: first.dbId }]);
    const scope = `set:${listSets()[0]?.id}` as const;
    deleteSet(listSets()[0]?.id ?? '');
    const read = await readScopedRows(adapter, {
      names: ['Category'],
      scope: { elements: scope },
    });
    expect(read.rows).toHaveLength(all.length);
    expect(read.scopeNote).toMatch(/no longer exists/);
    adapter.destroy();
  });
});
