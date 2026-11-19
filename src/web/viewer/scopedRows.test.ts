import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { peekScopedRows, readScopedRows } from './scopedRows.js';
import { deleteSet, listSets, saveSelectionSet } from './selectionSets.js';
import { forgetLeafRows } from './sharedLeafRows.js';

beforeEach(() => {
  installMemoryStorage();
});

async function combined() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
  return adapter;
}

describe('readScopedRows', () => {
  it('reads every model by default and narrows to one model', async () => {
    const adapter = await combined();
    const { rows: all } = await readScopedRows(adapter, {
      names: ['Category'],
    });
    const { rows: one } = await readScopedRows(adapter, {
      names: ['Category'],
      models: 'urn-a',
    });
    expect(new Set(all.map((row) => row.modelId))).toEqual(
      new Set(['urn-a', 'urn-b']),
    );
    expect(one.length).toBe(all.length / 2);
    expect(one.every((row) => row.modelId === 'urn-a')).toBe(true);
    adapter.destroy();
  });

  it('reports a model that cannot be read as a failure instead of dropping it', async () => {
    const adapter = await combined();
    vi.spyOn(adapter, 'getLeafProperties').mockImplementation(
      async (names, modelIds) => {
        if (modelIds?.includes('urn-b')) throw new Error('timeout');
        return [{ dbId: 1, name: 'El', properties: { [names[0] ?? '']: 'x' } }];
      },
    );
    const read = await readScopedRows(adapter, { names: ['Category'] });
    expect(read.failed).toEqual([adapter.getModels()[1]?.name]);
    expect(read.rows).toHaveLength(1);
    adapter.destroy();
  });

  it('lists an unavailable model apart from unexpected failures', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([
      { urn: 'urn-a', name: 'Arch' },
      { urn: 'urn-noprops', name: 'Broken DB' },
    ]);
    const read = await readScopedRows(adapter, { names: ['Category'] });
    expect(read.failed).toEqual([]);
    expect(read.unavailable.map((model) => model.name)).toEqual(['Broken DB']);
    expect(read.rows.length).toBeGreaterThan(0);
    adapter.destroy();
  });

  it('keeps only selected elements and counts the model rows before them', async () => {
    const adapter = await combined();
    const { rows: all } = await readScopedRows(adapter, {
      names: ['Category'],
    });
    const first = all[0];
    if (!first?.modelId) throw new Error('no rows');
    adapter.selectModelIds([{ modelId: first.modelId, dbId: first.dbId }]);
    const read = await readScopedRows(adapter, {
      names: ['Category'],
      elements: 'selected',
    });
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]?.dbId).toBe(first.dbId);
    expect(read.total).toBe(all.length);
    adapter.destroy();
  });

  it('uses the element items it is given without asking the adapter', async () => {
    const adapter = await combined();
    const spy = vi.spyOn(adapter, 'getModelSelection');
    const read = await readScopedRows(adapter, {
      names: ['Category'],
      elements: 'selected',
      items: [],
    });
    expect(spy).not.toHaveBeenCalled();
    expect(read.rows).toEqual([]);
    adapter.destroy();
  });
});

describe('set scope', () => {
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
      elements: scope,
    });
    expect(both.rows.map((row) => row.modelId).sort()).toEqual([
      'urn-a',
      'urn-b',
    ]);
    expect(both.scopeNote).toBeUndefined();
    const one = await readScopedRows(adapter, {
      names: ['Category'],
      elements: scope,
      models: 'urn-b',
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
      elements: scope,
    });
    expect(read.rows).toHaveLength(all.length);
    expect(read.elements).toBe('all');
    expect(read.scopeNote).toMatch(/no longer exists/);
    adapter.destroy();
  });
});

describe('peekScopedRows', () => {
  it('answers null before anything is read and never reads properties', async () => {
    const adapter = await combined();
    const read = vi.spyOn(adapter, 'getLeafProperties');
    expect(await peekScopedRows(adapter, {})).toBeNull();
    expect(read).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it('returns the cached rows without reading again', async () => {
    const adapter = await combined();
    const { rows } = await readScopedRows(adapter, { names: ['Category'] });
    const read = vi.spyOn(adapter, 'getLeafProperties');
    const peeked = await peekScopedRows(adapter, {});
    expect(peeked?.rows).toHaveLength(rows.length);
    expect(peeked?.total).toBe(rows.length);
    expect(read).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it('honours the model and element scope from the cache', async () => {
    const adapter = await combined();
    const { rows } = await readScopedRows(adapter, { names: ['Category'] });
    const oneModel = await peekScopedRows(adapter, { models: 'urn-a' });
    expect(oneModel?.rows).toHaveLength(rows.length / 2);
    expect(oneModel?.rows.every((row) => row.modelId === 'urn-a')).toBe(true);
    const first = rows[0];
    if (!first?.modelId) throw new Error('no rows');
    adapter.selectModelIds([{ modelId: first.modelId, dbId: first.dbId }]);
    const picked = await peekScopedRows(adapter, { elements: 'selected' });
    expect(picked?.rows.map((row) => row.dbId)).toEqual([first.dbId]);
    expect(picked?.total).toBe(rows.length);
    adapter.destroy();
  });

  it('notes a deleted set from the cache', async () => {
    const adapter = await combined();
    const { rows } = await readScopedRows(adapter, { names: ['Category'] });
    saveSelectionSet('One', [
      { modelId: rows[0]?.modelId ?? '', dbId: rows[0]?.dbId ?? -1 },
    ]);
    const scope = `set:${listSets()[0]?.id}` as const;
    deleteSet(listSets()[0]?.id ?? '');
    const peeked = await peekScopedRows(adapter, { elements: scope });
    expect(peeked?.scopeNote).toMatch(/no longer exists/);
    expect(peeked?.elements).toBe('all');
    expect(peeked?.rows).toHaveLength(rows.length);
    expect(peeked?.failed).toEqual([]);
    adapter.destroy();
  });

  it('lists unavailable models from a warm cache', async () => {
    const adapter = await combined();
    await readScopedRows(adapter, { names: ['Category'] });
    const models = adapter.getModels();
    vi.spyOn(adapter, 'getModels').mockReturnValue(
      models.map((model) =>
        model.id === 'urn-b' ? { ...model, propertiesError: 'timeout' } : model,
      ),
    );
    const peeked = await peekScopedRows(adapter, {});
    expect(peeked?.unavailable.map((model) => model.name)).toEqual([
      models[1]?.name,
    ]);
    expect(peeked?.failed).toEqual([]);
    adapter.destroy();
  });

  it('answers null once the read cache is forgotten', async () => {
    const adapter = await combined();
    await readScopedRows(adapter, { names: ['Category'] });
    forgetLeafRows(adapter);
    expect(await peekScopedRows(adapter, {})).toBeNull();
    adapter.destroy();
  });
});
