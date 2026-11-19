import { useSyncExternalStore } from 'react';
import type { PanelId } from './paneRegistry.js';

let dashboardTarget: PanelId | null = null;
const targetListeners = new Set<() => void>();

export function setDashboardSettingsTarget(id: PanelId | null): void {
  dashboardTarget = id;
  for (const listener of targetListeners) listener();
}

export function dropDashboardSettingsTarget(id: PanelId): void {
  if (dashboardTarget === id) setDashboardSettingsTarget(null);
}

export function useDashboardSettingsTarget(): PanelId | null {
  return useSyncExternalStore(
    (listener) => {
      targetListeners.add(listener);
      return () => targetListeners.delete(listener);
    },
    () => dashboardTarget,
    () => null,
  );
}
