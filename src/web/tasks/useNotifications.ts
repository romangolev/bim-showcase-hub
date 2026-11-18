import { useMemo, useSyncExternalStore } from 'react';
import {
  type NotificationSnapshot,
  type NotificationStore,
  type NotifyOptions,
  notifications,
} from './notifications.js';

export interface NotificationCenter extends NotificationSnapshot {
  dismiss: (id: number) => void;
  clear: () => void;
  clearHistory: () => void;
}

export interface Notify {
  notify: (message: string, options?: NotifyOptions) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

export function useNotifications(
  store: NotificationStore = notifications,
): NotificationCenter {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return {
    ...snapshot,
    dismiss: store.dismiss,
    clear: store.clear,
    clearHistory: store.clearHistory,
  };
}

export function useNotify(store: NotificationStore = notifications): Notify {
  return useMemo(
    () => ({
      notify: (message, options) => store.notify(message, options),
      dismiss: (id) => store.dismiss(id),
      clear: () => store.clear(),
    }),
    [store],
  );
}
