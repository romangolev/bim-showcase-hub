import {
  describeStatus,
  type ExportOptions,
  type ExportStatus,
  exportToXlsx,
} from '../../extensions/excelExport.js';
import {
  applyNamePattern,
  DEFAULT_NAME_PATTERN,
  type ExcelSettings,
} from '../../extensions/exportFormats.js';
import { currentColoring } from '../../viewer/modelColoring.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import {
  confirmLargeExport,
  type ExportJob,
  exportFileName,
  runOnce,
  statusReporter,
} from '../kernel/exportKit.js';
import { EXCEL_SETTINGS, type ExcelToolSettings } from './excelSettings.js';
import { publishExcelStatus } from './excelStatus.js';

export function excelFileNameFrom(
  fileName: string | undefined,
  settings: ExcelSettings,
): string {
  const model = exportFileName(fileName, '', '', 'x').slice(0, -2) || 'model';
  const extension = settings.format === 'copy' ? 'xlsx' : settings.format;
  const pattern =
    settings.namePattern.trim() === DEFAULT_NAME_PATTERN &&
    /-properties(-|$)/i.test(model)
      ? '{model}'
      : settings.namePattern;
  return applyNamePattern(pattern, model, extension);
}

export async function excelJob(
  adapter: ViewerAdapter,
  settings: ExcelToolSettings,
  fileName: string | undefined,
  { task, signal }: ExportJob,
  overrides: Partial<ExportOptions> = {},
): Promise<ExportStatus> {
  const report = statusReporter(task, describeStatus);
  const options: ExportOptions = {
    propertyNames: settings.properties,
    fileName: excelFileNameFrom(fileName, settings),
    format: settings.format,
    scope: settings.scope,
    modelScope: settings.modelScope,
    metadata: settings.metadata,
    exporterName: settings.exporterName,
    summarySheet: settings.summarySheet,
    groupBy: settings.groupBy,
    emptyText: settings.emptyLabel === 'blank' ? '' : '(empty)',
    coloring:
      settings.colorColumn || settings.legendSheet
        ? currentColoring(adapter)
        : null,
    legendSheet: settings.legendSheet,
    colorColumn: settings.colorColumn,
    columnFormats: settings.columnFormats,
    table: {
      delimiter: settings.csvDelimiter,
      decimal: settings.decimalMark,
      header: settings.includeHeader,
    },
    confirm: (rows) =>
      settings.confirmAbove === 0 ||
      confirmLargeExport(rows, settings.confirmAbove),
    signal,
    onProgress: (progress) =>
      task.progress(
        progress.total ? progress.loaded / progress.total : null,
        progress.total
          ? `${progress.loaded.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')} elements`
          : 'Reading element properties',
      ),
    ...overrides,
  };
  return exportToXlsx(adapter, {
    ...options,
    onStatus: (status) => {
      options.onStatus?.(status);
      report(status);
      publishExcelStatus(adapter, status);
    },
  });
}

export function startExcelExport(
  adapter: ViewerAdapter,
  fileName: string | undefined,
): void {
  runOnce(
    adapter,
    'excel',
    'Exporting Excel',
    (job) => excelJob(adapter, EXCEL_SETTINGS.read(), fileName, job),
    true,
  );
}
