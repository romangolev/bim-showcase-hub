import {
  DEFAULT_IFC_FILE_NAME,
  describeIfcStatus,
  exportToIfc,
} from '../../extensions/ifcExport.js';
import {
  exportEntry,
  exportFileName,
  statusReporter,
} from '../kernel/exportKit.js';
import {
  type ToolContext,
  type ToolContribution,
  ViewerTool,
} from '../kernel/ViewerTool.js';
import { IfcFields } from './IfcFields.js';
import { IFC_SETTINGS, type IfcToolSettings } from './ifcSettings.js';

export const IFC_TOOLTIP = 'Export IFC';

export function ifcFileNameFrom(fileName?: string): string {
  return exportFileName(fileName, DEFAULT_IFC_FILE_NAME, '', 'ifc');
}

export class IfcExportTool extends ViewerTool<IfcToolSettings> {
  readonly id = 'ifc';
  readonly title = 'IFC export';
  readonly description =
    'Export the model to an .ifc file from the viewer toolbar, using the IFC file settings below.';
  readonly settings = IFC_SETTINGS;
  readonly exportTitle = IFC_TOOLTIP;

  contribute(ctx: ToolContext): ToolContribution {
    return {
      exports: [
        exportEntry(
          ctx,
          this.id,
          {
            id: 'export-ifc',
            icon: 'bsh-ico-ifc',
            tooltip: IFC_TOOLTIP,
            label: 'Exporting IFC',
          },
          ({ task }) =>
            exportToIfc(ctx.adapter, {
              fileName: ifcFileNameFrom(ctx.fileName()),
              settings: () => ctx.current(this),
              onStatus: statusReporter(task, describeIfcStatus),
            }),
        ),
      ],
    };
  }

  override scrub(settings: IfcToolSettings): IfcToolSettings {
    return { ...settings, author: '', organisation: '' };
  }

  protected override renderFields() {
    return <IfcFields />;
  }
}
