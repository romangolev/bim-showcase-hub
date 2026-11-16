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
import {
  applyTheme,
  LIGHT_SCHEME_QUERY,
  readStoredTheme,
  readSystemTheme,
  type Theme,
  writeStoredTheme,
} from './theme.js';

export type ThemeSource = 'system' | 'user';

export interface ThemeContextValue {
  theme: Theme;
  source: ThemeSource;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [explicit, setExplicit] = useState<Theme | null>(readStoredTheme);
  const [system, setSystem] = useState<Theme>(readSystemTheme);
  const theme = explicit ?? system;

  useLayoutEffect(() => {
    applyTheme(theme, document.documentElement);
  }, [theme]);

  useEffect(() => {
    if (explicit !== null || !window.matchMedia) return;
    const list = window.matchMedia(LIGHT_SCHEME_QUERY);
    const onChange = () => setSystem(readSystemTheme());
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [explicit]);

  const setTheme = useCallback((next: Theme) => {
    writeStoredTheme(next);
    setExplicit(next);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      source: explicit === null ? 'system' : 'user',
      setTheme,
      toggleTheme,
    }),
    [theme, explicit, setTheme, toggleTheme],
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
