import { scrubAppSettings } from '../settings/settings.js';
import { onForgetPersonal } from '../storage.js';
import { tasks } from '../tasks/taskStore.js';
import { ExcelExportTool } from './excel/ExcelExportTool.js';
import { GlbExportTool } from './glb/GlbExportTool.js';
import { IfcExportTool } from './ifc/IfcExportTool.js';
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
  scrubAppSettings();
});

export { useViewerTools } from './kernel/useViewerTools.js';
