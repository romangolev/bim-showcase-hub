import { DEFAULT_IFC_SETTINGS, readIfcSettings } from '../../ifc/settings.js';
import type { IfcSettings } from '../../ifc/types.js';
import { defineRecord } from '../../storage.js';
import { readEnabled, type ToolSettings } from '../kernel/ViewerTool.js';

export type IfcToolSettings = IfcSettings & ToolSettings;

export const IFC_SETTINGS_KEY = 'bsh.tool.ifc.v1';

export const DEFAULT_IFC_TOOL_SETTINGS: IfcToolSettings = {
  enabled: true,
  ...DEFAULT_IFC_SETTINGS,
};

export function readIfcToolSettings(raw: unknown): IfcToolSettings {
  return { enabled: readEnabled(raw), ...readIfcSettings(raw) };
}

export const IFC_SETTINGS = defineRecord({
  key: IFC_SETTINGS_KEY,
  initial: DEFAULT_IFC_TOOL_SETTINGS,
  sanitize: readIfcToolSettings,
});
