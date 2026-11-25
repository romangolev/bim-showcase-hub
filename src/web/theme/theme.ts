export type ThemeScheme = 'dark' | 'light';

export const THEMES = [
  { id: 'dark', scheme: 'dark', color: '#131416' },
  { id: 'light', scheme: 'light', color: '#ffffff' },
] as const satisfies readonly {
  id: string;
  scheme: ThemeScheme;
  color: string;
}[];

export type Theme = (typeof THEMES)[number]['id'];
export type ThemePreference = 'system' | Theme;

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
  ...THEMES.map((theme) => theme.id).filter(
    (id) => id !== 'light' && id !== 'dark',
  ),
];

export const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

export function readSystemTheme(): ThemeScheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia(LIGHT_SCHEME_QUERY).matches ? 'light' : 'dark';
}

export function resolveTheme(
  preference: ThemePreference,
  system: ThemeScheme,
): Theme {
  return preference === 'system' ? system : preference;
}

export function themeScheme(theme: Theme): ThemeScheme {
  return THEMES.find((entry) => entry.id === theme)?.scheme ?? 'dark';
}

export const THEME_COLORS = Object.fromEntries(
  THEMES.map((theme) => [theme.id, theme.color]),
) as Record<Theme, string>;

export function applyTheme(theme: Theme, root: HTMLElement): void {
  root.dataset.theme = theme;
  root.style.colorScheme = themeScheme(theme);
  root.ownerDocument
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme]);
}
