import type { PropertyRow } from '../../shared/types.js';

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
