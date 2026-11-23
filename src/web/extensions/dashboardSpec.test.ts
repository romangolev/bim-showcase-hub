import { beforeEach, describe, expect, it } from 'vitest';
import { exportSaved, importSaved, readSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  DASHBOARD_USER_PRESETS,
  DEFAULT_DASHBOARD_VIEW,
  sanitizeDashboardView,
  saveDashboardPreset,
  viewSpec,
  withChartType,
} from './dashboardPresets.js';

describe('dashboard view sanitizer', () => {
  it('fills every chart spec field when the blob has none', () => {
    expect(sanitizeDashboardView({})).toMatchObject({
      chartType: 'both',
      aggregate: 'count',
      measure: '',
      topN: 12,
      otherBucket: true,
      kind: 'both',
      maxCategories: 12,
    });
    expect(sanitizeDashboardView(null)).toMatchObject({
      chartType: 'both',
      aggregate: 'count',
    });
  });

  it('reads a blob written by the previous build', () => {
    const old = sanitizeDashboardView({
      kind: 'doughnut',
      maxCategories: 6,
      property: 'Level',
    });
    expect(old).toMatchObject({
      chartType: 'doughnut',
      aggregate: 'count',
      measure: '',
      topN: 6,
      otherBucket: true,
      kind: 'doughnut',
    });
  });

  it('keeps the pair for an old both view and lets settings change it', () => {
    expect(
      sanitizeDashboardView({ kind: 'both', chartType: 'bar' }),
    ).toMatchObject({ chartType: 'both', kind: 'both' });
    expect(sanitizeDashboardView({ chartType: 'both' })).toMatchObject({
      chartType: 'both',
      kind: 'both',
    });
    expect(
      sanitizeDashboardView({ kind: 'bar', chartType: 'hbar' }),
    ).toMatchObject({ chartType: 'hbar', kind: 'bar' });
    const view = withChartType(DEFAULT_DASHBOARD_VIEW, 'doughnut');
    expect(view).toMatchObject({ chartType: 'doughnut', kind: 'doughnut' });
    expect(withChartType(view, 'both')).toMatchObject({
      chartType: 'both',
      kind: 'both',
    });
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
      colour: 'red',
    });
    expect(view).toMatchObject({
      chartType: 'both',
      aggregate: 'count',
      measure: '',
      topN: 12,
      otherBucket: true,
      maxCategories: 12,
    });
    expect(view).not.toHaveProperty('colour');
  });

  it('clamps the top N and falls back to the saved category limit', () => {
    expect(sanitizeDashboardView({ topN: 2 }).topN).toBe(3);
    expect(sanitizeDashboardView({ topN: 500 }).topN).toBe(100);
    expect(
      sanitizeDashboardView({ topN: 8, chartType: 'table', otherBucket: false })
        .topN,
    ).toBe(8);
  });

  it('resolves spec defaults for a hand-written view', () => {
    const spec = viewSpec({
      ...DEFAULT_DASHBOARD_VIEW,
      chartType: undefined,
      aggregate: undefined,
      measure: undefined,
      topN: undefined,
      otherBucket: undefined,
    });
    expect(spec).toEqual({
      chartType: 'both',
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
      property: 'Category',
      properties: ['Category', 'Volume'],
      aggregate: 'sum' as const,
      measure: 'Volume',
      chartType: 'hbar' as const,
      topN: 7,
      otherBucket: false,
    };
    expect(saveDashboardPreset('Quantities', view)).toBe(true);
    const saved = DASHBOARD_USER_PRESETS.list()[0];
    expect(saved?.data).toMatchObject({
      aggregate: 'sum',
      measure: 'Volume',
      chartType: 'hbar',
      topN: 7,
      otherBucket: false,
    });
  });

  it('survives a JSON export and import round trip', () => {
    saveDashboardPreset('Quantities', {
      ...DEFAULT_DASHBOARD_VIEW,
      aggregate: 'avg',
      measure: 'Volume',
      chartType: 'table',
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
      chartType: 'table',
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
      chartType: 'hbar',
      topN: 9,
      otherBucket: false,
    });
  });
});
