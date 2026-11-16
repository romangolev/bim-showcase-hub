import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ViewerAdapter } from './ViewerAdapter.js';

export interface ViewerContextValue {
  adapter: ViewerAdapter | null;
  setAdapter: (adapter: ViewerAdapter | null) => void;
}

export const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const value = useMemo(() => ({ adapter, setAdapter }), [adapter]);
  return (
    <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
  );
}

export function useViewer(): ViewerAdapter | null {
  return useContext(ViewerContext)?.adapter ?? null;
}
