import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  buildChart,
  CHART_PALETTES,
  type ChartPaletteId,
  type ChartTheme,
  formatMeasure,
  OTHER_COLOR,
  OTHER_LABEL,
  parseMeasure,
  seriesColors,
  shapeChartData,
} from './dashboardData.js';
import { PAINT_PALETTES } from './paintBrushes.js';

const row = (dbId: number, properties: PropertyRow['properties']) => ({
  dbId,
  name: String(dbId),
  properties,
});

describe('parseMeasure', () => {
  it('strips thousands separators and keeps sign and decimals', () => {
    expect(parseMeasure('1,234.5 mm')).toMatchObject({
      value: 1234.5,
      family: 'length',
    });
    expect(parseMeasure('-3.5')).toMatchObject({
      value: -3.5,
      family: 'unitless',
    });
    expect(parseMeasure('1 234,5 kg')).toMatchObject({
      value: 1234.5,
      family: 'mass',
    });
    expect(parseMeasure('0,125 m')).toMatchObject({ value: 0.125 });
  });

  it('reads a trailing unit and converts within one family', () => {
    expect(parseMeasure('12 m²')).toMatchObject({
      value: 12,
      family: 'area',
      factor: 1,
    });
    expect(parseMeasure('500 mm')).toMatchObject({ factor: 0.001 });
    expect(parseMeasure('12 in')).toMatchObject({ factor: 0.0254 });
  });

  it('accepts numbers and rejects text without one', () => {
    expect(parseMeasure(42)).toMatchObject({ value: 42, family: 'unitless' });
    expect(parseMeasure('Walls')).toBeNull();
    expect(parseMeasure('')).toBeNull();
    expect(parseMeasure(null)).toBeNull();
    expect(parseMeasure(true)).toBeNull();
    expect(parseMeasure(Number.NaN)).toBeNull();
  });

  it('formats a value with its unit', () => {
    expect(formatMeasure(2.5, 'm')).toBe('2.5 m');
    expect(formatMeasure(1234.5, null)).toBe('1,234.5');
  });
});

describe('buildChart', () => {
  const rows = [
    row(1, { Category: 'Walls', Length: '2 m', Cost: '10' }),
    row(2, { Category: 'Walls', Length: '500 mm', Cost: '30' }),
    row(3, { Category: 'Doors', Length: '1.5 m', Cost: '20' }),
    row(4, { Category: 'Doors', Length: 'n/a', Cost: '' }),
  ];

  it('keeps the count chart shape unchanged', () => {
    expect(
      buildChart(rows, { property: 'Category', aggregate: 'count' }),
    ).toEqual({
      property: 'Category',
      total: 4,
      data: [
        { label: 'Doors', count: 2 },
        { label: 'Walls', count: 2 },
      ],
    });
    expect(
      buildChart(rows, {
        property: 'Category',
        aggregate: 'count',
        topN: 2,
      }).data,
    ).toHaveLength(2);
  });

  it('sums a measure and converts mm to m', () => {
    const chart = buildChart(rows, {
      property: 'Category',
      aggregate: 'sum',
      measure: 'Length',
    });
    expect(chart.unit).toBe('m');
    expect(chart.numeric).toBe(3);
    expect(chart.missing).toBe(1);
    expect(chart.data).toEqual([
      { label: 'Walls', count: 2, value: 2.5 },
      { label: 'Doors', count: 2, value: 1.5 },
    ]);
  });

  it('averages, takes the minimum and the maximum over the numeric cells', () => {
    const avg = buildChart(rows, {
      property: 'Category',
      aggregate: 'avg',
      measure: 'Length',
    });
    expect(avg.data?.find((datum) => datum.label === 'Walls')).toMatchObject({
      value: 1.25,
    });
    const min = buildChart(rows, {
      property: 'Category',
      aggregate: 'min',
      measure: 'Length',
    });
    expect(min.data?.find((datum) => datum.label === 'Walls')).toMatchObject({
      value: 0.5,
    });
    const max = buildChart(rows, {
      property: 'Category',
      aggregate: 'max',
      measure: 'Length',
    });
    expect(max.data?.find((datum) => datum.label === 'Walls')).toMatchObject({
      value: 2,
    });
  });

  it('keeps counts beside numeric values', () => {
    const chart = buildChart(rows, {
      property: 'Category',
      aggregate: 'sum',
      measure: 'Cost',
    });
    expect(chart.data).toEqual([
      { label: 'Walls', count: 2, value: 40 },
      { label: 'Doors', count: 2, value: 20 },
    ]);
    expect(chart.unit).toBeUndefined();
  });

  it('marks different unit families as mixed instead of summing', () => {
    const mixed = buildChart(
      [
        row(1, { Category: 'Walls', Size: '2 m' }),
        row(2, { Category: 'Walls', Size: '4 kg' }),
      ],
      { property: 'Category', aggregate: 'sum', measure: 'Size' },
    );
    expect(mixed.mixed).toBe(true);
    expect(mixed.data).toEqual([]);
    expect(mixed.units).toEqual(['kg', 'm']);
    expect(mixed.numeric).toBe(2);
  });

  it('treats a value without a unit as mixed with a measured value', () => {
    const mixed = buildChart(
      [
        row(1, { Category: 'Walls', Size: '10' }),
        row(2, { Category: 'Walls', Size: '2 m' }),
      ],
      { property: 'Category', aggregate: 'sum', measure: 'Size' },
    );
    expect(mixed.mixed).toBe(true);
    expect(mixed.units).toEqual(['m', 'unitless']);
  });

  it('is unavailable when the property has no numbers', () => {
    const chart = buildChart([row(1, { Category: 'Walls', Length: 'n/a' })], {
      property: 'Category',
      aggregate: 'sum',
      measure: 'Length',
    });
    expect(chart.unavailable).toBe(true);
    expect(chart.data).toEqual([]);
    expect(chart.numeric).toBe(0);
  });

  it('is unavailable when no measure is chosen', () => {
    const chart = buildChart(rows, {
      property: 'Category',
      aggregate: 'sum',
      measure: '',
    });
    expect(chart.unavailable).toBe(true);
  });

  it('folds the long tail into Other and keeps the totals', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      row(index + 1, {
        Category: `C${index}`,
        Length: `${index + 1} m`,
      }),
    );
    const chart = buildChart(many, {
      property: 'Category',
      aggregate: 'sum',
      measure: 'Length',
      topN: 3,
      otherBucket: true,
    });
    expect(chart.data).toHaveLength(3);
    const other = chart.data?.at(-1);
    expect(other?.label).toBe(OTHER_LABEL);
    expect(other?.value).toBe(4 + 3 + 2 + 1);
    expect(other?.count).toBe(4);
    expect(
      chart.data?.reduce((sum, datum) => sum + (datum.value ?? 0), 0),
    ).toBe(21);
  });

  it('drops the tail when the Other bucket is off', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      row(index + 1, { Category: `C${index}`, Length: `${index + 1} m` }),
    );
    const chart = buildChart(many, {
      property: 'Category',
      aggregate: 'sum',
      measure: 'Length',
      topN: 3,
      otherBucket: false,
    });
    expect(chart.data?.map((datum) => datum.label)).toEqual(['C5', 'C4', 'C3']);
  });

  it('handles an empty model and a single value', () => {
    expect(
      buildChart([], { property: 'Category', aggregate: 'count' }),
    ).toEqual({
      property: 'Category',
      total: 0,
      data: [],
    });
    const single = buildChart([row(1, { Category: 'Walls', Length: '2 m' })], {
      property: 'Category',
      aggregate: 'sum',
      measure: 'Length',
    });
    expect(single.data).toEqual([{ label: 'Walls', count: 1, value: 2 }]);
  });

  it('keeps shapeChartData as the count path', () => {
    expect(shapeChartData(rows, 'Category', 12)).toEqual(
      buildChart(rows, { property: 'Category', aggregate: 'count', topN: 12 }),
    );
  });
});

describe('chart units', () => {
  it('reports each family once in the mixed message', () => {
    const chart = buildChart(
      [
        row(1, { Category: 'A', Size: '1 mm' }),
        row(2, { Category: 'A', Size: '2 cm' }),
        row(3, { Category: 'B', Size: '3 kg' }),
      ],
      { property: 'Category', aggregate: 'sum', measure: 'Size' },
    );
    expect(chart.mixed).toBe(true);
    expect(chart.units).toEqual(['kg', 'm']);
  });
});

describe('seriesColors palette', () => {
  const theme: ChartTheme = {
    scheme: 'dark',
    text: '#858687',
    label: '#cececf',
    grid: 'rgba(255,255,255,0.06)',
    surface: '#131416',
    fontFamily: 'Inter',
    fontWeight: '420',
    fontSize: 12,
  };

  it('keeps the theme palette by default', () => {
    const labels = ['Walls', 'Doors'];
    expect(seriesColors(theme, labels)).toEqual(
      seriesColors(theme, labels, 'default'),
    );
    for (const color of seriesColors(theme, labels)) {
      expect(CHART_PALETTES.dark).toContain(color);
    }
  });

  it('takes its colours from the chosen palette and keeps Other grey', () => {
    const colors = seriesColors(theme, ['A', OTHER_LABEL], 'okabe-ito');
    const okabe = PAINT_PALETTES.find(
      (p) => p.id === 'okabe-ito',
    )?.swatches.map((s) => s.hex.toLowerCase());
    expect(okabe).toContain(colors[0]?.toLowerCase());
    expect(colors[1]).toBe(OTHER_COLOR);
  });

  it('falls back to the theme palette for an unknown id', () => {
    expect(seriesColors(theme, ['Walls'], 'nope' as ChartPaletteId)).toEqual(
      seriesColors(theme, ['Walls']),
    );
  });
});

describe('measure parsing edge cases', () => {
  it('reads locale grouping and rejects values it cannot read', () => {
    expect(parseMeasure('1.000,5 m²')).toMatchObject({
      value: 1000.5,
      family: 'area',
    });
    expect(parseMeasure('1,000.5 m²')).toMatchObject({ value: 1000.5 });
    expect(parseMeasure('1.234')).toBeNull();
    expect(parseMeasure('0.125 m')).toMatchObject({ value: 0.125 });
    expect(parseMeasure('12 кг')).toMatchObject({
      value: 12,
      family: 'unit:кг',
    });
    expect(parseMeasure('2.5 kg/m³')).toMatchObject({
      value: 2.5,
      family: 'unit:kg/m3',
    });
    expect(parseMeasure('2:30')).toBeNull();
    expect(parseMeasure('1e5')).toBeNull();
  });
});
