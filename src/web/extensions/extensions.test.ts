import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import {
  availableProperties,
  countByProperty,
  OTHER_LABEL,
  seriesColors,
  shapeChartData,
} from './dashboardData.js';
import {
  buildExportRows,
  buildExportSheets,
  describeStatus,
  exportToXlsx,
  sheetNameFor,
} from './excelExport.js';
import {
  DEFAULT_SUMMARY_PROPERTIES,
  EMPTY_VALUE_LABEL,
  formatCount,
  summarize,
} from './modelSummary.js';
import { PAINT_PRESETS, paintSelection } from './paintBrushes.js';

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

  it('counts only the rows written and skips keys containing "<"', async () => {
    const data = [
      row(1, { Category: 'Walls' }),
      row(2, { Category: 'Walls' }),
      row(3, { Category: 'Model <Sketch>' }),
      row(4, { Category: null }),
    ];
    const adapter = {
      getLeafProperties: () => Promise.resolve(data),
    } as unknown as MockViewerAdapter;
    const sheets = buildExportSheets(data, ['Category'], 'Category');
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Walls',
      EMPTY_VALUE_LABEL,
    ]);
    const status = await exportToXlsx(adapter, {
      propertyNames: ['Category'],
      save: vi.fn(),
    });
    expect(status).toEqual({
      phase: 'done',
      fileName: 'model-properties.xlsx',
      rowCount: 3,
    });
  });

  it('reports empty when every group is skipped', async () => {
    const data = [row(1, { Category: '<none>' }), row(2, { Category: 'A<B' })];
    const adapter = {
      getLeafProperties: () => Promise.resolve(data),
    } as unknown as MockViewerAdapter;
    const save = vi.fn();
    const status = await exportToXlsx(adapter, {
      propertyNames: ['Category'],
      save,
    });
    expect(status).toEqual({ phase: 'empty' });
    expect(save).not.toHaveBeenCalled();
  });

  it('reports empty and error outcomes', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    expect((await exportToXlsx(adapter)).phase).toBe('empty');
    const failing = {
      getLeafProperties: () => Promise.reject(new Error('boom')),
    } as unknown as MockViewerAdapter;
    const status = await exportToXlsx(failing);
    expect(describeStatus(status)).toBe('Export failed: boom');
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

  it('lists only properties that have values', () => {
    expect(
      availableProperties(rows, ['Category', 'Level', 'Assembly Code']),
    ).toEqual(['Category', 'Assembly Code']);
  });

  it('builds a single-hue ramp with a muted Other slice', () => {
    const theme = {
      accent: '#3b82f6',
      muted: '#9d9e9f',
      text: '#858687',
      label: '#cececf',
      grid: 'g',
      surface: '#131416',
      fontFamily: 'Inter',
      fontWeight: '420',
      fontSize: 12,
    };
    const colors = seriesColors(theme, ['a', 'b', 'c', OTHER_LABEL]);
    expect(colors).toHaveLength(4);
    expect(colors[0]).toBe('rgb(59, 130, 246)');
    expect(new Set(colors).size).toBe(4);
    expect(colors[3]).not.toBe(colors[2]);
    expect(seriesColors(theme, ['only'])).toEqual(['rgb(59, 130, 246)']);
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
    expect(adapter.getSelection()).toEqual([]);
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
