import {
  DEFAULT_EXCEL_SETTINGS,
  type ExcelSettings,
  readExcelSettings,
} from '../../extensions/exportFormats.js';
import { persistedSetting } from '../kernel/persistedSetting.js';
import { readEnabled, type ToolSettings } from '../kernel/ViewerTool.js';

export type ExcelToolSettings = ExcelSettings & ToolSettings;

export const EXCEL_SETTINGS_KEY = 'bsh.tool.excel.v1';

export const DEFAULT_EXCEL_TOOL_SETTINGS: ExcelToolSettings = {
  enabled: true,
  ...DEFAULT_EXCEL_SETTINGS,
};

export function readExcelToolSettings(raw: unknown): ExcelToolSettings {
  return { enabled: readEnabled(raw), ...readExcelSettings(raw) };
}

export const EXCEL_SETTINGS = persistedSetting(
  EXCEL_SETTINGS_KEY,
  DEFAULT_EXCEL_TOOL_SETTINGS,
  readExcelToolSettings,
);
