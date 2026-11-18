import {
  DEFAULT_IFC_FILE_NAME,
  describeIfcStatus,
  exportToIfc,
  type IfcExportStatus,
  ifcHasWarning,
} from '../../extensions/ifcExport.js';
import { exportEntry, exportFileName, isBusy } from '../kernel/exportKit.js';
import {
  type ToolBadge,
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

export function ifcBadge(status: IfcExportStatus): ToolBadge {
  return {
    text:
      status.phase === 'error'
        ? 'IFC export failed'
        : describeIfcStatus(status),
    detail: describeIfcStatus(status),
    error: ifcHasWarning(status),
  };
}

export class IfcExportTool extends ViewerTool<IfcToolSettings> {
  readonly id = 'ifc';
  readonly title = 'IFC export';
  readonly description =
    'Export the model to an .ifc file from the viewer toolbar, using the IFC export settings below.';
  readonly settings = IFC_SETTINGS;
  readonly exportTitle = IFC_TOOLTIP;
  readonly legacy = {
    fields: ['ifcExport', 'ifc'],
    read: (blob: Record<string, unknown>) => ({
      ...(typeof blob.ifc === 'object' && blob.ifc !== null ? blob.ifc : {}),
      enabled: blob.ifcExport,
    }),
  };

  contribute(ctx: ToolContext): ToolContribution {
    return {
      exports: [
        exportEntry(
          ctx,
          this.id,
          { id: 'export-ifc', icon: 'bsh-ico-ifc', tooltip: IFC_TOOLTIP },
          () =>
            exportToIfc(ctx.adapter, {
              fileName: ifcFileNameFrom(ctx.fileName()),
              settings: () => ctx.current(this),
              onStatus: (status) =>
                ctx.report(ifcBadge(status), isBusy(status)),
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
