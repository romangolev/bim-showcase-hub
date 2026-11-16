import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';

const exportToXlsx = vi.fn(async () => undefined);

vi.mock('./excelExport.js', async (original) => ({
  ...(await original<typeof import('./excelExport.js')>()),
  exportToXlsx,
}));

const { DEFAULT_FILE_NAME, exportFileName } = await import('./excelExport.js');
const { buildToolGroupSpec, modelKey, TOOL_GROUP_ID } = await import(
  './viewerTools.js'
);

const adapter = {} as ViewerAdapter;

function ids(spec: ReturnType<typeof buildToolGroupSpec>): string[] {
  return [
    spec.id,
    spec.paint.id,
    spec.paint.reset.id,
    spec.export.id,
    ...spec.paint.swatches.map((swatch) => swatch.id),
  ];
}

afterEach(() => {
  exportToXlsx.mockClear();
});

describe('tool group ids per viewer', () => {
  it('derives a short stable key from the urn', () => {
    expect(modelKey('urn-a')).toBe(modelKey('urn-a'));
    expect(modelKey('urn-a')).not.toBe(modelKey('urn-b'));
    expect(modelKey('urn-a')).toMatch(/^[0-9a-z]{1,7}$/);
  });

  it('gives two viewers disjoint control ids and keeps the icons', () => {
    const a = buildToolGroupSpec(adapter, { key: modelKey('urn-a') });
    const b = buildToolGroupSpec(adapter, { key: modelKey('urn-b') });
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    expect(a.id.startsWith(`${TOOL_GROUP_ID}-`)).toBe(true);
    expect(a.paint.swatches.map((swatch) => swatch.icon)).toEqual(
      b.paint.swatches.map((swatch) => swatch.icon),
    );
  });

  it('keeps the plain ids without a key', () => {
    const spec = buildToolGroupSpec(adapter);
    expect(spec.export.id).toBe('export-xlsx');
    expect(spec.paint.id).toBe('paint');
  });

  it('exports under the model name and version', () => {
    const spec = buildToolGroupSpec(adapter, {
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
