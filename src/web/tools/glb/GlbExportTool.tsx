import {
  DEFAULT_GLB_FILE_NAME,
  describeGlbStatus,
  exportGeometryToGlb,
  type GlbExportStatus,
  glbHasWarning,
} from '../../extensions/glbExport.js';
import { exportEntry, exportFileName, isBusy } from '../kernel/exportKit.js';
import { persistedSetting } from '../kernel/persistedSetting.js';
import {
  readEnabled,
  type ToolBadge,
  type ToolContext,
  type ToolContribution,
  type ToolSettings,
  ViewerTool,
} from '../kernel/ViewerTool.js';

export const GEOMETRY_TOOLTIP = 'Export geometry (GLB)';
export const GLB_SETTINGS_KEY = 'bsh.tool.glb.v1';

export type GlbToolSettings = ToolSettings;

export const GLB_SETTINGS = persistedSetting<GlbToolSettings>(
  GLB_SETTINGS_KEY,
  { enabled: true },
  (raw) => ({ enabled: readEnabled(raw) }),
);

export function glbFileNameFrom(fileName?: string): string {
  return exportFileName(fileName, DEFAULT_GLB_FILE_NAME, '-geometry', 'glb');
}

export function glbBadge(status: GlbExportStatus): ToolBadge {
  return {
    text:
      status.phase === 'error'
        ? 'GLB export failed'
        : describeGlbStatus(status),
    detail: describeGlbStatus(status),
    error: glbHasWarning(status),
  };
}

export class GlbExportTool extends ViewerTool<GlbToolSettings> {
  readonly id = 'glb';
  readonly title = 'Geometry export';
  readonly description =
    'Export the model geometry to a .glb file from the viewer toolbar.';
  readonly settings = GLB_SETTINGS;
  readonly legacy = {
    fields: ['glbExport'],
    read: (blob: Record<string, unknown>) => ({ enabled: blob.glbExport }),
  };

  contribute(ctx: ToolContext): ToolContribution {
    return {
      exports: [
        exportEntry(
          ctx,
          this.id,
          { id: 'export-glb', icon: 'bsh-ico-glb', tooltip: GEOMETRY_TOOLTIP },
          () =>
            exportGeometryToGlb(ctx.adapter, {
              fileName: glbFileNameFrom(ctx.fileName()),
              onStatus: (status) =>
                ctx.report(glbBadge(status), isBusy(status)),
            }),
        ),
      ],
    };
  }
}
