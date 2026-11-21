import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  type ColorBySpec,
  colorByChart,
  colorByProperty,
  coloringAssignments,
  DEFAULT_COLOR_BY,
  entryItems,
  entryOf,
  legendCsv,
  sanitizeColorBy,
} from './colorBy.js';
import { type ChartData, OTHER_LABEL } from './dashboardData.js';

const row = (
  dbId: number,
  props: PropertyRow['properties'],
  modelId = 'm',
): PropertyRow => ({
  dbId,
  name: `e${dbId}`,
  properties: props,
  modelId,
});

const fixed = (labels: readonly string[]) => labels.map((_, i) => `#00000${i}`);

describe('colorByProperty', () => {
  const rows = [
    row(1, { Category: 'Walls' }),
    row(2, { Category: 'Walls' }),
    row(3, { Category: 'Doors' }),
    row(3, { Category: 'Doors' }, 'other'),
  ];

  it('gives each value a colour, a count and its elements per model', () => {
    const coloring = colorByProperty(
      rows,
      { ...DEFAULT_COLOR_BY, property: 'Category' },
      fixed,
    );
    expect(coloring.legend.map((e) => [e.label, e.count])).toEqual([
      ['Doors', 2],
      ['Walls', 2],
    ]);
    expect(entryItems(coloring, 1)).toEqual([
      { modelId: 'm', dbId: 1 },
      { modelId: 'm', dbId: 2 },
    ]);
    expect(entryOf(coloring, 'other', 3)?.label).toBe('Doors');
  });

  it('folds values past top N into Other', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      row(i + 1, { Category: `C${i}` }),
    );
    const coloring = colorByProperty(
      many,
      { ...DEFAULT_COLOR_BY, topN: 3 },
      fixed,
    );
    expect(coloring.legend.map((e) => e.label)).toEqual([
      'C0',
      'C1',
      OTHER_LABEL,
    ]);
    expect(coloring.legend[2]?.count).toBe(4);
  });

  it('applies a per-value override', () => {
    const spec: ColorBySpec = {
      ...DEFAULT_COLOR_BY,
      overrides: { Walls: '#ff0000' },
    };
    const coloring = colorByProperty(rows, spec, fixed);
    expect(coloring.legend.find((e) => e.label === 'Walls')?.color).toBe(
      '#ff0000',
    );
  });

  it('bins numbers into ranges with a sequential palette', () => {
    const numeric = Array.from({ length: 12 }, (_, i) =>
      row(i + 1, { Area: `${i + 1} m²` }),
    );
    const coloring = colorByProperty(
      numeric,
      { ...DEFAULT_COLOR_BY, property: 'Area', mode: 'range' },
      fixed,
    );
    expect(coloring.legend.length).toBeGreaterThan(2);
    expect(coloring.legend.reduce((sum, e) => sum + e.count, 0)).toBe(12);
    expect(coloring.legend[0]?.color).toBe('#440154');
  });

  it('refuses ranges over mixed unit families', () => {
    const mixed = [row(1, { Size: '2 m' }), row(2, { Size: '3 m²' })];
    const coloring = colorByProperty(
      mixed,
      { ...DEFAULT_COLOR_BY, property: 'Size', mode: 'range' },
      fixed,
    );
    expect(coloring.legend).toEqual([]);
    expect(coloring.note).toMatch(/units/);
  });

  it('turns a coloring into theming assignments', () => {
    const coloring = colorByProperty(rows, DEFAULT_COLOR_BY, () => [
      '#ff0000',
      '#0000ff',
    ]);
    const assigned = coloringAssignments(coloring, 0.5);
    expect(assigned.get('m')?.get(1)).toEqual([0, 0, 1, 0.5]);
  });

  it('writes the legend as CSV with a guarded label', () => {
    const coloring = colorByProperty(
      [row(1, { Category: '=x' })],
      DEFAULT_COLOR_BY,
      () => ['#123456'],
    );
    expect(legendCsv(coloring)).toBe("Value,Color,Count\r\n'=x,#123456,1");
  });

  it('sanitizes a stored spec', () => {
    expect(
      sanitizeColorBy({
        property: '',
        topN: 999,
        overrides: { a: 'red', b: '#00ff00' },
      }),
    ).toEqual({
      ...DEFAULT_COLOR_BY,
      topN: 24,
      overrides: { b: '#00ff00' },
    });
  });
});

describe('colorByChart', () => {
  it('uses the chart buckets and colours, folding hidden values into Other', () => {
    const rows = ['A', 'A', 'B', 'C', 'D'].map((c, i) =>
      row(i + 1, { Category: c }),
    );
    const chart: ChartData = {
      property: 'Category',
      total: 5,
      data: [
        { label: 'A', count: 2 },
        { label: OTHER_LABEL, count: 3 },
      ],
    };
    const coloring = colorByChart(rows, chart, ['#111111', '#222222']);
    expect(coloring.origin).toBe('chart');
    expect(coloring.legend.map((e) => [e.label, e.color, e.count])).toEqual([
      ['A', '#111111', 2],
      [OTHER_LABEL, '#222222', 3],
    ]);
  });

  it('leaves out values the chart does not show when it has no Other bucket', () => {
    const rows = ['A', 'B'].map((c, i) => row(i + 1, { Category: c }));
    const chart: ChartData = {
      property: 'Category',
      total: 2,
      data: [{ label: 'A', count: 1 }],
    };
    expect(colorByChart(rows, chart, ['#111111']).legend[0]?.count).toBe(1);
  });

  it('normalizes a mixed chart colour to hex for theming and export', () => {
    const rows = [row(1, { Category: 'A' })];
    const chart: ChartData = {
      property: 'Category',
      total: 1,
      data: [{ label: 'A', count: 1 }],
    };
    const coloring = colorByChart(rows, chart, ['rgb(255, 0, 0)']);
    expect(coloring.legend[0]?.color).toBe('#ff0000');
    expect(coloringAssignments(coloring, 1).get('m')?.get(1)).toEqual([
      1, 0, 0, 1,
    ]);
  });
});
