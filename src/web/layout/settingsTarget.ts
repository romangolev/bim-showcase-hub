import { useSyncExternalStore } from 'react';
import type { PanelId } from './paneRegistry.js';

let current: PanelId | null = null;
const listeners = new Set<() => void>();

export function setPaneSettingsTarget(id: PanelId | null): void {
  current = id;
  for (const listener of listeners) listener();
}

export function dropPaneSettingsTarget(id: PanelId): void {
  if (current === id) setPaneSettingsTarget(null);
}

export function usePaneSettingsTarget(): PanelId | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
