import type { IfcSettings } from '../ifc/types.js';
import type {
  Rgba,
  ToolGroupSpec,
  ViewerAdapter,
} from '../viewer/ViewerAdapter.js';
import {
  DEFAULT_EXPORT_PROPERTIES,
  type ExportStatus,
  exportToXlsx,
} from './excelExport.js';
import {
  applyNamePattern,
  CONFIRM_ABOVE,
  DEFAULT_EXCEL_SETTINGS,
  DEFAULT_NAME_PATTERN,
  type ExcelSettings,
} from './exportFormats.js';
import {
  DEFAULT_GLB_FILE_NAME,
  exportGeometryToGlb,
  type GlbExportStatus,
} from './glbExport.js';
import {
  DEFAULT_IFC_FILE_NAME,
  exportToIfc,
  type IfcExportStatus,
} from './ifcExport.js';
import {
  PAINT_PRESETS,
  PALETTE_ICON,
  type PaintPreset,
  paintSelection,
  paletteToPresets,
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
export const IFC_TOOLTIP = 'Export IFC';

export interface ToolFeatures {
  paint: boolean;
  export: boolean;
  geometry: boolean;
  ifc: boolean;
}

export const ALL_TOOL_FEATURES: ToolFeatures = {
  paint: true,
  export: true,
  geometry: true,
  ifc: true,
};

export interface ViewerToolsOptions {
  features?: ToolFeatures;
  paintPalette?: readonly string[];
  paintIntensity?: number;
  onStatus?: (status: ExportStatus) => void;
  onGeometryStatus?: (status: GlbExportStatus) => void;
  onIfcStatus?: (status: IfcExportStatus) => void;
  ifcSettings?: () => IfcSettings;
  excelSettings?: () => ExcelSettings;
  key?: string;
  fileName?: () => string;
}

function exportFileName(
  fileName: string | undefined,
  fallback: string,
  suffix: string,
  extension: string,
): string {
  const model = (fileName ?? '')
    .trim()
    .replace(/\.(xlsx|glb|gltf|ifc)$/i, '')
    .replace(/-properties$/i, '');
  return model ? `${model}${suffix}.${extension}` : fallback;
}

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

export function confirmLargeExport(rowCount: number): boolean {
  return (
    rowCount <= CONFIRM_ABOVE ||
    window.confirm(
      `Export ${rowCount.toLocaleString('en-US')} elements? This can take a while.`,
    )
  );
}

export function glbFileNameFrom(fileName?: string): string {
  return exportFileName(fileName, DEFAULT_GLB_FILE_NAME, '-geometry', 'glb');
}

export function ifcFileNameFrom(fileName?: string): string {
  return exportFileName(fileName, DEFAULT_IFC_FILE_NAME, '', 'ifc');
}

export function modelKey(urn: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < urn.length; index += 1) {
    hash ^= urn.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

type ExportKind = 'xlsx' | 'glb' | 'ifc';

const running = new WeakMap<ViewerAdapter, Set<ExportKind>>();

function runOnce(
  adapter: ViewerAdapter,
  kind: ExportKind,
  start: () => Promise<unknown>,
): void {
  let kinds = running.get(adapter);
  if (!kinds) {
    kinds = new Set();
    running.set(adapter, kinds);
  }
  if (kinds.has(kind)) return;
  const active = kinds;
  active.add(kind);
  try {
    void start()
      .finally(() => {
        active.delete(kind);
      })
      .catch(() => undefined);
  } catch (error) {
    active.delete(kind);
    throw error;
  }
}

function keyed(id: string, key?: string): string {
  return key ? `${id}-${key}` : id;
}

export function buildToolGroupSpec(
  adapter: ViewerAdapter,
  options: ViewerToolsOptions = {},
): ToolGroupSpec {
  const { key } = options;
  const features = options.features ?? ALL_TOOL_FEATURES;
  const presets: readonly PaintPreset[] = options.paintPalette
    ? paletteToPresets(options.paintPalette, options.paintIntensity ?? 0.5)
    : PAINT_PRESETS;
  return {
    id: keyed(TOOL_GROUP_ID, key),
    title: TOOL_GROUP_TITLE,
    ...(features.paint
      ? {
          paint: {
            id: keyed('paint', key),
            tooltip: PAINT_TOOLTIP,
            swatches: presets.map((preset) => ({
              id: keyed(preset.id, key),
              icon: options.paintPalette ? PALETTE_ICON : preset.id,
              label: preset.label,
              swatch: preset.swatch,
              color: preset.color,
            })),
            reset: { id: keyed('paint-reset', key), label: RESET_PAINT_LABEL },
            selectHint: PAINT_SELECT_HINT,
            resetHint: PAINT_RESET_HINT,
            onPaint: (color: Rgba) => paintSelection(adapter, color),
            onReset: () => resetPaint(adapter),
          },
        }
      : {}),
    exports: [
      ...(features.export
        ? [
            {
              id: keyed('export-xlsx', key),
              icon: 'bsh-ico-export',
              tooltip: EXPORT_TOOLTIP,
              onExport: () => {
                const settings =
                  options.excelSettings?.() ?? DEFAULT_EXCEL_SETTINGS;
                runOnce(adapter, 'xlsx', () =>
                  exportToXlsx(adapter, {
                    propertyNames: DEFAULT_EXPORT_PROPERTIES,
                    fileName: excelFileNameFrom(options.fileName?.(), settings),
                    format: settings.format,
                    scope: settings.scope,
                    metadata: settings.metadata,
                    confirm: confirmLargeExport,
                    onStatus: options.onStatus,
                  }),
                );
              },
            },
          ]
        : []),
      ...(features.geometry
        ? [
            {
              id: keyed('export-glb', key),
              icon: 'bsh-ico-glb',
              tooltip: GEOMETRY_TOOLTIP,
              onExport: () => {
                runOnce(adapter, 'glb', () =>
                  exportGeometryToGlb(adapter, {
                    fileName: glbFileNameFrom(options.fileName?.()),
                    onStatus: options.onGeometryStatus,
                  }),
                );
              },
            },
          ]
        : []),
      ...(features.ifc
        ? [
            {
              id: keyed('export-ifc', key),
              icon: 'bsh-ico-ifc',
              tooltip: IFC_TOOLTIP,
              onExport: () => {
                runOnce(adapter, 'ifc', () =>
                  exportToIfc(adapter, {
                    fileName: ifcFileNameFrom(options.fileName?.()),
                    settings: options.ifcSettings,
                    onStatus: options.onIfcStatus,
                  }),
                );
              },
            },
          ]
        : []),
    ],
  };
}

export function registerViewerTools(
  adapter: ViewerAdapter,
  options: ViewerToolsOptions = {},
): () => void {
  const features = options.features ?? ALL_TOOL_FEATURES;
  if (
    !features.paint &&
    !features.export &&
    !features.geometry &&
    !features.ifc
  ) {
    return () => undefined;
  }
  return adapter.registerToolGroup(buildToolGroupSpec(adapter, options));
}
