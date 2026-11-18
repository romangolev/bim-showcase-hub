import { flag } from '../../shared/guards.js';
import {
  DEFAULT_EXCEL_SETTINGS,
  type ExcelSettings,
  readExcelSettings,
} from '../extensions/exportFormats.js';
import {
  DEFAULT_PAINT_INTENSITY,
  DEFAULT_PAINT_PALETTE,
  sanitizeIntensity,
  sanitizePalette,
} from '../extensions/paintBrushes.js';
import { DEFAULT_IFC_SETTINGS, readIfcSettings } from '../ifc/settings.js';
import type { IfcSettings } from '../ifc/types.js';
import { BSH_KEYS, readJson, writeJson } from '../storage.js';

export interface Settings {
  paintBrushes: boolean;
  excelExport: boolean;
  glbExport: boolean;
  ifcExport: boolean;
  sessionWarnMinutes: number;
  recentsLength: number;
  paintPalette: string[];
  paintIntensity: number;
  ifc: IfcSettings;
  excel: ExcelSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  paintBrushes: true,
  excelExport: true,
  glbExport: true,
  ifcExport: true,
  sessionWarnMinutes: 10,
  recentsLength: 5,
  paintPalette: [...DEFAULT_PAINT_PALETTE],
  paintIntensity: DEFAULT_PAINT_INTENSITY,
  ifc: DEFAULT_IFC_SETTINGS,
  excel: DEFAULT_EXCEL_SETTINGS,
};

export { DEFAULT_IFC_SETTINGS, readExcelSettings, readIfcSettings };

export const SETTINGS_STORAGE_KEY = BSH_KEYS.preference.settings;

function minutes(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(120, Math.max(0, Math.round(value)))
    : fallback;
}

export function readSettings(): Settings {
  const parsed = readJson<unknown>(SETTINGS_STORAGE_KEY, undefined);
  if (parsed === undefined) return DEFAULT_SETTINGS;
  const source =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  return {
    paintBrushes: flag(source.paintBrushes, DEFAULT_SETTINGS.paintBrushes),
    excelExport: flag(source.excelExport, DEFAULT_SETTINGS.excelExport),
    glbExport: flag(source.glbExport, DEFAULT_SETTINGS.glbExport),
    ifcExport: flag(source.ifcExport, DEFAULT_SETTINGS.ifcExport),
    sessionWarnMinutes: minutes(
      source.sessionWarnMinutes,
      DEFAULT_SETTINGS.sessionWarnMinutes,
    ),
    recentsLength: Math.round(
      minutes(source.recentsLength, DEFAULT_SETTINGS.recentsLength),
    ),
    paintPalette: sanitizePalette(source.paintPalette),
    paintIntensity: sanitizeIntensity(source.paintIntensity),
    ifc: readIfcSettings(source.ifc),
    excel: readExcelSettings(source.excel),
  };
}

export function writeSettings(settings: Settings): void {
  writeJson(SETTINGS_STORAGE_KEY, settings);
}
