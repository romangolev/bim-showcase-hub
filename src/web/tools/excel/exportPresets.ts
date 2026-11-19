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
  groupBy: string | null;
};

export type ExportPresetSettings = Pick<
  ExcelSettings,
  'format' | 'scope' | 'namePattern' | 'includeHeader' | 'groupBy'
> & { properties: readonly string[] };

export const EXPORT_PRESET_KIND = 'export-preset';

export interface BuiltInExportPreset {
  id: string;
  name: string;
  data: ExportPresetData;
  everyColumn?: boolean;
}

export const BUILT_IN_EXPORT_PRESETS: readonly BuiltInExportPreset[] = [
  {
    id: 'classification-audit',
    name: 'Classification audit',
    data: {
      properties: ['Category', 'Name', 'Assembly Code', 'Classification Code'],
      format: 'xlsx',
      scope: 'all',
      namePattern: '{model}-classification-audit',
      includeHeader: true,
      groupBy: 'Category',
    },
  },
  {
    id: 'levels-and-categories',
    name: 'Levels and categories',
    data: {
      properties: ['Level', 'Category', 'Name'],
      format: 'xlsx',
      scope: 'all',
      namePattern: '{model}-levels',
      includeHeader: true,
      groupBy: 'Level',
    },
  },
  {
    id: 'everything',
    name: 'Everything',
    everyColumn: true,
    data: {
      properties: DEFAULT_EXPORT_PROPERTIES,
      format: 'xlsx',
      scope: 'all',
      namePattern: '{model}-everything',
      includeHeader: true,
      groupBy: null,
    },
  },
];

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
    groupBy: settings.groupBy,
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
    groupBy: settings.groupBy,
  };
}

export function presetSettings(preset: ExportPresetData): ExportPresetSettings {
  return {
    properties: [...preset.properties],
    format: preset.format,
    scope: preset.scope,
    namePattern: preset.namePattern,
    includeHeader: preset.includeHeader,
    groupBy: preset.groupBy,
  };
}

export function builtInSettings(
  preset: BuiltInExportPreset,
  catalog: readonly string[] = [],
): ExportPresetSettings {
  const settings = presetSettings(preset.data);
  return preset.everyColumn && catalog.length > 0
    ? { ...settings, properties: [...catalog] }
    : settings;
}

export const EXPORT_PRESETS = defineSavedKind<ExportPresetData>({
  kind: EXPORT_PRESET_KIND,
  version: 1,
  label: 'Export preset',
  sanitize: sanitizeExportPreset,
});
