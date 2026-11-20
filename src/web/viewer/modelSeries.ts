import type { PropertyRow } from '../../shared/types.js';
import {
  type ChartData,
  type ChartSeries,
  OTHER_LABEL,
} from '../extensions/dashboardData.js';
import { formatValue } from '../extensions/modelSummary.js';

export interface ModelCount {
  modelId: string;
  name: string;
  count: number;
}

export function modelCounts(rows: readonly PropertyRow[]): ModelCount[] {
  const counts = new Map<string, ModelCount>();
  for (const row of rows) {
    if (row.modelId === undefined) continue;
    const seen = counts.get(row.modelId);
    if (seen) {
      seen.count += 1;
    } else {
      counts.set(row.modelId, {
        modelId: row.modelId,
        name: row.modelName ?? row.modelId,
        count: 1,
      });
    }
  }
  return [...counts.values()];
}

export function formatModelCounts(counts: readonly ModelCount[]): string {
  return counts
    .map((entry) => `${entry.name} ${entry.count.toLocaleString('en-US')}`)
    .join(', ');
}

export function splitByModel(
  chart: ChartData,
  rows: readonly PropertyRow[],
): ChartData {
  const slots = new Map(chart.data.map((datum, index) => [datum.label, index]));
  const seen = new Map<string, ChartSeries>();
  for (const row of rows) {
    if (row.modelId === undefined) continue;
    const value = formatValue(row.properties[chart.property]);
    const slot = slots.get(value) ?? slots.get(OTHER_LABEL);
    if (slot === undefined) continue;
    const series = seen.get(row.modelId) ?? {
      modelId: row.modelId,
      label: row.modelName ?? row.modelId,
      counts: chart.data.map(() => 0),
    };
    series.counts[slot] = (series.counts[slot] ?? 0) + 1;
    seen.set(row.modelId, series);
  }
  if (seen.size < 2) return chart;
  return { ...chart, series: [...seen.values()] };
}
