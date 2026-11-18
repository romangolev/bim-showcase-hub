import {
  DEFAULT_GLB_FILE_NAME,
  describeGlbStatus,
  exportGeometryToGlb,
} from '../../extensions/glbExport.js';
import { defineRecord } from '../../storage.js';
import {
  exportEntry,
  exportFileName,
  statusReporter,
} from '../kernel/exportKit.js';
import {
  readEnabled,
  type ToolContext,
  type ToolContribution,
  type ToolSettings,
  ViewerTool,
} from '../kernel/ViewerTool.js';

export const GEOMETRY_TOOLTIP = 'Export geometry (GLB)';
export const GLB_SETTINGS_KEY = 'bsh.tool.glb.v1';

export type GlbToolSettings = ToolSettings;

export const GLB_SETTINGS = defineRecord<GlbToolSettings>({
  key: GLB_SETTINGS_KEY,
  initial: { enabled: true },
  sanitize: (raw) => ({ enabled: readEnabled(raw) }),
});

export function glbFileNameFrom(fileName?: string): string {
  return exportFileName(fileName, DEFAULT_GLB_FILE_NAME, '-geometry', 'glb');
}

export class GlbExportTool extends ViewerTool<GlbToolSettings> {
  readonly id = 'glb';
  readonly title = 'Geometry export';
  readonly description =
    'Export the model geometry to a .glb file from the viewer toolbar.';
  readonly settings = GLB_SETTINGS;
  readonly exportTitle = GEOMETRY_TOOLTIP;
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
          {
            id: 'export-glb',
            icon: 'bsh-ico-glb',
            tooltip: GEOMETRY_TOOLTIP,
            label: 'Exporting geometry (GLB)',
          },
          ({ task }) =>
            exportGeometryToGlb(ctx.adapter, {
              fileName: glbFileNameFrom(ctx.fileName()),
              onStatus: statusReporter(task, describeGlbStatus),
            }),
        ),
      ],
    };
  }
}
