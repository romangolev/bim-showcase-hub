import type { ToolGroupSpec, ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  DEFAULT_EXPORT_PROPERTIES,
  DEFAULT_FILE_NAME,
  type ExportStatus,
  exportToXlsx,
} from './excelExport.js';
import {
  DEFAULT_GLB_FILE_NAME,
  exportGeometryToGlb,
  type GlbExportStatus,
} from './glbExport.js';
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
export const GEOMETRY_TOOLTIP = 'Export geometry (GLB)';

export interface ViewerToolsOptions {
  onStatus?: (status: ExportStatus) => void;
  onGeometryStatus?: (status: GlbExportStatus) => void;
  key?: string;
  fileName?: () => string;
}

export function glbFileNameFrom(fileName?: string): string {
  const name = (fileName ?? '').trim();
  if (!name) return DEFAULT_GLB_FILE_NAME;
  const base = name.replace(/\.(xlsx|glb|gltf)$/i, '');
  const model = base.replace(/-properties$/i, '');
  if (!model) return DEFAULT_GLB_FILE_NAME;
  return `${model}-geometry.glb`;
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
  let geometryBusy = false;
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
    geometry: {
      id: keyed('export-glb', key),
      tooltip: GEOMETRY_TOOLTIP,
      onExport: () => {
        if (geometryBusy) return;
        geometryBusy = true;
        void exportGeometryToGlb(adapter, {
          fileName: glbFileNameFrom(options.fileName?.()),
          onStatus: options.onGeometryStatus,
        }).finally(() => {
          geometryBusy = false;
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
