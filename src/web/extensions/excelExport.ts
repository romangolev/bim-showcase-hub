import type { PropertyRow } from '../../shared/types.js';
import {
  ALL_MODELS,
  distinctModelCount,
  type ModelScope,
} from '../viewer/modelScope.js';
import { isAbortError, throwIfAborted } from '../viewer/propertyReads.js';
import { readScopedRows } from '../viewer/scopedRows.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  type AboutInfo,
  aboutRows,
  type ExportFormat,
  type ExportScope,
  type TableOptions,
  toDelimited,
  toJsonRecords,
} from './exportFormats.js';
import { formatValue, summarize } from './modelSummary.js';

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

export const FALLBACK_SHEET_NAME = 'Elements';

export type ExportCell = string | number | boolean;

function shownModels(adapter: ViewerAdapter): AboutInfo['models'] {
  return adapter
    .getModels()
    .filter((model) => model.status === 'ready' && model.visible)
    .map(({ name, urn, version, path }) => ({
      name,
      urn,
      ...(version ? { version } : {}),
      ...(path ? { path } : {}),
    }));
}

export interface ExportSheet {
  name: string;
  header: string[];
  rows: ExportCell[][];
}

export type ExportStatus =
  | { phase: 'reading' }
  | { phase: 'building' }
  | {
      phase: 'done';
      fileName: string;
      rowCount: number;
      missing?: string[];
      scopeNote?: string;
    }
  | { phase: 'empty' }
  | { phase: 'cancelled' }
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
  return [...groups.entries()].map(([key, bucket]) => ({
    name: sheetNameFor(key, used),
    ...buildExportRows(bucket, propertyNames, withModel),
  }));
}

export interface ExportOptions {
  propertyNames?: readonly string[];
  groupBy?: string | null;
  fileName?: string;
  format?: ExportFormat;
  scope?: ExportScope;
  modelScope?: ModelScope;
  metadata?: boolean;
  exporterName?: boolean;
  summarySheet?: boolean;
  table?: Partial<TableOptions>;
  confirm?: (rowCount: number) => boolean;
  copy?: (text: Promise<string>) => Promise<void>;
  onStatus?: (status: ExportStatus) => void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
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
    format = 'xlsx',
    scope = 'all',
    modelScope = ALL_MODELS,
    metadata = false,
    exporterName = true,
    summarySheet = false,
    table = {},
    confirm,
    copy = (text) =>
      navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': text.then(
            (value) => new Blob([value], { type: 'text/plain' }),
          ),
        }),
      ]),
    onStatus,
    onProgress,
    signal,
    save = saveBlob,
  } = options;
  const emit = (status: ExportStatus): ExportStatus => {
    onStatus?.(status);
    return status;
  };
  const copyText = {
    resolve: (_text: string): void => undefined,
    reject: (): void => undefined,
  };
  let copied: Promise<void> | undefined;
  try {
    if (format === 'copy') {
      const pending = new Promise<string>((resolve, reject) => {
        copyText.resolve = resolve;
        copyText.reject = () => reject(new Error('Export stopped'));
      });
      pending.catch(() => undefined);
      copied = copy(pending);
      copied.catch(() => undefined);
    }
    emit({ phase: 'reading' });
    const { rows, scopeNote, failed, unavailable } = await readScopedRows(
      adapter,
      {
        names: propertyNames,
        models: modelScope,
        elements: scope,
        signal,
        onProgress: ({ done, total }) => onProgress?.(total ? done / total : 0),
      },
    );
    throwIfAborted(signal);
    if (failed.length > 0) {
      throw new Error(`Could not read properties of ${failed.join(', ')}`);
    }
    if (rows.length === 0) {
      copyText.reject();
      return emit({ phase: 'empty' });
    }
    if (confirm && !confirm(rows.length)) {
      copyText.reject();
      return emit({ phase: 'cancelled' });
    }
    throwIfAborted(signal);
    emit({ phase: 'building' });
    let rowCount = rows.length;
    const about = (): AboutInfo => ({
      models: shownModels(adapter),
      scope,
      rowCount,
      exporter: exporterName,
    });
    let delivered = fileName;
    if (format === 'xlsx') {
      const sheets = buildExportSheets(rows, propertyNames, groupBy);
      if (sheets.length === 0) return emit({ phase: 'empty' });
      rowCount = sheets.reduce((total, sheet) => total + sheet.rows.length, 0);
      const { default: writeXlsxFile } = await import(
        'write-excel-file/browser'
      );
      const aboutSheet = metadata
        ? [
            {
              sheet: sheetNameFor(
                'About',
                new Set(sheets.map((sheet) => sheet.name.toLowerCase())),
              ),
              data: aboutRows(about()).map(([key, value]) => [
                { value: key, fontWeight: 'bold' as const },
                value,
              ]),
            },
          ]
        : [];
      const summary = summarySheet
        ? [
            {
              sheet: sheetNameFor(
                'Summary',
                new Set(
                  [...sheets.map((sheet) => sheet.name), 'About'].map((name) =>
                    name.toLowerCase(),
                  ),
                ),
              ),
              data: [
                ['Property', 'Value', 'Count'].map((value) => ({
                  value,
                  fontWeight: 'bold' as const,
                })),
                ...summarize(rows, propertyNames).map((entry) => [
                  entry.property,
                  entry.value,
                  entry.count,
                ]),
              ],
            },
          ]
        : [];
      const blob = await writeXlsxFile([
        ...sheets.map((sheet) => ({
          sheet: sheet.name,
          data: [
            sheet.header.map((value) => ({
              value,
              fontWeight: 'bold' as const,
            })),
            ...sheet.rows,
          ],
        })),
        ...summary,
        ...aboutSheet,
      ]).toBlob();
      throwIfAborted(signal);
      save(blob, fileName);
    } else {
      const flat = buildExportRows(
        rows,
        propertyNames,
        distinctModelCount(rows) > 1,
      );
      throwIfAborted(signal);
      if (format === 'copy') {
        copyText.resolve(
          toDelimited(flat.header, flat.rows, table.delimiter ?? '\t', table),
        );
        await copied;
        delivered = 'the clipboard';
      } else if (format === 'csv') {
        save(
          new Blob(
            [
              '\uFEFF',
              toDelimited(
                flat.header,
                flat.rows,
                table.delimiter ?? ',',
                table,
              ),
            ],
            {
              type: 'text/csv;charset=utf-8',
            },
          ),
          fileName,
        );
      } else {
        const elements = toJsonRecords(flat.header, flat.rows);
        const body = metadata
          ? {
              about: Object.fromEntries(aboutRows(about())),
              elements,
            }
          : elements;
        save(
          new Blob([JSON.stringify(body, null, 2)], {
            type: 'application/json',
          }),
          fileName,
        );
      }
    }
    const missing = unavailable.map((model) => model.name);
    return emit({
      phase: 'done',
      fileName: delivered,
      rowCount,
      ...(missing.length > 0 ? { missing } : {}),
      ...(scopeNote ? { scopeNote } : {}),
    });
  } catch (err) {
    copyText.reject();
    if (signal?.aborted || isAbortError(err))
      return emit({ phase: 'cancelled' });
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
    case 'done': {
      const base = `Exported ${status.rowCount} elements to ${status.fileName}`;
      const notes = [
        status.missing?.length
          ? `Missing ${status.missing.join(', ')}: properties could not be read`
          : '',
        status.scopeNote ?? '',
      ].filter(Boolean);
      return notes.length > 0 ? `${base}. ${notes.join('. ')}` : base;
    }
    case 'empty':
      return 'No elements to export';
    case 'cancelled':
      return 'Export cancelled';
    case 'error':
      return `Export failed: ${status.message}`;
  }
}
