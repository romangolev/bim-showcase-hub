import { flag, isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord, getStorageAdapter } from '../storage.js';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme.js';

export const SETTINGS_VERSION = 4;

export type Density = 'comfortable' | 'compact';
export type TextSize = 100 | 112 | 125;
export type Language = 'en' | 'ru';
export type Units = 'metric' | 'imperial';

export interface Settings {
  version: number;
  sessionWarnMinutes: number;
  recentsLength: number;
  density: Density;
  textSize: TextSize;
  theme: ThemePreference;
  reducedMotion: boolean;
  restoreSession: boolean;
  language: Language;
  units: Units;
}

export const DENSITIES: readonly Density[] = ['comfortable', 'compact'];
export const TEXT_SIZES: readonly TextSize[] = [100, 112, 125];
export const LANGUAGES: readonly Language[] = ['en', 'ru'];
export const UNITS: readonly Units[] = ['metric', 'imperial'];

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  sessionWarnMinutes: 10,
  recentsLength: 5,
  density: 'comfortable',
  textSize: 100,
  theme: 'system',
  reducedMotion: false,
  restoreSession: true,
  language: 'en',
  units: 'metric',
};

export const SETTINGS_STORAGE_KEY = BSH_KEYS.preference.settings;

export const APP_SETTINGS_BLOB = defineRecord<unknown>({
  key: SETTINGS_STORAGE_KEY,
  initial: undefined,
  sanitize: (raw) => raw,
});

function minutes(value: unknown, fallback: number): number {
  return clampNumber(value, fallback, 0, 120);
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function pick<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

const LEGACY_TEXT_SIZES: Record<string, TextSize> = {
  small: 100,
  medium: 100,
  large: 112,
};

function textSize(value: unknown): TextSize {
  if (value === 100 || value === 112 || value === 125) return value;
  if (typeof value === 'string') {
    const migrated = LEGACY_TEXT_SIZES[value];
    if (migrated) return migrated;
  }
  return DEFAULT_SETTINGS.textSize;
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
    recentsLength: clampNumber(
      source.recentsLength,
      DEFAULT_SETTINGS.recentsLength,
      0,
      20,
    ),
    density: pick(source.density, DENSITIES, DEFAULT_SETTINGS.density),
    textSize: textSize(source.textSize),
    theme: pick(source.theme, THEME_PREFERENCES, DEFAULT_SETTINGS.theme),
    reducedMotion: flag(source.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    restoreSession: flag(
      source.restoreSession,
      DEFAULT_SETTINGS.restoreSession,
    ),
    language: pick(source.language, LANGUAGES, DEFAULT_SETTINGS.language),
    units: pick(source.units, UNITS, DEFAULT_SETTINGS.units),
  };
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
  root.lang = settings.language;
  root.dataset.density = settings.density;
  root.dataset.textSize = String(settings.textSize);
  root.dataset.reducedMotion = settings.reducedMotion ? 'true' : 'false';
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
