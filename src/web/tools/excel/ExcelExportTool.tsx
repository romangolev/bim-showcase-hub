import {
  DEFAULT_EXPORT_PROPERTIES,
  describeStatus,
  exportToXlsx,
} from '../../extensions/excelExport.js';
import {
  applyNamePattern,
  CONFIRM_ABOVE,
  DEFAULT_NAME_PATTERN,
  type ExcelSettings,
} from '../../extensions/exportFormats.js';
import {
  confirmLargeExport,
  exportEntry,
  exportFileName,
  statusReporter,
} from '../kernel/exportKit.js';
import {
  type ToolContext,
  type ToolContribution,
  ViewerTool,
} from '../kernel/ViewerTool.js';
import { ExcelFields } from './ExcelFields.js';
import { EXCEL_SETTINGS, type ExcelToolSettings } from './excelSettings.js';

export const EXPORT_TOOLTIP = 'Export to Excel';

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

export class ExcelExportTool extends ViewerTool<ExcelToolSettings> {
  readonly id = 'excel';
  readonly title = 'Excel export';
  readonly description =
    'Export element properties to an .xlsx file from the viewer toolbar.';
  readonly settings = EXCEL_SETTINGS;
  readonly exportTitle = EXPORT_TOOLTIP;
  readonly legacy = {
    fields: ['excelExport', 'excel'],
    read: (blob: Record<string, unknown>) => ({
      ...(typeof blob.excel === 'object' && blob.excel !== null
        ? blob.excel
        : {}),
      enabled: blob.excelExport,
    }),
  };

  contribute(ctx: ToolContext): ToolContribution {
    return {
      exports: [
        exportEntry(
          ctx,
          this.id,
          {
            id: 'export-xlsx',
            icon: 'bsh-ico-export',
            tooltip: EXPORT_TOOLTIP,
            label: 'Exporting Excel',
            cancellable: true,
          },
          ({ task, signal }) => {
            const settings = ctx.current(this);
            return exportToXlsx(ctx.adapter, {
              propertyNames: DEFAULT_EXPORT_PROPERTIES,
              fileName: excelFileNameFrom(ctx.fileName(), settings),
              format: settings.format,
              scope: settings.scope,
              modelScope: settings.modelScope,
              metadata: settings.metadata,
              exporterName: settings.exporterName,
              summarySheet: settings.summarySheet,
              table: {
                delimiter: settings.csvDelimiter,
                decimal: settings.decimalMark,
                header: settings.includeHeader,
              },
              confirm: (rows) => confirmLargeExport(rows, CONFIRM_ABOVE),
              signal,
              onProgress: (fraction) => task.progress(fraction),
              onStatus: statusReporter(task, describeStatus),
            });
          },
        ),
      ],
    };
  }

  protected override renderFields() {
    return <ExcelFields />;
  }
}
