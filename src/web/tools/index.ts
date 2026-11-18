import { APP_SETTINGS_BLOB } from '../settings/settings.js';
import { onForgetPersonal } from '../storage.js';
import { tasks } from '../tasks/taskStore.js';
import { ExcelExportTool } from './excel/ExcelExportTool.js';
import { GlbExportTool } from './glb/GlbExportTool.js';
import { IfcExportTool } from './ifc/IfcExportTool.js';
import { migrateLegacySettings } from './kernel/migrateLegacy.js';
import { ToolRegistry } from './kernel/ToolRegistry.js';
import { PaintTool } from './paint/PaintTool.js';

export const TOOLS = new ToolRegistry()
  .register(new PaintTool())
  .register(new ExcelExportTool())
  .register(new GlbExportTool())
  .register(new IfcExportTool());

onForgetPersonal(() => {
  tasks.clearFinished();
  TOOLS.scrubPersonal();
  migrateLegacySettings(TOOLS, APP_SETTINGS_BLOB, { scrub: true });
});

export function migrateLegacyToolSettings(): void {
  migrateLegacySettings(TOOLS, APP_SETTINGS_BLOB);
}

export { useViewerTools } from './kernel/useViewerTools.js';
