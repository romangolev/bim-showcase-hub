import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  publishActiveAdapter,
  releaseActiveAdapter,
} from './activeAdapterStore.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export interface ViewerRegistry {
  publish: (key: string, adapter: ViewerAdapter) => void;
  withdraw: (key: string, adapter: ViewerAdapter) => void;
}

export interface ActiveViewerValue extends ViewerRegistry {
  adapter: ViewerAdapter | null;
  activeKey: string | null;
}

export const ActiveViewerContext = createContext<ActiveViewerValue | null>(
  null,
);

export const ModelViewerContext = createContext<ViewerAdapter | null>(null);

export interface ViewerProviderProps {
  active?: string | null;
  children: ReactNode;
}

export function ViewerProvider({
  active = null,
  children,
}: ViewerProviderProps) {
  const [adapters, setAdapters] = useState<
    Readonly<Record<string, ViewerAdapter>>
  >({});
  const publish = useCallback((key: string, adapter: ViewerAdapter) => {
    setAdapters((current) =>
      current[key] === adapter ? current : { ...current, [key]: adapter },
    );
  }, []);
  const withdraw = useCallback((key: string, adapter: ViewerAdapter) => {
    setAdapters((current) => {
      if (current[key] !== adapter) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);
  const adapter = active ? (adapters[active] ?? null) : null;
  const published = useRef<ViewerAdapter | null>(null);
  useEffect(() => {
    if (adapter) publishActiveAdapter(adapter);
    else releaseActiveAdapter(published.current);
    published.current = adapter;
  }, [adapter]);
  useEffect(() => () => releaseActiveAdapter(published.current), []);
  const value = useMemo(
    () => ({ adapter, activeKey: active, publish, withdraw }),
    [adapter, active, publish, withdraw],
  );
  return (
    <ActiveViewerContext.Provider value={value}>
      {children}
    </ActiveViewerContext.Provider>
  );
}

export function useActiveViewer(): ViewerAdapter | null {
  return useContext(ActiveViewerContext)?.adapter ?? null;
}

export function useViewer(): ViewerAdapter | null {
  const own = useContext(ModelViewerContext);
  const active = useActiveViewer();
  return own ?? active;
}
