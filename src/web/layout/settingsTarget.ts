import { useSyncExternalStore } from 'react';
import type { PanelId } from './paneRegistry.js';

export function createTarget() {
  let current: PanelId | null = null;
  const listeners = new Set<() => void>();

  const set = (id: PanelId | null): void => {
    current = id;
    for (const listener of listeners) listener();
  };

  return {
    set,
    drop: (id: PanelId): void => {
      if (current === id) set(null);
    },
    use: (): PanelId | null =>
      useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => current,
        () => null,
      ),
  };
}
