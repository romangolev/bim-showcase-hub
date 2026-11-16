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
  selectionIds,
} from './federation.js';
import { RealViewerAdapter } from './RealViewerAdapter.js';

let env: FakeEnvironment;
let host: HTMLElement;
let adapter: RealViewerAdapter;

beforeEach(() => {
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

  it('unloads a model removed while it was loading', async () => {
    const gate = deferred();
    env.gate.set('slow', gate.promise);
    await adapter.loadModels([{ urn: 'arch' }]);
    const adding = adapter.addModel({ urn: 'slow' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    adapter.removeModel('slow');
    gate.release();
    await adding;
    expect(viewer().models.map((m) => m.urn)).toEqual(['arch']);
    expect(viewer().unloaded.map((m) => m.urn)).toEqual(['slow']);
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

describe('federated selection, paint and properties', () => {
  it('listens to the aggregate selection event only', async () => {
    await adapter.loadModels([{ urn: 'a' }, { urn: 'b' }]);
    expect(viewer().listenerCount(FAKE_AGGREGATE_EVENT)).toBe(1);
    expect(viewer().listenerCount(FAKE_SELECTION_EVENT)).toBe(0);
    const seen: number[][] = [];
    adapter.onSelectionChange((ids) => seen.push(ids));
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

  it('paints legacy ids on the first model', async () => {
    await adapter.loadModels([{ urn: 'a' }, { urn: 'b' }]);
    adapter.setThemingColor([11], [1, 0, 0, 1]);
    expect(viewer().themed).toEqual([
      { model: viewer().modelOf('a'), dbId: 11 },
    ]);
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

  it('flattens aggregate and single selection events', () => {
    const model = new FakeModel('a', {}, {}, false);
    expect(
      selectionIds({
        selections: [
          { model, dbIdArray: [1, 2] },
          { model, dbIdArray: [1] },
        ],
      }),
    ).toEqual([1, 2, 1]);
    expect(selectionIds({ dbIdArray: [4] })).toEqual([4]);
    expect(selectionIds({})).toEqual([]);
  });
});
