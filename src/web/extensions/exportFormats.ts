import { flag, isRecord, required } from '../../shared/guards.js';
import {
  type BaseElementScope,
  type ElementScope,
  sanitizeElementScope,
} from '../viewer/propertyScope.js';
import { DELETED_SET_LABEL, getSet, setIdOf } from '../viewer/selectionSets.js';
import type { ExportCell } from './excelExport.js';

export type ExportFormat = 'xlsx' | 'csv' | 'json' | 'copy';
export type ExportScope = ElementScope;

export type CsvDelimiter = ',' | ';' | '\t';
export type DecimalMark = '.' | ',';
export type EmptyLabel = 'blank' | '(empty)';

export interface TableOptions {
  delimiter: CsvDelimiter;
  decimal: DecimalMark;
  header: boolean;
}

export interface ExcelSettings {
  format: ExportFormat;
  scope: ExportScope;
  modelScope: string;
  metadata: boolean;
  namePattern: string;
  csvDelimiter: CsvDelimiter;
  decimalMark: DecimalMark;
  includeHeader: boolean;
  exporterName: boolean;
  summarySheet: boolean;
  groupBy: string | null;
  emptyLabel: EmptyLabel;
  confirmAbove: number;
}

export const DEFAULT_NAME_PATTERN = '{model}-properties';
export const DEFAULT_GROUP_BY = 'Category';

export const DEFAULT_CONFIRM_ABOVE = 20000;
const CONFIRM_ABOVE_MIN = 1000;
export const CONFIRM_ABOVE_MAX = 1_000_000;

export function sanitizeConfirmAbove(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CONFIRM_ABOVE;
  }
  const rows = Math.floor(value);
  if (rows === 0) return 0;
  return Math.min(CONFIRM_ABOVE_MAX, Math.max(CONFIRM_ABOVE_MIN, rows));
}

export const DEFAULT_EXCEL_SETTINGS: ExcelSettings = {
  format: 'xlsx',
  scope: 'all',
  modelScope: 'all',
  metadata: false,
  namePattern: DEFAULT_NAME_PATTERN,
  csvDelimiter: ',',
  decimalMark: '.',
  includeHeader: true,
  exporterName: true,
  summarySheet: false,
  groupBy: DEFAULT_GROUP_BY,
  emptyLabel: 'blank',
  confirmAbove: DEFAULT_CONFIRM_ABOVE,
};

export function readExcelSettings(value: unknown): ExcelSettings {
  const source = isRecord(value) ? value : {};
  const d = DEFAULT_EXCEL_SETTINGS;
  const format = (['xlsx', 'csv', 'json', 'copy'] as ExportFormat[]).find(
    (item) => item === source.format,
  );
  return {
    format: format ?? d.format,
    scope: sanitizeElementScope(source.scope),
    modelScope: required(source.modelScope, d.modelScope),
    metadata: flag(source.metadata, d.metadata),
    namePattern: required(source.namePattern, d.namePattern),
    csvDelimiter:
      ([',', ';', '\t'] as const).find(
        (item) => item === source.csvDelimiter,
      ) ?? d.csvDelimiter,
    decimalMark: source.decimalMark === ',' ? ',' : d.decimalMark,
    includeHeader: flag(source.includeHeader, d.includeHeader),
    exporterName: flag(source.exporterName, d.exporterName),
    summarySheet: flag(source.summarySheet, d.summarySheet),
    groupBy:
      source.groupBy === null
        ? null
        : required(source.groupBy, d.groupBy ?? DEFAULT_GROUP_BY),
    emptyLabel: source.emptyLabel === '(empty)' ? '(empty)' : d.emptyLabel,
    confirmAbove: sanitizeConfirmAbove(source.confirmAbove),
  };
}

export const DELIMITER_LABELS: Record<CsvDelimiter, string> = {
  ',': 'Comma (,)',
  ';': 'Semicolon (;)',
  '\t': 'Tab',
};

export const DECIMAL_LABELS: Record<DecimalMark, string> = {
  '.': 'Point (1.5)',
  ',': 'Comma (1,5)',
};

export const EMPTY_LABELS: Record<EmptyLabel, string> = {
  blank: 'Blank cells',
  '(empty)': '(empty) text',
};

export const EXPORTER_NAME = 'BIM Showcase Hub';

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: 'Excel (.xlsx)',
  csv: 'CSV (.csv)',
  json: 'JSON (.json)',
  copy: 'Copy as table (TSV)',
};

export function scopeLabel(scope: ExportScope): string {
  const id = setIdOf(scope);
  if (id === undefined) return SCOPE_LABELS[scope as BaseElementScope];
  const set = getSet(id);
  return set ? `Saved set: ${set.name}` : DELETED_SET_LABEL;
}

export const SCOPE_LABELS: Record<BaseElementScope, string> = {
  all: 'All elements',
  selected: 'Selected elements',
  isolated: 'Isolated elements',
  visible: 'Visible elements',
};

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

function field(
  value: ExportCell,
  delimiter: string,
  decimal: DecimalMark,
): string {
  const text =
    typeof value === 'number' && decimal === ','
      ? String(value).replace('.', ',')
      : String(value);
  return text.includes(delimiter) || /["\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function toDelimited(
  header: readonly string[],
  rows: readonly ExportCell[][],
  delimiter: CsvDelimiter,
  { decimal = '.', header: withHeader = true }: Partial<TableOptions> = {},
): string {
  const lines = (withHeader ? [header, ...rows] : rows).map((row) =>
    row
      .map((value) => field(guardCell(value), delimiter, decimal))
      .join(delimiter),
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
  models: readonly {
    name: string;
    urn: string;
    version?: string;
    path?: string;
  }[];
  scope: ExportScope;
  rowCount: number;
  exporter?: boolean;
  date?: Date;
}

function optionalRow(
  key: string,
  values: readonly (string | undefined)[],
): [string, ExportCell][] {
  return values.some(Boolean)
    ? [[key, values.map((value) => value ?? '').join(', ')]]
    : [];
}

export function aboutRows(info: AboutInfo): [string, ExportCell][] {
  const rows: [string, ExportCell][] = [
    ['Model', info.models.map((model) => model.name).join(', ')],
    ['Source URN', info.models.map((model) => model.urn).join(', ')],
    ...optionalRow(
      'Version (from link)',
      info.models.map((model) => model.version),
    ),
    ...optionalRow(
      'Path (from link)',
      info.models.map((model) => model.path),
    ),
    ['Exported', (info.date ?? new Date()).toISOString()],
    ['Scope', scopeLabel(info.scope)],
    ['Rows', info.rowCount],
  ];
  return info.exporter === false
    ? rows
    : [...rows, ['Exporter', EXPORTER_NAME]];
}
