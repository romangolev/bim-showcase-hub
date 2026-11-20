import type { PropertyRow } from '../../shared/types.js';

export { formatCount } from './exportCommon.js';

export const DEFAULT_SUMMARY_PROPERTIES: readonly string[] = [
  'Assembly Code',
  'Classification Code',
  'Name',
];

export const EMPTY_VALUE_LABEL = '(empty)';

export interface SummaryEntry {
  property: string;
  value: string;
  count: number;
}

export function formatValue(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE_LABEL;
  }
  return String(value);
}

export function summarize(
  rows: readonly PropertyRow[],
  propertyNames: readonly string[] = DEFAULT_SUMMARY_PROPERTIES,
): SummaryEntry[] {
  const entries: SummaryEntry[] = [];
  for (const property of propertyNames) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = formatValue(row.properties[property]);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    for (const [value, count] of sorted) {
      entries.push({ property, value, count });
    }
  }
  return entries;
}

export type SummarySort = 'count' | 'value';
export type SummaryDensity = 'comfortable' | 'compact';
export const SUMMARY_COLUMNS = ['property', 'value', 'count'] as const;
export type SummaryColumn = (typeof SUMMARY_COLUMNS)[number];

export const SUMMARY_LAYOUTS = ['flat', 'grouped', 'pivot'] as const;
export type SummaryLayout = (typeof SUMMARY_LAYOUTS)[number];

export const MAX_GROUP_BY = 4;
export const MAX_PRECISION = 4;
export const MAX_UNIT_LABEL = 16;
export const MAX_TITLE_LENGTH = 80;

export interface SummaryView {
  hideEmpty: boolean;
  minCount: number;
  text: string;
  sort: SummarySort;
  density: SummaryDensity;
  hiddenColumns: SummaryColumn[];
  autoRefresh: boolean;
  layout: SummaryLayout;
  groupBy: string[];
  measure: string | null;
  unitLabel: string;
  precision: number;
  titles: Record<string, string>;
}

export const DEFAULT_SUMMARY_VIEW: SummaryView = {
  hideEmpty: false,
  minCount: 1,
  text: '',
  sort: 'count',
  density: 'comfortable',
  hiddenColumns: [],
  autoRefresh: true,
  layout: 'flat',
  groupBy: [],
  measure: null,
  unitLabel: '',
  precision: 2,
  titles: {},
};

export function viewEntries(
  entries: readonly SummaryEntry[],
  view: SummaryView,
): SummaryEntry[] {
  const needle = view.text.trim().toLowerCase();
  const kept = entries.filter(
    (entry) =>
      (!view.hideEmpty || entry.value !== EMPTY_VALUE_LABEL) &&
      entry.count >= view.minCount &&
      (!needle ||
        entry.value.toLowerCase().includes(needle) ||
        entry.property.toLowerCase().includes(needle)),
  );
  if (view.sort === 'count') return kept;
  const groups = new Map<string, SummaryEntry[]>();
  for (const entry of kept) {
    const group = groups.get(entry.property);
    if (group) group.push(entry);
    else groups.set(entry.property, [entry]);
  }
  return [...groups.values()].flatMap((group) =>
    group.sort((a, b) => a.value.localeCompare(b.value)),
  );
}

export function emptyShares(
  entries: readonly SummaryEntry[],
): { property: string; percent: number }[] {
  const totals = new Map<string, { empty: number; all: number }>();
  for (const { property, value, count } of entries) {
    const total = totals.get(property) ?? { empty: 0, all: 0 };
    total.all += count;
    if (value === EMPTY_VALUE_LABEL) total.empty += count;
    totals.set(property, total);
  }
  return [...totals].map(([property, { empty, all }]) => ({
    property,
    percent: all === 0 ? 0 : Math.round((empty / all) * 100),
  }));
}

export type MeasureFamily = 'area' | 'volume' | 'length' | 'none';

export interface ParsedMeasure {
  value: number;
  unit: string;
  family: MeasureFamily;
  factor: number;
}

const MEASURE_UNITS: Record<
  string,
  { unit: string; family: MeasureFamily; factor: number }
> = {
  'm²': { unit: 'm²', family: 'area', factor: 1 },
  'm³': { unit: 'm³', family: 'volume', factor: 1 },
  m: { unit: 'm', family: 'length', factor: 1 },
  mm: { unit: 'm', family: 'length', factor: 0.001 },
};

const UNITLESS: Pick<ParsedMeasure, 'unit' | 'family' | 'factor'> = {
  unit: '',
  family: 'none',
  factor: 1,
};

const FAMILY_UNITS: Record<MeasureFamily, string> = {
  area: 'm²',
  volume: 'm³',
  length: 'm',
  none: '',
};

const MEASURE_NUMBER =
  /^[+-]?(?:\d{1,3}(?:[,\u00a0\u202f ]\d{3})+|\d+)(?:\.\d+)?$/;

function canonicalUnit(text: string): string {
  const lower = text.toLowerCase();
  if (lower === 'm2' || text === 'm²') return 'm²';
  if (lower === 'm3' || text === 'm³') return 'm³';
  return lower;
}

export function parseMeasure(raw: unknown): ParsedMeasure | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, ...UNITLESS } : null;
  }
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  let unit = UNITLESS;
  const suffix = /^(.*?)\s*(m³|m3|m²|m2|mm|m)$/i.exec(text);
  const suffixUnit = suffix?.[2];
  if (suffix && suffixUnit) {
    const parsedUnit = MEASURE_UNITS[canonicalUnit(suffixUnit)];
    if (parsedUnit) {
      unit = parsedUnit;
      text = suffix[1] ?? '';
    }
  }
  text = text.trim();
  if (!MEASURE_NUMBER.test(text)) return null;
  const value = Number(text.replace(/[,\u00a0\u202f ]/g, ''));
  if (!Number.isFinite(value)) return null;
  return { value, ...unit };
}

export type MeasureCell =
  | {
      status: 'ok';
      sum: number;
      unit: string;
      family: MeasureFamily;
      measured: number;
      skipped: number;
    }
  | { status: 'missing' }
  | { status: 'mixed' };

export function measureOf(
  rows: readonly PropertyRow[],
  property: string,
): MeasureCell {
  let family: MeasureFamily | null = null;
  let sum = 0;
  let measured = 0;
  let skipped = 0;
  let mixed = false;
  for (const row of rows) {
    const parsed = parseMeasure(row.properties[property]);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    if (family === null) family = parsed.family;
    else if (family !== parsed.family) mixed = true;
    sum += parsed.value * parsed.factor;
    measured += 1;
  }
  if (mixed) return { status: 'mixed' };
  if (family === null) return { status: 'missing' };
  return {
    status: 'ok',
    sum,
    unit: FAMILY_UNITS[family],
    family,
    measured,
    skipped,
  };
}

export function measureByValue(
  rows: readonly PropertyRow[],
  valueProperty: string,
  measureProperty: string,
): Map<string, MeasureCell> {
  const groups = new Map<string, PropertyRow[]>();
  for (const row of rows) {
    const value = formatValue(row.properties[valueProperty]);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return new Map(
    [...groups].map(([value, group]) => [
      value,
      measureOf(group, measureProperty),
    ]),
  );
}

export function formatMeasure(
  cell: MeasureCell,
  options: { precision: number; unitLabel: string },
): string {
  if (cell.status !== 'ok') return 'n/a';
  const precision = Math.min(
    MAX_PRECISION,
    Math.max(0, Math.floor(Number(options.precision) || 0)),
  );
  const number = cell.sum.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
  const unit = options.unitLabel.trim() || cell.unit;
  return unit ? `${number} ${unit}` : number;
}

export interface PivotNode {
  value: string;
  count: number;
  children: PivotNode[];
  measure: MeasureCell | null;
}

function orderByCount<T extends { value: string; count: number }>(
  nodes: T[],
): T[] {
  return nodes.sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
}

export function pivotTree(
  rows: readonly PropertyRow[],
  groupBy: readonly string[],
  options: { measure?: string | null } = {},
): PivotNode[] {
  const names = sanitizeGroupBy(groupBy);
  if (names.length === 0) return [];
  const measureProperty = options.measure?.trim() || null;
  const build = (
    subset: readonly PropertyRow[],
    depth: number,
  ): PivotNode[] => {
    const name = names[depth];
    if (!name) return [];
    const groups = new Map<string, PropertyRow[]>();
    for (const row of subset) {
      const value = formatValue(row.properties[name]);
      const group = groups.get(value);
      if (group) group.push(row);
      else groups.set(value, [row]);
    }
    return orderByCount(
      [...groups].map(([value, group]) => ({
        value,
        count: group.length,
        children: build(group, depth + 1),
        measure: measureProperty ? measureOf(group, measureProperty) : null,
      })),
    );
  };
  return build(rows, 0);
}

export interface SummaryBlock {
  property: string;
  entries: SummaryEntry[];
}

export function summaryBlocks(
  entries: readonly SummaryEntry[],
): SummaryBlock[] {
  const blocks = new Map<string, SummaryEntry[]>();
  for (const entry of entries) {
    const block = blocks.get(entry.property);
    if (block) block.push(entry);
    else blocks.set(entry.property, [entry]);
  }
  return [...blocks].map(([property, blockEntries]) => ({
    property,
    entries: blockEntries,
  }));
}

export function blockTitle(
  titles: Record<string, string>,
  property: string,
): string {
  const title = titles[property];
  return typeof title === 'string' && title.trim() ? title.trim() : property;
}

export function countShare(count: number, max: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(max) || max <= 0) return 0;
  if (count <= 0) return 0;
  return Math.min(100, Math.round((count / max) * 100));
}

export function sanitizeLayout(raw: unknown): SummaryLayout {
  return (
    SUMMARY_LAYOUTS.find((name) => name === raw) ?? DEFAULT_SUMMARY_VIEW.layout
  );
}

export function sanitizeGroupBy(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    if (!name || names.includes(name)) continue;
    names.push(name);
    if (names.length === MAX_GROUP_BY) break;
  }
  return names;
}

export function sanitizeTitles(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue;
    const property = key.trim();
    const title = value.trim().slice(0, MAX_TITLE_LENGTH);
    if (!property || !title) continue;
    entries.push([property, title]);
  }
  return Object.fromEntries(entries);
}

export function sanitizeView(raw: unknown): SummaryView {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const minCount = Number(source.minCount);
  const precision = source.precision;
  return {
    hideEmpty: source.hideEmpty === true,
    minCount:
      Number.isFinite(minCount) && minCount >= 1 ? Math.floor(minCount) : 1,
    text: typeof source.text === 'string' ? source.text : '',
    sort: source.sort === 'value' ? 'value' : 'count',
    density: source.density === 'compact' ? 'compact' : 'comfortable',
    hiddenColumns: Array.isArray(source.hiddenColumns)
      ? SUMMARY_COLUMNS.filter((column) =>
          (source.hiddenColumns as unknown[]).includes(column),
        )
      : [],
    autoRefresh:
      typeof source.autoRefresh === 'boolean' ? source.autoRefresh : true,
    layout: sanitizeLayout(source.layout),
    groupBy: sanitizeGroupBy(source.groupBy),
    measure:
      typeof source.measure === 'string' && source.measure.trim()
        ? source.measure.trim()
        : null,
    unitLabel:
      typeof source.unitLabel === 'string'
        ? source.unitLabel.trim().slice(0, MAX_UNIT_LABEL)
        : '',
    precision:
      typeof precision === 'number' &&
      Number.isFinite(precision) &&
      precision >= 0
        ? Math.min(MAX_PRECISION, Math.floor(precision))
        : DEFAULT_SUMMARY_VIEW.precision,
    titles: sanitizeTitles(source.titles),
  };
}

export function summaryTable(
  entries: readonly SummaryEntry[],
  hiddenColumns: readonly SummaryColumn[],
): { header: string[]; rows: (string | number)[][] } {
  const shown = SUMMARY_COLUMNS.filter((c) => !hiddenColumns.includes(c));
  const labels: Record<SummaryColumn, string> = {
    property: 'Property',
    value: 'Value',
    count: 'Count',
  };
  return {
    header: shown.map((column) => labels[column]),
    rows: entries.map((entry) => shown.map((column) => entry[column])),
  };
}
