import { describe, expect, it, vi } from 'vitest';
import type { IfcSettings, IfcSourceRead } from '../ifc/types.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { describeIfcStatus, exportToIfc } from './ifcExport.js';

const SETTINGS: IfcSettings = {
  classOverrides: {},
  psetExclude: [],
  psetInclude: [],
  levelProperty: 'Level',
  fallbackStorey: 'Unassigned',
  projectName: 'Tower',
  siteName: 'Site',
  buildingName: '',
  author: '',
  organisation: '',
  lengthUnit: 'm',
};

function source(skipped = 0, elements = 1): IfcSourceRead {
  return {
    skipped,
    models: [
      {
        id: 'a',
        name: 'Tower.rvt',
        urn: 'urn-a',
        elements: Array.from({ length: elements }, (_, i) => ({
          dbId: i + 1,
          name: `Wall ${i + 1}`,
          properties: { Identity: { Category: 'Revit Walls' } },
          parts: [
            {
              positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
              indices: new Uint16Array([0, 1, 2]),
            },
          ],
        })),
      },
    ],
  };
}

function adapterWith(read: IfcSourceRead): ViewerAdapter {
  return {
    getIfcSource: async () => read,
    getModels: () => [
      { id: 'a', urn: 'a', name: 'Tower.rvt', visible: true, status: 'ready' },
    ],
  } as unknown as ViewerAdapter;
}

describe('exportToIfc', () => {
  it('saves an IFC file and reports counts', async () => {
    const save = vi.fn();
    const phases: string[] = [];
    const status = await exportToIfc(adapterWith(source(0, 2)), {
      fileName: 'tower.ifc',
      settings: () => SETTINGS,
      save,
      onStatus: (next) => phases.push(next.phase),
    });
    expect(status).toMatchObject({
      phase: 'done',
      fileName: 'tower.ifc',
      elementCount: 2,
      triangleCount: 2,
    });
    expect(phases).toEqual(['reading', 'building', 'done']);
    const blob = save.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/x-step');
    const text = await blob.text();
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text).toContain('IFCWALL(');
  });

  it('stops with a clear error when the file passes the size limit', async () => {
    const save = vi.fn();
    const status = await exportToIfc(adapterWith(source(0, 2)), {
      settings: () => SETTINGS,
      save,
      maxBytes: 100,
    });
    expect(status).toMatchObject({
      phase: 'error',
      message: expect.stringMatching(
        /^Export failed: the file would be larger than \d+ MB$/,
      ),
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('counts the exported elements, not the source elements', async () => {
    const read = source(0, 3);
    const first = read.models[0]?.elements[1];
    if (first) first.parts = [];
    const save = vi.fn();
    const status = await exportToIfc(adapterWith(read), {
      settings: () => SETTINGS,
      save,
    });
    expect(status).toMatchObject({ phase: 'done', elementCount: 2 });
  });

  it('reads the settings at export time', async () => {
    const save = vi.fn();
    let unit: 'm' | 'mm' = 'm';
    const options = {
      settings: () => ({ ...SETTINGS, lengthUnit: unit }),
      save,
    };
    await exportToIfc(adapterWith(source()), options);
    unit = 'mm';
    await exportToIfc(adapterWith(source()), options);
    const first = await (save.mock.calls[0] as [Blob])[0].text();
    const second = await (save.mock.calls[1] as [Blob])[0].text();
    expect(first).toContain('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
    expect(second).toContain('.MILLI.');
  });

  it('reports skipped fragments and missing models as a warning', async () => {
    const adapter = {
      getIfcSource: async () => source(3),
      getModels: () => [
        {
          id: 'b',
          urn: 'b',
          name: 'Annex.rvt',
          visible: true,
          status: 'loading',
        },
      ],
    } as unknown as ViewerAdapter;
    const status = await exportToIfc(adapter, { save: vi.fn() });
    expect(status).toMatchObject({
      phase: 'done',
      skipped: 3,
      missing: ['Annex.rvt'],
    });
    expect(describeIfcStatus(status)).toContain('3 fragments skipped');
    expect(describeIfcStatus(status)).toContain('missing Annex.rvt');
  });

  it('notes unavailable levels and generated ids', async () => {
    const adapter = {
      getIfcSource: async () => ({
        ...source(),
        levelsUnavailable: 1,
        generatedIds: 4,
      }),
      getModels: () => [],
    } as unknown as ViewerAdapter;
    const status = await exportToIfc(adapter, { save: vi.fn() });
    expect(describeIfcStatus(status)).toContain('levels unavailable');
    expect(describeIfcStatus(status)).toContain('4 ids generated');
  });

  it('reports an empty source without saving', async () => {
    const save = vi.fn();
    const status = await exportToIfc(adapterWith({ models: [], skipped: 0 }), {
      save,
    });
    expect(status.phase).toBe('empty');
    expect(save).not.toHaveBeenCalled();
  });

  it('reports reader failures as errors', async () => {
    const failing = {
      getIfcSource: async () => {
        throw new Error('The model is still loading');
      },
    } as unknown as ViewerAdapter;
    expect(await exportToIfc(failing)).toMatchObject({
      phase: 'error',
      message: 'Export failed: The model is still loading',
    });
  });
});
