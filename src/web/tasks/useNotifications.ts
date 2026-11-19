import { useSyncExternalStore } from 'react';
import {
  type NotificationSnapshot,
  type NotificationStore,
  notifications,
} from './notifications.js';

export interface NotificationCenter extends NotificationSnapshot {
  dismiss: (id: number) => void;
  clear: () => void;
  clearHistory: () => void;
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
