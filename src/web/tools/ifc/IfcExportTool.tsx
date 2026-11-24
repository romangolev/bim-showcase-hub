import {
  DEFAULT_IFC_FILE_NAME,
  describeIfcStatus,
  exportToIfc,
} from '../../extensions/ifcExport.js';
import type { ModalDefinition } from '../../modal/types.js';
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
import { IFC_BATCH_MODAL } from './IfcBatchModal.js';
import {
  IFC_MENU_MODAL,
  IFC_MENU_MODAL_ID,
  setExportCurrent,
} from './IfcExportMenu.js';
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
    const { openModal } = ctx;
    return {
      exports: [
        openModal
          ? {
              ...entry,
              onMenu: () => {
                setExportCurrent(entry.onExport);
                openModal(IFC_MENU_MODAL_ID);
              },
            }
          : entry,
      ],
    };
  }

  override modals(): ModalDefinition[] {
    return [...super.modals(), IFC_MENU_MODAL, IFC_BATCH_MODAL];
  }

  override scrub(settings: IfcToolSettings): IfcToolSettings {
    return { ...settings, author: '', organisation: '' };
  }

  protected override renderFields() {
    return <IfcFields />;
  }
}
