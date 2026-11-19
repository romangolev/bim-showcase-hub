export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  run: () => void;
}

export interface Notification {
  id: number;
  message: string;
  tone: NotificationTone;
  detail: string | null;
  duration: number | null;
  action: NotificationAction | null;
  createdAt: number;
}

export interface NotificationSnapshot {
  items: readonly Notification[];
  history: readonly Notification[];
  announcement: string;
}

export interface NotifyOptions {
  tone?: NotificationTone;
  detail?: string;
  duration?: number;
  action?: NotificationAction;
}

export interface NotificationStore {
  notify: (message: string, options?: NotifyOptions) => number;
  dismiss: (id: number) => void;
  clear: () => void;
  clearHistory: () => void;
  announce: (message: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => NotificationSnapshot;
}

export const MAX_LIVE_NOTIFICATIONS = 5;
export const NOTIFICATION_HISTORY_LIMIT = 50;

function distinct(previous: string, message: string): string {
  return previous === message ? `${message} ` : message;
}

function pushHistory(
  history: readonly Notification[],
  entries: readonly Notification[],
): readonly Notification[] {
  let next = history;
  for (const entry of entries) next = [entry, ...next];
  return next.slice(0, NOTIFICATION_HISTORY_LIMIT);
}

export function createNotificationStore(
  now: () => number = Date.now,
): NotificationStore {
  let nextId = 1;
  let snapshot: NotificationSnapshot = {
    items: [],
    history: [],
    announcement: '',
  };
  const listeners = new Set<() => void>();

  const commit = (
    items: readonly Notification[],
    history: readonly Notification[],
    announcement: string,
  ) => {
    snapshot = {
      items,
      history: history.slice(0, NOTIFICATION_HISTORY_LIMIT),
      announcement,
    };
    for (const listener of listeners) listener();
  };

  return {
    notify(message, options = {}) {
      const text = message.trim();
      if (!text) return 0;
      const notification: Notification = {
        id: nextId++,
        message: text,
        tone: options.tone ?? 'info',
        detail: options.detail ?? null,
        duration: options.duration ?? null,
        action: options.action ?? null,
        createdAt: now(),
      };
      const all = [...snapshot.items, notification];
      const overflow = all.slice(
        0,
        Math.max(0, all.length - MAX_LIVE_NOTIFICATIONS),
      );
      const kept = all.slice(overflow.length);
      commit(
        kept,
        pushHistory(snapshot.history, overflow),
        distinct(snapshot.announcement, text),
      );
      return notification.id;
    },
    dismiss(id) {
      const notification = snapshot.items.find((item) => item.id === id);
      if (!notification) return;
      commit(
        snapshot.items.filter((item) => item.id !== id),
        pushHistory(snapshot.history, [notification]),
        snapshot.announcement,
      );
    },
    clear() {
      commit(
        [],
        pushHistory(snapshot.history, snapshot.items),
        snapshot.announcement,
      );
    },
    clearHistory() {
      commit(snapshot.items, [], snapshot.announcement);
    },
    announce(message) {
      const text = message.trim();
      if (text === snapshot.announcement) return;
      if (!text && !snapshot.announcement) return;
      commit(
        snapshot.items,
        snapshot.history,
        text ? distinct(snapshot.announcement, text) : '',
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

export const notifications = createNotificationStore();

export function notify(message: string, options?: NotifyOptions): number {
  return notifications.notify(message, options);
}

export function announce(message: string): void {
  notifications.announce(message);
}
