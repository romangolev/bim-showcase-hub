import type { PropertyRow } from '../../shared/types.js';
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

export interface ChartData {
  property: string;
  total: number;
  data: ChartDatum[];
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

export const CHART_PALETTE_TOKENS: readonly {
  token: string;
  fallback: string;
}[] = [
  { token: '--color-signal-blue', fallback: '#3b82f6' },
  { token: '--color-arc-blue', fallback: '#60a5fa' },
  { token: '--color-iris', fallback: '#314ef0' },
  { token: '--color-ring-blue', fallback: '#93c5fd' },
  { token: '--color-ash', fallback: '#9d9e9f' },
  { token: '--color-steel', fallback: '#71717a' },
  { token: '--color-chalk', fallback: '#cececf' },
  { token: '--color-smoke', fallback: '#3c3d3e' },
];

export interface ChartTheme {
  series: string[];
  text: string;
  grid: string;
  surface: string;
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
    series: CHART_PALETTE_TOKENS.map((t) =>
      readToken(style, t.token, t.fallback),
    ),
    text: readToken(style, '--color-chalk', '#cececf'),
    grid: readToken(style, '--color-hairline-faint', 'rgba(255,255,255,0.06)'),
    surface: readToken(style, '--color-graphite', '#131416'),
  };
}

export function seriesColors(theme: ChartTheme, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => theme.series[i % theme.series.length] ?? theme.text,
  );
}
