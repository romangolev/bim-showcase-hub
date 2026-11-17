import { describe, expect, it } from 'vitest';
import type {
  BulkPropertyItem,
  FragmentList,
  GuiViewer3D,
  ViewerModel,
} from './autodesk.js';
import { readViewerSource } from './viewerSource.js';

const TRIANGLE = {
  vb: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  vbstride: 3,
  ib: new Uint16Array([0, 1, 2]),
  attributes: { position: { offset: 0 } },
};

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function fragments(dbIds: (number | number[])[]): FragmentList {
  return {
    getCount: () => dbIds.length,
    getDbIds: (fragId) => dbIds[fragId] as number | number[],
    getVizmesh: () => ({
      geometry: TRIANGLE,
      matrixWorld: { elements: IDENTITY },
      material: { color: { r: 1, g: 0, b: 0 } },
    }),
    isLine: () => false,
    isPoint: () => false,
    isNotLoaded: () => false,
  };
}

interface FakeOptions {
  dbIds: (number | number[])[];
  loaded?: boolean;
  externalIds?: Record<string, number>;
  bulkExternalIds?: Record<number, string>;
  mappingCalls?: number[];
  levelRefs?: Record<number, unknown>;
  plainLevels?: number[];
  nodes?: Record<number, string>;
  chunks?: number[][];
}

function model(options: FakeOptions): ViewerModel {
  const fake: Partial<ViewerModel> = {
    getFragmentList: () => fragments(options.dbIds),
    getUnitScale: () => 1,
    isLoadDone: () => options.loaded ?? true,
    getExternalIdMapping: options.externalIds
      ? (ok) => {
          options.mappingCalls?.push(1);
          ok(options.externalIds as Record<string, number>);
        }
      : undefined,
    getBulkProperties: (ids, _opts, ok) => {
      options.chunks?.push([...ids]);
      const elementIds = new Set(options.dbIds.flat());
      const nodes = options.nodes;
      const known = nodes
        ? ids.filter((id) => elementIds.has(id) || id in nodes)
        : ids;
      const items: BulkPropertyItem[] = known.map((dbId) => ({
        dbId,
        name: options.nodes?.[dbId] ?? `Element ${dbId}`,
        ...(options.bulkExternalIds?.[dbId]
          ? { externalId: options.bulkExternalIds[dbId] }
          : {}),
        properties: [
          ...(options.levelRefs?.[dbId] !== undefined
            ? [
                {
                  displayName: 'Level',
                  displayValue: options.levelRefs[dbId],
                  displayCategory: '__internalref__',
                },
              ]
            : []),
          ...(options.plainLevels?.includes(dbId)
            ? [
                {
                  displayName: 'Level',
                  displayValue: 'Plain',
                  displayCategory: 'Constraints',
                },
              ]
            : []),
          {
            displayName: 'Category',
            displayValue: 'Revit Walls',
            displayCategory: 'Identity',
          },
          {
            displayName: 'Mark',
            displayValue: '',
            displayCategory: 'Identity',
          },
          {
            displayName: 'Height',
            displayValue: 2.5,
            displayCategory: 'Dimensions',
          },
          {
            displayName: 'Hidden',
            displayValue: 'x',
            displayCategory: '__internal__',
          },
          { displayName: 'Flag', displayValue: true, displayCategory: 'Other' },
          {
            displayName: 'Odd',
            displayValue: { a: 1 },
            displayCategory: 'Other',
          },
        ],
      }));
      ok(items);
    },
  };
  return fake as ViewerModel;
}

function viewerOf(models: ViewerModel[]): GuiViewer3D {
  return { getAllModels: () => models } as unknown as GuiViewer3D;
}

const META = { id: 'a', name: 'Tower.rvt', urn: 'urn-a' };

describe('readViewerSource', () => {
  it('groups fragments by dbId and reads properties and external ids', async () => {
    const m = model({ dbIds: [5, 5, 6], externalIds: { 'guid-5': 5 } });
    const result = await readViewerSource(viewerOf([m]), new Map([[m, META]]));
    expect(result.skipped).toBe(0);
    const [source] = result.models;
    expect(source?.id).toBe('a');
    expect(source?.name).toBe('Tower.rvt');
    expect(source?.elements.map((e) => e.dbId)).toEqual([5, 6]);
    const first = source?.elements[0];
    expect(first?.parts).toHaveLength(2);
    expect(first?.externalId).toBe('guid-5');
    expect(source?.elements[1]?.externalId).toBeUndefined();
    expect(first?.name).toBe('Element 5');
    expect(first?.properties).toEqual({
      Identity: { Category: 'Revit Walls' },
      Dimensions: { Height: 2.5 },
      Other: { Flag: true, Odd: '[object Object]' },
    });
  });

  it('reads the external id from the bulk item without loading the mapping', async () => {
    const mappingCalls: number[] = [];
    const m = model({
      dbIds: [5, 6],
      bulkExternalIds: { 5: 'bulk-5', 6: 'bulk-6' },
      externalIds: { 'map-5': 5 },
      mappingCalls,
    });
    const result = await readViewerSource(viewerOf([m]), new Map([[m, META]]));
    expect(result.models[0]?.elements.map((e) => e.externalId)).toEqual([
      'bulk-5',
      'bulk-6',
    ]);
    expect(mappingCalls).toHaveLength(0);
  });

  it('falls back to the mapping for items without an external id', async () => {
    const m = model({
      dbIds: [5, 6],
      bulkExternalIds: { 5: 'bulk-5' },
      externalIds: { 'map-6': 6 },
    });
    const result = await readViewerSource(viewerOf([m]), new Map([[m, META]]));
    expect(result.models[0]?.elements.map((e) => e.externalId)).toEqual([
      'bulk-5',
      'map-6',
    ]);
  });

  it('keeps the Revit category that the viewer stores in a hidden group', async () => {
    const m = model({ dbIds: [5] });
    const inner = m.getBulkProperties.bind(m);
    m.getBulkProperties = (ids, opts, ok, fail) =>
      inner(
        ids,
        opts,
        (items) =>
          ok(
            items.map((item) => ({
              ...item,
              properties: [
                {
                  displayName: 'Category',
                  displayValue: 'Revit Doors',
                  displayCategory: '__category__',
                },
                {
                  displayName: 'CategoryId',
                  displayValue: -2000023,
                  displayCategory: '__categoryId__',
                },
              ],
            })),
          ),
        fail,
      );
    const result = await readViewerSource(viewerOf([m]), new Map([[m, META]]));
    expect(result.models[0]?.elements[0]?.properties).toEqual({
      Other: { Category: 'Revit Doors' },
    });
  });

  describe('level references', () => {
    async function levelsOf(options: FakeOptions) {
      const m = model(options);
      const result = await readViewerSource(
        viewerOf([m]),
        new Map([[m, META]]),
      );
      return result.models[0]?.elements.map((e) => e.properties);
    }

    it('resolves an internal level reference to the node name', async () => {
      const props = await levelsOf({
        dbIds: [5, 6],
        levelRefs: { 5: 2, 6: '3' },
        nodes: { 2: 'Ground [311]', 3: 'First' },
      });
      expect(props?.[0]?.Constraints).toEqual({ Level: 'Ground' });
      expect(props?.[1]?.Constraints).toEqual({ Level: 'First' });
      expect(JSON.stringify(props)).not.toContain('__internalref__');
    });

    it('keeps a plain Level over the reference', async () => {
      const props = await levelsOf({
        dbIds: [5],
        levelRefs: { 5: 2 },
        plainLevels: [5],
        nodes: { 2: 'Ground' },
      });
      expect(props?.[0]?.Constraints).toEqual({ Level: 'Plain' });
    });

    it('leaves elements alone when the id cannot be resolved', async () => {
      const props = await levelsOf({
        dbIds: [5, 6, 7],
        levelRefs: { 5: 99, 6: 2, 7: 'abc' },
        nodes: { 2: '' },
      });
      for (const p of props ?? []) expect(p.Constraints).toBeUndefined();
    });

    it('reads shared level ids once and in chunks', async () => {
      const chunks: number[][] = [];
      const dbIds = Array.from({ length: 5 }, (_, i) => 10 + i);
      const levelRefs: Record<number, number> = {};
      const nodes: Record<number, string> = {};
      for (const id of dbIds) levelRefs[id] = id % 2 === 0 ? 2 : 3;
      nodes[2] = 'A';
      nodes[3] = 'B';
      await levelsOf({ dbIds, levelRefs, nodes, chunks });
      const levelReads = chunks.slice(1);
      expect(levelReads).toEqual([[2, 3]]);

      const many: number[][] = [];
      const ids = Array.from({ length: 1500 }, (_, i) => 5000 + i);
      const refs: Record<number, number> = {};
      const names: Record<number, string> = {};
      ids.forEach((id, i) => {
        refs[id] = i;
        names[i] = `L${i}`;
      });
      await levelsOf({
        dbIds: ids.slice(0, 1500),
        levelRefs: refs,
        nodes: names,
        chunks: many,
      });
      expect(many.slice(2).map((c) => c.length)).toEqual([1000, 500]);
    });
  });

  it('counts fragments that hold several elements as skipped', async () => {
    const m = model({ dbIds: [5, [6, 7]] });
    const result = await readViewerSource(viewerOf([m]), new Map([[m, META]]));
    expect(result.models[0]?.elements.map((e) => e.dbId)).toEqual([5]);
    expect(result.skipped).toBe(1);
  });

  it('reads properties in chunks', async () => {
    const chunks: number[][] = [];
    const ids = Array.from({ length: 2500 }, (_, i) => i + 1);
    const m = model({ dbIds: ids, chunks });
    await readViewerSource(viewerOf([m]), new Map([[m, META]]));
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 500]);
  });

  it('reads several models and keeps one source model each', async () => {
    const a = model({ dbIds: [1] });
    const b = model({ dbIds: [1, 2] });
    const result = await readViewerSource(
      viewerOf([a, b]),
      new Map([
        [a, META],
        [b, { id: 'b', name: 'Annex.rvt', urn: 'urn-b' }],
      ]),
    );
    expect(result.models.map((m) => [m.id, m.elements.length])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('skips a model without geometry and fails when nothing is left', async () => {
    const empty = model({ dbIds: [] });
    const good = model({ dbIds: [1] });
    const ok = await readViewerSource(
      viewerOf([empty, good]),
      new Map([
        [empty, META],
        [good, { id: 'b', name: 'B', urn: 'urn-b' }],
      ]),
    );
    expect(ok.models.map((m) => m.id)).toEqual(['b']);
    await expect(
      readViewerSource(viewerOf([empty]), new Map([[empty, META]])),
    ).rejects.toThrow('no viewable geometry');
  });

  it('refuses while a model is still loading', async () => {
    const m = model({ dbIds: [1], loaded: false });
    await expect(
      readViewerSource(viewerOf([m]), new Map([[m, META]])),
    ).rejects.toThrow('still loading');
  });
});
