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
import { ifcBatchMode } from './ifcBatchMode.js';
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
    const entry = exportEntry(
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
    );
    const { openModal, focusDocuments } = ctx;
    if (!openModal && !focusDocuments) return { exports: [entry] };
    return {
      exports: [
        {
          ...entry,
          menu: [
            {
              id: ctx.id('ifc-export-now'),
              icon: 'bsh-ico-ifc',
              tooltip: 'Export current model',
              run: entry.onExport,
            },
            ...(focusDocuments
              ? [
                  {
                    id: ctx.id('ifc-batch'),
                    icon: 'bsh-ico-ifc-batch',
                    tooltip: 'Batch export IFC',
                    run: () => {
                      ifcBatchMode.set(true);
                      focusDocuments();
                    },
                  },
                ]
              : []),
            ...(openModal
              ? [
                  {
                    id: ctx.id('ifc-settings'),
                    icon: 'bsh-ico-ifc-settings',
                    tooltip: 'IFC settings',
                    run: () => openModal(this.modalId),
                  },
                ]
              : []),
          ],
        },
      ],
    };
  }

  override scrub(settings: IfcToolSettings): IfcToolSettings {
    return { ...settings, author: '', organisation: '' };
  }

  override get hasSettings(): boolean {
    return true;
  }

  protected override renderFields() {
    return <IfcFields />;
  }
}
