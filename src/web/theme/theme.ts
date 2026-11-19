import { BSH_KEYS, defineRecord, RAW_STRING } from '../storage.js';

export type Theme = 'dark' | 'light';
export type ThemePreference = 'system' | Theme;

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

export const THEME_STORAGE_KEY = BSH_KEYS.preference.theme;
export const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || isTheme(value);
}

const STORED_THEME = defineRecord<Theme | null>({
  key: THEME_STORAGE_KEY,
  initial: null,
  sanitize: (value) => (isTheme(value) ? value : null),
  codec: { encode: (value) => value ?? '', decode: RAW_STRING.decode },
});

export function readStoredTheme(): Theme | null {
  return STORED_THEME.read();
}

export function readSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia(LIGHT_SCHEME_QUERY).matches ? 'light' : 'dark';
}

export function resolveTheme(
  preference: ThemePreference,
  system: Theme,
): Theme {
  return preference === 'system' ? system : preference;
}

export function applyTheme(theme: Theme, root: HTMLElement): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
