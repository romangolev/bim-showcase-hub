import { describe, expect, it } from 'vitest';
import { chartDelimited, chartTable } from './chartExport.js';
import { DASHBOARD_PRESETS, presetCharts } from './dashboardPresets.js';

const chart = {
  property: 'Category',
  total: 5,
  data: [
    { label: 'Walls', count: 3 },
    { label: '=SUM(A1)', count: 2 },
  ],
};

describe('chart export', () => {
  it('builds a table of buckets', () => {
    expect(chartTable(chart)).toEqual({
      header: ['Category', 'Count'],
      rows: [
        ['Walls', 3],
        ['=SUM(A1)', 2],
      ],
    });
  });

  it('writes CSV and TSV with the formula guard', () => {
    expect(chartDelimited(chart, ',')).toBe(
      "Category,Count\r\nWalls,3\r\n'=SUM(A1),2",
    );
    expect(chartDelimited(chart, '\t').split('\r\n')[0]).toBe(
      'Category\tCount',
    );
  });
});

describe('dashboard presets', () => {
  it('keeps only charts whose property exists', () => {
    const rows = [
      { dbId: 1, name: 'a', properties: { Category: 'Walls', Level: null } },
    ];
    const health = DASHBOARD_PRESETS.find((p) => p.id === 'health');
    expect(health && presetCharts(health, rows)).toEqual(['Category']);
    const discipline = DASHBOARD_PRESETS.find((p) => p.id === 'discipline');
    expect(discipline && presetCharts(discipline, rows)).toEqual(['Category']);
  });
});
