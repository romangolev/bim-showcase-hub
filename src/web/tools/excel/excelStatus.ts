import { useCallback, useSyncExternalStore } from 'react';
import type { ExportStatus } from '../../extensions/excelExport.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';

const last = new WeakMap<ViewerAdapter, ExportStatus>();
const listeners = new Set<() => void>();

export function publishExcelStatus(
  adapter: ViewerAdapter,
  status: ExportStatus,
): void {
  last.set(adapter, status);
  for (const listener of [...listeners]) listener();
}

export function lastExcelStatus(adapter: ViewerAdapter): ExportStatus | null {
  return last.get(adapter) ?? null;
}

export function useExcelStatus(
  adapter: ViewerAdapter | null,
): ExportStatus | null {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const snapshot = useCallback(
    () => (adapter ? lastExcelStatus(adapter) : null),
    [adapter],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
