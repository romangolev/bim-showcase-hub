import {
  DEFAULT_EXCEL_SETTINGS,
  type ExcelSettings,
  type ExportFormat,
  type ExportScope,
} from '../extensions/exportFormats.js';
import {
  DEFAULT_PAINT_INTENSITY,
  DEFAULT_PAINT_PALETTE,
  sanitizeIntensity,
  sanitizePalette,
} from '../extensions/paintBrushes.js';
import { ALLOWED_CLASSES } from '../ifc/classTable.js';
import type { IfcSettings } from '../ifc/types.js';

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

export const DEFAULT_IFC_SETTINGS: IfcSettings = {
  classOverrides: {},
  psetExclude: [],
  psetInclude: [],
  levelProperty: 'Level',
  fallbackStorey: 'Unassigned',
  projectName: '',
  siteName: 'Site',
  buildingName: '',
  author: '',
  organisation: '',
  lengthUnit: 'm',
};

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

export const SETTINGS_STORAGE_KEY = 'bsh-settings-v1';

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function minutes(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(120, Math.max(0, Math.round(value)))
    : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function required(value: unknown, fallback: string): string {
  const next = text(value, fallback);
  return next || fallback;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function overrides(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, target] of Object.entries(value)) {
    const name = key.trim();
    if (
      name &&
      typeof target === 'string' &&
      ALLOWED_CLASSES.includes(target)
    ) {
      out[name] = target;
    }
  }
  return out;
}

export function readIfcSettings(value: unknown): IfcSettings {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const d = DEFAULT_IFC_SETTINGS;
  return {
    classOverrides: overrides(source.classOverrides),
    psetExclude: list(source.psetExclude),
    psetInclude: list(source.psetInclude),
    levelProperty: required(source.levelProperty, d.levelProperty),
    fallbackStorey: required(source.fallbackStorey, d.fallbackStorey),
    projectName: text(source.projectName, d.projectName),
    siteName: required(source.siteName, d.siteName),
    buildingName: text(source.buildingName, d.buildingName),
    author: text(source.author, d.author),
    organisation: text(source.organisation, d.organisation),
    lengthUnit: source.lengthUnit === 'mm' ? 'mm' : 'm',
  };
}

export function readExcelSettings(value: unknown): ExcelSettings {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const d = DEFAULT_EXCEL_SETTINGS;
  const format = (['xlsx', 'csv', 'json', 'copy'] as ExportFormat[]).find(
    (item) => item === source.format,
  );
  const scope = (['all', 'selected', 'isolated'] as ExportScope[]).find(
    (item) => item === source.scope,
  );
  return {
    format: format ?? d.format,
    scope: scope ?? d.scope,
    metadata: flag(source.metadata, d.metadata),
    namePattern: required(source.namePattern, d.namePattern),
  };
}

export function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
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
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}
