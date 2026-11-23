import type { PropertyRow } from '../../shared/types.js';
import type { ModelDbId } from '../viewer/modelSet.js';
import {
  formatMeasure,
  measureUnits,
  type ParsedMeasure,
  parseMeasure,
} from './dashboardData.js';
import { formatCount } from './exportCommon.js';
import { EMPTY_VALUE_LABEL, formatValue } from './modelSummary.js';

export const DEFAULT_MUST_HAVE: readonly string[] = [
  'Level',
  'Classification Code',
];
export const DEFAULT_UNIQUE: readonly string[] = ['Name', 'Mark'];
export const DEFAULT_KPI_THRESHOLD = 10;
export const MAX_KPI_THRESHOLD = 100;

export type KpiTone = 'good' | 'bad' | 'neutral';

export interface HealthKpiOptions {
  enabled: boolean;
  mustHave: readonly string[];
  unique: readonly string[];
  threshold: number;
  measure: string;
}

export const DEFAULT_HEALTH_KPI_OPTIONS: HealthKpiOptions = {
  enabled: false,
  mustHave: DEFAULT_MUST_HAVE,
  unique: DEFAULT_UNIQUE,
  threshold: DEFAULT_KPI_THRESHOLD,
  measure: '',
};

export interface HealthKpiTile {
  id: string;
  label: string;
  value: number;
  share: number;
  tone: KpiTone;
  text: string;
  offenders: ModelDbId[];
}

function cleanNames(
  raw: unknown,
  fallback: readonly string[],
): readonly string[] {
  if (!Array.isArray(raw)) return fallback;
  return [
    ...new Set(
      raw
        .filter(
          (name): name is string =>
            typeof name === 'string' && name.trim() !== '',
        )
        .map((name) => name.trim()),
    ),
  ];
}

export function sanitizeHealthKpiOptions(raw: unknown): HealthKpiOptions {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const threshold = Number(source.threshold);
  return {
    enabled:
      typeof source.enabled === 'boolean'
        ? source.enabled
        : DEFAULT_HEALTH_KPI_OPTIONS.enabled,
    mustHave: cleanNames(source.mustHave, DEFAULT_MUST_HAVE),
    unique: cleanNames(source.unique, DEFAULT_UNIQUE),
    threshold:
      Number.isFinite(threshold) && threshold >= 0
        ? Math.min(threshold, MAX_KPI_THRESHOLD)
        : DEFAULT_KPI_THRESHOLD,
    measure: typeof source.measure === 'string' ? source.measure.trim() : '',
  };
}

function shareOf(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

function thresholdTone(
  share: number,
  threshold: number,
): { tone: KpiTone; text: string } {
  return share * 100 > threshold
    ? { tone: 'bad', text: `Above the ${threshold}% threshold` }
    : {
        tone: 'good',
        text: `Within the ${threshold}% threshold`,
      };
}

function pushOffender(items: ModelDbId[], row: PropertyRow): void {
  if (row.modelId === undefined) return;
  items.push({ modelId: row.modelId, dbId: row.dbId });
}

function duplicateLabels(
  rows: readonly PropertyRow[],
  property: string,
): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = formatValue(row.properties[property]);
    if (label === EMPTY_VALUE_LABEL) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [label, count] of counts) {
    if (count > 1) duplicates.add(label);
  }
  return duplicates;
}

export function healthKpis(
  rows: readonly PropertyRow[],
  options: HealthKpiOptions,
): HealthKpiTile[] {
  if (!options.enabled) return [];
  const total = rows.length;
  const threshold = options.threshold;
  const tiles: HealthKpiTile[] = [
    {
      id: 'elements',
      label: 'Elements',
      value: total,
      share: total > 0 ? 1 : 0,
      tone: 'neutral',
      text: 'In the current scope',
      offenders: [],
    },
  ];

  const missingOffenders = new Map<string, ModelDbId[]>();
  const missingCounts = new Map<string, number>();
  for (const property of options.mustHave) {
    missingOffenders.set(property, []);
    missingCounts.set(property, 0);
  }
  const emptyOffenders: ModelDbId[] = [];
  let emptyCount = 0;
  for (const row of rows) {
    let anyEmpty = false;
    for (const property of options.mustHave) {
      if (formatValue(row.properties[property]) !== EMPTY_VALUE_LABEL) continue;
      missingCounts.set(property, (missingCounts.get(property) ?? 0) + 1);
      pushOffender(missingOffenders.get(property) ?? [], row);
      anyEmpty = true;
    }
    if (!anyEmpty) continue;
    emptyCount += 1;
    pushOffender(emptyOffenders, row);
  }

  for (const property of options.mustHave) {
    const missing = missingCounts.get(property) ?? 0;
    const share = shareOf(missing, total);
    const verdict = thresholdTone(share, threshold);
    tiles.push({
      id: `missing:${property}`,
      label: `${property} missing`,
      value: missing,
      share,
      tone: total === 0 ? 'neutral' : verdict.tone,
      text:
        total === 0
          ? 'No elements in this scope'
          : missing === 0
            ? `No missing ${property} values`
            : verdict.text,
      offenders: missingOffenders.get(property) ?? [],
    });
  }

  const emptyShare = shareOf(emptyCount, total);
  if (options.mustHave.length > 0) {
    tiles.push({
      id: 'empty',
      label: 'Empty values',
      value: emptyCount,
      share: emptyShare,
      tone: 'neutral',
      text:
        total === 0
          ? 'No elements in this scope'
          : `${formatCount(emptyCount)} of ${formatCount(total)} elements have an empty must-have value`,
      offenders: emptyOffenders,
    });
  }

  for (const property of options.unique) {
    const duplicates = duplicateLabels(rows, property);
    const offenders: ModelDbId[] = [];
    let value = 0;
    for (const row of rows) {
      if (!duplicates.has(formatValue(row.properties[property]))) continue;
      value += 1;
      pushOffender(offenders, row);
    }
    const share = shareOf(value, total);
    const verdict = thresholdTone(share, threshold);
    tiles.push({
      id: `duplicate:${property}`,
      label: `Elements with a duplicate ${property}`,
      value,
      share,
      tone: total === 0 ? 'neutral' : verdict.tone,
      text:
        total === 0
          ? 'No elements in this scope'
          : value === 0
            ? `No duplicate ${property} values`
            : verdict.text,
      offenders,
    });
  }

  if (options.measure) {
    const parsed: ParsedMeasure[] = [];
    const offenders: ModelDbId[] = [];
    for (const row of rows) {
      const value = parseMeasure(row.properties[options.measure]);
      if (!value) continue;
      parsed.push(value);
      pushOffender(offenders, row);
    }
    const units = measureUnits(parsed);
    const valueTotal = parsed.reduce(
      (sum, value) => sum + value.value * value.factor,
      0,
    );
    tiles.push({
      id: `numeric:${options.measure}`,
      label: `${options.measure} numeric`,
      value: parsed.length,
      share: shareOf(parsed.length, total),
      tone: units.mixed ? 'bad' : 'neutral',
      text: units.mixed
        ? `Mixed units (${units.units.join(', ')}), not summed`
        : parsed.length === 0
          ? `No numeric ${options.measure} values`
          : `${formatCount(parsed.length)} of ${formatCount(total)} elements parse as numbers, ${formatMeasure(valueTotal, units.unit)} in total`,
      offenders,
    });
  }

  return tiles;
}
