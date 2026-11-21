import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { sanitizeElementScope } from '../viewer/propertyScope.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  itemsWithValues,
  runElementAction,
  sanitizeAction,
} from './elementActions.js';
import {
  blockTitle,
  countShare,
  DEFAULT_SUMMARY_PROPERTIES,
  DEFAULT_SUMMARY_VIEW,
  emptyShares,
  formatMeasure,
  measureByValue,
  measureOf,
  parseMeasure,
  pivotTree,
  sanitizeView,
  summarize,
  summaryBlocks,
  summaryTable,
  viewEntries,
} from './modelSummary.js';
import { sanitizePropertyNames } from './propertyNames.js';

const entries = [
  { property: 'A', value: 'zeta', count: 5 },
  { property: 'A', value: '(empty)', count: 3 },
  { property: 'A', value: 'alpha', count: 1 },
  { property: 'B', value: 'beta', count: 2 },
];

describe('viewEntries', () => {
  it('filters empty values, small counts and text', () => {
    const view = { ...DEFAULT_SUMMARY_VIEW, hideEmpty: true, minCount: 2 };
    expect(viewEntries(entries, view).map((e) => e.value)).toEqual([
      'zeta',
      'beta',
    ]);
    const text = { ...DEFAULT_SUMMARY_VIEW, text: 'ALP' };
    expect(viewEntries(entries, text).map((e) => e.value)).toEqual(['alpha']);
  });

  it('sorts by value inside each property', () => {
    const view = { ...DEFAULT_SUMMARY_VIEW, sort: 'value' as const };
    expect(viewEntries(entries, view).map((e) => e.value)).toEqual([
      '(empty)',
      'alpha',
      'zeta',
      'beta',
    ]);
  });
});

describe('emptyShares', () => {
  it('reports the rounded share of empty values per property', () => {
    expect(emptyShares(entries)).toEqual([
      { property: 'A', percent: 33 },
      { property: 'B', percent: 0 },
    ]);
  });
});

describe('sanitizeView', () => {
  it('falls back to defaults on bad input', () => {
    expect(sanitizeView('x')).toEqual(DEFAULT_SUMMARY_VIEW);
    expect(
      sanitizeView({
        minCount: -4,
        density: 'compact',
        hiddenColumns: ['count', 'x'],
      }),
    ).toEqual({
      ...DEFAULT_SUMMARY_VIEW,
      density: 'compact',
      hiddenColumns: ['count'],
    });
  });
});

describe('summaryTable', () => {
  it('drops hidden columns from header and rows', () => {
    expect(summaryTable(entries.slice(0, 1), ['property'])).toEqual({
      header: ['Value', 'Count'],
      rows: [['zeta', 5]],
    });
  });
});

describe('summarize', () => {
  it('keeps the flat counts and ordering the summary has always shown', () => {
    const rows: PropertyRow[] = [
      { dbId: 1, name: 'a', properties: { C: 'Wall' } },
      { dbId: 2, name: 'b', properties: { C: 'Door' } },
      { dbId: 3, name: 'c', properties: { C: 'Wall' } },
      { dbId: 4, name: 'd', properties: {} },
    ];
    expect(summarize(rows, ['C'])).toEqual([
      { property: 'C', value: 'Wall', count: 2 },
      { property: 'C', value: '(empty)', count: 1 },
      { property: 'C', value: 'Door', count: 1 },
    ]);
  });
});

describe('parseMeasure', () => {
  it('reads numbers with separators and a trailing unit', () => {
    expect(parseMeasure('1,234.5 m²')).toMatchObject({
      value: 1234.5,
      unit: 'm²',
      family: 'area',
    });
    expect(parseMeasure('12.5m2')).toMatchObject({
      value: 12.5,
      unit: 'm²',
    });
    expect(parseMeasure('300 mm')).toMatchObject({
      value: 300,
      unit: 'm',
      family: 'length',
      factor: 0.001,
    });
    expect(parseMeasure('-4 m')).toMatchObject({ value: -4, unit: 'm' });
    expect(parseMeasure('0.125 m')).toMatchObject({ value: 0.125, unit: 'm' });
    expect(parseMeasure(42)).toMatchObject({
      value: 42,
      unit: '',
      family: 'none',
    });
  });

  it('rejects text, empty cells and malformed grouping', () => {
    expect(parseMeasure('n/a')).toBeNull();
    expect(parseMeasure('(empty)')).toBeNull();
    expect(parseMeasure('')).toBeNull();
    expect(parseMeasure('1,2345')).toBeNull();
    expect(parseMeasure('1.234')).toBeNull();
    expect(parseMeasure(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseMeasure(null)).toBeNull();
  });
});

describe('measures', () => {
  const rows: PropertyRow[] = [
    { dbId: 1, name: 'a', properties: { Category: 'Walls', Area: '12.5 m²' } },
    {
      dbId: 2,
      name: 'b',
      properties: { Category: 'Walls', Area: '1,200 m2' },
    },
    { dbId: 3, name: 'c', properties: { Category: 'Doors', Area: '3 m²' } },
    { dbId: 4, name: 'd', properties: { Category: 'Doors', Area: '' } },
  ];

  it('sums one property per value and counts skipped cells', () => {
    const cells = measureByValue(rows, 'Category', 'Area');
    expect(cells.get('Walls')).toMatchObject({
      status: 'ok',
      sum: 1212.5,
      unit: 'm²',
      measured: 2,
      skipped: 0,
    });
    expect(cells.get('Doors')).toMatchObject({
      status: 'ok',
      sum: 3,
      measured: 1,
      skipped: 1,
    });
    expect(parseMeasure('12,5 m')).toMatchObject({ value: 12.5, unit: 'm' });
  });

  it('converts millimetres to metres inside the length family', () => {
    expect(
      measureOf(
        [
          { dbId: 1, name: 'a', properties: { Length: '1 m' } },
          { dbId: 2, name: 'b', properties: { Length: '500 mm' } },
        ],
        'Length',
      ),
    ).toMatchObject({ status: 'ok', sum: 1.5, unit: 'm' });
  });

  it('marks mixed families and missing numbers as n/a', () => {
    const mixed = measureOf(
      [
        { dbId: 1, name: 'a', properties: { Volume: '10 m²' } },
        { dbId: 2, name: 'b', properties: { Volume: '2 m³' } },
      ],
      'Volume',
    );
    expect(mixed).toEqual({ status: 'mixed' });
    expect(
      measureOf(
        [
          { dbId: 1, name: 'a', properties: { Volume: 'n/a' } },
          { dbId: 2, name: 'b', properties: {} },
        ],
        'Volume',
      ),
    ).toEqual({ status: 'missing' });
  });

  it('formats with the view precision and unit label', () => {
    const cell = measureOf(rows.slice(0, 2), 'Area');
    expect(formatMeasure(cell, { precision: 1, unitLabel: '' })).toBe(
      '1,212.5 m²',
    );
    expect(formatMeasure(cell, { precision: 0, unitLabel: 'sq ft' })).toBe(
      '1,213 sq ft',
    );
    expect(
      formatMeasure({ status: 'missing' }, { precision: 2, unitLabel: '' }),
    ).toBe('n/a');
    expect(
      formatMeasure({ status: 'mixed' }, { precision: 2, unitLabel: '' }),
    ).toBe('n/a');
  });
});

describe('pivotTree', () => {
  const rows: PropertyRow[] = [
    {
      dbId: 1,
      name: 'a',
      properties: { Category: 'Walls', Type: 'Basic', Area: '10 m²' },
    },
    {
      dbId: 2,
      name: 'b',
      properties: { Category: 'Walls', Type: 'Basic', Area: '5 m²' },
    },
    {
      dbId: 3,
      name: 'c',
      properties: { Category: 'Walls', Type: 'Curtain', Area: '1 m²' },
    },
    {
      dbId: 4,
      name: 'd',
      properties: { Category: 'Doors', Type: 'Single', Area: '2 m²' },
    },
  ];

  it('nests the ordered group-by and counts every subtree', () => {
    const tree = pivotTree(rows, ['Category', 'Type']);
    expect(tree.map((node) => [node.value, node.count])).toEqual([
      ['Walls', 3],
      ['Doors', 1],
    ]);
    expect(tree[0]?.children.map((node) => [node.value, node.count])).toEqual([
      ['Basic', 2],
      ['Curtain', 1],
    ]);
    expect(tree[0]?.children[0]?.children).toEqual([]);
  });

  it('sums the measure over each subtree', () => {
    const tree = pivotTree(rows, ['Category'], { measure: 'Area' });
    expect(tree[0]?.measure).toMatchObject({ status: 'ok', sum: 16 });
    expect(tree[1]?.measure).toMatchObject({ status: 'ok', sum: 2 });
  });

  it('returns nothing without a grouping property', () => {
    expect(pivotTree(rows, [])).toEqual([]);
    expect(pivotTree(rows, ['   '])).toEqual([]);
  });
});

describe('blocks, titles and bars', () => {
  it('keeps the property order of the entries', () => {
    expect(
      summaryBlocks(entries).map((block) => [
        block.property,
        block.entries.length,
      ]),
    ).toEqual([
      ['A', 3],
      ['B', 1],
    ]);
  });

  it('falls back to the property name for an empty title', () => {
    expect(blockTitle({ A: ' Codes ' }, 'A')).toBe('Codes');
    expect(blockTitle({ A: '   ' }, 'A')).toBe('A');
    expect(blockTitle({}, 'A')).toBe('A');
  });

  it('rounds a share of the largest count', () => {
    expect(countShare(3, 3)).toBe(100);
    expect(countShare(1, 3)).toBe(33);
    expect(countShare(0, 3)).toBe(0);
    expect(countShare(4, 0)).toBe(0);
  });
});

describe('sanitizeView grouping, measures and titles', () => {
  it('fills the new fields from a blob of the previous build', () => {
    expect(sanitizeView({ density: 'compact' })).toMatchObject({
      layout: 'flat',
      groupBy: [],
      measure: null,
      unitLabel: '',
      precision: 2,
      titles: {},
    });
  });

  it('keeps known values and drops corrupt ones', () => {
    expect(
      sanitizeView({
        layout: 'pivot',
        groupBy: ['A', ' A ', 'B', 3, 'C', 'D', 'E'],
        measure: ' Area ',
        unitLabel: 'x'.repeat(40),
        precision: 9,
        titles: { A: '  ', B: ' Type ', C: 7 },
      }),
    ).toMatchObject({
      layout: 'pivot',
      groupBy: ['A', 'B', 'C', 'D'],
      measure: 'Area',
      unitLabel: 'x'.repeat(16),
      precision: 4,
      titles: { B: 'Type' },
    });
    expect(
      sanitizeView({ layout: 'matrix', groupBy: 'A', precision: -1 }),
    ).toMatchObject({
      layout: 'flat',
      groupBy: [],
      precision: 2,
    });
    expect(sanitizeView({ precision: '3' })).toMatchObject({ precision: 2 });
  });
});

describe('element actions', () => {
  const rows: PropertyRow[] = [
    { dbId: 1, name: 'a', properties: { C: 'Wall' }, modelId: 'm1' },
    { dbId: 1, name: 'b', properties: { C: 'Door' }, modelId: 'm2' },
    { dbId: 2, name: 'c', properties: { C: null }, modelId: 'm2' },
    { dbId: 3, name: 'd', properties: { C: 'Wall' } },
  ];

  it('picks model and dbId pairs by displayed value', () => {
    expect(itemsWithValues(rows, 'C', new Set(['Wall', '(empty)']))).toEqual([
      { modelId: 'm1', dbId: 1 },
      { modelId: 'm2', dbId: 2 },
    ]);
  });

  it('routes each action to the adapter', () => {
    const adapter = {
      selectModelIds: vi.fn(),
      isolateModelIds: vi.fn(),
      hideModelIds: vi.fn(),
      fitToView: vi.fn(),
    } as unknown as ViewerAdapter;
    const items = [{ modelId: 'm1', dbId: 1 }];
    runElementAction(adapter, 'hide', items);
    expect(adapter.hideModelIds).toHaveBeenCalledWith(items);
    expect(adapter.selectModelIds).not.toHaveBeenCalled();
    runElementAction(adapter, 'select', items);
    runElementAction(adapter, 'isolate', items);
    expect(adapter.selectModelIds).toHaveBeenCalledTimes(1);
    expect(adapter.fitToView).not.toHaveBeenCalled();
    runElementAction(adapter, 'zoom', items);
    expect(adapter.fitToView).toHaveBeenCalledWith(items);
    expect(adapter.isolateModelIds).toHaveBeenCalledWith(items);
    expect(sanitizeAction('nope')).toBe('select');
    expect(sanitizeAction('hide')).toBe('hide');
    expect(sanitizeAction(undefined)).toBe('select');
  });

  it('does nothing when no element matches', () => {
    const adapter = {
      selectModelIds: vi.fn(),
      isolateModelIds: vi.fn(),
      hideModelIds: vi.fn(),
      fitToView: vi.fn(),
    } as unknown as ViewerAdapter;
    for (const action of ['select', 'isolate', 'hide', 'zoom'] as const) {
      runElementAction(adapter, action, []);
    }
    expect(adapter.selectModelIds).not.toHaveBeenCalled();
    expect(adapter.isolateModelIds).not.toHaveBeenCalled();
    expect(adapter.hideModelIds).not.toHaveBeenCalled();
    expect(adapter.fitToView).not.toHaveBeenCalled();
  });
});

describe('summary property and scope settings', () => {
  it('sanitizes the chosen properties', () => {
    const sanitize = (raw: unknown) =>
      sanitizePropertyNames(raw, DEFAULT_SUMMARY_PROPERTIES);
    expect(sanitize(['A', 'A', ' ', 3, 'B'])).toEqual(['A', 'B']);
    expect(sanitize([])).toBe(DEFAULT_SUMMARY_PROPERTIES);
    expect(sanitize('x')).toBe(DEFAULT_SUMMARY_PROPERTIES);
  });

  it('falls back to all elements for an unknown scope', () => {
    expect(sanitizeElementScope('visible')).toBe('visible');
    expect(sanitizeElementScope('bogus')).toBe('all');
  });
});
