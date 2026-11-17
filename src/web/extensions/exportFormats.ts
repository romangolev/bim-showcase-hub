import type { ModelDbId } from '../viewer/modelSet.js';
import type { ExportCell } from './excelExport.js';

export type ExportFormat = 'xlsx' | 'csv' | 'json' | 'copy';
export type ExportScope = 'all' | 'selected' | 'isolated';

export interface ExcelSettings {
  format: ExportFormat;
  scope: ExportScope;
  metadata: boolean;
  namePattern: string;
}

export const DEFAULT_NAME_PATTERN = '{model}-properties';

export const DEFAULT_EXCEL_SETTINGS: ExcelSettings = {
  format: 'xlsx',
  scope: 'all',
  metadata: false,
  namePattern: DEFAULT_NAME_PATTERN,
};

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: 'Excel (.xlsx)',
  csv: 'CSV (.csv)',
  json: 'JSON (.json)',
  copy: 'Copy as table (TSV)',
};

export const SCOPE_LABELS: Record<ExportScope, string> = {
  all: 'All elements',
  selected: 'Selected elements',
  isolated: 'Isolated elements',
};

export const CONFIRM_ABOVE = 20000;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function guardCell(value: ExportCell): ExportCell {
  if (typeof value !== 'string') return value;
  if (!FORMULA_START.test(value) || value === '-' || PLAIN_NUMBER.test(value)) {
    return value;
  }
  return `'${value}`;
}

export function safeName(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .normalize('NFC');
}

function field(value: ExportCell, delimiter: string): string {
  const text = String(value);
  return text.includes(delimiter) || /["\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function toDelimited(
  header: readonly string[],
  rows: readonly ExportCell[][],
  delimiter: ',' | '\t',
): string {
  const lines = [header, ...rows].map((row) =>
    row.map((value) => field(guardCell(value), delimiter)).join(delimiter),
  );
  return lines.join('\r\n');
}

export function toJsonRecords(
  header: readonly string[],
  rows: readonly ExportCell[][],
): Record<string, ExportCell>[] {
  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])),
  );
}

export function filterByScope<
  T extends { modelId?: string | undefined; dbId: number },
>(
  rows: readonly T[],
  scope: ExportScope,
  items: readonly ModelDbId[],
  primaryId?: string,
): T[] {
  if (scope === 'all') return [...rows];
  const keep = new Set(items.map((item) => `${item.modelId}:${item.dbId}`));
  return rows.filter((row) =>
    keep.has(`${row.modelId ?? primaryId}:${row.dbId}`),
  );
}

export function applyNamePattern(
  pattern: string,
  model: string,
  extension: string,
  date: Date = new Date(),
): string {
  const stamp = date.toISOString().slice(0, 10);
  const name = safeName(
    (pattern.trim() || DEFAULT_NAME_PATTERN)
      .replace(/\{model\}/g, () => model)
      .replace(/\{date\}/g, () => stamp),
  ).slice(0, 120);
  return `${name || 'model-properties'}.${extension}`;
}

export interface AboutInfo {
  models: readonly { name: string; urn: string }[];
  scope: ExportScope;
  rowCount: number;
  date?: Date;
}

export function aboutRows(info: AboutInfo): [string, ExportCell][] {
  return [
    ['Model', info.models.map((model) => model.name).join(', ')],
    ['Source URN', info.models.map((model) => model.urn).join(', ')],
    ['Exported', (info.date ?? new Date()).toISOString()],
    ['Scope', SCOPE_LABELS[info.scope]],
    ['Rows', info.rowCount],
  ];
}
