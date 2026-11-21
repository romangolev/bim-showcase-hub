import { isRecord } from '../../shared/guards.js';
import type { MeasurementInfo } from './ViewerAdapter.js';

export const MEASURE_EXTENSION_ID = 'Autodesk.Measure';

export interface MeasureExtensionLike {
  getMeasurementList?(): unknown;
  deleteMeasurements?(): void;
  activate?(mode: string): boolean;
}

const VALUE_FIELDS = ['distance', 'area', 'angle', 'value'] as const;

function measurementValue(entry: Record<string, unknown>): string | null {
  for (const field of VALUE_FIELDS) {
    const value = entry[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) {
      const unit = typeof entry.unit === 'string' ? ` ${entry.unit}` : '';
      return `${value}${unit}`;
    }
  }
  return null;
}

export function toMeasurements(raw: unknown): MeasurementInfo[] {
  if (!Array.isArray(raw)) return [];
  const out: MeasurementInfo[] = [];
  raw.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.type !== 'string') return;
    const value = measurementValue(entry);
    if (!value) return;
    const id =
      typeof entry.id === 'string' || typeof entry.id === 'number'
        ? String(entry.id)
        : `m${index}`;
    out.push({ id, type: entry.type, value });
  });
  return out;
}

const FORMULA_START = /^[=+\-@]/;

function cell(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function measurementsCsv(list: readonly MeasurementInfo[]): string {
  return [
    'Type,Value',
    ...list.map((entry) => `${cell(entry.type)},${cell(entry.value)}`),
  ].join('\r\n');
}
