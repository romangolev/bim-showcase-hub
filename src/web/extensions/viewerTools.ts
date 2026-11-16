import type { ToolGroupSpec, ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  DEFAULT_EXPORT_PROPERTIES,
  DEFAULT_FILE_NAME,
  type ExportStatus,
  exportToXlsx,
} from './excelExport.js';
import {
  PAINT_PRESETS,
  paintSelection,
  RESET_PAINT_LABEL,
  resetPaint,
} from './paintBrushes.js';

export const TOOL_GROUP_ID = 'bim-showcase-hub-tools';
export const TOOL_GROUP_TITLE = 'BIM Showcase Hub tools';
export const PAINT_TOOLTIP = 'Paint selection';
export const PAINT_SELECT_HINT = 'Select elements to paint';
export const PAINT_RESET_HINT = 'Nothing painted yet';
export const EXPORT_TOOLTIP = 'Export to Excel';

export interface ViewerToolsOptions {
  onStatus?: (status: ExportStatus) => void;
  key?: string;
  fileName?: () => string;
}

export function modelKey(urn: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < urn.length; index += 1) {
    hash ^= urn.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function keyed(id: string, key?: string): string {
  return key ? `${id}-${key}` : id;
}

export function buildToolGroupSpec(
  adapter: ViewerAdapter,
  options: ViewerToolsOptions = {},
): ToolGroupSpec {
  let busy = false;
  const { key } = options;
  return {
    id: keyed(TOOL_GROUP_ID, key),
    title: TOOL_GROUP_TITLE,
    paint: {
      id: keyed('paint', key),
      tooltip: PAINT_TOOLTIP,
      swatches: PAINT_PRESETS.map((preset) => ({
        id: keyed(preset.id, key),
        icon: preset.id,
        label: preset.label,
        swatch: preset.swatch,
        color: preset.color,
      })),
      reset: { id: keyed('paint-reset', key), label: RESET_PAINT_LABEL },
      selectHint: PAINT_SELECT_HINT,
      resetHint: PAINT_RESET_HINT,
      onPaint: (color) => paintSelection(adapter, color),
      onReset: () => resetPaint(adapter),
    },
    export: {
      id: keyed('export-xlsx', key),
      tooltip: EXPORT_TOOLTIP,
      onExport: () => {
        if (busy) return;
        busy = true;
        void exportToXlsx(adapter, {
          propertyNames: DEFAULT_EXPORT_PROPERTIES,
          fileName: options.fileName?.() || DEFAULT_FILE_NAME,
          onStatus: options.onStatus,
        }).finally(() => {
          busy = false;
        });
      },
    },
  };
}

export function registerViewerTools(
  adapter: ViewerAdapter,
  options: ViewerToolsOptions = {},
): () => void {
  return adapter.registerToolGroup(buildToolGroupSpec(adapter, options));
}
