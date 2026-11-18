import type { ElementScope } from '../viewer/propertyScope.js';
import type { ExportCell } from './excelExport.js';

export { filterByElementScope as filterByScope } from '../viewer/propertyScope.js';

export type ExportFormat = 'xlsx' | 'csv' | 'json' | 'copy';
export type ExportScope = ElementScope;

export type CsvDelimiter = ',' | ';' | '\t';
export type DecimalMark = '.' | ',';

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
}

export const DEFAULT_NAME_PATTERN = '{model}-properties';

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
};

export const DELIMITER_LABELS: Record<CsvDelimiter, string> = {
  ',': 'Comma (,)',
  ';': 'Semicolon (;)',
  '\t': 'Tab',
};

export const DECIMAL_LABELS: Record<DecimalMark, string> = {
  '.': 'Point (1.5)',
  ',': 'Comma (1,5)',
};

export const EXPORTER_NAME = 'BIM Showcase Hub';

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
  visible: 'Visible elements',
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
    ['Scope', SCOPE_LABELS[info.scope]],
    ['Rows', info.rowCount],
  ];
  return info.exporter === false
    ? rows
    : [...rows, ['Exporter', EXPORTER_NAME]];
}
