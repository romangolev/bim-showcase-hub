import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { readScopedRows } from '../viewer/scopedRows.js';
import {
  deleteSet,
  listSets,
  saveSelectionSet,
} from '../viewer/selectionSets.js';
import { buildColoring } from './colorBy.js';
import {
  availableProperties,
  CHART_PALETTES,
  countByProperty,
  OTHER_COLOR,
  OTHER_LABEL,
  selectedBuckets,
  seriesColors,
  shapeChartData,
} from './dashboardData.js';
import { sanitizeDashboardView } from './dashboardPresets.js';
import {
  buildExportRows,
  buildExportSheets,
  COLOR_COLUMN,
  COLOR_HEX_COLUMN,
  describeStatus,
  exportPreview,
  exportToXlsx,
  MODEL_COLUMN,
  PREVIEW_ROWS,
  sheetNameFor,
} from './excelExport.js';
import {
  DEFAULT_SUMMARY_PROPERTIES,
  EMPTY_VALUE_LABEL,
  formatCount,
  summarize,
} from './modelSummary.js';
import {
  DEFAULT_PAINT_PALETTE,
  PAINT_PALETTES,
  PAINT_PRESETS,
  paintSelection,
  paletteToPresets,
  resolvePaintPalette,
  sanitizeIntensity,
  sanitizePalette,
  sanitizePaletteId,
} from './paintBrushes.js';

function row(
  dbId: number,
  properties: PropertyRow['properties'],
  name = `El ${dbId}`,
): PropertyRow {
  return { dbId, name, properties };
}

const rows: PropertyRow[] = [
  row(1, { Category: 'Walls', 'Assembly Code': 'B2010', Name: 'W1' }),
  row(2, { Category: 'Walls', 'Assembly Code': 'B2010', Name: 'W2' }),
  row(3, { Category: 'Doors', 'Assembly Code': 'B2030', Name: 'D1' }),
  row(4, { Category: 'Doors', 'Assembly Code': null, Name: 'D1' }),
];

describe('summarize', () => {
  it('counts values per property sorted by count then label', () => {
    const result = summarize(rows, ['Category', 'Assembly Code']);
    expect(result).toEqual([
      { property: 'Category', value: 'Doors', count: 2 },
      { property: 'Category', value: 'Walls', count: 2 },
      { property: 'Assembly Code', value: 'B2010', count: 2 },
      { property: 'Assembly Code', value: EMPTY_VALUE_LABEL, count: 1 },
      { property: 'Assembly Code', value: 'B2030', count: 1 },
    ]);
  });

  it('uses the neutral default property names', () => {
    expect(DEFAULT_SUMMARY_PROPERTIES).toEqual([
      'Assembly Code',
      'Classification Code',
      'Name',
    ]);
    expect(summarize([], undefined)).toEqual([]);
  });

  it('treats missing properties as empty', () => {
    expect(summarize([row(1, {})], ['Level'])).toEqual([
      { property: 'Level', value: EMPTY_VALUE_LABEL, count: 1 },
    ]);
  });
});

describe('formatCount', () => {
  it('adds thousands separators', () => {
    expect(formatCount(104686)).toBe('104,686');
    expect(formatCount(7)).toBe('7');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});

describe('export rows', () => {
  it('builds header and rows in property order', () => {
    expect(buildExportRows(rows.slice(0, 1), ['Name', 'Category'])).toEqual({
      header: ['dbId', 'Name', 'Category'],
      rows: [[1, 'W1', 'Walls']],
    });
  });

  it('blanks null values', () => {
    const built = buildExportRows(rows.slice(3), ['Assembly Code']);
    expect(built.rows).toEqual([[4, '']]);
  });

  it('groups into one sheet per category', () => {
    const sheets = buildExportSheets(rows, ['Category', 'Name']);
    expect(sheets.map((s) => s.name)).toEqual(['Walls', 'Doors']);
    expect(sheets[0]?.rows).toHaveLength(2);
  });

  it('falls back to a single sheet without the group property', () => {
    const sheets = buildExportSheets(rows, ['Name'], 'Category');
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.name).toBe('Elements');
    expect(sheets[0]?.rows).toHaveLength(4);
  });

  it('adds a model column only when rows come from several models', () => {
    const tagged = (r: PropertyRow, modelId: string, modelName?: string) => ({
      ...r,
      modelId,
      modelName,
    });
    const one = rows.map((r) => tagged(r, 'a', 'Arch'));
    expect(buildExportSheets(one, ['Name'], null)[0]?.header).toEqual([
      'dbId',
      'Name',
    ]);
    const mixed = [
      tagged(rows[0] as PropertyRow, 'a', 'Arch'),
      tagged(rows[0] as PropertyRow, 's'),
    ];
    const sheets = buildExportSheets(mixed, ['Category', 'Name']);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.header).toEqual([
      MODEL_COLUMN,
      'dbId',
      'Category',
      'Name',
    ]);
    expect(sheets[0]?.rows).toEqual([
      ['Arch', 1, 'Walls', 'W1'],
      ['s', 1, 'Walls', 'W1'],
    ]);
  });

  it('previews the first 20 export rows with the model column for several models', () => {
    const many: PropertyRow[] = Array.from({ length: 30 }, (_, i) => ({
      dbId: i,
      name: `e${i}`,
      properties: { Category: 'Walls' },
      modelId: i % 2 ? 'a' : 'b',
      modelName: i % 2 ? 'A' : 'B',
    }));
    const preview = exportPreview(many, ['Category']);
    expect(preview.rows).toHaveLength(PREVIEW_ROWS);
    expect(preview.header).toEqual([MODEL_COLUMN, 'dbId', 'Category']);
  });

  it('adds the colour label and hex after the properties', () => {
    const coloured: PropertyRow[] = [
      {
        dbId: 1,
        name: 'a',
        properties: { Category: 'Walls' },
        modelId: 'm',
      },
      {
        dbId: 2,
        name: 'b',
        properties: { Category: 'Doors' },
        modelId: 'm',
      },
    ];
    const coloring = buildColoring(
      'property',
      'Category',
      coloured.slice(0, 1),
      () => 'Walls',
      ['Walls'],
      ['#ff0000'],
    );
    const built = buildExportRows(coloured, ['Category'], false, '', coloring);
    expect(built.header).toEqual([
      'dbId',
      'Category',
      COLOR_COLUMN,
      COLOR_HEX_COLUMN,
    ]);
    expect(built.rows).toEqual([
      [1, 'Walls', 'Walls', '#ff0000'],
      [2, 'Doors', '', ''],
    ]);
  });

  it('splits a measure column into a number and a unit column', () => {
    const measured = [
      {
        dbId: 1,
        name: 'a',
        properties: { Area: '12.5 m²', Mark: '007' },
        modelId: 'm',
      },
    ];
    const built = buildExportRows(measured, ['Area', 'Mark'], false, '', null, {
      Area: 'measure',
      Mark: 'text',
    });
    expect(built.header).toEqual(['dbId', 'Area', 'Area unit', 'Mark']);
    expect(built.rows[0]).toEqual([1, 12.5, 'm²', '007']);
    expect(built.textColumns).toEqual([3]);
  });

  it('keeps a measure cell that does not parse as text with an empty unit', () => {
    const unparsed = [
      { dbId: 1, name: 'a', properties: { Area: 'n/a' }, modelId: 'm' },
    ];
    expect(
      buildExportRows(unparsed, ['Area'], false, '', null, { Area: 'measure' })
        .rows[0],
    ).toEqual([1, 'n/a', '']);
  });

  it('parses a number column and leaves the rest as text', () => {
    const mixed = [
      {
        dbId: 1,
        name: 'a',
        properties: { Qty: '3', Note: '4' },
        modelId: 'm',
      },
    ];
    const built = buildExportRows(mixed, ['Qty', 'Note'], false, '', null, {
      Qty: 'number',
      Note: 'text',
    });
    expect(built.rows[0]).toEqual([1, 3, '4']);
    expect(built.textColumns).toEqual([2]);
  });

  it('names the models whose properties are missing from an export', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([
      { urn: 'urn-a', name: 'Arch' },
      { urn: 'urn-noprops', name: 'Broken DB' },
    ]);
    const status = await exportToXlsx(adapter, { save: vi.fn() });
    expect(status).toMatchObject({ phase: 'done', missing: ['Broken DB'] });
    expect(describeStatus(status)).toContain(
      'Missing Broken DB: properties could not be read',
    );
    adapter.destroy();
  });

  it('exports only a saved set and warns when the set is gone', async () => {
    installMemoryStorage();
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.load('urn');
    const read = await readScopedRows(adapter, { names: ['Category'] });
    const row0 = read.rows[0];
    const first = { modelId: row0?.modelId ?? '', dbId: row0?.dbId ?? -1 };
    saveSelectionSet('One', [first]);
    const id = listSets()[0]?.id ?? '';
    const one = await exportToXlsx(adapter, {
      scope: `set:${id}`,
      save: vi.fn(),
    });
    expect(one).toMatchObject({ phase: 'done', rowCount: 1 });
    expect(one).not.toHaveProperty('scopeNote');
    deleteSet(id);
    const stale = await exportToXlsx(adapter, {
      scope: `set:${id}`,
      save: vi.fn(),
    });
    expect(stale).toMatchObject({ phase: 'done' });
    expect((stale as { rowCount: number }).rowCount).toBeGreaterThan(1);
    expect(describeStatus(stale)).toContain('no longer exists');
    adapter.destroy();
  });

  it('fails the export when a model could not be read', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([
      { urn: 'urn-a', name: 'Arch' },
      { urn: 'urn-b', name: 'MEP' },
    ]);
    vi.spyOn(adapter, 'getLeafProperties').mockImplementation(
      async (_names, ids) => {
        if (ids?.includes('urn-b')) throw new Error('timeout');
        return [row(1, { Category: 'Walls' })];
      },
    );
    const status = await exportToXlsx(adapter, { save: vi.fn() });
    expect(status).toMatchObject({
      phase: 'error',
      message: 'Could not read properties of MEP',
    });
    adapter.destroy();
  });

  it('returns no sheets for no rows', () => {
    expect(buildExportSheets([], ['Name'])).toEqual([]);
  });
  it('sanitises and de-duplicates sheet names', () => {
    const used = new Set<string>();
    expect(sheetNameFor('A/B:C', used)).toBe('A B C');
    expect(sheetNameFor('a b c', used)).toBe('a b c 2');
    expect(sheetNameFor('x'.repeat(40), used)).toHaveLength(31);
  });

  it('reports status through exportToXlsx and saves a blob', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.load('urn');
    const save = vi.fn();
    const phases: string[] = [];
    const result = await exportToXlsx(adapter, {
      fileName: 'out.xlsx',
      save,
      onStatus: (s) => phases.push(s.phase),
    });
    expect(phases).toEqual(['reading', 'building', 'done']);
    expect(result.phase).toBe('done');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(save.mock.calls[0]?.[1]).toBe('out.xlsx');
    adapter.destroy();
  });

  it('writes a sheet for every group, including keys containing "<"', async () => {
    const data = [
      row(1, { Category: 'Walls' }),
      row(2, { Category: 'Walls' }),
      row(3, { Category: 'Model <Sketch>' }),
      row(4, { Category: null }),
    ];
    const adapter = {
      getLeafProperties: () => Promise.resolve(data),
      getModels: () => [
        { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
      ],
    } as unknown as MockViewerAdapter;
    const sheets = buildExportSheets(data, ['Category'], 'Category');
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Walls',
      'Model <Sketch>',
      EMPTY_VALUE_LABEL,
    ]);
    const status = await exportToXlsx(adapter, {
      propertyNames: ['Category'],
      save: vi.fn(),
    });
    expect(status).toEqual({
      phase: 'done',
      fileName: 'model-properties.xlsx',
      rowCount: 4,
    });
  });

  it('reports empty and error outcomes', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    expect((await exportToXlsx(adapter)).phase).toBe('empty');
    const failing = {
      getLeafProperties: () => Promise.reject(new Error('boom')),
      getModels: () => [
        { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
      ],
    } as unknown as MockViewerAdapter;
    const status = await exportToXlsx(failing);
    expect(describeStatus(status)).toBe('Export failed: boom');
  });

  it('ends as cancelled when the signal aborts and reports progress', async () => {
    const adapter = {
      getLeafProperties: (
        _names: unknown,
        _models: unknown,
        options: {
          onProgress?: (p: {
            phase: string;
            loaded: number;
            total: number;
            partial: boolean;
          }) => void;
        },
      ) => {
        options.onProgress?.({
          phase: 'rows',
          loaded: 1,
          total: 1,
          partial: false,
        });
        return Promise.resolve([row(1, { Category: 'Walls' })]);
      },
      getModels: () => [
        { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
      ],
    } as unknown as MockViewerAdapter;
    const progress: string[] = [];
    const done = await exportToXlsx(adapter, {
      propertyNames: ['Category'],
      save: vi.fn(),
      onProgress: (value) => progress.push(`${value.loaded}/${value.total}`),
    });
    expect(done.phase).toBe('done');
    expect(progress.at(-1)).toBe('1/1');
    const controller = new AbortController();
    controller.abort();
    const copy = vi.fn(() => Promise.resolve());
    const status = await exportToXlsx(adapter, {
      propertyNames: ['Category'],
      format: 'copy',
      copy,
      signal: controller.signal,
    });
    expect(status).toEqual({ phase: 'cancelled' });
  });
});

describe('dashboard data', () => {
  it('counts by property', () => {
    expect(countByProperty(rows, 'Category')).toEqual([
      { label: 'Doors', count: 2 },
      { label: 'Walls', count: 2 },
    ]);
  });

  it('groups the long tail into Other', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      row(i, { Name: `n${i}` }),
    ).concat([row(100, { Name: 'n0' })]);
    const shaped = shapeChartData(many, 'Name', 4);
    expect(shaped.total).toBe(11);
    expect(shaped.data).toHaveLength(4);
    expect(shaped.data[0]).toEqual({ label: 'n0', count: 2 });
    expect(shaped.data[3]).toEqual({ label: OTHER_LABEL, count: 7 });
  });

  it('finds the buckets that hold the selected elements', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      row(i, { Name: `n${i}` }),
    ).concat([row(100, { Name: 'n0' })]);
    const shaped = shapeChartData(many, 'Name', 4);
    const at = (...dbIds: number[]) =>
      dbIds.map((dbId) => ({ modelId: 'm', dbId }));
    const tagged = many.map((item) => ({ ...item, modelId: 'm' }));
    expect(selectedBuckets(tagged, shaped, [])).toEqual(new Set());
    expect(selectedBuckets(tagged, shaped, at(100, 9))).toEqual(
      new Set(['n0', OTHER_LABEL]),
    );
    expect(
      selectedBuckets(tagged, shaped, [{ modelId: 'x', dbId: 100 }]),
    ).toEqual(new Set());
  });

  it('lists only properties that have values', () => {
    expect(
      availableProperties(rows, ['Category', 'Level', 'Assembly Code']),
    ).toEqual(['Category', 'Assembly Code']);
  });

  it('keeps a saved split-by-model flag and drops a false one', () => {
    expect(sanitizeDashboardView({ splitByModel: true })).toMatchObject({
      splitByModel: true,
    });
    expect(sanitizeDashboardView({ splitByModel: false })).not.toHaveProperty(
      'splitByModel',
    );
    expect(sanitizeDashboardView({})).not.toHaveProperty('splitByModel');
  });

  describe('series colours', () => {
    const base = {
      text: '#858687',
      label: '#cececf',
      grid: 'g',
      fontFamily: 'Inter',
      fontWeight: '420',
      fontSize: 12,
    };
    const themes = {
      dark: { ...base, scheme: 'dark' as const, surface: '#131416' },
      light: { ...base, scheme: 'light' as const, surface: '#ffffff' },
    };

    function lab(hex: string): number[] {
      const lin = (i: number) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const [r, g, b] = [lin(1), lin(3), lin(5)] as [number, number, number];
      const xyz = [
        (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
        0.2126 * r + 0.7152 * g + 0.0722 * b,
        (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
      ].map((t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116)) as [
        number,
        number,
        number,
      ];
      return [
        116 * xyz[1] - 16,
        500 * (xyz[0] - xyz[1]),
        200 * (xyz[1] - xyz[2]),
      ];
    }

    it.each(['dark', 'light'] as const)(
      'keeps the first 8 %s colours far apart',
      (scheme) => {
        const first = CHART_PALETTES[scheme].slice(0, 8);
        expect(first).toHaveLength(8);
        for (let i = 0; i < first.length; i += 1) {
          for (let j = i + 1; j < first.length; j += 1) {
            const a = lab(first[i] as string);
            const b = lab(first[j] as string);
            const distance = Math.hypot(
              (a[0] ?? 0) - (b[0] ?? 0),
              (a[1] ?? 0) - (b[1] ?? 0),
              (a[2] ?? 0) - (b[2] ?? 0),
            );
            expect(distance).toBeGreaterThan(18);
          }
        }
      },
    );

    it('gives a value the same colour in every chart', () => {
      const one = seriesColors(themes.dark, ['Walls', 'Doors']);
      const two = seriesColors(themes.dark, ['Walls']);
      expect(two[0]).toBe(one[0]);
      expect(seriesColors(themes.dark, ['Walls'])).toEqual(two);
    });

    it('keeps neighbours distinct, repeats after the palette and greys Other', () => {
      const labels = Array.from({ length: 12 }, (_, i) => `v${i}`);
      const colors = seriesColors(themes.light, [...labels, OTHER_LABEL]);
      expect(new Set(colors.slice(0, 8)).size).toBe(8);
      expect(new Set(colors.slice(0, 12)).size).toBe(12);
      expect(colors[12]).toBe(OTHER_COLOR);
      expect(seriesColors(themes.dark, ['a', OTHER_LABEL])[1]).toBe(
        OTHER_COLOR,
      );
    });
  });
});

describe('paint palette', () => {
  it('keeps valid unique hex colours, caps at 8 and falls back to the defaults', () => {
    expect(sanitizePalette(['#FF0000', '#ff0000', 'red', '#00ff00'])).toEqual([
      '#ff0000',
      '#00ff00',
    ]);
    expect(sanitizePalette([])).toEqual([...DEFAULT_PAINT_PALETTE]);
    expect(sanitizePalette(undefined)).toEqual([...DEFAULT_PAINT_PALETTE]);
    const many = Array.from(
      { length: 12 },
      (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`,
    );
    expect(sanitizePalette(many)).toHaveLength(8);
  });

  it('clamps and rounds intensity', () => {
    expect(sanitizeIntensity(5)).toBe(1);
    expect(sanitizeIntensity(0)).toBe(0.1);
    expect(sanitizeIntensity(0.52)).toBe(0.5);
    expect(sanitizeIntensity('x')).toBe(0.5);
  });

  it('builds presets with the intensity as alpha', () => {
    const [preset] = paletteToPresets(['#ff8000'], 0.75);
    expect(preset?.id).toBe('paint-ff8000');
    expect(preset?.color[0]).toBe(1);
    expect(preset?.color[1]).toBeCloseTo(128 / 255);
    expect(preset?.color[3]).toBe(0.75);
  });

  it('keeps preset ids unique when a colour repeats', () => {
    const ids = paletteToPresets(['#ff8000', '#112233', '#ff8000'], 0.5).map(
      (preset) => preset.id,
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('paint-ff8000');
  });

  it('sanitises palette ids and resolves named and custom palettes', () => {
    expect(sanitizePaletteId('okabe-ito')).toBe('okabe-ito');
    expect(sanitizePaletteId('nope')).toBe('default');
    expect(resolvePaintPalette('okabe-ito', [])[0]).toBe('#e69f00');
    expect(resolvePaintPalette('custom', ['#112233'])).toEqual(['#112233']);
  });

  it('labels every swatch of every palette with a non-colour marker', () => {
    for (const palette of PAINT_PALETTES) {
      if (palette.id === 'custom') continue;
      const presets = paletteToPresets(
        resolvePaintPalette(palette.id, []),
        0.5,
      );
      expect(presets).toHaveLength(palette.swatches.length);
      expect(new Set(presets.map((preset) => preset.marker)).size).toBe(
        presets.length,
      );
      for (const preset of presets) {
        expect(preset.label).toContain(preset.marker);
        expect(preset.colorName).not.toBe('');
      }
    }
  });

  it('keeps the default palette colours and ids unchanged', () => {
    const presets = paletteToPresets(DEFAULT_PAINT_PALETTE, 0.5);
    expect(presets.map((preset) => preset.id)).toEqual(
      PAINT_PRESETS.map((preset) => preset.id),
    );
    expect(presets.map((preset) => preset.swatch)).toEqual([
      '#ef4444',
      '#22c55e',
      '#3b82f6',
    ]);
    expect(presets[0]?.color[0]).toBeCloseTo(0xef / 255);
    expect(presets[0]?.color[3]).toBe(0.5);
  });
});

describe('paint brushes', () => {
  it('paints the selection then clears it', async () => {
    const host = document.createElement('div');
    const adapter = new MockViewerAdapter(host);
    await adapter.load('urn');
    const ids = buildFirstIds(host);
    adapter.selectIds(ids);
    const preset = PAINT_PRESETS[0];
    expect(preset && paintSelection(adapter, preset.color)).toBe(true);
    expect(adapter.getModelSelection().map((item) => item.dbId)).toEqual([]);
    expect(host.querySelectorAll('.bsh-mock__el--themed')).toHaveLength(
      ids.length,
    );
    adapter.destroy();
  });

  it('does nothing without a selection', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.load('urn');
    expect(paintSelection(adapter, [1, 0, 0, 1])).toBe(false);
    adapter.destroy();
  });
});

function buildFirstIds(host: HTMLElement): number[] {
  return [...host.querySelectorAll<SVGElement>('[data-dbid]')]
    .slice(0, 3)
    .map((el) => Number(el.dataset.dbid));
}
