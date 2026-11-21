import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { OTHER_LABEL, shapeChartData } from '../extensions/dashboardData.js';
import { formatModelCounts, modelCounts, splitByModel } from './modelSeries.js';

function row(
  modelId: string,
  modelName: string,
  category: string,
  dbId: number,
): PropertyRow {
  return {
    dbId,
    name: `El ${dbId}`,
    properties: { Category: category },
    modelId,
    modelName,
  };
}

describe('modelCounts', () => {
  it('counts rows per model in first-seen order', () => {
    const rows: PropertyRow[] = [
      { dbId: 1, name: 'x', properties: {}, modelId: 'b', modelName: 'B.rvt' },
      { dbId: 1, name: 'x', properties: {}, modelId: 'a', modelName: 'A.rvt' },
      { dbId: 2, name: 'y', properties: {}, modelId: 'b', modelName: 'B.rvt' },
    ];
    expect(modelCounts(rows)).toEqual([
      { modelId: 'b', name: 'B.rvt', count: 2 },
      { modelId: 'a', name: 'A.rvt', count: 1 },
    ]);
    expect(formatModelCounts(modelCounts(rows))).toBe('B.rvt 2, A.rvt 1');
  });

  it('ignores untagged rows and falls back to the model id', () => {
    expect(modelCounts([{ dbId: 1, name: 'x', properties: {} }])).toEqual([]);
    expect(
      modelCounts([{ dbId: 1, name: 'x', properties: {}, modelId: 'a' }]),
    ).toEqual([{ modelId: 'a', name: 'a', count: 1 }]);
  });
});

describe('splitByModel', () => {
  const rows = [
    row('a', 'A.rvt', 'Walls', 1),
    row('a', 'A.rvt', 'Doors', 2),
    row('b', 'B.rvt', 'Walls', 1),
    row('b', 'B.rvt', 'Pipes', 2),
  ];

  it('splits each category count by model and keeps the Other bucket', () => {
    const chart = shapeChartData(rows, 'Category', 2);
    expect(chart.data.map((d) => d.label)).toEqual(['Walls', OTHER_LABEL]);
    expect(chart.data[1]?.count).toBe(2);
    expect(splitByModel(chart, rows)).toEqual({
      ...chart,
      series: [
        { modelId: 'a', label: 'A.rvt', counts: [1, 1] },
        { modelId: 'b', label: 'B.rvt', counts: [1, 1] },
      ],
    });
  });

  it('leaves a chart from one model alone', () => {
    const single = [
      row('a', 'A.rvt', 'Walls', 1),
      row('a', 'A.rvt', 'Doors', 2),
    ];
    const chart = shapeChartData(single, 'Category');
    expect(splitByModel(chart, single)).toBe(chart);
  });

  it('aligns an untagged row with no model at all', () => {
    const chart = shapeChartData(rows, 'Category', 2);
    const untagged: PropertyRow[] = [
      { dbId: 9, name: 'x', properties: { Category: 'Walls' } },
    ];
    expect(splitByModel(chart, untagged)).toBe(chart);
  });
});
