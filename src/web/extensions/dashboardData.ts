import type { PropertyRow } from '../../shared/types.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import { type ParsedMeasure, parseMeasure } from './measureParse.js';
import { EMPTY_VALUE_LABEL, formatValue } from './modelSummary.js';

export const DEFAULT_DASHBOARD_PROPERTIES: readonly string[] = [
  'Category',
  'Level',
  'Assembly Code',
  'Classification Code',
  'Name',
];

export { type ParsedMeasure, parseMeasure };

export const OTHER_LABEL = 'Other';
export const DEFAULT_MAX_CATEGORIES = 12;
export const DEFAULT_TOP_N = DEFAULT_MAX_CATEGORIES;
export const TOP_N_MIN = 3;
export const TOP_N_MAX = 100;

export const AGGREGATES = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type Aggregate = (typeof AGGREGATES)[number];
export const AGGREGATE_LABELS: Record<Aggregate, string> = {
  count: 'Count',
  sum: 'Sum',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
};

export const CHART_TYPES = ['bar', 'hbar', 'doughnut', 'table'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  hbar: 'Horizontal bars',
  doughnut: 'Doughnut',
  table: 'Table',
};

export function sanitizeAggregate(raw: unknown): Aggregate {
  return AGGREGATES.find((aggregate) => aggregate === raw) ?? 'count';
}

export function sanitizeChartType(raw: unknown): ChartType {
  return CHART_TYPES.find((type) => type === raw) ?? 'bar';
}

export interface ChartDatum {
  label: string;
  count: number;
  value?: number;
}

export interface ChartData {
  property: string;
  total: number;
  data: ChartDatum[];
  aggregate?: Aggregate;
  measure?: string;
  unit?: string;
  numeric?: number;
  missing?: number;
  mixed?: boolean;
  units?: string[];
  unavailable?: boolean;
}

export interface ChartSpec {
  property: string;
  aggregate: Aggregate;
  measure?: string;
  topN?: number;
  otherBucket?: boolean;
}

const BASE_UNITS: Record<string, string> = {
  length: 'm',
  area: 'm²',
  volume: 'm³',
  mass: 'kg',
  time: 's',
  angle: '°',
  percent: '%',
};

function unitLabel(family: string, tokens: ReadonlySet<string>): string | null {
  if (family === 'unitless') return null;
  if (family === 'currency' || family.startsWith('unit:')) {
    return [...tokens][0] ?? null;
  }
  return BASE_UNITS[family] ?? null;
}

export interface MeasureUnits {
  mixed: boolean;
  unit: string | null;
  units: string[];
}

export function measureUnits(values: readonly ParsedMeasure[]): MeasureUnits {
  const families = new Set<string>();
  const tokens = new Set<string>();
  for (const value of values) {
    families.add(value.family);
    tokens.add(value.unit ?? '');
  }
  const family = families.size === 1 ? ([...families][0] ?? '') : '';
  const mixed =
    families.size > 1 ||
    (family === 'currency' && tokens.size > 1) ||
    (family.startsWith('unit:') && tokens.size > 1);
  if (mixed) {
    const labels = new Set<string>();
    for (const name of families) {
      if (name.startsWith('unit:')) labels.add(name.slice('unit:'.length));
      else if (name === 'currency') {
        for (const token of tokens) labels.add(token);
      } else {
        labels.add(BASE_UNITS[name] ?? name);
      }
    }
    return { mixed: true, unit: null, units: [...labels].sort() };
  }
  if (families.size === 0) return { mixed: false, unit: null, units: [] };
  return { mixed: false, unit: unitLabel(family, tokens), units: [] };
}

const DISPLAY_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

export function formatMeasure(
  value: number,
  unit: string | null | undefined,
): string {
  const text = DISPLAY_FORMAT.format(value);
  return unit ? `${text} ${unit}` : text;
}

export function countByProperty(
  rows: readonly PropertyRow[],
  property: string,
): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = formatValue(row.properties[property]);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function shapeChartData(
  rows: readonly PropertyRow[],
  property: string,
  maxCategories = DEFAULT_MAX_CATEGORIES,
  otherBucket = true,
): ChartData {
  const all = countByProperty(rows, property);
  const total = all.reduce((sum, d) => sum + d.count, 0);
  if (all.length <= maxCategories) return { property, total, data: all };
  if (!otherBucket) {
    return { property, total, data: all.slice(0, maxCategories) };
  }
  const head = all.slice(0, maxCategories - 1);
  const rest = all.slice(maxCategories - 1);
  const other = rest.reduce((sum, d) => sum + d.count, 0);
  return {
    property,
    total,
    data: [...head, { label: OTHER_LABEL, count: other }],
  };
}

interface MeasureCell {
  label: string;
  count: number;
  numeric: number;
  sum: number;
  min: number;
  max: number;
}

interface ScoredCell extends MeasureCell {
  value?: number;
}

function scoredValue(
  cell: MeasureCell,
  aggregate: Aggregate,
): number | undefined {
  if (cell.numeric === 0) return undefined;
  if (aggregate === 'sum') return cell.sum;
  if (aggregate === 'avg') return cell.sum / cell.numeric;
  if (aggregate === 'min') return cell.min;
  return cell.max;
}

function mergeCells(cells: readonly MeasureCell[]): MeasureCell {
  return cells.reduce<MeasureCell>(
    (merged, cell) => ({
      label: OTHER_LABEL,
      count: merged.count + cell.count,
      numeric: merged.numeric + cell.numeric,
      sum: merged.sum + cell.sum,
      min: Math.min(merged.min, cell.min),
      max: Math.max(merged.max, cell.max),
    }),
    {
      label: OTHER_LABEL,
      count: 0,
      numeric: 0,
      sum: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    },
  );
}

export function buildChart(
  rows: readonly PropertyRow[],
  spec: ChartSpec,
): ChartData {
  const topN = Math.min(
    TOP_N_MAX,
    Math.max(TOP_N_MIN, Math.floor(spec.topN ?? DEFAULT_TOP_N)),
  );
  const otherBucket = spec.otherBucket ?? true;
  if (spec.aggregate === 'count') {
    return shapeChartData(rows, spec.property, topN, otherBucket);
  }
  const measure = spec.measure ?? '';
  const total = rows.length;
  if (!measure) {
    return {
      property: spec.property,
      total,
      data: [],
      aggregate: spec.aggregate,
      measure,
      unavailable: true,
    };
  }
  const cells = new Map<string, MeasureCell>();
  const measures: ParsedMeasure[] = [];
  let numeric = 0;
  for (const row of rows) {
    const label = formatValue(row.properties[spec.property]);
    const cell = cells.get(label) ?? {
      label,
      count: 0,
      numeric: 0,
      sum: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    };
    cell.count += 1;
    const parsed = parseMeasure(row.properties[measure]);
    if (parsed) {
      numeric += 1;
      cell.numeric += 1;
      cell.sum += parsed.value * parsed.factor;
      cell.min = Math.min(cell.min, parsed.value * parsed.factor);
      cell.max = Math.max(cell.max, parsed.value * parsed.factor);
      measures.push(parsed);
    }
    cells.set(label, cell);
  }
  const base: ChartData = {
    property: spec.property,
    total,
    data: [],
    aggregate: spec.aggregate,
    measure,
    numeric,
    missing: total - numeric,
  };
  if (numeric === 0) return { ...base, unavailable: true };
  const units = measureUnits(measures);
  if (units.mixed) return { ...base, mixed: true, units: units.units };
  const ranked: ScoredCell[] = [...cells.values()]
    .map((cell) => ({ ...cell, value: scoredValue(cell, spec.aggregate) }))
    .sort(
      (a, b) =>
        (b.value ?? Number.NEGATIVE_INFINITY) -
          (a.value ?? Number.NEGATIVE_INFINITY) ||
        b.count - a.count ||
        a.label.localeCompare(b.label),
    );
  const shaped: readonly ScoredCell[] =
    ranked.length > topN
      ? otherBucket
        ? (() => {
            const merged = mergeCells(ranked.slice(topN - 1));
            return [
              ...ranked.slice(0, topN - 1),
              { ...merged, value: scoredValue(merged, spec.aggregate) },
            ];
          })()
        : ranked.slice(0, topN)
      : ranked;
  const data = shaped.map((cell) =>
    cell.value === undefined
      ? { label: cell.label, count: cell.count }
      : { label: cell.label, count: cell.count, value: cell.value },
  );
  const unit = units.unit;
  return {
    ...base,
    data,
    ...(unit ? { unit } : {}),
  };
}

export function bucketLabels(
  rows: readonly PropertyRow[],
  chart: ChartData,
  label: string,
): Set<string> {
  const all = countByProperty(rows, chart.property);
  if (label !== OTHER_LABEL || all.length === chart.data.length) {
    return new Set([label]);
  }
  const shown = new Set(chart.data.map((d) => d.label));
  return new Set(all.map((d) => d.label).filter((name) => !shown.has(name)));
}

export function selectedBuckets(
  rows: readonly PropertyRow[],
  chart: ChartData,
  selection: readonly ModelDbId[],
): Set<string> {
  const picked = new Set(
    selection.map((item) => `${item.modelId}:${item.dbId}`),
  );
  if (picked.size === 0) return new Set();
  const shown = new Set(chart.data.map((d) => d.label));
  const buckets = new Set<string>();
  for (const row of rows) {
    if (!picked.has(`${row.modelId}:${row.dbId}`)) continue;
    const label = formatValue(row.properties[chart.property]);
    buckets.add(shown.has(label) ? label : OTHER_LABEL);
  }
  return buckets;
}

export function availableProperties(
  rows: readonly PropertyRow[],
  candidates: readonly string[],
): string[] {
  return candidates.filter((name) =>
    rows.some((row) => {
      const label = formatValue(row.properties[name]);
      return label !== EMPTY_VALUE_LABEL;
    }),
  );
}

export interface ChartTheme {
  scheme: 'light' | 'dark';
  text: string;
  label: string;
  grid: string;
  surface: string;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
}

function readToken(
  style: CSSStyleDeclaration,
  token: string,
  fallback: string,
) {
  const value = style.getPropertyValue(token).trim();
  return value || fallback;
}

export function readChartTheme(
  root: Element = document.documentElement,
): ChartTheme {
  const style = getComputedStyle(root);
  return {
    scheme: root.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    text: readToken(style, '--color-fog', '#858687'),
    label: readToken(style, '--color-chalk', '#cececf'),
    grid: readToken(style, '--color-hairline-faint', 'rgba(255,255,255,0.06)'),
    surface: readToken(style, '--color-graphite', '#131416'),
    fontFamily: readToken(
      style,
      '--font-sans',
      '"Inter Variable", Inter, system-ui, sans-serif',
    ),
    fontWeight: readToken(style, '--weight-body', '420'),
    fontSize: 12,
  };
}

function parseHex(color: string): [number, number, number] | null {
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mixColors(from: string, to: string, weight: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const mixed = a.map((channel, i) =>
    Math.round(channel * weight + (b[i] ?? 0) * (1 - weight)),
  );
  return `rgb(${mixed.join(', ')})`;
}

export const CHART_PALETTES: Record<ChartTheme['scheme'], readonly string[]> = {
  dark: [
    '#E69F00',
    '#56B4E9',
    '#00A077',
    '#F0E442',
    '#3A86D8',
    '#D55E00',
    '#CC79A7',
    '#9A8AE0',
  ],
  light: [
    '#C27800',
    '#2F95CF',
    '#00875F',
    '#A89700',
    '#0B5FB8',
    '#D55E00',
    '#B5588C',
    '#7A62C8',
  ],
};

export const OTHER_COLOR = '#8A8F98';
const REPEAT_WEIGHT = 0.6;

function hashLabel(label: string): number {
  let hash = 2166136261;
  for (let i = 0; i < label.length; i += 1) {
    hash = Math.imul(hash ^ label.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

export function seriesColors(
  theme: ChartTheme,
  labels: readonly string[],
): string[] {
  const palette = CHART_PALETTES[theme.scheme];
  const cycles: Set<number>[] = [];
  return labels.map((label) => {
    if (label === OTHER_LABEL) return OTHER_COLOR;
    let cycle = 0;
    while (cycles[cycle]?.size === palette.length) cycle += 1;
    const taken = cycles[cycle] ?? new Set<number>();
    cycles[cycle] = taken;
    let slot = hashLabel(label) % palette.length;
    while (taken.has(slot)) slot = (slot + 1) % palette.length;
    taken.add(slot);
    const base = palette[slot] ?? OTHER_COLOR;
    return cycle === 0 ? base : mixColors(base, theme.surface, REPEAT_WEIGHT);
  });
}
