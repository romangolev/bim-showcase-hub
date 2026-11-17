import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { FORGET_EVENT } from '../storage.js';
import {
  DEFAULT_SETTINGS,
  readSettings,
  type Settings,
  writeSettings,
} from './settings.js';

export interface SettingsApi {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const FALLBACK: SettingsApi = {
  settings: DEFAULT_SETTINGS,
  setSetting: () => undefined,
};

const SettingsContext = createContext<SettingsApi>(FALLBACK);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readSettings);
  useEffect(() => {
    const reload = () => setSettings(readSettings());
    window.addEventListener(FORGET_EVENT, reload);
    return () => window.removeEventListener(FORGET_EVENT, reload);
  }, []);
  const setSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((current) => {
        const next = { ...current, [key]: value };
        writeSettings(next);
        return next;
      });
    },
    [],
  );
  const value = useMemo(
    () => ({ settings, setSetting }),
    [settings, setSetting],
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsApi {
  return useContext(SettingsContext);
}
