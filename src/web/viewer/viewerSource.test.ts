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
  chunks?: number[][];
}

function model(options: FakeOptions): ViewerModel {
  const fake: Partial<ViewerModel> = {
    getFragmentList: () => fragments(options.dbIds),
    getUnitScale: () => 1,
    isLoadDone: () => options.loaded ?? true,
    getExternalIdMapping: options.externalIds
      ? (ok) => ok(options.externalIds as Record<string, number>)
      : undefined,
    getBulkProperties: (ids, _opts, ok) => {
      options.chunks?.push([...ids]);
      const items: BulkPropertyItem[] = ids.map((dbId) => ({
        dbId,
        name: `Element ${dbId}`,
        properties: [
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
