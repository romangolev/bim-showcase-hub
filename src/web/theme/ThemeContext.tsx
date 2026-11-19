import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useSettings } from '../settings/SettingsContext.js';
import {
  applyTheme,
  LIGHT_SCHEME_QUERY,
  readSystemTheme,
  resolveTheme,
  type Theme,
  type ThemePreference,
} from './theme.js';

export type ThemeSource = 'system' | 'user';

export interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  source: ThemeSource;
  setTheme: (preference: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, setSetting } = useSettings();
  const preference = settings.theme;
  const [system, setSystem] = useState<Theme>(readSystemTheme);
  const theme = resolveTheme(preference, system);

  useLayoutEffect(() => {
    applyTheme(theme, document.documentElement);
  }, [theme]);

  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return;
    const list = window.matchMedia(LIGHT_SCHEME_QUERY);
    const onChange = () => setSystem(readSystemTheme());
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [preference]);

  const setTheme = useCallback(
    (next: ThemePreference) => setSetting('theme', next),
    [setSetting],
  );

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      preference,
      source: preference === 'system' ? 'system' : 'user',
      setTheme,
      toggleTheme,
    }),
    [theme, preference, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside a ThemeProvider');
  return value;
}
