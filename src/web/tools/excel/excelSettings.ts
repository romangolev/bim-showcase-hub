import { isRecord } from '../../../shared/guards.js';
import { DEFAULT_EXPORT_PROPERTIES } from '../../extensions/excelExport.js';
import {
  DEFAULT_EXCEL_SETTINGS,
  type ExcelSettings,
  readExcelSettings,
} from '../../extensions/exportFormats.js';
import { defineRecord } from '../../storage.js';
import { readEnabled, type ToolSettings } from '../kernel/ViewerTool.js';

export interface ExcelToolSettings extends ExcelSettings, ToolSettings {
  properties: readonly string[];
}

export const EXCEL_SETTINGS_KEY = 'bsh.tool.excel.v1';

export function sanitizeExportProperties(raw: unknown): readonly string[] {
  const names = Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter(
            (name): name is string =>
              typeof name === 'string' && name.trim() !== '',
          ),
        ),
      ]
    : [];
  return names.length > 0 ? names : DEFAULT_EXPORT_PROPERTIES;
}

export const DEFAULT_EXCEL_TOOL_SETTINGS: ExcelToolSettings = {
  enabled: true,
  ...DEFAULT_EXCEL_SETTINGS,
  properties: DEFAULT_EXPORT_PROPERTIES,
};

export function readExcelToolSettings(raw: unknown): ExcelToolSettings {
  return {
    enabled: readEnabled(raw),
    ...readExcelSettings(raw),
    properties: sanitizeExportProperties(
      isRecord(raw) ? raw.properties : undefined,
    ),
  };
}

export const EXCEL_SETTINGS = defineRecord({
  key: EXCEL_SETTINGS_KEY,
  initial: DEFAULT_EXCEL_TOOL_SETTINGS,
  sanitize: readExcelToolSettings,
});
