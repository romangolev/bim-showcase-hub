import { DEFAULT_EXPORT_PROPERTIES } from '../../extensions/excelExport.js';
import { setIdOf } from '../../viewer/selectionSets.js';
import { exportEntry } from '../kernel/exportKit.js';
import {
  type ToolContext,
  type ToolContribution,
  ViewerTool,
} from '../kernel/ViewerTool.js';
import { ExcelFields } from './ExcelFields.js';
import { excelJob } from './excelJob.js';
import { EXCEL_SETTINGS, type ExcelToolSettings } from './excelSettings.js';

export { excelFileNameFrom } from './excelJob.js';

export const EXPORT_TOOLTIP = 'Export to Excel';

export class ExcelExportTool extends ViewerTool<ExcelToolSettings> {
  readonly id = 'excel';
  readonly title = 'Excel export';
  readonly description =
    'Export element properties to an .xlsx file from the viewer toolbar.';
  readonly settings = EXCEL_SETTINGS;
  readonly exportTitle = EXPORT_TOOLTIP;

  override scrub(settings: ExcelToolSettings): ExcelToolSettings {
    return {
      ...settings,
      modelScope: 'all',
      scope: setIdOf(settings.scope) === undefined ? settings.scope : 'all',
      properties: DEFAULT_EXPORT_PROPERTIES,
    };
  }

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
          (job) =>
            excelJob(ctx.adapter, ctx.current(this), ctx.fileName(), job),
        ),
      ],
    };
  }

  override get hasSettings(): boolean {
    return true;
  }

  protected override renderFields() {
    return <ExcelFields />;
  }
}
