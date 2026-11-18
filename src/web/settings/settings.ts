import { flag, isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord, getStorageAdapter } from '../storage.js';
import {
  isThemePreference,
  readStoredTheme,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../theme/theme.js';

export const SETTINGS_VERSION = 3;

export type Density = 'comfortable' | 'compact';
export type TextSize = 'small' | 'medium' | 'large';
export type Language = 'en';

export interface Settings {
  version: number;
  sessionWarnMinutes: number;
  recentsLength: number;
  density: Density;
  textSize: TextSize;
  theme: ThemePreference;
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
  theme: 'system',
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
    theme: pick(source.theme, THEME_PREFERENCES, DEFAULT_SETTINGS.theme),
    reducedMotion: flag(source.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    language: pick(source.language, LANGUAGES, DEFAULT_SETTINGS.language),
  };
}

export function migrateLegacyTheme(): void {
  const stored = APP_SETTINGS_BLOB.read();
  if (isRecord(stored) && isThemePreference(stored.theme)) return;
  const legacy = readStoredTheme();
  if (!legacy) return;
  const wrote = APP_SETTINGS_BLOB.write({
    ...(isRecord(stored) ? stored : {}),
    theme: legacy,
  });
  if (wrote) getStorageAdapter().remove('local', THEME_STORAGE_KEY);
}

export function writeSettings(settings: Settings): boolean {
  const stored = APP_SETTINGS_BLOB.read();
  if (storedFromNewerBuild()) return false;
  return APP_SETTINGS_BLOB.write({
    ...(isRecord(stored) ? stored : {}),
    ...settings,
  });
}

function storedFromNewerBuild(): boolean {
  const text = getStorageAdapter().get('local', SETTINGS_STORAGE_KEY);
  if (text === null) return false;
  try {
    const parsed = JSON.parse(text) as { version?: unknown };
    return (
      typeof parsed.version === 'number' && parsed.version > SETTINGS_VERSION
    );
  } catch {
    return false;
  }
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
