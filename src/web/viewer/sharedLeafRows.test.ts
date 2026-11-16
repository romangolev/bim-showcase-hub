import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import type { ModelInfo } from './modelSet.js';
import { forgetLeafRows, readLeafRows } from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

function fakeAdapter() {
  const getLeafProperties = vi.fn(async (names: string[]) => {
    const row: PropertyRow = {
      dbId: 1,
      name: 'El',
      properties: Object.fromEntries(names.map((n) => [n, `${n}-v`])),
    };
    return [row];
  });
  return {
    adapter: { getLeafProperties } as unknown as ViewerAdapter,
    getLeafProperties,
  };
}

describe('readLeafRows', () => {
  it('merges same-tick reads into one bulk read of the union', async () => {
    const { adapter, getLeafProperties } = fakeAdapter();
    const [dashboard, summary, exported] = await Promise.all([
      readLeafRows(adapter, ['Category', 'Level', 'Name']),
      readLeafRows(adapter, ['Name', 'Assembly Code']),
      readLeafRows(adapter, ['Level', 'Category']),
    ]);
    expect(getLeafProperties).toHaveBeenCalledTimes(1);
    expect(new Set(getLeafProperties.mock.calls[0]?.[0])).toEqual(
      new Set(['Category', 'Level', 'Name', 'Assembly Code']),
    );
    expect(Object.keys(dashboard[0]?.properties ?? {})).toEqual([
      'Category',
      'Level',
      'Name',
    ]);
    expect(Object.keys(summary[0]?.properties ?? {})).toEqual([
      'Name',
      'Assembly Code',
    ]);
    expect(Object.keys(exported[0]?.properties ?? {})).toEqual([
      'Level',
      'Category',
    ]);
  });

  it('serves a finished read from the cache until it is forgotten', async () => {
    const { adapter, getLeafProperties } = fakeAdapter();
    await readLeafRows(adapter, ['Name', 'Level']);
    const cached = await readLeafRows(adapter, ['Level']);
    expect(getLeafProperties).toHaveBeenCalledTimes(1);
    expect(cached[0]?.properties).toEqual({ Level: 'Level-v' });
    await readLeafRows(adapter, ['Category']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    forgetLeafRows(adapter);
    await readLeafRows(adapter, ['Category']);
    expect(getLeafProperties).toHaveBeenCalledTimes(3);
  });

  it('keeps reads and caches separate per adapter', async () => {
    const a = fakeAdapter();
    const b = fakeAdapter();
    await Promise.all([
      readLeafRows(a.adapter, ['Name']),
      readLeafRows(b.adapter, ['Name']),
    ]);
    await readLeafRows(a.adapter, ['Name']);
    expect(a.getLeafProperties).toHaveBeenCalledTimes(1);
    expect(b.getLeafProperties).toHaveBeenCalledTimes(1);
    forgetLeafRows(a.adapter);
    await readLeafRows(b.adapter, ['Name']);
    expect(b.getLeafProperties).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight read with a covered request', async () => {
    let release: (rows: PropertyRow[]) => void = () => {};
    const getLeafProperties = vi.fn(
      () =>
        new Promise<PropertyRow[]>((resolve) => {
          release = resolve;
        }),
    );
    const adapter = { getLeafProperties } as unknown as ViewerAdapter;
    const first = readLeafRows(adapter, ['Name', 'Level']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = readLeafRows(adapter, ['Name']);
    release([{ dbId: 1, name: 'El', properties: { Name: 'n', Level: 'l' } }]);
    const [a, b] = await Promise.all([first, second]);
    expect(getLeafProperties).toHaveBeenCalledTimes(1);
    expect(a[0]?.properties).toEqual({ Name: 'n', Level: 'l' });
    expect(b[0]?.properties).toEqual({ Name: 'n' });
  });
});

describe('readLeafRows with a model set', () => {
  async function combined(urns: string[]) {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels(urns.map((urn) => ({ urn })));
    const spy = vi.spyOn(adapter, 'getLeafProperties');
    return { adapter, spy };
  }

  function callsFor(spy: { mock: { calls: unknown[][] } }, id: string) {
    return spy.mock.calls.filter((call) =>
      (call[1] as string[] | undefined)?.includes(id),
    ).length;
  }

  it('reads each model once and never re-reads on visibility changes', async () => {
    const { adapter, spy } = await combined(['urn-a', 'urn-b']);
    const both = await readLeafRows(adapter, ['Category']);
    expect(callsFor(spy, 'urn-a')).toBe(1);
    expect(callsFor(spy, 'urn-b')).toBe(1);
    adapter.setModelVisible('urn-b', false);
    const one = await readLeafRows(adapter, ['Category']);
    expect(one).toHaveLength(both.length / 2);
    adapter.setModelVisible('urn-b', true);
    expect(await readLeafRows(adapter, ['Category'])).toHaveLength(both.length);
    expect(spy).toHaveBeenCalledTimes(2);
    adapter.destroy();
  });

  it('never caches a failed model read', async () => {
    const { adapter, spy } = await combined(['urn-a', 'urn-noprops']);
    const first = await readLeafRows(adapter, ['Category']);
    expect(first.every((row) => row.modelId === 'urn-a')).toBe(true);
    await readLeafRows(adapter, ['Category']);
    expect(callsFor(spy, 'urn-noprops')).toBe(2);
    expect(callsFor(spy, 'urn-a')).toBe(1);
    adapter.destroy();
  });

  it('does not cache an empty read and reads again after a model reloads', async () => {
    let models: ModelInfo[] = [
      { id: 'm1', urn: 'm1', name: 'M1', visible: true, status: 'ready' },
    ];
    let listener: (next: ModelInfo[]) => void = () => {};
    let rows: PropertyRow[] = [];
    const getLeafProperties = vi.fn(async () => rows);
    const adapter = {
      getLeafProperties,
      getModels: () => models,
      onModelsChange: (cb: (next: ModelInfo[]) => void) => {
        listener = cb;
        return () => {};
      },
    } as unknown as ViewerAdapter;
    expect(await readLeafRows(adapter, ['Name'])).toEqual([]);
    rows = [{ dbId: 1, name: 'El', properties: { Name: 'first' } }];
    expect(await readLeafRows(adapter, ['Name'])).toHaveLength(1);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    await readLeafRows(adapter, ['Name']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    const set = (status: ModelInfo['status']) => {
      models = models.map((model) => ({ ...model, status }));
      listener(models);
    };
    set('loading');
    set('ready');
    rows = [{ dbId: 1, name: 'El', properties: { Name: 'second' } }];
    const fresh = await readLeafRows(adapter, ['Name']);
    expect(getLeafProperties).toHaveBeenCalledTimes(3);
    expect(fresh[0]?.properties.Name).toBe('second');
    models = models.map((model) => ({ ...model, visible: false }));
    listener(models);
    models = models.map((model) => ({ ...model, visible: true }));
    listener(models);
    await readLeafRows(adapter, ['Name']);
    expect(getLeafProperties).toHaveBeenCalledTimes(3);
  });

  it('reuses the rows of the same version and leaves out removed models', async () => {
    const { adapter, spy } = await combined(['urn-a', 'urn-b']);
    await readLeafRows(adapter, ['Category']);
    adapter.removeModel('urn-b');
    const left = await readLeafRows(adapter, ['Category']);
    expect(left.every((row) => row.modelId === 'urn-a')).toBe(true);
    await adapter.addModel({ urn: 'urn-b', name: 'Renamed' });
    const back = await readLeafRows(adapter, ['Category']);
    expect(callsFor(spy, 'urn-b')).toBe(2);
    expect(back.some((row) => row.modelName === 'Renamed')).toBe(true);
    adapter.destroy();
  });
});
