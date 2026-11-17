import type { PropertyRow } from '../../shared/types.js';
import { distinctModelCount, unavailableModels } from '../viewer/modelScope.js';
import { readLeafRows } from '../viewer/sharedLeafRows.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { formatValue } from './modelSummary.js';

export const DEFAULT_EXPORT_PROPERTIES: readonly string[] = [
  'Category',
  'Name',
  'Assembly Code',
  'Classification Code',
  'Level',
];

export const DEFAULT_GROUP_BY = 'Category';
export const DEFAULT_FILE_NAME = 'model-properties.xlsx';
export const MODEL_COLUMN = 'Model';

export function exportFileName(file?: string, version?: string): string {
  const base = (file ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const parts = [base, version ?? '']
    .map((part) =>
      part
        .normalize('NFKD')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-.]+|[-.]+$/g, ''),
    )
    .filter(Boolean);
  if (!base || parts.length === 0) return DEFAULT_FILE_NAME;
  return `${parts.join('-').slice(0, 120)}-properties.xlsx`;
}
export const FALLBACK_SHEET_NAME = 'Elements';

export type ExportCell = string | number | boolean;

function unavailableModelNames(adapter: ViewerAdapter): string[] {
  if (typeof adapter.getModels !== 'function') return [];
  return unavailableModels(adapter.getModels()).map((model) => model.name);
}

export interface ExportSheet {
  name: string;
  header: string[];
  rows: ExportCell[][];
}

export type ExportStatus =
  | { phase: 'reading' }
  | { phase: 'building' }
  | { phase: 'done'; fileName: string; rowCount: number; missing?: string[] }
  | { phase: 'empty' }
  | { phase: 'error'; message: string };

const FORBIDDEN_SHEET_CHARS = /[\\/?*[\]:]/g;

export function sheetNameFor(value: string, used: Set<string>): string {
  const base =
    value.replace(FORBIDDEN_SHEET_CHARS, ' ').trim().slice(0, 31) ||
    FALLBACK_SHEET_NAME;
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${n++}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

function cellOf(
  value: string | number | boolean | null | undefined,
): ExportCell {
  if (value === null || value === undefined) return '';
  return value;
}

export function buildExportRows(
  rows: readonly PropertyRow[],
  propertyNames: readonly string[],
  withModel = false,
): { header: string[]; rows: ExportCell[][] } {
  const values = (row: PropertyRow): ExportCell[] => [
    row.dbId,
    ...propertyNames.map((name) => cellOf(row.properties[name])),
  ];
  if (!withModel) {
    return { header: ['dbId', ...propertyNames], rows: rows.map(values) };
  }
  return {
    header: [MODEL_COLUMN, 'dbId', ...propertyNames],
    rows: rows.map((row) => [
      cellOf(row.modelName ?? row.modelId),
      ...values(row),
    ]),
  };
}

export function buildExportSheets(
  rows: readonly PropertyRow[],
  propertyNames: readonly string[],
  groupBy: string | null = DEFAULT_GROUP_BY,
): ExportSheet[] {
  if (rows.length === 0) return [];
  const used = new Set<string>();
  const withModel = distinctModelCount(rows) > 1;
  if (!groupBy || !propertyNames.includes(groupBy)) {
    const built = buildExportRows(rows, propertyNames, withModel);
    return [{ name: sheetNameFor(FALLBACK_SHEET_NAME, used), ...built }];
  }
  const groups = new Map<string, PropertyRow[]>();
  for (const row of rows) {
    const key = formatValue(row.properties[groupBy]);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .filter(([key]) => !key.includes('<'))
    .map(([key, bucket]) => ({
      name: sheetNameFor(key, used),
      ...buildExportRows(bucket, propertyNames, withModel),
    }));
}

export interface ExportOptions {
  propertyNames?: readonly string[];
  groupBy?: string | null;
  fileName?: string;
  onStatus?: (status: ExportStatus) => void;
  save?: (blob: Blob, fileName: string) => void;
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportToXlsx(
  adapter: ViewerAdapter,
  options: ExportOptions = {},
): Promise<ExportStatus> {
  const {
    propertyNames = DEFAULT_EXPORT_PROPERTIES,
    groupBy = DEFAULT_GROUP_BY,
    fileName = DEFAULT_FILE_NAME,
    onStatus,
    save = saveBlob,
  } = options;
  const emit = (status: ExportStatus): ExportStatus => {
    onStatus?.(status);
    return status;
  };
  try {
    emit({ phase: 'reading' });
    const rows = await readLeafRows(adapter, propertyNames);
    const sheets = buildExportSheets(rows, propertyNames, groupBy);
    if (sheets.length === 0) return emit({ phase: 'empty' });
    emit({ phase: 'building' });
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const blob = await writeXlsxFile(
      sheets.map((sheet) => ({
        sheet: sheet.name,
        data: [
          sheet.header.map((value) => ({ value, fontWeight: 'bold' as const })),
          ...sheet.rows,
        ],
      })),
    ).toBlob();
    save(blob, fileName);
    const rowCount = sheets.reduce(
      (total, sheet) => total + sheet.rows.length,
      0,
    );
    const missing = unavailableModelNames(adapter);
    return emit(
      missing.length > 0
        ? { phase: 'done', fileName, rowCount, missing }
        : { phase: 'done', fileName, rowCount },
    );
  } catch (err) {
    return emit({
      phase: 'error',
      message: err instanceof Error ? err.message : 'Export failed',
    });
  }
}

export function describeStatus(status: ExportStatus): string {
  switch (status.phase) {
    case 'reading':
      return 'Reading element properties';
    case 'building':
      return 'Building the Excel file';
    case 'done':
      return status.missing?.length
        ? `Exported ${status.rowCount} elements to ${status.fileName}. Missing ${status.missing.join(', ')}: properties could not be read`
        : `Exported ${status.rowCount} elements to ${status.fileName}`;
    case 'empty':
      return 'No elements to export';
    case 'error':
      return `Export failed: ${status.message}`;
  }
}
