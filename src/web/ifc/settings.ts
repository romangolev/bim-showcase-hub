import { required, text } from '../../shared/guards.js';
import { ALLOWED_CLASSES } from './classTable.js';
import type { IfcSettings } from './types.js';

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
