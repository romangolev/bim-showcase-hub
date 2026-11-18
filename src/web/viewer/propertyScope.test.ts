import { describe, expect, it, vi } from 'vitest';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { filterByElementScope, readScopedRows } from './propertyScope.js';

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
