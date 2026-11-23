import { beforeEach, describe, expect, it } from 'vitest';
import { exportSaved, importSaved, readSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  addChart,
  chartsFromProperties,
  DASHBOARD_PRESETS,
  DASHBOARD_USER_PRESETS,
  DEFAULT_DASHBOARD_VIEW,
  matchingPreset,
  patchChart,
  presetChartList,
  removeChart,
  sanitizeDashboardView,
  saveDashboardPreset,
  viewSpec,
} from './dashboardPresets.js';

describe('dashboard view sanitizer', () => {
  it('fills every chart spec field when the blob has none', () => {
    expect(sanitizeDashboardView({})).toMatchObject({
      aggregate: 'count',
      measure: '',
      topN: 12,
      otherBucket: true,
      maxCategories: 12,
      orientation: 'horizontal',
      sizes: [],
    });
    expect(sanitizeDashboardView(null).charts).toEqual([
      { id: 'c1', property: 'Category', chartType: 'bar', dataLabels: false },
      {
        id: 'c2',
        property: 'Category',
        chartType: 'doughnut',
        dataLabels: false,
      },
    ]);
  });

  it('turns a single-chart blob written by the previous build into a list', () => {
    const old = sanitizeDashboardView({
      kind: 'doughnut',
      maxCategories: 6,
      property: 'Level',
    });
    expect(old).toMatchObject({
      aggregate: 'count',
      measure: '',
      topN: 6,
      otherBucket: true,
    });
    expect(old.charts).toEqual([
      { id: 'c1', property: 'Level', chartType: 'doughnut', dataLabels: false },
    ]);
  });

  it('turns an old both view into a bar and a doughnut of one property', () => {
    for (const raw of [
      { kind: 'both', chartType: 'bar', property: 'Level' },
      { chartType: 'both', property: 'Level' },
      { property: 'Level' },
    ]) {
      expect(
        sanitizeDashboardView(raw).charts.map((c) => [c.property, c.chartType]),
      ).toEqual([
        ['Level', 'bar'],
        ['Level', 'doughnut'],
      ]);
    }
    expect(
      sanitizeDashboardView({ kind: 'bar', chartType: 'hbar' }).charts,
    ).toMatchObject([{ chartType: 'hbar' }]);
  });

  it('turns an old preset view into one chart per preset property', () => {
    const view = sanitizeDashboardView({ preset: 'discipline', kind: 'both' });
    expect(view.charts.map((c) => [c.id, c.property, c.chartType])).toEqual([
      ['c1', 'Discipline', 'bar'],
      ['c2', 'Category', 'bar'],
    ]);
    expect(
      sanitizeDashboardView({ preset: 'discipline', chartType: 'table' })
        .charts[0]?.chartType,
    ).toBe('table');
    expect(sanitizeDashboardView({ preset: 'nope' }).charts).toHaveLength(2);
  });

  it('reads the new chart list and repairs bad entries', () => {
    const view = sanitizeDashboardView({
      charts: [
        { id: 'a', property: 'Level', chartType: 'hbar', dataLabels: true },
        { id: 'a', property: 'Type', chartType: 'pie', name: '  Types  ' },
        { id: 'b', property: '  ' },
        'nope',
      ],
      orientation: 'vertical',
      sizes: [1, 3],
    });
    expect(view.charts).toEqual([
      { id: 'a', property: 'Level', chartType: 'hbar', dataLabels: true },
      {
        id: 'c2',
        property: 'Type',
        chartType: 'bar',
        dataLabels: false,
        name: 'Types',
      },
    ]);
    expect(view.orientation).toBe('vertical');
    expect(view.sizes).toEqual([0.25, 0.75]);
  });

  it('keeps an empty list and drops sizes that do not fit the list', () => {
    expect(sanitizeDashboardView({ charts: [] }).charts).toEqual([]);
    const charts = [{ property: 'Level' }, { property: 'Type' }];
    expect(sanitizeDashboardView({ charts, sizes: [1] }).sizes).toEqual([]);
    expect(sanitizeDashboardView({ charts, sizes: [1, -1] }).sizes).toEqual([]);
  });

  it('edits the chart list', () => {
    const base = sanitizeDashboardView({
      charts: [{ property: 'Level' }],
      sizes: [1],
    });
    const added = addChart(base);
    expect(added.charts.map((c) => [c.id, c.property])).toEqual([
      ['c1', 'Level'],
      ['c2', 'Level'],
    ]);
    expect(added.sizes).toEqual([]);
    const patched = patchChart(added, 'c2', {
      property: 'Type',
      dataLabels: true,
    });
    expect(patched.charts[1]).toMatchObject({
      property: 'Type',
      dataLabels: true,
    });
    expect(removeChart(patched, 'c1').charts.map((c) => c.id)).toEqual(['c2']);
    expect(
      addChart({ ...base, charts: chartsFromProperties(Array(12).fill('A')) })
        .charts,
    ).toHaveLength(12);
  });

  it('recognises a built-in preset by its chart list', () => {
    const preset = DASHBOARD_PRESETS[1];
    expect(preset && matchingPreset(presetChartList(preset))?.id).toBe(
      preset?.id,
    );
    expect(matchingPreset(DEFAULT_DASHBOARD_VIEW.charts)).toBeUndefined();
  });

  it('replaces corrupt values and ignores unknown fields', () => {
    const view = sanitizeDashboardView({
      kind: 'nope',
      chartType: 'pie',
      aggregate: 'median',
      measure: 42,
      topN: 'many',
      otherBucket: 'yes',
      maxCategories: 'many',
      orientation: 'diagonal',
      colour: 'red',
    });
    expect(view).toMatchObject({
      aggregate: 'count',
      measure: '',
      topN: 12,
      otherBucket: true,
      maxCategories: 12,
      orientation: 'horizontal',
    });
    expect(view.charts.map((c) => c.chartType)).toEqual(['bar', 'doughnut']);
    expect(view).not.toHaveProperty('colour');
  });

  it('clamps the top N and falls back to the saved category limit', () => {
    expect(sanitizeDashboardView({ topN: 2 }).topN).toBe(3);
    expect(sanitizeDashboardView({ topN: 500 }).topN).toBe(100);
    expect(sanitizeDashboardView({ topN: 8, otherBucket: false }).topN).toBe(8);
  });

  it('resolves spec defaults for a hand-written view', () => {
    const spec = viewSpec({
      ...DEFAULT_DASHBOARD_VIEW,
      aggregate: undefined,
      measure: undefined,
      topN: undefined,
      otherBucket: undefined,
    });
    expect(spec).toEqual({
      aggregate: 'count',
      measure: '',
      topN: DEFAULT_DASHBOARD_VIEW.maxCategories,
      otherBucket: true,
    });
  });
});

describe('saved chart specs', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('saves the aggregation, measure, type and buckets with the preset', () => {
    const view = {
      ...DEFAULT_DASHBOARD_VIEW,
      properties: ['Category', 'Volume'],
      aggregate: 'sum' as const,
      measure: 'Volume',
      topN: 7,
      otherBucket: false,
    };
    expect(saveDashboardPreset('Quantities', view)).toBe(true);
    const saved = DASHBOARD_USER_PRESETS.list()[0];
    expect(saved?.data).toMatchObject({
      aggregate: 'sum',
      measure: 'Volume',
      topN: 7,
      otherBucket: false,
    });
  });

  it('survives a JSON export and import round trip', () => {
    saveDashboardPreset('Quantities', {
      ...DEFAULT_DASHBOARD_VIEW,
      aggregate: 'avg',
      measure: 'Volume',
      topN: 4,
      otherBucket: true,
    });
    const file = exportSaved('dashboard-preset');
    expect(file).toContain('"aggregate": "avg"');
    installMemoryStorage();
    const result = importSaved(file);
    expect(result.accepted).toBe(1);
    const item = readSaved('dashboard-preset')[0];
    expect(item?.data).toMatchObject({
      aggregate: 'avg',
      measure: 'Volume',
      topN: 4,
      otherBucket: true,
    });
  });

  it('keeps the spec when a saved preset is applied', () => {
    window.localStorage.setItem(
      'bsh.saved.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'x',
            kind: 'dashboard-preset',
            name: 'Spec',
            version: 1,
            updatedAt: 1,
            data: {
              aggregate: 'max',
              measure: 'Length',
              chartType: 'hbar',
              topN: 9,
              otherBucket: false,
            },
          },
        ],
      }),
    );
    const item = DASHBOARD_USER_PRESETS.list()[0];
    const applied = sanitizeDashboardView(item?.data);
    expect(applied).toMatchObject({
      aggregate: 'max',
      measure: 'Length',
      topN: 9,
      otherBucket: false,
    });
    expect(applied.charts).toMatchObject([{ chartType: 'hbar' }]);
  });
});
