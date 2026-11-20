import { isRecord } from '../../shared/guards.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { defineSavedKind } from '../store/savedKinds.js';
import { MAX_ITEM_BYTES } from '../store/savedStore.js';
import type { SummaryView } from './modelSummary.js';
import { DEFAULT_SUMMARY_VIEW } from './modelSummary.js';
import { sanitizePropertyNames } from './propertyNames.js';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SummaryPresetData = {
  properties: string[];
  view: JsonValue;
};

export const SUMMARY_PRESET_KIND = 'summary-preset';
export const MAX_PRESET_PROPERTIES = 24;
const MAX_VIEW_DEPTH = 24;

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > MAX_VIEW_DEPTH) return false;
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    default:
      break;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, depth + 1));
  }
  if (isRecord(value)) {
    return Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
  }
  return false;
}

export function sanitizeSummaryPreset(raw: unknown): SummaryPresetData | null {
  try {
    if (!isRecord(raw)) return null;
    const { properties, view } = raw;
    if (!Array.isArray(properties) || properties.length === 0) return null;
    if (
      !properties.every(
        (name) => typeof name === 'string' && name.trim() !== '',
      )
    ) {
      return null;
    }
    if (!isRecord(view) || !isJsonValue(view)) return null;
    const names = sanitizePropertyNames(properties, []).slice(
      0,
      MAX_PRESET_PROPERTIES,
    );
    if (names.length === 0) return null;
    const clean: SummaryPresetData = { properties: [...names], view };
    return JSON.stringify(clean).length > MAX_ITEM_BYTES ? null : clean;
  } catch {
    return null;
  }
}

export const SUMMARY_PRESETS = defineSavedKind<SummaryPresetData>({
  kind: SUMMARY_PRESET_KIND,
  version: 1,
  label: 'Summary preset',
  sanitize: sanitizeSummaryPreset,
});

export interface SummaryStarter {
  id: string;
  name: string;
  data: SummaryPresetData;
}

export const BUILT_IN_SUMMARY_PRESETS: readonly SummaryStarter[] = [
  {
    id: 'doors-check',
    name: 'Doors check',
    data: {
      properties: ['Category', 'Family', 'Type Name'],
      view: { ...DEFAULT_SUMMARY_VIEW } as unknown as JsonValue,
    },
  },
  {
    id: 'rooms-by-level',
    name: 'Rooms by level',
    data: {
      properties: ['Level', 'Category', 'Name'],
      view: { ...DEFAULT_SUMMARY_VIEW } as unknown as JsonValue,
    },
  },
];

export function saveSummaryPreset(
  name: string,
  properties: readonly string[],
  view: unknown,
): boolean {
  if (!isRecord(view) || !isJsonValue(view)) return false;
  return (
    SUMMARY_PRESETS.save(name, { properties: [...properties], view }) !== null
  );
}

export function applySummaryPreset(data: SummaryPresetData): boolean {
  const clean = sanitizeSummaryPreset(data);
  if (!clean) return false;
  const properties = PANE_SETTINGS.summary.properties.write(clean.properties);
  const view = PANE_SETTINGS.summary.view.write(
    clean.view as unknown as SummaryView,
  );
  return properties && view;
}

export function missingPresetProperties(
  properties: readonly string[],
  catalog: readonly string[],
): string[] {
  const known = new Set(catalog);
  return properties.filter((name) => !known.has(name));
}
