import { isRecord } from '../../shared/guards.js';
import type { PropertyRow } from '../../shared/types.js';
import type { Color } from '../viewer/colorLayers.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import {
  type ChartData,
  countByProperty,
  measureUnits,
  OTHER_COLOR,
  OTHER_LABEL,
} from './dashboardData.js';
import { toDelimited } from './exportFormats.js';
import { type ParsedMeasure, parseMeasure } from './measureParse.js';
import { formatValue } from './modelSummary.js';
import { hexToRgba, PAINT_PALETTES } from './paintBrushes.js';

export type ColoringOrigin = 'property' | 'chart' | 'rules';
export type ColorMode = 'category' | 'range';

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
  count: number;
}

export interface Coloring {
  origin: ColoringOrigin;
  title: string;
  legend: LegendEntry[];
  byElement: Map<string, Map<number, number>>;
  note?: string;
}

export interface ColorBySpec {
  property: string;
  mode: ColorMode;
  topN: number;
  overrides: Record<string, string>;
}

export type PaletteFn = (labels: readonly string[]) => string[];

const RGB = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/;

export function toHexColor(color: string): string {
  const rgb = RGB.exec(color.trim());
  if (!rgb) return color;
  return `#${rgb
    .slice(1)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

export const COLOR_TOP_N_MIN = 3;
export const COLOR_TOP_N_MAX = 24;
export const RANGE_BINS = 6;
export const NO_VALUE_LABEL = '(no value)';
const HEX = /^#[0-9a-f]{6}$/i;
const RANGE_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

export const DEFAULT_COLOR_BY: ColorBySpec = {
  property: 'Category',
  mode: 'category',
  topN: 10,
  overrides: {},
};

export function sanitizeColorBy(raw: unknown): ColorBySpec {
  const source = isRecord(raw) ? raw : {};
  const property =
    typeof source.property === 'string' && source.property.trim()
      ? source.property.trim()
      : DEFAULT_COLOR_BY.property;
  const topN =
    typeof source.topN === 'number' && Number.isFinite(source.topN)
      ? Math.min(
          COLOR_TOP_N_MAX,
          Math.max(COLOR_TOP_N_MIN, Math.floor(source.topN)),
        )
      : DEFAULT_COLOR_BY.topN;
  const overrides: Record<string, string> = {};
  if (isRecord(source.overrides)) {
    for (const [label, hex] of Object.entries(source.overrides)) {
      if (typeof hex === 'string' && HEX.test(hex))
        overrides[label] = hex.toLowerCase();
    }
  }
  return {
    property,
    mode: source.mode === 'range' ? 'range' : 'category',
    topN,
    overrides,
  };
}

export function buildColoring(
  origin: ColoringOrigin,
  title: string,
  rows: readonly PropertyRow[],
  labelOf: (row: PropertyRow) => string | null,
  labels: readonly string[],
  colors: readonly string[],
): Coloring {
  const index = new Map(labels.map((label, i) => [label, i]));
  const counts = labels.map(() => 0);
  const byElement = new Map<string, Map<number, number>>();
  for (const row of rows) {
    if (row.modelId === undefined) continue;
    const label = labelOf(row);
    const at = label === null ? undefined : index.get(label);
    if (at === undefined) continue;
    counts[at] = (counts[at] ?? 0) + 1;
    let ids = byElement.get(row.modelId);
    if (!ids) {
      ids = new Map();
      byElement.set(row.modelId, ids);
    }
    ids.set(row.dbId, at);
  }
  return {
    origin,
    title,
    byElement,
    legend: labels.map((label, i) => ({
      key: label,
      label,
      color: toHexColor(colors[i] ?? OTHER_COLOR),
      count: counts[i] ?? 0,
    })),
  };
}

function categoryColoring(
  rows: readonly PropertyRow[],
  spec: ColorBySpec,
  palette: PaletteFn,
): Coloring {
  const all = countByProperty(rows, spec.property).map((d) => d.label);
  const folded = all.length > spec.topN;
  const shown = folded ? all.slice(0, spec.topN - 1) : all;
  const labels = folded ? [...shown, OTHER_LABEL] : shown;
  const kept = new Set(shown);
  const colors = palette(labels).map(
    (color, i) => spec.overrides[labels[i] ?? ''] ?? color,
  );
  return buildColoring(
    'property',
    spec.property,
    rows,
    (row) => {
      const label = formatValue(row.properties[spec.property]);
      return kept.has(label) ? label : folded ? OTHER_LABEL : null;
    },
    labels,
    colors,
  );
}

function quantileEdges(values: readonly number[], bins: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const edges: number[] = [];
  for (let i = 1; i < bins; i += 1) {
    const edge = sorted[Math.floor((i * sorted.length) / bins)];
    if (edge !== undefined && edge !== edges.at(-1)) edges.push(edge);
  }
  return edges;
}

function spread(colors: readonly string[], count: number): string[] {
  if (count <= 1) return colors.slice(0, 1);
  return Array.from(
    { length: count },
    (_, i) =>
      colors[Math.round((i * (colors.length - 1)) / (count - 1))] ??
      OTHER_COLOR,
  );
}

function rangeColoring(
  rows: readonly PropertyRow[],
  spec: ColorBySpec,
): Coloring {
  const parsed = new Map<PropertyRow, number>();
  const measures: ParsedMeasure[] = [];
  for (const row of rows) {
    const measure = parseMeasure(row.properties[spec.property]);
    if (!measure) continue;
    measures.push(measure);
    parsed.set(row, measure.value * measure.factor);
  }
  const units = measureUnits(measures);
  if (units.mixed) {
    return {
      ...buildColoring('property', spec.property, [], () => null, [], []),
      note: `Values mix units (${units.units.join(', ')}), so they cannot be ranged`,
    };
  }
  const edges = quantileEdges([...parsed.values()], RANGE_BINS);
  const unit = units.unit ? ` ${units.unit}` : '';
  const fmt = (n: number) => RANGE_FORMAT.format(n);
  const ranges = [
    `< ${fmt(edges[0] ?? 0)}${unit}`,
    ...edges
      .slice(1)
      .map((edge, i) => `${fmt(edges[i] ?? 0)} – ${fmt(edge)}${unit}`),
    `≥ ${fmt(edges.at(-1) ?? 0)}${unit}`,
  ];
  const values = [...parsed.values()];
  const labels =
    edges.length === 0 ? [`${fmt(values[0] ?? 0)}${unit}`] : ranges;
  const viridis =
    PAINT_PALETTES.find((p) => p.id === 'viridis')?.swatches.map(
      (s) => s.hex,
    ) ?? [];
  const missing = rows.length > parsed.size;
  return buildColoring(
    'property',
    spec.property,
    rows,
    (row) => {
      const value = parsed.get(row);
      if (value === undefined) return missing ? NO_VALUE_LABEL : null;
      return labels[edges.filter((edge) => edge <= value).length] ?? null;
    },
    missing ? [...labels, NO_VALUE_LABEL] : labels,
    missing
      ? [...spread(viridis, labels.length), OTHER_COLOR]
      : spread(viridis, labels.length),
  );
}

export function colorByProperty(
  rows: readonly PropertyRow[],
  spec: ColorBySpec,
  palette: PaletteFn,
): Coloring {
  return spec.mode === 'range'
    ? rangeColoring(rows, spec)
    : categoryColoring(rows, spec, palette);
}

export function colorByChart(
  rows: readonly PropertyRow[],
  chart: ChartData,
  colors: readonly string[],
): Coloring {
  const labels = chart.data.map((d) => d.label);
  const shown = new Set(labels);
  const other = shown.has(OTHER_LABEL);
  return buildColoring(
    'chart',
    chart.measure ? `${chart.property} (${chart.measure})` : chart.property,
    rows,
    (row) => {
      const label = formatValue(row.properties[chart.property]);
      return shown.has(label) ? label : other ? OTHER_LABEL : null;
    },
    labels,
    colors,
  );
}

export function coloringAssignments(
  coloring: Coloring,
  strength: number,
): Map<string, Map<number, Color>> {
  const colors = coloring.legend.map((entry) =>
    hexToRgba(entry.color, strength),
  );
  const out = new Map<string, Map<number, Color>>();
  for (const [modelId, ids] of coloring.byElement) {
    const model = new Map<number, Color>();
    for (const [dbId, at] of ids) {
      const color = colors[at];
      if (color) model.set(dbId, color);
    }
    out.set(modelId, model);
  }
  return out;
}

export function entryItems(coloring: Coloring, index: number): ModelDbId[] {
  const items: ModelDbId[] = [];
  for (const [modelId, ids] of coloring.byElement) {
    for (const [dbId, at] of ids)
      if (at === index) items.push({ modelId, dbId });
  }
  return items;
}

export function entryOf(
  coloring: Coloring,
  modelId: string,
  dbId: number,
): LegendEntry | null {
  const at = coloring.byElement.get(modelId)?.get(dbId);
  return at === undefined ? null : (coloring.legend[at] ?? null);
}

export function legendCsv(coloring: Coloring): string {
  return toDelimited(
    ['Value', 'Color', 'Count'],
    coloring.legend.map((entry) => [entry.label, entry.color, entry.count]),
    ',',
  );
}
