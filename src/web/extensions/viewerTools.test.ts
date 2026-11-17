import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

const exportToXlsx = vi.fn(async () => undefined);
const exportGeometryToGlb = vi.fn(async () => undefined);
const exportToIfc = vi.fn(async () => undefined);

vi.mock('./excelExport.js', async (original) => ({
  ...(await original<typeof import('./excelExport.js')>()),
  exportToXlsx,
}));

vi.mock('./glbExport.js', async (original) => ({
  ...(await original<typeof import('./glbExport.js')>()),
  exportGeometryToGlb,
}));

vi.mock('./ifcExport.js', async (original) => ({
  ...(await original<typeof import('./ifcExport.js')>()),
  exportToIfc,
}));

const { DEFAULT_FILE_NAME, exportFileName } = await import('./excelExport.js');
const {
  buildToolGroupSpec,
  glbFileNameFrom,
  ifcFileNameFrom,
  modelKey,
  registerViewerTools,
  TOOL_GROUP_ID,
} = await import('./viewerTools.js');

const adapter = {} as ViewerAdapter;

function full(options: Parameters<typeof buildToolGroupSpec>[1] = {}) {
  const spec = buildToolGroupSpec(adapter, options);
  if (!spec.paint || !spec.export || !spec.geometry || !spec.ifc) {
    throw new Error('tool spec incomplete');
  }
  return {
    ...spec,
    paint: spec.paint,
    export: spec.export,
    geometry: spec.geometry,
    ifc: spec.ifc,
  };
}

function ids(spec: ReturnType<typeof full>): string[] {
  return [
    spec.id,
    spec.paint.id,
    spec.paint.reset.id,
    spec.export.id,
    spec.geometry.id,
    spec.ifc.id,
    ...spec.paint.swatches.map((swatch) => swatch.id),
  ];
}

afterEach(() => {
  exportToXlsx.mockClear();
  exportGeometryToGlb.mockClear();
  exportToIfc.mockClear();
});

describe('tool group ids per viewer', () => {
  it('derives a short stable key from the urn', () => {
    expect(modelKey('urn-a')).toBe(modelKey('urn-a'));
    expect(modelKey('urn-a')).not.toBe(modelKey('urn-b'));
    expect(modelKey('urn-a')).toMatch(/^[0-9a-z]{1,7}$/);
  });

  it('gives two viewers disjoint control ids and keeps the icons', () => {
    const a = full({ key: modelKey('urn-a') });
    const b = full({ key: modelKey('urn-b') });
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    expect(a.id.startsWith(`${TOOL_GROUP_ID}-`)).toBe(true);
    expect(a.paint.swatches.map((swatch) => swatch.icon)).toEqual(
      b.paint.swatches.map((swatch) => swatch.icon),
    );
  });

  it('keeps the plain ids without a key', () => {
    const spec = full();
    expect(spec.export.id).toBe('export-xlsx');
    expect(spec.geometry.id).toBe('export-glb');
    expect(spec.ifc.id).toBe('export-ifc');
    expect(spec.paint.id).toBe('paint');
  });

  it('exports under the model name and version', () => {
    const spec = full({
      fileName: () => exportFileName('Snowdon Towers Sample.rvt', 'v3'),
    });
    spec.export.onExport();
    expect(exportToXlsx).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({
        fileName: 'Snowdon-Towers-Sample-v3-properties.xlsx',
      }),
    );
  });

  it('exports geometry under the model name and version', () => {
    const spec = buildToolGroupSpec(adapter, {
      fileName: () => exportFileName('Snowdon Towers Sample.rvt', 'v3'),
    });
    spec.geometry?.onExport();
    expect(exportGeometryToGlb).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({
        fileName: 'Snowdon-Towers-Sample-v3-geometry.glb',
      }),
    );
  });

  it('exports IFC under the model name and the current settings getter', () => {
    const ifcSettings = vi.fn();
    const spec = buildToolGroupSpec(adapter, {
      fileName: () => exportFileName('Snowdon Towers Sample.rvt', 'v3'),
      ifcSettings,
    });
    spec.ifc?.onExport();
    expect(exportToIfc).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({
        fileName: 'Snowdon-Towers-Sample-v3.ifc',
        settings: ifcSettings,
      }),
    );
  });
});

describe('ifcFileNameFrom', () => {
  it('swaps the extension and drops the properties suffix', () => {
    expect(ifcFileNameFrom('Tower-v2-properties.xlsx')).toBe('Tower-v2.ifc');
    expect(ifcFileNameFrom('Tower.ifc')).toBe('Tower.ifc');
  });

  it('falls back without a file name', () => {
    expect(ifcFileNameFrom('')).toBe('model.ifc');
    expect(ifcFileNameFrom()).toBe('model.ifc');
  });
});

describe('glbFileNameFrom', () => {
  it('replaces the properties suffix with a geometry suffix', () => {
    expect(glbFileNameFrom('Tower-v2-properties.xlsx')).toBe(
      'Tower-v2-geometry.glb',
    );
    expect(glbFileNameFrom('Tower.glb')).toBe('Tower-geometry.glb');
    expect(glbFileNameFrom('Tower')).toBe('Tower-geometry.glb');
  });

  it('falls back without a file name', () => {
    expect(glbFileNameFrom()).toBe('model-geometry.glb');
    expect(glbFileNameFrom('   ')).toBe('model-geometry.glb');
  });
});

describe('exportFileName', () => {
  it('sanitizes the model name and version', () => {
    expect(exportFileName('Tower: Phase/2*.rvt', 'v12')).toBe(
      'Tower-Phase-2-v12-properties.xlsx',
    );
    expect(exportFileName('Café plan.nwd')).toBe('Cafe-plan-properties.xlsx');
  });

  it('falls back without a file name', () => {
    expect(exportFileName()).toBe(DEFAULT_FILE_NAME);
    expect(exportFileName('', 'v2')).toBe(DEFAULT_FILE_NAME);
    expect(exportFileName('***.rvt')).toBe(DEFAULT_FILE_NAME);
  });
});

describe('tool features', () => {
  it('omits disabled features from the tool group spec', () => {
    const mock = new MockViewerAdapter(document.createElement('div'));
    const all = buildToolGroupSpec(mock);
    expect(all.paint).toBeDefined();
    expect(all.export).toBeDefined();
    expect(all.geometry).toBeDefined();
    expect(all.ifc).toBeDefined();

    const paintOnly = buildToolGroupSpec(mock, {
      features: { paint: true, export: false, geometry: false, ifc: false },
    });
    expect(paintOnly.paint).toBeDefined();
    expect(paintOnly.export).toBeUndefined();

    const exportOnly = buildToolGroupSpec(mock, {
      features: { paint: false, export: true, geometry: false, ifc: false },
    });
    expect(exportOnly.paint).toBeUndefined();
    expect(exportOnly.export).toBeDefined();
    expect(exportOnly.geometry).toBeUndefined();

    const geometryOnly = buildToolGroupSpec(mock, {
      features: { paint: false, export: false, geometry: true, ifc: false },
    });
    expect(geometryOnly.paint).toBeUndefined();
    expect(geometryOnly.export).toBeUndefined();
    expect(geometryOnly.geometry).toBeDefined();
    expect(geometryOnly.ifc).toBeUndefined();

    const ifcOnly = buildToolGroupSpec(mock, {
      features: { paint: false, export: false, geometry: false, ifc: true },
    });
    expect(ifcOnly.paint).toBeUndefined();
    expect(ifcOnly.export).toBeUndefined();
    expect(ifcOnly.geometry).toBeUndefined();
    expect(ifcOnly.ifc).toBeDefined();
  });

  it('registers nothing when every feature is off', () => {
    const mock = new MockViewerAdapter(document.createElement('div'));
    const spy = vi.spyOn(mock, 'registerToolGroup');
    registerViewerTools(mock, {
      features: { paint: false, export: false, geometry: false, ifc: false },
    })();
    expect(spy).not.toHaveBeenCalled();
  });
});
