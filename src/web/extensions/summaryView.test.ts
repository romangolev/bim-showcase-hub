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
  additionProblem,
  aggregateCell,
  applyAddition,
  blockTitle,
  COUNT_COLUMN,
  cellsByEntry,
  columnTitle,
  countShare,
  DEFAULT_SUMMARY_PROPERTIES,
  DEFAULT_SUMMARY_VIEW,
  emptyShares,
  entryKey,
  formatCell,
  formatPercent,
  MAX_SUMMARY_COLUMNS,
  MAX_SUMMARY_ROWS,
  parseMeasure,
  pivotTree,
  type SummaryAggregate,
  type SummaryColumnSpec,
  sanitizeView,
  summarize,
  summaryBlocks,
  summaryColumn,
  summaryTable,
  viewEntries,
  viewPropertyNames,
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
  it('reports the exact share of empty values per property', () => {
    const [a, b] = emptyShares(entries);
    expect(a?.percent).toBeCloseTo(33.33, 1);
    expect(b).toEqual({ property: 'B', percent: 0 });
  });

  it('never rounds a share to 0 or 100 unless it is exact', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(0.2)).toBe('<1%');
    expect(formatPercent(99.8)).toBe('>99%');
    expect(formatPercent(33.4)).toBe('33%');
  });
});

describe('sanitizeView', () => {
  it('falls back to defaults on bad input', () => {
    expect(sanitizeView('x')).toEqual(DEFAULT_SUMMARY_VIEW);
    expect(sanitizeView({ minCount: -4, density: 'compact' })).toEqual({
      ...DEFAULT_SUMMARY_VIEW,
      density: 'compact',
    });
  });
});

describe('sanitizeView columns migration', () => {
  it('derives Count for a blob with no columns', () => {
    expect(sanitizeView({ density: 'compact' })).toMatchObject({
      columns: [COUNT_COLUMN],
      showProperty: true,
    });
  });

  it('drops Count when the old view hid it', () => {
    expect(sanitizeView({ hiddenColumns: ['count', 'x'] }).columns).toEqual([]);
  });

  it('turns the old measure into a Sum column with its precision and unit', () => {
    expect(
      sanitizeView({
        measure: ' Area ',
        precision: 9,
        unitLabel: 'x'.repeat(40),
      }).columns,
    ).toEqual([
      COUNT_COLUMN,
      {
        id: 'sum:Area',
        property: 'Area',
        aggregate: 'sum',
        title: '',
        precision: 4,
        unitLabel: 'x'.repeat(16),
      },
    ]);
    expect(
      sanitizeView({ measure: 'Area', precision: '3' }).columns[1],
    ).toMatchObject({ precision: 2 });
  });

  it('hides the property column when the old view did and ignores a hidden value', () => {
    expect(
      sanitizeView({ hiddenColumns: ['property', 'value'] }),
    ).toMatchObject({ showProperty: false, columns: [COUNT_COLUMN] });
    expect(
      sanitizeView({ hiddenColumns: ['property'], showProperty: true })
        .showProperty,
    ).toBe(true);
  });

  it('never carries the old fields forward', () => {
    const view = sanitizeView({
      measure: 'Area',
      hiddenColumns: ['count'],
      unitLabel: 'm',
      precision: 1,
    });
    for (const key of ['measure', 'hiddenColumns', 'unitLabel', 'precision']) {
      expect(view).not.toHaveProperty(key);
    }
  });

  it('keeps valid columns in order and drops garbage', () => {
    expect(
      sanitizeView({
        columns: [
          {
            property: ' Area ',
            aggregate: 'sum',
            title: ' Total ',
            precision: 1,
            unitLabel: 'm2',
          },
          { property: 'Area', aggregate: 'sum' },
          { property: 'Area', aggregate: 'avg' },
          { property: null, aggregate: 'count' },
          { property: null, aggregate: 'sum' },
          { property: 'Mark', aggregate: 'median' },
          'junk',
          null,
        ],
      }).columns,
    ).toEqual([
      {
        id: 'sum:Area',
        property: 'Area',
        aggregate: 'sum',
        title: 'Total',
        precision: 1,
        unitLabel: 'm2',
      },
      {
        id: 'avg:Area',
        property: 'Area',
        aggregate: 'avg',
        title: '',
        precision: 2,
        unitLabel: '',
      },
      COUNT_COLUMN,
    ]);
  });

  it('caps the columns and keeps an empty list', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      property: `P${index}`,
      aggregate: 'count',
    }));
    expect(sanitizeView({ columns: many }).columns).toHaveLength(
      MAX_SUMMARY_COLUMNS,
    );
    expect(sanitizeView({ columns: [] }).columns).toEqual([]);
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

describe('column aggregates', () => {
  const rows: PropertyRow[] = [
    {
      dbId: 1,
      name: 'a',
      properties: { Category: 'Walls', Area: '12.5 m²', Mark: 'W1' },
    },
    {
      dbId: 2,
      name: 'b',
      properties: { Category: 'Walls', Area: '1,200 m2', Mark: 'W1' },
    },
    {
      dbId: 3,
      name: 'c',
      properties: { Category: 'Doors', Area: '3 m²', Mark: '' },
    },
    {
      dbId: 4,
      name: 'd',
      properties: { Category: 'Doors', Area: '', Mark: null },
    },
  ];
  const ref = (property: string | null, aggregate: SummaryAggregate) => ({
    property,
    aggregate,
  });

  it('counts elements, values and distinct values', () => {
    expect(aggregateCell(rows, ref(null, 'count'))).toEqual({
      status: 'ok',
      value: 4,
      unit: '',
      missing: 0,
    });
    expect(aggregateCell(rows, ref('Mark', 'count'))).toMatchObject({
      value: 2,
    });
    expect(aggregateCell(rows, ref('Mark', 'distinct'))).toMatchObject({
      value: 1,
    });
  });

  it('reports filled and empty shares, and 0% when nothing is filled', () => {
    expect(aggregateCell(rows, ref('Mark', 'filled'))).toMatchObject({
      value: 50,
    });
    expect(aggregateCell(rows, ref('Mark', 'empty'))).toMatchObject({
      value: 50,
    });
    expect(aggregateCell(rows.slice(2), ref('Mark', 'filled'))).toMatchObject({
      status: 'ok',
      value: 0,
    });
    expect(aggregateCell([], ref('Mark', 'filled'))).toEqual({
      status: 'none',
    });
  });

  it('sums, averages and bounds numbers and counts the missing ones', () => {
    expect(aggregateCell(rows, ref('Area', 'sum'))).toEqual({
      status: 'ok',
      value: 1215.5,
      unit: 'm²',
      missing: 1,
    });
    expect(aggregateCell(rows.slice(0, 2), ref('Area', 'avg'))).toMatchObject({
      value: 606.25,
    });
    expect(aggregateCell(rows, ref('Area', 'min'))).toMatchObject({ value: 3 });
    expect(aggregateCell(rows, ref('Area', 'max'))).toMatchObject({
      value: 1200,
    });
  });

  it('converts millimetres and reports mixed families and missing numbers', () => {
    expect(
      aggregateCell(
        [
          { dbId: 1, name: 'a', properties: { Length: '1 m' } },
          { dbId: 2, name: 'b', properties: { Length: '500 mm' } },
        ],
        ref('Length', 'sum'),
      ),
    ).toMatchObject({ value: 1.5, unit: 'm' });
    expect(
      aggregateCell(
        [
          { dbId: 1, name: 'a', properties: { Volume: '10 m²' } },
          { dbId: 2, name: 'b', properties: { Volume: '2 m³' } },
        ],
        ref('Volume', 'sum'),
      ),
    ).toEqual({ status: 'mixed', units: ['m²', 'm³'] });
    expect(
      aggregateCell(
        [
          { dbId: 1, name: 'a', properties: { Volume: 'n/a' } },
          { dbId: 2, name: 'b', properties: {} },
        ],
        ref('Volume', 'sum'),
      ),
    ).toEqual({ status: 'none' });
  });

  it('computes every column per entry', () => {
    const entry = (value: string, count: number) => ({
      property: 'Category',
      value,
      count,
    });
    const cells = cellsByEntry(
      rows,
      [entry('Walls', 2), entry('Doors', 4), entry('Gone', 7)],
      [ref(null, 'count'), ref('Area', 'sum')],
    );
    expect(cells.get(entryKey(entry('Walls', 2)))).toEqual([
      { status: 'ok', value: 2, unit: '', missing: 0 },
      { status: 'ok', value: 1212.5, unit: 'm²', missing: 0 },
    ]);
    expect(cells.get(entryKey(entry('Doors', 4)))?.[1]).toMatchObject({
      value: 3,
      missing: 1,
    });
    expect(cells.get(entryKey(entry('Gone', 7)))).toEqual([
      { status: 'ok', value: 7, unit: '', missing: 0 },
      { status: 'none' },
    ]);
  });

  it('skips the rows when every column is an element count', () => {
    const entry = { property: 'Category', value: 'Walls', count: 9 };
    expect(
      cellsByEntry(
        new Proxy([], { get: () => assertNoRead() }),
        [entry],
        [ref(null, 'count')],
      ).get(entryKey(entry)),
    ).toEqual([{ status: 'ok', value: 9, unit: '', missing: 0 }]);
  });

  it('counts whitespace-only values as empty', () => {
    const blanks: PropertyRow[] = [
      { dbId: 1, name: 'a', properties: { Mark: '  ' } },
      { dbId: 2, name: 'b', properties: { Mark: 'M1' } },
    ];
    expect(aggregateCell(blanks, ref('Mark', 'filled'))).toMatchObject({
      value: 50,
    });
    expect(aggregateCell(blanks, ref('Mark', 'distinct'))).toMatchObject({
      value: 1,
    });
  });

  it('formats the missing count in the given language', () => {
    expect(
      formatCell(
        { status: 'ok', value: 1, unit: 'm²', missing: 1234 },
        summaryColumn('Area', 'sum'),
        'ru',
      ),
    ).toMatch(/1\s234 missing/);
  });

  it('formats each kind of cell', () => {
    const sum = summaryColumn('Area', 'sum', { precision: 1 });
    expect(
      formatCell({ status: 'ok', value: 1212.5, unit: 'm²', missing: 0 }, sum),
    ).toBe('1,212.5 m²');
    expect(
      formatCell(
        { status: 'ok', value: 1212.5, unit: 'm²', missing: 2 },
        summaryColumn('Area', 'sum', { precision: 0, unitLabel: 'sq ft' }),
      ),
    ).toBe('1,213 sq ft (2 missing)');
    expect(
      formatCell(
        { status: 'ok', value: 33.4, unit: '', missing: 0 },
        summaryColumn('Mark', 'filled'),
      ),
    ).toBe('33%');
    expect(
      formatCell(
        { status: 'ok', value: 104686, unit: '', missing: 0 },
        COUNT_COLUMN,
      ),
    ).toBe('104,686');
    expect(formatCell({ status: 'none' }, sum)).toBe('n/a');
    expect(formatCell({ status: 'mixed', units: ['m²', 'm³'] }, sum)).toBe(
      'mixed units',
    );
  });

  it('spells out generated titles and keeps a custom one', () => {
    expect(columnTitle(COUNT_COLUMN)).toBe('Count');
    expect(columnTitle(summaryColumn('Area', 'sum'))).toBe('Sum of Area');
    expect(columnTitle(summaryColumn('Mark', 'filled'))).toBe(
      'Filled % of Mark',
    );
    expect(
      columnTitle(summaryColumn('Area', 'sum', { title: ' Total ' })),
    ).toBe('Total');
  });
});

function assertNoRead(): never {
  throw new Error('rows must not be read');
}

describe('viewPropertyNames', () => {
  it('names the row and column properties once each', () => {
    expect(
      viewPropertyNames(
        ['Level', 'Name'],
        [COUNT_COLUMN, summaryColumn('Level', 'distinct')],
      ),
    ).toEqual(['Level', 'Name']);
  });
});

describe('summaryTable', () => {
  const rows: PropertyRow[] = [
    { dbId: 1, name: 'a', properties: { A: 'zeta', Area: '2 m²' } },
    { dbId: 2, name: 'b', properties: { A: 'zeta', Area: '3 m²' } },
  ];

  it('exports the visible columns under their titles', () => {
    const view = {
      ...DEFAULT_SUMMARY_VIEW,
      showProperty: false,
      columns: [COUNT_COLUMN, summaryColumn('Area', 'sum')],
    };
    expect(summaryTable(summarize(rows, ['A']), view, rows)).toEqual({
      header: ['Value', 'Count', 'Sum of Area'],
      rows: [['zeta', 2, '5 m²']],
    });
  });

  it('keeps the property column by default', () => {
    expect(summaryTable(entries.slice(0, 1), DEFAULT_SUMMARY_VIEW, [])).toEqual(
      { header: ['Property', 'Value', 'Count'], rows: [['A', 'zeta', 5]] },
    );
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

  it('computes the columns over each subtree', () => {
    const tree = pivotTree(rows, ['Category'], {
      columns: [{ property: 'Area', aggregate: 'sum' }],
    });
    expect(tree[0]?.cells[0]).toMatchObject({ status: 'ok', value: 16 });
    expect(tree[1]?.cells[0]).toMatchObject({ status: 'ok', value: 2 });
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

describe('sanitizeView grouping and titles', () => {
  it('fills the new fields from a blob of the previous build', () => {
    expect(sanitizeView({ density: 'compact' })).toMatchObject({
      layout: 'flat',
      groupBy: [],
      titles: {},
    });
  });

  it('keeps known values and drops corrupt ones', () => {
    expect(
      sanitizeView({
        layout: 'pivot',
        groupBy: ['A', ' A ', 'B', 3, 'C', 'D', 'E'],
        titles: { A: '  ', B: ' Type ', C: 7 },
      }),
    ).toMatchObject({
      layout: 'pivot',
      groupBy: ['A', 'B', 'C', 'D'],
      titles: { B: 'Type' },
    });
    expect(sanitizeView({ layout: 'matrix', groupBy: 'A' })).toMatchObject({
      layout: 'flat',
      groupBy: [],
    });
  });
});

describe('adding a property', () => {
  const columns: SummaryColumnSpec[] = [
    COUNT_COLUMN,
    summaryColumn('Area', 'sum'),
  ];

  const view = { ...DEFAULT_SUMMARY_VIEW, columns };

  it('appends a row or a column', () => {
    expect(
      applyAddition(['A'], view, { role: 'rows', property: ' Level ' }),
    ).toEqual({ properties: ['A', 'Level'], view });
    const filled = summaryColumn('Mark', 'filled');
    expect(
      applyAddition(['A'], view, { role: 'column', column: filled }).view
        .columns,
    ).toEqual([...columns, filled]);
  });

  it('replaces the item being edited in place', () => {
    expect(
      applyAddition(
        ['A', 'B'],
        view,
        { role: 'rows', property: 'C' },
        { role: 'rows', property: 'A' },
      ).properties,
    ).toEqual(['C', 'B']);
    const avg = summaryColumn('Area', 'avg');
    expect(
      applyAddition(
        ['A'],
        view,
        { role: 'column', column: avg },
        { role: 'column', column: summaryColumn('Area', 'sum') },
      ).view.columns,
    ).toEqual([COUNT_COLUMN, avg]);
  });

  it('follows a renamed row in the pivot levels and block titles', () => {
    const named = {
      ...view,
      groupBy: ['A', 'B'],
      titles: { A: 'First', B: 'Second' },
    };
    const next = applyAddition(
      ['A', 'B'],
      named,
      { role: 'rows', property: 'C' },
      { role: 'rows', property: 'A' },
    );
    expect(next.view.groupBy).toEqual(['C', 'B']);
    expect(next.view.titles).toEqual({ B: 'Second', C: 'First' });
  });

  it('names what blocks an addition', () => {
    expect(
      additionProblem({ role: 'rows', property: ' ' }, ['A'], columns),
    ).toBe('Choose a property');
    expect(
      additionProblem({ role: 'rows', property: 'A' }, ['A'], columns),
    ).toBe('Already in the rows');
    expect(
      additionProblem({ role: 'rows', property: 'A' }, ['A'], columns, {
        role: 'rows',
        property: 'A',
      }),
    ).toBeNull();
    expect(
      additionProblem(
        { role: 'column', column: summaryColumn('Area', 'sum') },
        ['A'],
        columns,
      ),
    ).toBe('This column already exists');
    expect(
      additionProblem(
        { role: 'column', column: summaryColumn('Area', 'avg') },
        ['A'],
        columns,
      ),
    ).toBeNull();
    const full = Array.from({ length: MAX_SUMMARY_COLUMNS }, (_, index) =>
      summaryColumn(`P${index}`, 'count'),
    );
    expect(
      additionProblem(
        { role: 'column', column: summaryColumn('Q', 'count') },
        ['A'],
        full,
      ),
    ).toBe('The summary holds up to 12 columns');
    const rows = Array.from(
      { length: MAX_SUMMARY_ROWS },
      (_, index) => `R${index}`,
    );
    expect(
      additionProblem({ role: 'rows', property: 'Q' }, rows, columns),
    ).toBe('The summary holds up to 24 row properties');
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
