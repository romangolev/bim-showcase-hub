import { isRecord } from '../../../shared/guards.js';
import { DEFAULT_EXPORT_PROPERTIES } from '../../extensions/excelExport.js';
import {
  type ExcelSettings,
  type ExportFormat,
  type ExportScope,
  readExcelSettings,
} from '../../extensions/exportFormats.js';
import { sanitizePropertyNames } from '../../extensions/propertyNames.js';
import { defineSavedKind } from '../../store/savedKinds.js';

export type ExportPresetData = {
  properties: readonly string[];
  format: ExportFormat;
  scope: ExportScope;
  namePattern: string;
  includeHeader: boolean;
};

export type ExportPresetSettings = Pick<
  ExcelSettings,
  'format' | 'scope' | 'namePattern' | 'includeHeader'
> & { properties: readonly string[] };

export const EXPORT_PRESET_KIND = 'export-preset';

export function sanitizeExportPreset(raw: unknown): ExportPresetData {
  const settings = readExcelSettings(raw);
  return {
    properties: sanitizePropertyNames(
      isRecord(raw) ? raw.properties : undefined,
      DEFAULT_EXPORT_PROPERTIES,
    ),
    format: settings.format,
    scope: settings.scope,
    namePattern: settings.namePattern,
    includeHeader: settings.includeHeader,
  };
}

export function presetFromSettings(
  settings: ExportPresetSettings,
): ExportPresetData {
  return {
    properties: [...settings.properties],
    format: settings.format,
    scope: settings.scope,
    namePattern: settings.namePattern,
    includeHeader: settings.includeHeader,
  };
}

export function presetSettings(preset: ExportPresetData): ExportPresetSettings {
  return {
    properties: [...preset.properties],
    format: preset.format,
    scope: preset.scope,
    namePattern: preset.namePattern,
    includeHeader: preset.includeHeader,
  };
}

export const EXPORT_PRESETS = defineSavedKind<ExportPresetData>({
  kind: EXPORT_PRESET_KIND,
  version: 1,
  label: 'Export preset',
  sanitize: sanitizeExportPreset,
});
