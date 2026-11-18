import { useSyncExternalStore } from 'react';
import type { PanelId } from './paneRegistry.js';

let summaryTarget: PanelId | null = null;
const targetListeners = new Set<() => void>();

export function setSummarySettingsTarget(id: PanelId | null): void {
  summaryTarget = id;
  for (const listener of targetListeners) listener();
}

export function useSummarySettingsTarget(): PanelId | null {
  return useSyncExternalStore(
    (listener) => {
      targetListeners.add(listener);
      return () => targetListeners.delete(listener);
    },
    () => summaryTarget,
    () => null,
  );
}
