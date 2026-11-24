import { useModalApi } from '../../modal/modalApi.js';
import type { ModalDefinition } from '../../modal/types.js';
import { IFC_BATCH_MODAL } from './IfcBatchModal.js';

export const IFC_MENU_MODAL_ID = 'tool-ifc-menu';
export const IFC_SETTINGS_MODAL_ID = 'tool-ifc-settings';

let exportCurrent: (() => void) | null = null;

export function setExportCurrent(run: () => void): void {
  exportCurrent = run;
}

function IfcExportMenuBody({ close }: { close: () => void }) {
  const modal = useModalApi();
  return (
    <div className="settings__actions ifc-menu">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          const run = exportCurrent;
          close();
          run?.();
        }}
      >
        Export current
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => modal?.open(IFC_BATCH_MODAL.id)}
      >
        Batch export…
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => modal?.open(IFC_SETTINGS_MODAL_ID)}
      >
        IFC settings
      </button>
    </div>
  );
}

export const IFC_MENU_MODAL: ModalDefinition = {
  id: IFC_MENU_MODAL_ID,
  title: 'IFC export',
  size: 'sheet',
  Body: IfcExportMenuBody,
  onClose: () => {
    exportCurrent = null;
  },
};
