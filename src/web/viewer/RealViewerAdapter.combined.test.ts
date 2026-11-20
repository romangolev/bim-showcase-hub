import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewingDocument } from './autodesk.js';
import {
  FAKE_AGGREGATE_EVENT,
  FAKE_SELECTION_EVENT,
  type FakeEnvironment,
  type FakeFederatedViewer,
  FakeModel,
  installFakeFederation,
} from './fakeFederatedViewer.js';
import {
  anchorOf,
  federatedLoadOptions,
  NO_MATCHING_VIEW_MESSAGE,
  nodeIs2d,
  OTHER_REGION_MESSAGE,
  pickGeometryNode,
} from './federation.js';
import { RealViewerAdapter } from './RealViewerAdapter.js';
import { resetRegion } from './region.js';

let env: FakeEnvironment;
let host: HTMLElement;
let adapter: RealViewerAdapter;

beforeEach(() => {
  resetRegion();
  env = installFakeFederation();
  host = document.createElement('div');
  document.body.appendChild(host);
  adapter = new RealViewerAdapter(host);
});

afterEach(() => {
  adapter.destroy();
  host.remove();
  vi.restoreAllMocks();
});

function viewer(): FakeFederatedViewer {
  const current = env.viewers.at(-1);
  if (!current) throw new Error('no viewer');
  return current;
}

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const OFFSET = { x: 100, y: 200, z: 3 };

describe('federated loading', () => {
  it('loads the anchor first and shares its offset and unit', async () => {
    env.specs.set('arch', { offset: OFFSET, unit: 'ft' });
    env.specs.set('mep', { offset: { x: 9, y: 9, z: 9 }, unit: 'mm' });
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'mep' }]);
    const [arch, mep] = viewer().models;
    expect(arch?.options).toEqual({
      keepCurrentModels: true,
      applyRefPoint: true,
    });
    expect(mep?.options).toEqual({
      keepCurrentModels: true,
      applyRefPoint: true,
      globalOffset: OFFSET,
      applyScaling: 'ft',
    });
    expect(mep?.globalOffset).toEqual(OFFSET);
    expect(viewer().fits).toBe(1);
  });

  it('makes the next model the anchor when the first fails', async () => {
    env.specs.set('bad', { fail: 'gone' });
    env.specs.set('arch', { offset: OFFSET });
    const models = await adapter.loadModels([
      { urn: 'bad' },
      { urn: 'arch' },
      { urn: 'str' },
    ]);
    expect(models.map((m) => m.status)).toEqual(['error', 'ready', 'ready']);
    expect(models[0]?.error).toBe('Document load failed (404): gone');
    expect(viewer().modelOf('arch').options.globalOffset).toBeUndefined();
    expect(viewer().modelOf('str').options.globalOffset).toEqual(OFFSET);
  });

  it('keeps the anchor offset after the anchor is removed', async () => {
    env.specs.set('arch', { offset: OFFSET });
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'str' }]);
    const first = viewer().modelOf('arch');
    adapter.removeModel('arch');
    expect(viewer().unloaded).toEqual([first]);
    expect(viewer().cleared).toContain(first);
    await adapter.addModel({ urn: 'mep' });
    expect(viewer().modelOf('mep').options.globalOffset).toEqual(OFFSET);
    expect(viewer().fits).toBe(2);
  });

  it('starts a fresh anchor once the set is empty', async () => {
    env.specs.set('arch', { offset: OFFSET });
    await adapter.loadModels([{ urn: 'arch' }]);
    adapter.removeModel('arch');
    expect(adapter.getModels()).toEqual([]);
    await adapter.addModel({ urn: 'mep' });
    expect(viewer().modelOf('mep').options.globalOffset).toBeUndefined();
  });

  it('drops the anchor when only failed models remain after it is removed', async () => {
    env.specs.set('arch', { offset: OFFSET, unit: 'ft' });
    env.specs.set('bad', { fail: 'gone' });
    env.specs.set('sheet', { only2d: true });
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'bad' }]);
    adapter.removeModel('arch');
    expect(adapter.getModels().map((m) => m.status)).toEqual(['error']);
    const sheet = await adapter.addModel({ urn: 'sheet' });
    expect(sheet.status).toBe('ready');
    expect(viewer().modelOf('sheet').options).toEqual({
      keepCurrentModels: true,
      applyRefPoint: true,
    });
  });

  it('moves the anchor to the next ready model when the anchor is removed', async () => {
    env.specs.set('arch', { offset: OFFSET, unit: 'ft' });
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'str' }]);
    adapter.removeModel('arch');
    await adapter.addModel({ urn: 'mep' });
    expect(viewer().modelOf('mep').options).toMatchObject({
      globalOffset: OFFSET,
      applyScaling: 'ft',
    });
    expect(adapter.getTogetherOffsets()).not.toHaveProperty('str');
  });

  it('refuses a 2D-only file in a 3D set', async () => {
    env.specs.set('sheet', { only2d: true });
    const models = await adapter.loadModels([
      { urn: 'arch' },
      { urn: 'sheet' },
    ]);
    expect(models[1]).toMatchObject({
      status: 'error',
      error: NO_MATCHING_VIEW_MESSAGE['3d'],
    });
  });

  it('refuses a model from another region', async () => {
    const eu = btoa('urn:adsk.wipemea:fs.file:abc');
    const models = await adapter.loadModels([{ urn: 'arch' }, { urn: eu }]);
    expect(models[1]).toMatchObject({
      status: 'error',
      error: OTHER_REGION_MESSAGE,
    });
  });

  it('fetches an added manifest while earlier loads still run', async () => {
    const gate = deferred();
    env.gate.set('arch', gate.promise);
    const loading = adapter.loadModels([{ urn: 'arch' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const adding = adapter.addModel({ urn: 'mep' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(env.documentLoads).toEqual(['arch', 'mep']);
    expect(viewer().models).toHaveLength(0);
    gate.release();
    await loading;
    expect((await adding).status).toBe('ready');
  });

  it('checks the region before fetching the manifest', async () => {
    const eu = btoa('urn:adsk.wipemea:fs.file:abc');
    await adapter.loadModels([{ urn: 'arch' }, { urn: eu }]);
    const info = await adapter.addModel({
      urn: btoa('urn:adsk.wipemea:fs.file:xyz'),
    });
    expect(info.error).toBe(OTHER_REGION_MESSAGE);
    expect(env.documentLoads).toEqual(['arch']);
  });

  it('unloads a model removed while it was loading', async () => {
    const gate = deferred();
    env.gate.set('slow', gate.promise);
    await adapter.loadModels([{ urn: 'arch' }]);
    const adding = adapter.addModel({ urn: 'slow' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    adapter.removeModel('slow');
    gate.release();
    await expect(adding).rejects.toMatchObject({ code: 'cancelled' });
    expect(viewer().models.map((m) => m.urn)).toEqual(['arch']);
    expect(viewer().unloaded.map((m) => m.urn)).toEqual(['slow']);
  });

  it('drops a stale load when the same urn is added again', async () => {
    const gate = deferred();
    env.gate.set('slow', gate.promise);
    await adapter.loadModels([{ urn: 'arch' }]);
    const first = adapter.addModel({ urn: 'slow' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    adapter.removeModel('slow');
    const second = adapter.addModel({ urn: 'slow' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    gate.release();
    await expect(first).rejects.toMatchObject({ code: 'cancelled' });
    expect((await second).status).toBe('ready');
    const slow = viewer().models.filter((m) => m.urn === 'slow');
    expect(slow).toHaveLength(1);
    expect(viewer().unloaded.map((m) => m.urn)).toEqual(['slow']);
    expect(adapter.getModels().map((m) => [m.id, m.status])).toEqual([
      ['arch', 'ready'],
      ['slow', 'ready'],
    ]);
    viewer().selectIn('slow', [11]);
    expect(adapter.getModelSelection()).toEqual([
      { modelId: 'slow', dbId: 11 },
    ]);
  });

  it('hides a model that was hidden before it finished loading', async () => {
    const gate = deferred();
    env.gate.set('slow', gate.promise);
    await adapter.loadModels([{ urn: 'arch' }]);
    const adding = adapter.addModel({ urn: 'slow' });
    adapter.setModelVisible('slow', false);
    gate.release();
    await adding;
    expect(viewer().hidden.has(viewer().modelOf('slow'))).toBe(true);
  });
});

describe('viewer startup', () => {
  it('starts one viewer for concurrent adds', async () => {
    const [a, b] = await Promise.all([
      adapter.addModel({ urn: 'arch' }),
      adapter.addModel({ urn: 'mep' }),
    ]);
    expect(env.viewers).toHaveLength(1);
    expect([a.status, b.status]).toEqual(['ready', 'ready']);
    expect(
      viewer()
        .models.map((m) => m.urn)
        .sort(),
    ).toEqual(['arch', 'mep']);
  });

  it('lets concurrent first adds wait for the anchor and share its offset', async () => {
    const gate = deferred();
    env.gate.set('arch', gate.promise);
    env.specs.set('arch', { offset: OFFSET, unit: 'ft' });
    env.specs.set('mep', { unit: 'mm' });
    const arch = adapter.addModel({ urn: 'arch' });
    const mep = adapter.addModel({ urn: 'mep' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(viewer().models).toHaveLength(0);
    gate.release();
    await Promise.all([arch, mep]);
    expect(viewer().modelOf('arch').options.globalOffset).toBeUndefined();
    expect(viewer().modelOf('mep').options).toMatchObject({
      globalOffset: OFFSET,
      applyScaling: 'ft',
    });
  });

  it('makes a waiting add the anchor when the anchor fails', async () => {
    env.specs.set('arch', { noGeometry: true });
    env.specs.set('mep', { offset: OFFSET });
    const [arch, mep] = await Promise.all([
      adapter.addModel({ urn: 'arch' }),
      adapter.addModel({ urn: 'mep' }),
    ]);
    expect(arch.status).toBe('error');
    expect(mep.status).toBe('ready');
    expect(viewer().modelOf('mep').options.globalOffset).toBeUndefined();
    const str = await adapter.addModel({ urn: 'str' });
    expect(str.status).toBe('ready');
    expect(viewer().modelOf('str').options.globalOffset).toEqual(OFFSET);
  });

  it('reuses a live empty viewer', async () => {
    await adapter.loadModels([{ urn: 'arch' }]);
    adapter.removeModel('arch');
    const info = await adapter.addModel({ urn: 'mep' });
    expect(info.status).toBe('ready');
    expect(env.viewers).toHaveLength(1);
    expect(viewer().finished).toBe(false);
  });

  it('records a start failure on the model with the real message', async () => {
    env.startCode = 7;
    const seen: string[][] = [];
    adapter.onModelsChange((models) =>
      seen.push(models.map((m) => `${m.id}:${m.status}:${m.error ?? ''}`)),
    );
    const info = await adapter.addModel({ urn: 'arch', name: 'Arch.rvt' });
    expect(info).toMatchObject({
      id: 'arch',
      name: 'Arch.rvt',
      status: 'error',
      error: 'Viewer failed to start (7)',
    });
    expect(adapter.getModels()).toEqual([info]);
    expect(seen.at(-1)).toEqual(['arch:error:Viewer failed to start (7)']);
    env.startCode = 0;
    const retried = await adapter.addModel({ urn: 'arch' });
    expect(retried.status).toBe('ready');
  });

  it('marks every model when loadModels cannot start the viewer', async () => {
    env.startCode = 3;
    await expect(
      adapter.loadModels([{ urn: 'arch' }, { urn: 'mep' }]),
    ).rejects.toThrow('Viewer failed to start (3)');
    expect(adapter.getModels().map((m) => [m.id, m.error])).toEqual([
      ['arch', 'Viewer failed to start (3)'],
      ['mep', 'Viewer failed to start (3)'],
    ]);
  });

  it('reports a region clash from the Autodesk initializer', async () => {
    const other = new RealViewerAdapter(document.createElement('div'));
    await other.loadModels([{ urn: 'arch' }]);
    const eu = btoa('urn:adsk.wipemea:fs.file:abc');
    const info = await adapter.addModel({ urn: eu });
    expect(info.status).toBe('error');
    expect(info.error).toMatch(/This model is in the EU region/);
    other.destroy();
  });

  it('reports no error for a model of a destroyed adapter', async () => {
    const seen: string[] = [];
    adapter.onModelsChange((models) =>
      seen.push(...models.map((m) => m.status)),
    );
    const adding = adapter.addModel({ urn: 'arch' });
    adapter.destroy();
    await expect(adding).rejects.toMatchObject({ code: 'closed' });
    await expect(adapter.addModel({ urn: 'arch' })).rejects.toMatchObject({
      code: 'closed',
    });
    expect(seen).not.toContain('error');
    expect(adapter.getModels()).toEqual([]);
    expect(env.viewers).toHaveLength(0);
  });
});

describe('federated selection, paint and properties', () => {
  it('listens to the aggregate selection event only', async () => {
    await adapter.loadModels([{ urn: 'a' }, { urn: 'b' }]);
    expect(viewer().listenerCount(FAKE_AGGREGATE_EVENT)).toBe(1);
    expect(viewer().listenerCount(FAKE_SELECTION_EVENT)).toBe(0);
    const seen: number[][] = [];
    adapter.onSelectionChange((items) =>
      seen.push(items.map((item) => item.dbId)),
    );
    viewer().selectIn('b', [12]);
    expect(seen).toEqual([[12]]);
    expect(adapter.getModelSelection()).toEqual([{ modelId: 'b', dbId: 12 }]);
    adapter.destroy();
    expect(viewer().listenerCount(FAKE_AGGREGATE_EVENT)).toBe(0);
  });

  it('clears paint on every model', async () => {
    await adapter.loadModels([{ urn: 'a' }, { urn: 'b' }]);
    adapter.clearThemingColors();
    expect(viewer().cleared).toEqual(viewer().models);
  });

  it('clears theming for one element at a time', async () => {
    await adapter.loadModels([{ urn: 'a' }, { urn: 'b' }]);
    adapter.clearModelThemingColors([
      { modelId: 'a', dbId: 11 },
      { modelId: 'b', dbId: 12 },
    ]);
    expect(
      viewer().themed.map((entry) => [
        (entry.model as FakeModel | undefined)?.urn,
        entry.dbId,
        entry.color,
      ]),
    ).toEqual([
      ['a', 11, null],
      ['b', 12, null],
    ]);
    expect(viewer().cleared).toEqual([]);
  });

  it('reads properties of every model and keeps the rest when one fails', async () => {
    env.specs.set('a', { categories: ['Walls', 'Doors'] });
    env.specs.set('b', { categories: ['Ducts'] });
    await adapter.loadModels([
      { urn: 'a', name: 'Arch' },
      { urn: 'b', name: 'MEP' },
    ]);
    const rows = await adapter.getLeafProperties(['Category']);
    expect(
      rows.map((r) => [r.modelName, r.dbId, r.properties.Category]),
    ).toEqual([
      ['Arch', 11, 'Walls'],
      ['Arch', 12, 'Doors'],
      ['Arch', 13, 'Walls'],
      ['MEP', 11, 'Ducts'],
      ['MEP', 12, 'Ducts'],
      ['MEP', 13, 'Ducts'],
    ]);
    vi.spyOn(viewer().modelOf('b'), 'getObjectTree').mockImplementation(
      (_ok, fail) => fail?.(new Error('db')),
    );
    const partial = await adapter.getLeafProperties(['Category']);
    expect(partial.every((row) => row.modelId === 'a')).toBe(true);
    vi.spyOn(viewer().modelOf('a'), 'getObjectTree').mockImplementation(
      (_ok, fail) => fail?.(new Error('db')),
    );
    await expect(adapter.getLeafProperties(['Category'])).rejects.toThrow('db');
  });

  it('discovers distinct properties with their categories across models', async () => {
    await adapter.loadModels([
      { urn: 'a', name: 'Arch' },
      { urn: 'b', name: 'MEP' },
    ]);
    const answer =
      (extra: string) =>
      (ids: number[], _opts: unknown, ok: (items: never[]) => void) =>
        ok(
          ids.map((dbId) => ({
            dbId,
            name: 'n',
            properties: [
              {
                displayName: 'Level',
                displayValue: 'L1',
                displayCategory: 'Constraints',
              },
              { displayName: extra, displayValue: 1 },
            ],
          })) as never[],
        );
    vi.spyOn(viewer().modelOf('a'), 'getBulkProperties').mockImplementation(
      answer('Width') as never,
    );
    vi.spyOn(viewer().modelOf('b'), 'getBulkProperties').mockImplementation(
      answer('Flow') as never,
    );
    expect(await adapter.discoverProperties()).toEqual([
      { name: 'Level', category: 'Constraints' },
      { name: 'Flow', category: 'Other' },
      { name: 'Width', category: 'Other' },
    ]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.discoverProperties(undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('covers every leaf when discovering properties', async () => {
    const leaves = Array.from({ length: 5001 }, (_, i) => 1000 + i);
    env.specs.set('a', { leaves });
    await adapter.loadModels([{ urn: 'a', name: 'Arch' }]);
    const chunks: number[] = [];
    vi.spyOn(viewer().modelOf('a'), 'getBulkProperties').mockImplementation(
      (ids, _options, ok) => {
        chunks.push(ids.length);
        ok(
          ids.map((dbId) => ({
            dbId,
            name: 'n',
            properties: [
              {
                displayName: 'Level',
                displayValue: 'L1',
                displayCategory: 'Constraints',
              },
            ],
          })) as never[],
        );
      },
    );
    const seen: {
      phase: string;
      loaded: number;
      total: number;
      partial: boolean;
    }[] = [];
    const found = await adapter.discoverProperties(undefined, {
      onProgress: (progress) => seen.push(progress),
    });
    expect(chunks).toEqual([5000, 1]);
    expect(seen.at(-1)).toMatchObject({ loaded: 5001, total: 5001 });
    expect(found).toEqual([{ name: 'Level', category: 'Constraints' }]);
  });

  it('stops discovering after the chunk that was cancelled', async () => {
    const leaves = Array.from({ length: 5001 }, (_, i) => 1000 + i);
    env.specs.set('a', { leaves });
    await adapter.loadModels([{ urn: 'a' }]);
    const controller = new AbortController();
    const chunks: number[] = [];
    vi.spyOn(viewer().modelOf('a'), 'getBulkProperties').mockImplementation(
      (ids, _options, ok) => {
        chunks.push(ids.length);
        ok(
          ids.map((dbId) => ({
            dbId,
            name: 'n',
            properties: [{ displayName: 'Level', displayValue: 'L1' }],
          })) as never[],
        );
        controller.abort();
      },
    );
    await expect(
      adapter.discoverProperties(undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(chunks).toEqual([5000]);
  });

  it('reads a 100k model in 20 discovery chunks and reports progress', async () => {
    const leaves = Array.from({ length: 100_000 }, (_, i) => i + 2);
    env.specs.set('a', { leaves });
    await adapter.loadModels([{ urn: 'a' }]);
    const chunks: number[] = [];
    vi.spyOn(viewer().modelOf('a'), 'getBulkProperties').mockImplementation(
      (ids, _options, ok) => {
        chunks.push(ids.length);
        ok(
          ids.map((dbId) => ({
            dbId,
            name: 'n',
            properties: [
              {
                displayName: 'Level',
                displayValue: 'L1',
                displayCategory: 'Constraints',
              },
            ],
          })) as never[],
        );
      },
    );
    const seen: {
      phase: string;
      loaded: number;
      total: number;
      partial: boolean;
    }[] = [];
    const found = await adapter.discoverProperties(undefined, {
      onProgress: (progress) => seen.push(progress),
    });
    expect(chunks).toEqual(Array.from({ length: 20 }, () => 5000));
    expect(seen[0]).toMatchObject({
      phase: 'discovery',
      loaded: 0,
      total: 100_000,
      partial: true,
    });
    expect(seen.at(-1)).toMatchObject({
      loaded: 100_000,
      total: 100_000,
      partial: false,
    });
    expect(seen.length).toBeLessThan(21);
    expect(found).toEqual([{ name: 'Level', category: 'Constraints' }]);
  });

  it('cancels 100k discovery between chunks', async () => {
    const leaves = Array.from({ length: 100_000 }, (_, i) => i + 2);
    env.specs.set('a', { leaves });
    await adapter.loadModels([{ urn: 'a' }]);
    const controller = new AbortController();
    const chunks: number[] = [];
    vi.spyOn(viewer().modelOf('a'), 'getBulkProperties').mockImplementation(
      (ids, _options, ok) => {
        chunks.push(ids.length);
        ok(
          ids.map((dbId) => ({
            dbId,
            name: 'n',
            properties: [{ displayName: 'Level', displayValue: 'L1' }],
          })) as never[],
        );
        controller.abort();
      },
    );
    await expect(
      adapter.discoverProperties(undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(chunks).toEqual([5000]);
  });

  it('keeps the first value when two categories share a property name', async () => {
    env.specs.set('a', { categories: ['Walls'] });
    await adapter.loadModels([{ urn: 'a', name: 'Arch' }]);
    vi.spyOn(viewer().modelOf('a'), 'getBulkProperties').mockImplementation(
      (ids, _opts, ok) =>
        ok(
          ids.map((dbId) => ({
            dbId,
            name: 'x',
            properties: [
              {
                displayName: 'Level',
                displayValue: 'L1',
                displayCategory: 'A',
              },
              {
                displayName: 'Level',
                displayValue: 'L2',
                displayCategory: 'B',
              },
            ],
          })),
        ),
    );
    const rows = await adapter.getLeafProperties(['Level']);
    expect(rows.every((row) => row.properties.Level === 'L1')).toBe(true);
  });

  it('tags its container so scripts find this viewer', async () => {
    await adapter.loadModels([{ urn: 'a' }]);
    const tagged = host as HTMLElement & { bshViewer?: unknown };
    expect(host.dataset.bshViewer).toBe('');
    expect(tagged.bshViewer).toBe(viewer());
    adapter.destroy();
    expect(host.dataset.bshViewer).toBeUndefined();
    expect(tagged.bshViewer).toBeUndefined();
  });

  it('returns an error entry when adding to a viewer that cannot load', async () => {
    env.specs.set('bad', { fail: 'gone' });
    const info = await adapter.addModel({ urn: 'bad', name: 'Bad.rvt' });
    expect(info).toMatchObject({ id: 'bad', status: 'error' });
  });
});

describe('federation helpers', () => {
  function doc(
    defaultIs2d: boolean | null,
    matches: unknown[] = [],
  ): ViewingDocument {
    const node = defaultIs2d === null ? {} : { is2D: () => defaultIs2d };
    return {
      getRoot: () => ({
        getDefaultGeometry: () => node,
        search: () => matches,
      }),
    };
  }

  it('reads the node dimension', () => {
    expect(nodeIs2d({ is2D: () => true })).toBe(true);
    expect(nodeIs2d({ is3D: () => true })).toBe(false);
    expect(nodeIs2d({})).toBeUndefined();
    expect(nodeIs2d(null)).toBeUndefined();
  });

  it('picks a node that matches the anchor dimension', () => {
    const anchor3d = { is2d: false };
    const alt = { is2D: () => false };
    expect(pickGeometryNode(doc(true), null)).toEqual(
      expect.objectContaining({}),
    );
    expect(pickGeometryNode(doc(true, [alt]), anchor3d)).toBe(alt);
    expect(() => pickGeometryNode(doc(true), anchor3d)).toThrow(
      NO_MATCHING_VIEW_MESSAGE['3d'],
    );
    expect(() => pickGeometryNode(doc(false), { is2d: true })).toThrow(
      NO_MATCHING_VIEW_MESSAGE['2d'],
    );
    expect(pickGeometryNode(doc(null), anchor3d)).toEqual({});
  });

  it('builds load options from the anchor', () => {
    expect(federatedLoadOptions(null)).toEqual({
      keepCurrentModels: true,
      applyRefPoint: true,
    });
    expect(federatedLoadOptions({ is2d: true })).toEqual({
      keepCurrentModels: true,
      applyRefPoint: true,
    });
    const model = new FakeModel(
      'a',
      { globalOffset: OFFSET },
      { unit: 'm' },
      false,
    );
    expect(anchorOf(model)).toEqual({
      globalOffset: OFFSET,
      unit: 'm',
      is2d: false,
    });
    expect(anchorOf(new FakeModel('s', {}, {}, true)).unit).toBeUndefined();
  });
});

describe('models far apart', () => {
  beforeEach(() => {
    env.specs.set('arch', { center: [0, 0, 0], size: 100, unit: 'ft' });
    env.specs.set('far', { center: [1_000_000, 0, 0], size: 100 });
  });

  it('reports the spread and frames the anchor first', async () => {
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'far' }]);
    const spread = adapter.getSpread();
    expect(spread?.farApart).toBe(true);
    expect(spread?.distanceMeters).toBeCloseTo(1_000_000 * 0.3048, 0);
    expect(viewer().fitted).toHaveLength(1);
    expect(viewer().fitted[0]?.min.x).toBe(-50);
    expect(viewer().fits).toBe(0);
  });

  it('brings models together for viewing and restores them', async () => {
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'far' }]);
    const offsets = adapter.getTogetherOffsets();
    expect(offsets).toEqual({ far: [-1_000_000, 0, 0] });
    adapter.setModelOffsets(offsets);
    const far = viewer().modelOf('far');
    expect(far.getBoundingBox().min.x).toBe(-50);
    expect(viewer().fits).toBe(1);
    expect(adapter.getSpread()?.farApart).toBe(true);
    adapter.setModelVisible('far', false);
    adapter.setModelVisible('far', true);
    expect(far.getBoundingBox().min.x).toBe(-50);
    adapter.setModelOffsets(null);
    expect(far.getBoundingBox().min.x).toBe(1_000_000 - 50);
    expect(viewer().fitted).toHaveLength(2);
  });

  it('applies a saved offset to a model that loads later', async () => {
    await adapter.loadModels([{ urn: 'arch' }]);
    adapter.setModelOffsets({ far: [-1_000_000, 0, 0] });
    await adapter.addModel({ urn: 'far' });
    expect(viewer().modelOf('far').getBoundingBox().min.x).toBe(-50);
  });

  it('does not warn for models that sit together', async () => {
    env.specs.set('near', { center: [20, 0, 0], size: 100 });
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'near' }]);
    expect(adapter.getSpread()?.farApart).toBe(false);
    expect(viewer().fits).toBe(1);
  });
});

describe('selecting and isolating by model', () => {
  it('selects per model and isolates only models with matches', async () => {
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'str' }]);
    adapter.selectModelIds([
      { modelId: 'arch', dbId: 3 },
      { modelId: 'arch', dbId: 4 },
      { modelId: 'str', dbId: 9 },
    ]);
    expect(adapter.getModelSelection()).toEqual([
      { modelId: 'arch', dbId: 3 },
      { modelId: 'arch', dbId: 4 },
      { modelId: 'str', dbId: 9 },
    ]);
    adapter.selectModelIds([{ modelId: 'str', dbId: 9 }]);
    expect(adapter.getModelSelection()).toEqual([{ modelId: 'str', dbId: 9 }]);
    adapter.isolateModelIds([{ modelId: 'arch', dbId: 3 }]);
    const arch = viewer().modelOf('arch');
    const str = viewer().modelOf('str');
    expect(viewer().isolated.get(arch)).toEqual([3]);
    expect(viewer().isolated.get(str)).toEqual([-1]);
    adapter.isolateModelIds([]);
    expect(viewer().isolated.get(arch)).toEqual([]);
    expect(viewer().isolated.get(str)).toEqual([]);
  });

  it('hides per model and shows everything again', async () => {
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'str' }]);
    const arch = viewer().modelOf('arch');
    const str = viewer().modelOf('str');
    adapter.hideModelIds([
      { modelId: 'arch', dbId: 3 },
      { modelId: 'arch', dbId: 4 },
    ]);
    expect(viewer().getHiddenNodes(arch)).toEqual([3, 4]);
    expect(viewer().getHiddenNodes(str)).toEqual([]);
    adapter.isolateModelIds([{ modelId: 'str', dbId: 9 }]);
    adapter.showAll();
    expect(viewer().getHiddenNodes(arch)).toEqual([]);
    expect(viewer().isolated.get(arch)).toEqual([]);
    expect(viewer().isolated.get(str)).toEqual([]);
  });

  it('shows hidden elements of one model again', async () => {
    await adapter.loadModels([{ urn: 'arch' }]);
    adapter.hideModelIds([{ modelId: 'arch', dbId: 11 }]);
    adapter.showModelIds([{ modelId: 'arch', dbId: 11 }]);
    expect(await adapter.getVisible()).toContainEqual({
      modelId: 'arch',
      dbId: 11,
    });
  });

  it('signals visibility changes from hide, show and isolate', async () => {
    await adapter.loadModels([{ urn: 'arch' }]);
    const seen = vi.fn();
    const off = adapter.onVisibilityChange(seen);
    adapter.hideModelIds([{ modelId: 'arch', dbId: 3 }]);
    expect(seen).toHaveBeenCalledTimes(1);
    adapter.isolateModelIds([{ modelId: 'arch', dbId: 4 }]);
    expect(seen).toHaveBeenCalledTimes(2);
    adapter.showAll();
    expect(seen.mock.calls.length).toBeGreaterThan(2);
    off();
    const total = seen.mock.calls.length;
    adapter.hideModelIds([{ modelId: 'arch', dbId: 5 }]);
    expect(seen).toHaveBeenCalledTimes(total);
  });

  it('keeps the selection when fitting a group that spans two models', async () => {
    await adapter.loadModels([{ urn: 'arch' }, { urn: 'str' }]);
    const keep = [{ modelId: 'arch', dbId: 7 }];
    adapter.selectModelIds(keep);
    adapter.fitToView([
      { modelId: 'arch', dbId: 3 },
      { modelId: 'str', dbId: 9 },
    ]);
    expect(adapter.getModelSelection()).toEqual(keep);
  });

  it('fits the view to the selection', async () => {
    await adapter.loadModels([{ urn: 'arch' }]);
    const before = viewer().fits;
    adapter.fitToView();
    expect(viewer().fits).toBe(before + 1);
  });
});
