import { BSH_KEYS, onForgetPersonal } from '../storage.js';
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
  TOOLS.scrubPersonal();
  migrateLegacySettings(TOOLS, BSH_KEYS.preference.settings, { scrub: true });
});

export function migrateLegacyToolSettings(): void {
  migrateLegacySettings(TOOLS, BSH_KEYS.preference.settings);
}

export { useViewerTools } from './kernel/useViewerTools.js';
