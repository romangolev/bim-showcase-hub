import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  itemsWithValues,
  runElementAction,
  sanitizeAction,
} from './elementActions.js';
import {
  DEFAULT_SUMMARY_VIEW,
  emptyShares,
  sanitizeView,
  summaryTable,
  viewEntries,
} from './modelSummary.js';

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
      fitToSelection: vi.fn(),
    } as unknown as ViewerAdapter;
    const items = [{ modelId: 'm1', dbId: 1 }];
    runElementAction(adapter, 'select', items);
    runElementAction(adapter, 'isolate', items);
    expect(adapter.selectModelIds).toHaveBeenCalledTimes(1);
    expect(adapter.fitToSelection).not.toHaveBeenCalled();
    runElementAction(adapter, 'zoom', items);
    expect(adapter.fitToSelection).toHaveBeenCalledTimes(1);
    expect(adapter.isolateModelIds).toHaveBeenCalledWith(items);
    expect(sanitizeAction('nope')).toBe('select');
  });
});
