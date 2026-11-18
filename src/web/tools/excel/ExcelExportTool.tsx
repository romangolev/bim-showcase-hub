import {
  DEFAULT_EXPORT_PROPERTIES,
  describeStatus,
  type ExportStatus,
  exportToXlsx,
} from '../../extensions/excelExport.js';
import {
  applyNamePattern,
  CONFIRM_ABOVE,
  DEFAULT_NAME_PATTERN,
  type ExcelSettings,
} from '../../extensions/exportFormats.js';
import { formatCount } from '../../extensions/modelSummary.js';
import {
  confirmLargeExport,
  exportEntry,
  exportFileName,
  isBusy,
} from '../kernel/exportKit.js';
import {
  type ToolBadge,
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

function badgeText(status: ExportStatus): string {
  if (status.phase === 'error') return 'Export failed';
  if (status.phase === 'done') {
    const rows = `Exported ${formatCount(status.rowCount)} rows`;
    return status.missing?.length
      ? `${rows}, missing ${status.missing.join(', ')}`
      : rows;
  }
  return describeStatus(status);
}

export function excelBadge(status: ExportStatus): ToolBadge {
  return {
    text: badgeText(status),
    detail: describeStatus(status),
    error:
      status.phase === 'error' ||
      (status.phase === 'done' && Boolean(status.missing?.length)),
  };
}

export class ExcelExportTool extends ViewerTool<ExcelToolSettings> {
  readonly id = 'excel';
  readonly title = 'Excel export';
  readonly description =
    'Export element properties to an .xlsx file from the viewer toolbar.';
  readonly settings = EXCEL_SETTINGS;
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
          },
          () => {
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
              onStatus: (status) =>
                ctx.report(excelBadge(status), isBusy(status)),
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
