import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord, getStorageAdapter } from '../storage.js';

export interface Settings {
  sessionWarnMinutes: number;
  recentsLength: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sessionWarnMinutes: 10,
  recentsLength: 5,
};

export const SETTINGS_STORAGE_KEY = BSH_KEYS.preference.settings;

export const APP_SETTINGS_BLOB = defineRecord<unknown>({
  key: SETTINGS_STORAGE_KEY,
  initial: undefined,
  sanitize: (raw) => raw,
});

function minutes(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(120, Math.max(0, Math.round(value)))
    : fallback;
}

export function readSettings(): Settings {
  const parsed = APP_SETTINGS_BLOB.read();
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
  const stored = APP_SETTINGS_BLOB.read();
  APP_SETTINGS_BLOB.write({
    ...(isRecord(stored) ? stored : {}),
    ...settings,
  });
}

export function scrubAppSettings(): void {
  const text = getStorageAdapter().get('local', SETTINGS_STORAGE_KEY);
  if (text === null) return;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    stored = undefined;
  }
  if (!isRecord(stored)) {
    getStorageAdapter().remove('local', SETTINGS_STORAGE_KEY);
    return;
  }
  const { sessionWarnMinutes, recentsLength } = stored;
  const kept = {
    ...(sessionWarnMinutes === undefined ? {} : { sessionWarnMinutes }),
    ...(recentsLength === undefined ? {} : { recentsLength }),
  };
  if (!APP_SETTINGS_BLOB.write(kept)) APP_SETTINGS_BLOB.remove();
}
