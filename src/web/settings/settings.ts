import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, readJson, writeJson } from '../storage.js';

export interface Settings {
  sessionWarnMinutes: number;
  recentsLength: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sessionWarnMinutes: 10,
  recentsLength: 5,
};

export const SETTINGS_STORAGE_KEY = BSH_KEYS.preference.settings;

function minutes(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(120, Math.max(0, Math.round(value)))
    : fallback;
}

export function readSettings(): Settings {
  const parsed = readJson<unknown>(SETTINGS_STORAGE_KEY, undefined);
  if (parsed === undefined) return DEFAULT_SETTINGS;
  const source = isRecord(parsed) ? parsed : {};
  return {
    sessionWarnMinutes: minutes(
      source.sessionWarnMinutes,
      DEFAULT_SETTINGS.sessionWarnMinutes,
    ),
    recentsLength: minutes(
      source.recentsLength,
      DEFAULT_SETTINGS.recentsLength,
    ),
  };
}

export function writeSettings(settings: Settings): void {
  const stored = readJson<unknown>(SETTINGS_STORAGE_KEY, undefined);
  writeJson(SETTINGS_STORAGE_KEY, {
    ...(isRecord(stored) ? stored : {}),
    ...settings,
  });
}
