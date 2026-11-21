export type Theme = 'dark' | 'light';
export type ThemePreference = 'system' | Theme;

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

export const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

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
