import { isRecord } from '../../../shared/guards.js';
import { defineRecord } from '../../storage.js';
import type { DisplaySettings } from '../../viewer/ViewerAdapter.js';
import { readEnabled, type ToolSettings } from '../kernel/ViewerTool.js';

export interface DisplayToolSettings extends ToolSettings, DisplaySettings {}

export const DISPLAY_SETTINGS_KEY = 'bsh.tool.display.v1';

export const LIGHT_PRESETS = [
  { value: 0, label: 'Simple Grey' },
  { value: 1, label: 'Sharp Highlights' },
  { value: 2, label: 'Dark Sky' },
  { value: 3, label: 'Grey Room' },
  { value: 4, label: 'Photo Booth' },
  { value: 5, label: 'Tranquility' },
  { value: 6, label: 'Infinity Pool' },
  { value: 7, label: 'Simple White' },
  { value: 8, label: 'Riverbank' },
  { value: 9, label: 'Contrast' },
  { value: 10, label: 'Rim Highlights' },
  { value: 11, label: 'Cool Light' },
  { value: 12, label: 'Warm Light' },
  { value: 13, label: 'Soft Light' },
  { value: 14, label: 'Grid Light' },
  { value: 15, label: 'Plaza' },
  { value: 16, label: 'Snow Field' },
] as const;

export const DEFAULT_DISPLAY_SETTINGS: DisplayToolSettings = {
  enabled: true,
  lightPreset: null,
  groundShadow: true,
  groundReflection: false,
  edges: true,
  ambientOcclusion: true,
  antialiasing: true,
  performance: false,
};

function readLightPreset(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= 0 && value < LIGHT_PRESETS.length ? value : null;
}

function readBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

export function sanitizeDisplaySettings(raw: unknown): DisplaySettings {
  const source = isRecord(raw) ? raw : {};
  return {
    lightPreset: readLightPreset(source.lightPreset),
    groundShadow: readBoolean(
      source.groundShadow,
      DEFAULT_DISPLAY_SETTINGS.groundShadow,
    ),
    groundReflection: readBoolean(
      source.groundReflection,
      DEFAULT_DISPLAY_SETTINGS.groundReflection,
    ),
    edges: readBoolean(source.edges, DEFAULT_DISPLAY_SETTINGS.edges),
    ambientOcclusion: readBoolean(
      source.ambientOcclusion,
      DEFAULT_DISPLAY_SETTINGS.ambientOcclusion,
    ),
    antialiasing: readBoolean(
      source.antialiasing,
      DEFAULT_DISPLAY_SETTINGS.antialiasing,
    ),
    performance: readBoolean(
      source.performance,
      DEFAULT_DISPLAY_SETTINGS.performance,
    ),
  };
}

export function sanitizeDisplayToolSettings(raw: unknown): DisplayToolSettings {
  return {
    enabled: readEnabled(raw),
    ...sanitizeDisplaySettings(raw),
  };
}

export const DISPLAY_SETTINGS = defineRecord<DisplayToolSettings>({
  key: DISPLAY_SETTINGS_KEY,
  initial: DEFAULT_DISPLAY_SETTINGS,
  sanitize: sanitizeDisplayToolSettings,
});

export function displaySettingsOf(
  settings: DisplayToolSettings,
): DisplaySettings {
  return sanitizeDisplaySettings(settings);
}
