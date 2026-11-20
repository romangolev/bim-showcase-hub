import type { PropertyRow } from '../../shared/types.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import { EMPTY_VALUE_LABEL, formatValue } from './modelSummary.js';

export const DEFAULT_DASHBOARD_PROPERTIES: readonly string[] = [
  'Category',
  'Level',
  'Assembly Code',
  'Classification Code',
  'Name',
];

export const OTHER_LABEL = 'Other';
export const DEFAULT_MAX_CATEGORIES = 12;

export interface ChartDatum {
  label: string;
  count: number;
}

export interface ChartSeries {
  modelId: string;
  label: string;
  counts: number[];
}

export interface ChartData {
  property: string;
  total: number;
  data: ChartDatum[];
  series?: ChartSeries[];
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
): ChartData {
  const all = countByProperty(rows, property);
  const total = all.reduce((sum, d) => sum + d.count, 0);
  if (all.length <= maxCategories) return { property, total, data: all };
  const head = all.slice(0, maxCategories - 1);
  const rest = all.slice(maxCategories - 1);
  const other = rest.reduce((sum, d) => sum + d.count, 0);
  return {
    property,
    total,
    data: [...head, { label: OTHER_LABEL, count: other }],
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
