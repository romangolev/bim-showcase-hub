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

export interface ChartTheme {
  accent: string;
  muted: string;
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
    accent: readToken(style, '--color-signal-blue', '#3b82f6'),
    muted: readToken(style, '--color-ash', '#9d9e9f'),
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

const RAMP_MAX_WEIGHT = 1;
const RAMP_MIN_WEIGHT = 0.32;
const MUTED_WEIGHT = 0.5;

export function seriesColors(
  theme: ChartTheme,
  labels: readonly string[],
): string[] {
  const steps = labels.filter((label) => label !== OTHER_LABEL).length;
  let index = 0;
  return labels.map((label) => {
    if (label === OTHER_LABEL) {
      return mixColors(theme.muted, theme.surface, MUTED_WEIGHT);
    }
    const t = steps <= 1 ? 0 : index / (steps - 1);
    index += 1;
    return mixColors(
      theme.accent,
      theme.surface,
      RAMP_MAX_WEIGHT - t * (RAMP_MAX_WEIGHT - RAMP_MIN_WEIGHT),
    );
  });
}
