import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExportSheets, MODEL_COLUMN } from '../extensions/excelExport.js';
import { paintSelection } from '../extensions/paintBrushes.js';
import {
  type FakeEnvironment,
  type FakeFederatedViewer,
  installFakeFederation,
} from './fakeFederatedViewer.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { buildMockElements } from './mockModel.js';
import { ALL_MODELS, scopeRows, unavailableModels } from './modelScope.js';
import { type ModelDbId, type ModelInfo, ModelSetError } from './modelSet.js';
import { RealViewerAdapter } from './RealViewerAdapter.js';
import { readLeafRows } from './sharedLeafRows.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

interface Harness {
  adapter: ViewerAdapter;
  failingUrn: string;
  dbIds: () => number[];
  select: (items: ModelDbId[]) => void;
  painted: (modelId: string) => number[];
  cleanup: () => void;
}

interface HarnessFactory {
  name: string;
  create: () => Harness;
}

const mockFactory: HarnessFactory = {
  name: 'mock',
  create: () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const adapter = new MockViewerAdapter(host);
    return {
      adapter,
      failingUrn: 'urn-broken',
      dbIds: () => buildMockElements().map((element) => element.dbId),
      select: (items) => adapter.selectModelIds(items),
      painted: (modelId) =>
        [
          ...host.querySelectorAll<SVGElement>(
            `[data-model-id="${modelId}"] .bsh-mock__el--themed`,
          ),
        ].map((node) => Number(node.dataset.dbid)),
      cleanup: () => {
        adapter.destroy();
        host.remove();
      },
    };
  },
};

let env: FakeEnvironment;

const realFactory: HarnessFactory = {
  name: 'real',
  create: () => {
    env = installFakeFederation();
    env.specs.set('urn-bad', { fail: 'Not found' });
    env.specs.set('urn-noprops', { propsFail: 'db' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const adapter = new RealViewerAdapter(host);
    const viewer = () => env.viewers.at(-1) as FakeFederatedViewer;
    return {
      adapter,
      failingUrn: 'urn-bad',
      dbIds: () => [11, 12, 13],
      select: (items) => {
        const byModel = new Map<string, number[]>();
        for (const { modelId, dbId } of items) {
          byModel.set(modelId, [...(byModel.get(modelId) ?? []), dbId]);
        }
        for (const [modelId, ids] of byModel) viewer().selectIn(modelId, ids);
      },
      painted: (modelId) =>
        viewer()
          .themed.filter(
            (entry) =>
              (entry.model as { urn?: string } | undefined)?.urn === modelId,
          )
          .map((entry) => entry.dbId),
      cleanup: () => {
        adapter.destroy();
        host.remove();
      },
    };
  },
};

let harness: Harness | null = null;

afterEach(() => {
  harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
});

function statuses(models: ModelInfo[]) {
  return models.map((model) => [model.id, model.status]);
}

describe.each([mockFactory, realFactory])(
  'model set contract ($name)',
  (factory) => {
    function setup(): Harness {
      harness = factory.create();
      return harness;
    }

    it('keeps the single-model API working', async () => {
      const { adapter } = setup();
      await adapter.load('urn-a');
      expect(statuses(adapter.getModels())).toEqual([['urn-a', 'ready']]);
      const rows = await adapter.getLeafProperties(['Category']);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.modelId === 'urn-a')).toBe(true);
    });

    it('loads several models into one scene in order', async () => {
      const { adapter } = setup();
      const seen: string[][] = [];
      adapter.onModelsChange((models) =>
        seen.push(models.map((m) => `${m.id}:${m.status}`)),
      );
      const models = await adapter.loadModels([
        { urn: 'urn-a', name: 'Arch.rvt' },
        { urn: 'urn-b', name: 'Struct.rvt' },
        { urn: 'urn-c' },
      ]);
      expect(statuses(models)).toEqual([
        ['urn-a', 'ready'],
        ['urn-b', 'ready'],
        ['urn-c', 'ready'],
      ]);
      expect(models.map((m) => m.name)).toEqual([
        'Arch.rvt',
        'Struct.rvt',
        'Model 3',
      ]);
      expect(seen.at(-1)).toEqual([
        'urn-a:ready',
        'urn-b:ready',
        'urn-c:ready',
      ]);
    });

    it('isolates a failing model and keeps the others', async () => {
      const { adapter, failingUrn } = setup();
      const models = await adapter.loadModels([
        { urn: 'urn-a' },
        { urn: failingUrn },
        { urn: 'urn-c' },
      ]);
      expect(statuses(models)).toEqual([
        ['urn-a', 'ready'],
        [failingUrn, 'error'],
        ['urn-c', 'ready'],
      ]);
      expect(models[1]?.error).toBeTruthy();
      const rows = await adapter.getLeafProperties(['Category']);
      expect(new Set(rows.map((row) => row.modelId))).toEqual(
        new Set(['urn-a', 'urn-c']),
      );
    });

    it('retries a failed model and does not count it toward the cap', async () => {
      const { adapter, failingUrn } = setup();
      await adapter.loadModels([{ urn: 'urn-0' }, { urn: failingUrn }]);
      for (let i = 1; i < 6; i++) await adapter.addModel({ urn: `urn-${i}` });
      expect(adapter.getModels()).toHaveLength(7);
      await expect(adapter.addModel({ urn: 'urn-x' })).rejects.toMatchObject({
        code: 'limit',
      });
      adapter.removeModel('urn-5');
      const retried = await adapter.addModel({ urn: failingUrn });
      expect(retried).toMatchObject({ id: failingUrn, status: 'error' });
      expect(adapter.getModels().map((m) => m.id)).toEqual([
        'urn-0',
        failingUrn,
        'urn-1',
        'urn-2',
        'urn-3',
        'urn-4',
      ]);
    });

    it('reports a model whose properties cannot be read', async () => {
      const { adapter } = setup();
      await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-noprops' }]);
      const rows = await adapter.getLeafProperties(['Category']);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.modelId === 'urn-a')).toBe(true);
      const unavailable = unavailableModels(adapter.getModels());
      expect(unavailable.map((m) => m.id)).toEqual(['urn-noprops']);
      expect(unavailable[0]?.propertiesError).toMatch(
        /^Properties could not be read/,
      );
      expect(unavailable[0]?.status).toBe('ready');
      adapter.removeModel('urn-a');
      await expect(adapter.getLeafProperties(['Category'])).rejects.toThrow();
    });

    it('reads only visible models and re-reads when one is shown', async () => {
      const { adapter } = setup();
      await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
      const both = await readLeafRows(adapter, ['Category']);
      adapter.setModelVisible('urn-b', false);
      const visible = await readLeafRows(adapter, ['Category']);
      expect(visible).toHaveLength(both.length / 2);
      expect(visible.every((row) => row.modelId === 'urn-a')).toBe(true);
      adapter.setModelVisible('urn-b', true);
      expect(await readLeafRows(adapter, ['Category'])).toHaveLength(
        both.length,
      );
    });

    it('rejects when every model fails', async () => {
      const { adapter, failingUrn } = setup();
      await expect(adapter.load(failingUrn)).rejects.toThrow();
      expect(statuses(adapter.getModels())).toEqual([[failingUrn, 'error']]);
    });

    it('enforces the cap of six and prevents duplicates', async () => {
      const { adapter } = setup();
      const seven = Array.from({ length: 7 }, (_, i) => ({ urn: `urn-${i}` }));
      await expect(adapter.loadModels(seven)).rejects.toBeInstanceOf(
        ModelSetError,
      );
      await adapter.loadModels(seven.slice(0, 6));
      await expect(adapter.addModel({ urn: 'urn-x' })).rejects.toMatchObject({
        code: 'limit',
      });
      adapter.removeModel('urn-5');
      await expect(adapter.addModel({ urn: 'urn-0' })).rejects.toMatchObject({
        code: 'duplicate',
      });
      const added = await adapter.addModel({ urn: 'urn-x', name: 'MEP' });
      expect(added).toMatchObject({
        id: 'urn-x',
        status: 'ready',
        name: 'MEP',
      });
      expect(adapter.getModels()).toHaveLength(6);
    });

    it('pairs every selected dbId with its model', async () => {
      const { adapter, dbIds, select } = setup();
      await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
      const [first, second] = dbIds();
      const seen: number[][] = [];
      adapter.onSelectionChange((ids) => seen.push(ids));
      select([
        { modelId: 'urn-a', dbId: first ?? 0 },
        { modelId: 'urn-b', dbId: first ?? 0 },
        { modelId: 'urn-b', dbId: second ?? 0 },
      ]);
      const selection = adapter.getModelSelection();
      expect(selection).toHaveLength(3);
      expect(selection).toEqual(
        expect.arrayContaining([
          { modelId: 'urn-a', dbId: first },
          { modelId: 'urn-b', dbId: first },
          { modelId: 'urn-b', dbId: second },
        ]),
      );
      expect(adapter.getSelection()).toHaveLength(3);
      expect(seen.at(-1)).toHaveLength(3);
    });

    it('paints the selection across models and only those elements', async () => {
      const { adapter, dbIds, select, painted } = setup();
      await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
      const [first, second] = dbIds();
      select([
        { modelId: 'urn-a', dbId: first ?? 0 },
        { modelId: 'urn-b', dbId: second ?? 0 },
      ]);
      expect(paintSelection(adapter, [1, 0, 0, 0.5])).toBe(true);
      expect(painted('urn-a')).toEqual([first]);
      expect(painted('urn-b')).toEqual([second]);
      expect(adapter.getModelSelection()).toEqual([]);
    });

    it('tags rows per model and scopes them', async () => {
      const { adapter } = setup();
      await adapter.loadModels([
        { urn: 'urn-a', name: 'Arch' },
        { urn: 'urn-b', name: 'Struct' },
      ]);
      const rows = await readLeafRows(adapter, ['Category']);
      const perModel = scopeRows(rows, 'urn-a').length;
      expect(perModel).toBeGreaterThan(0);
      expect(scopeRows(rows, 'urn-b')).toHaveLength(perModel);
      expect(scopeRows(rows, ALL_MODELS)).toHaveLength(perModel * 2);
      expect(new Set(rows.map((row) => row.modelName))).toEqual(
        new Set(['Arch', 'Struct']),
      );
      const sheets = buildExportSheets(rows, ['Category', 'Name'], null);
      expect(sheets[0]?.header[0]).toBe(MODEL_COLUMN);
      expect(sheets[0]?.rows[0]?.[0]).toBe('Arch');
    });

    it('re-reads rows after the model set changes', async () => {
      const { adapter } = setup();
      await adapter.loadModels([{ urn: 'urn-a' }]);
      const one = await readLeafRows(adapter, ['Category']);
      await adapter.addModel({ urn: 'urn-b' });
      const two = await readLeafRows(adapter, ['Category']);
      expect(two).toHaveLength(one.length * 2);
      adapter.removeModel('urn-a');
      const after = await readLeafRows(adapter, ['Category']);
      expect(after.every((row) => row.modelId === 'urn-b')).toBe(true);
    });

    it('removes a model and its selection, keeping the rest', async () => {
      const { adapter, dbIds, select } = setup();
      await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
      const [first] = dbIds();
      select([
        { modelId: 'urn-a', dbId: first ?? 0 },
        { modelId: 'urn-b', dbId: first ?? 0 },
      ]);
      const seen: number[][] = [];
      adapter.onSelectionChange((ids) => seen.push(ids));
      adapter.removeModel('urn-a');
      adapter.removeModel('missing');
      expect(statuses(adapter.getModels())).toEqual([['urn-b', 'ready']]);
      expect(adapter.getModelSelection()).toEqual([
        { modelId: 'urn-b', dbId: first },
      ]);
      expect(seen.at(-1)).toEqual([first]);
    });

    it('hides and shows a model and drops hidden selection', async () => {
      const { adapter, dbIds, select } = setup();
      await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
      const [first] = dbIds();
      select([
        { modelId: 'urn-a', dbId: first ?? 0 },
        { modelId: 'urn-b', dbId: first ?? 0 },
      ]);
      const seen: number[][] = [];
      adapter.onSelectionChange((ids) => seen.push(ids));
      adapter.setModelVisible('urn-b', false);
      expect(adapter.getModels().map((m) => m.visible)).toEqual([true, false]);
      expect(adapter.getModelSelection()).toEqual([
        { modelId: 'urn-a', dbId: first },
      ]);
      expect(adapter.getSelection()).toEqual([first]);
      expect(seen.at(-1)).toEqual([first]);
      adapter.setModelVisible('urn-b', true);
      expect(adapter.getModels().map((m) => m.visible)).toEqual([true, true]);
      expect(adapter.getModelSelection()).toEqual([
        { modelId: 'urn-a', dbId: first },
      ]);
    });

    it('stops notifying model listeners after unsubscribe and destroy', async () => {
      const { adapter } = setup();
      const cb = vi.fn();
      const off = adapter.onModelsChange(cb);
      off();
      await adapter.loadModels([{ urn: 'urn-a' }]);
      expect(cb).not.toHaveBeenCalled();
      const later = vi.fn();
      adapter.onModelsChange(later);
      adapter.destroy();
      adapter.destroy();
      expect(later).toHaveBeenCalledTimes(1);
      expect(later).toHaveBeenLastCalledWith([]);
      expect(await adapter.loadModels([{ urn: 'urn-b' }])).toEqual([]);
      expect(later).toHaveBeenCalledTimes(1);
    });
  },
);
