import { flag, isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord, getStorageAdapter } from '../storage.js';

export const SETTINGS_VERSION = 2;

export type Density = 'comfortable' | 'compact';
export type TextSize = 'small' | 'medium' | 'large';
export type Language = 'en';

export interface Settings {
  version: number;
  sessionWarnMinutes: number;
  recentsLength: number;
  density: Density;
  textSize: TextSize;
  reducedMotion: boolean;
  language: Language;
}

export const DENSITIES: readonly Density[] = ['comfortable', 'compact'];
export const TEXT_SIZES: readonly TextSize[] = ['small', 'medium', 'large'];
export const LANGUAGES: readonly Language[] = ['en'];

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  sessionWarnMinutes: 10,
  recentsLength: 5,
  density: 'comfortable',
  textSize: 'medium',
  reducedMotion: false,
  language: 'en',
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

function pick<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function readSettings(): Settings {
  const parsed = APP_SETTINGS_BLOB.read();
  if (parsed === undefined) return DEFAULT_SETTINGS;
  const source = isRecord(parsed) ? parsed : {};
  return {
    version: SETTINGS_VERSION,
    sessionWarnMinutes: minutes(
      source.sessionWarnMinutes,
      DEFAULT_SETTINGS.sessionWarnMinutes,
    ),
    recentsLength: minutes(
      source.recentsLength,
      DEFAULT_SETTINGS.recentsLength,
    ),
    density: pick(source.density, DENSITIES, DEFAULT_SETTINGS.density),
    textSize: pick(source.textSize, TEXT_SIZES, DEFAULT_SETTINGS.textSize),
    reducedMotion: flag(source.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    language: pick(source.language, LANGUAGES, DEFAULT_SETTINGS.language),
  };
}

export function writeSettings(settings: Settings): void {
  const stored = APP_SETTINGS_BLOB.read();
  APP_SETTINGS_BLOB.write({
    ...(isRecord(stored) ? stored : {}),
    ...settings,
  });
}

export function applyAppSettings(settings: Settings, root: HTMLElement): void {
  root.dataset.density = settings.density;
  root.dataset.textSize = settings.textSize;
  root.dataset.reducedMotion = settings.reducedMotion ? 'true' : 'false';
  root.lang = settings.language;
}

const APP_FIELDS = new Set(Object.keys(DEFAULT_SETTINGS));

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
  const kept = Object.fromEntries(
    Object.entries(stored).filter(([key]) => APP_FIELDS.has(key)),
  );
  if (Object.keys(kept).length === 0) {
    getStorageAdapter().remove('local', SETTINGS_STORAGE_KEY);
    return;
  }
  if (!APP_SETTINGS_BLOB.write(kept)) APP_SETTINGS_BLOB.remove();
}
