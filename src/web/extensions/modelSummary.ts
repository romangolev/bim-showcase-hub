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

export interface SummaryView {
  hideEmpty: boolean;
  minCount: number;
  text: string;
  sort: SummarySort;
  density: SummaryDensity;
  hiddenColumns: SummaryColumn[];
}

export const DEFAULT_SUMMARY_VIEW: SummaryView = {
  hideEmpty: false,
  minCount: 1,
  text: '',
  sort: 'count',
  density: 'comfortable',
  hiddenColumns: [],
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

export function sanitizeView(raw: unknown): SummaryView {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const minCount = Number(source.minCount);
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
