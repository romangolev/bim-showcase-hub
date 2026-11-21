import { scrubAppSettings } from '../settings/settings.js';
import { onForgetPersonal } from '../storage.js';
import { tasks } from '../tasks/taskStore.js';
import { DisplayTool } from './display/DisplayTool.js';
import { ExcelExportTool } from './excel/ExcelExportTool.js';
import { GlbExportTool } from './glb/GlbExportTool.js';
import { IfcExportTool } from './ifc/IfcExportTool.js';
import { ToolRegistry } from './kernel/ToolRegistry.js';
import { PaintTool } from './paint/PaintTool.js';
import { ToolbarProfileTool } from './toolbar/ToolbarProfileTool.js';

export const TOOLS = new ToolRegistry()
  .register(new PaintTool())
  .register(new ExcelExportTool())
  .register(new GlbExportTool())
  .register(new IfcExportTool())
  .register(new ToolbarProfileTool())
  .register(new DisplayTool());

onForgetPersonal(() => {
  tasks.clearFinished();
  TOOLS.scrubPersonal();
  scrubAppSettings();
});

export { useViewerTools } from './kernel/useViewerTools.js';
