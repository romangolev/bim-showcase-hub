import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import type { ModelInfo } from './modelSet.js';
import type { ReadOptions, ReadProgress } from './propertyReads.js';
import { readInChunks } from './propertyReads.js';
import {
  discoverLeafProperties,
  forgetLeafRows,
  leafRowsStale,
  peekLeafRows,
  readLeafRows,
  refreshLeafRows,
} from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

const getModels = () => [
  { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
];

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
    adapter: { getLeafProperties, getModels } as unknown as ViewerAdapter,
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

  it('only grows the cached property names', async () => {
    const { adapter, getLeafProperties } = fakeAdapter();
    await readLeafRows(adapter, ['Name', 'Level']);
    await readLeafRows(adapter, ['Category']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    const level = await readLeafRows(adapter, ['Level']);
    const name = await readLeafRows(adapter, ['Name']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    expect(level[0]?.properties).toEqual({ Level: 'Level-v' });
    expect(name[0]?.properties).toEqual({ Name: 'Name-v' });
  });

  it('hands out the cached rows when the names match the cache', async () => {
    const { adapter } = fakeAdapter();
    const first = await readLeafRows(adapter, ['Name', 'Level']);
    const again = await readLeafRows(adapter, ['Name', 'Level']);
    expect(again[0]).toBe(first[0]);
    expect(first[0]?.modelId).toBe('m');
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
    const adapter = {
      getLeafProperties,
      getModels,
    } as unknown as ViewerAdapter;
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

  it('reports the models that failed while returning the others', async () => {
    const { adapter } = await combined(['urn-a', 'urn-noprops']);
    const onFailed = vi.fn();
    const rows = await readLeafRows(adapter, ['Category'], { onFailed });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.modelId === 'urn-a')).toBe(true);
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0]?.[0]).toHaveLength(1);
    adapter.destroy();
  });

  it('reads only the requested models', async () => {
    const { adapter, spy } = await combined(['urn-a', 'urn-b']);
    const rows = await readLeafRows(adapter, ['Category'], {
      modelIds: ['urn-a'],
    });
    expect(rows.every((row) => row.modelId === 'urn-a')).toBe(true);
    expect(callsFor(spy, 'urn-a')).toBe(1);
    expect(callsFor(spy, 'urn-b')).toBe(0);
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

  it('caches an empty read that reported a complete tree', async () => {
    const getLeafProperties = vi.fn(
      async (
        _names: string[],
        _ids?: string[],
        options?: { onProgress?: (p: ReadProgress) => void },
      ) => {
        options?.onProgress?.({
          phase: 'rows',
          loaded: 0,
          total: 0,
          partial: false,
        });
        return [] as PropertyRow[];
      },
    );
    const adapter = {
      getLeafProperties,
      getModels,
    } as unknown as ViewerAdapter;
    expect(peekLeafRows(adapter, ['Name'])).toBeNull();
    expect(await readLeafRows(adapter, ['Name'])).toEqual([]);
    expect(peekLeafRows(adapter, ['Name'])).toEqual([]);
    expect(await readLeafRows(adapter, ['Name'])).toEqual([]);
    expect(getLeafProperties).toHaveBeenCalledTimes(1);
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

describe('readLeafRows cancel and progress', () => {
  type Progress = ReadProgress;
  function gated() {
    const signals: AbortSignal[] = [];
    let release: (rows: PropertyRow[]) => void = () => {};
    let progress: (p: Progress) => void = () => {};
    const getLeafProperties = vi.fn(
      (
        _names: string[],
        _ids?: readonly string[],
        options?: { signal?: AbortSignal; onProgress?: (p: Progress) => void },
      ) => {
        if (options?.signal) signals.push(options.signal);
        if (options?.onProgress) progress = options.onProgress;
        return new Promise<PropertyRow[]>((resolve, reject) => {
          release = resolve;
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('stopped', 'AbortError')),
          );
        });
      },
    );
    const adapter = {
      getLeafProperties,
      getModels,
    } as unknown as ViewerAdapter;
    return {
      adapter,
      signals,
      getLeafProperties,
      release: (rows: PropertyRow[]) => release(rows),
      report: (p: Progress) => progress(p),
    };
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const row: PropertyRow = { dbId: 1, name: 'El', properties: { Name: 'n' } };

  it('rejects an aborted read and aborts the underlying read', async () => {
    const g = gated();
    const controller = new AbortController();
    const read = readLeafRows(g.adapter, ['Name'], {
      signal: controller.signal,
    });
    await tick();
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    expect(g.signals[0]?.aborted).toBe(true);
    g.release([row]);
    await tick();
    const again = readLeafRows(g.adapter, ['Name']);
    await tick();
    g.release([row]);
    expect(await again).toHaveLength(1);
    expect(g.getLeafProperties).toHaveBeenCalledTimes(2);
  });

  it('keeps the shared read alive while another waiter remains', async () => {
    const g = gated();
    const first = new AbortController();
    const a = readLeafRows(g.adapter, ['Name'], { signal: first.signal });
    const b = readLeafRows(g.adapter, ['Name']);
    await tick();
    first.abort();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    expect(g.signals[0]?.aborted).toBe(false);
    g.release([row]);
    expect(await b).toHaveLength(1);
    expect(g.getLeafProperties).toHaveBeenCalledTimes(1);
  });

  it('reports progress to every waiter', async () => {
    const g = gated();
    const seen: number[] = [];
    const a = readLeafRows(g.adapter, ['Name'], {
      onProgress: (p) => seen.push(p.loaded / p.total),
    });
    await tick();
    g.report({ phase: 'rows', loaded: 1, total: 4, partial: true });
    const late: number[] = [];
    const b = readLeafRows(g.adapter, ['Name'], {
      onProgress: (p) => late.push(p.loaded / p.total),
    });
    g.report({ phase: 'rows', loaded: 4, total: 4, partial: false });
    g.release([row]);
    await Promise.all([a, b]);
    expect(seen).toEqual([0.25, 1]);
    expect(late).toEqual([0.25, 1]);
  });
});

describe('discoverLeafProperties', () => {
  function discovering() {
    const discoverProperties = vi.fn(async () => [
      { name: 'Level', category: 'Constraints' },
    ]);
    return {
      adapter: { discoverProperties, getModels } as unknown as ViewerAdapter,
      discoverProperties,
    };
  }

  it('caches per model until the cache is forgotten', async () => {
    const { adapter, discoverProperties } = discovering();
    const [a, b] = await Promise.all([
      discoverLeafProperties(adapter),
      discoverLeafProperties(adapter),
    ]);
    expect(a).toEqual(b);
    await discoverLeafProperties(adapter);
    expect(discoverProperties).toHaveBeenCalledTimes(1);
    forgetLeafRows(adapter);
    await discoverLeafProperties(adapter);
    expect(discoverProperties).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed discovery', async () => {
    const discoverProperties = vi
      .fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue([{ name: 'Level', category: 'Constraints' }]);
    const adapter = {
      discoverProperties,
      getModels,
    } as unknown as ViewerAdapter;
    await expect(discoverLeafProperties(adapter)).rejects.toThrow('db');
    expect(await discoverLeafProperties(adapter)).toHaveLength(1);
    expect(discoverProperties).toHaveBeenCalledTimes(2);
  });

  it('aborts the underlying discovery and never shares a stale result', async () => {
    const calls: { signal?: AbortSignal; release: (v: unknown[]) => void }[] =
      [];
    const discoverProperties = vi.fn(
      (_ids?: readonly string[], options?: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          calls.push({
            ...(options?.signal ? { signal: options.signal } : {}),
            release: resolve,
          });
        }),
    );
    const adapter = {
      discoverProperties,
      getModels,
    } as unknown as ViewerAdapter;
    const controller = new AbortController();
    const first = discoverLeafProperties(adapter, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls[0]?.signal?.aborted).toBe(true);
    const second = discoverLeafProperties(adapter);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(discoverProperties).toHaveBeenCalledTimes(2);
    calls[0]?.release([{ name: 'Stale', category: 'X' }]);
    calls[1]?.release([{ name: 'Level', category: 'Constraints' }]);
    expect(await second).toEqual([{ name: 'Level', category: 'Constraints' }]);
    expect(await discoverLeafProperties(adapter)).toEqual([
      { name: 'Level', category: 'Constraints' },
    ]);
    expect(discoverProperties).toHaveBeenCalledTimes(2);
  });

  it('rejects a cancelled waiter without poisoning the cache', async () => {
    const { adapter, discoverProperties } = discovering();
    const controller = new AbortController();
    controller.abort();
    await expect(
      discoverLeafProperties(adapter, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(await discoverLeafProperties(adapter)).toHaveLength(1);
    expect(discoverProperties).toHaveBeenCalledTimes(1);
  });
});

describe('discovery progress', () => {
  it('sums the progress of every model', async () => {
    const discoverProperties = vi.fn(
      async (
        _ids?: readonly string[],
        options?: { onProgress?: (p: ReadProgress) => void },
      ) => {
        options?.onProgress?.({
          phase: 'discovery',
          loaded: 2,
          total: 2,
          partial: false,
        });
        return [{ name: 'Level', category: 'Constraints' }];
      },
    );
    const adapter = {
      discoverProperties,
      getModels: () => [
        { id: 'a', urn: 'a', name: 'a', visible: true, status: 'ready' },
        { id: 'b', urn: 'b', name: 'b', visible: true, status: 'ready' },
      ],
    } as unknown as ViewerAdapter;
    const seen: ReadProgress[] = [];
    await discoverLeafProperties(adapter, {
      onProgress: (progress) => seen.push(progress),
    });
    expect(seen.at(-1)).toEqual({
      phase: 'discovery',
      loaded: 4,
      total: 4,
      partial: false,
    });
  });
});

describe('cache version', () => {
  it('drops rows and discovery when the model version changes', async () => {
    let version: string | undefined = '1';
    const getLeafProperties = vi.fn(async () => [
      { dbId: 1, name: 'El', properties: { Name: 'n' } },
    ]);
    const discoverProperties = vi.fn(async () => [
      { name: 'Name', category: 'Identity Data' },
    ]);
    const adapter = {
      getLeafProperties,
      discoverProperties,
      getModels: () => [
        {
          id: 'm',
          urn: 'm',
          name: 'm',
          visible: true,
          status: 'ready',
          version,
        },
      ],
    } as unknown as ViewerAdapter;
    await readLeafRows(adapter, ['Name']);
    await discoverLeafProperties(adapter);
    await readLeafRows(adapter, ['Name']);
    await discoverLeafProperties(adapter);
    expect(getLeafProperties).toHaveBeenCalledTimes(1);
    expect(discoverProperties).toHaveBeenCalledTimes(1);
    version = '2';
    await readLeafRows(adapter, ['Name']);
    await discoverLeafProperties(adapter);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    expect(discoverProperties).toHaveBeenCalledTimes(2);
  });
});

describe('large model reads', () => {
  const TOTAL = 60_000;

  function chunkedAdapter(abort?: {
    controller: AbortController;
    after: number;
  }) {
    const ids = Array.from({ length: TOTAL }, (_, i) => i + 1);
    let chunks = 0;
    const getLeafProperties = vi.fn(
      (names: string[], _ids?: readonly string[], options?: ReadOptions) =>
        readInChunks(
          ids,
          async (chunk) => {
            chunks += 1;
            if (abort && chunks === abort.after) abort.controller.abort();
            return chunk.map((dbId) => ({
              dbId,
              name: `El ${dbId}`,
              properties: Object.fromEntries(names.map((n) => [n, 'v'])),
            }));
          },
          options,
        ),
    );
    const adapter = {
      getLeafProperties,
      getModels,
    } as unknown as ViewerAdapter;
    return { adapter, getLeafProperties, chunks: () => chunks };
  }

  it('reports partial rows and never caches a cancelled read', async () => {
    const controller = new AbortController();
    const fake = chunkedAdapter({ controller, after: 2 });
    const chunks: PropertyRow[][] = [];
    const read = readLeafRows(fake.adapter, ['Name'], {
      signal: controller.signal,
      onRows: (rows) => chunks.push(rows),
    });
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.[0]?.modelId).toBe('m');
    expect(chunks[0]?.length).toBe(5000);
    expect(peekLeafRows(fake.adapter, ['Name'])).toBeNull();
  });

  it('reports progress, stops on cancel and completes the cache on the next read', async () => {
    const controller = new AbortController();
    const fake = chunkedAdapter({ controller, after: 2 });
    const seen: ReadProgress[] = [];
    const read = readLeafRows(fake.adapter, ['Name'], {
      signal: controller.signal,
      onProgress: (progress) => seen.push(progress),
    });
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.chunks()).toBe(2);
    expect(seen[0]).toMatchObject({
      phase: 'rows',
      loaded: 0,
      total: TOTAL,
      partial: true,
    });
    expect(peekLeafRows(fake.adapter, ['Name'])).toBeNull();
    const rows = await readLeafRows(fake.adapter, ['Name']);
    expect(rows).toHaveLength(TOTAL);
    expect(peekLeafRows(fake.adapter, ['Name'])).toHaveLength(TOTAL);
    const completed = fake.chunks();
    await readLeafRows(fake.adapter, ['Name']);
    expect(fake.chunks()).toBe(completed);
    expect(fake.getLeafProperties).toHaveBeenCalledTimes(2);
  });
});

describe('stale cache entries', () => {
  it('keeps the rows, marks them stale and replaces them on the next read', async () => {
    const { adapter, getLeafProperties } = fakeAdapter();
    await readLeafRows(adapter, ['Name']);
    expect(leafRowsStale(adapter)).toBe(false);
    refreshLeafRows(adapter);
    expect(leafRowsStale(adapter)).toBe(true);
    expect(peekLeafRows(adapter, ['Name'])).toHaveLength(1);
    const rows = await readLeafRows(adapter, ['Name']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    expect(leafRowsStale(adapter)).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('marks cached rows stale when the model version changes', async () => {
    let version = 'v1';
    const getLeafProperties = vi.fn(async () => [
      { dbId: 1, name: 'El', properties: { Name: 'n' } },
    ]);
    const adapter = {
      getLeafProperties,
      getModels: () => [
        {
          id: 'm',
          urn: 'm',
          name: 'm',
          visible: true,
          status: 'ready',
          version,
        },
      ],
    } as unknown as ViewerAdapter;
    await readLeafRows(adapter, ['Name']);
    expect(leafRowsStale(adapter)).toBe(false);
    version = 'v2';
    expect(leafRowsStale(adapter)).toBe(true);
    expect(peekLeafRows(adapter, ['Name'])).toHaveLength(1);
    await readLeafRows(adapter, ['Name']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
    expect(leafRowsStale(adapter)).toBe(false);
  });

  it('does not serve a stale entry while it is being refreshed', async () => {
    const { adapter, getLeafProperties } = fakeAdapter();
    await readLeafRows(adapter, ['Name']);
    refreshLeafRows(adapter);
    await readLeafRows(adapter, ['Level']);
    expect(getLeafProperties).toHaveBeenCalledTimes(2);
  });
});
