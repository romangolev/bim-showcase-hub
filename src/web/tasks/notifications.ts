type NotificationTone = 'info' | 'success' | 'warning' | 'error';

interface NotificationAction {
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
  log: readonly Notification[];
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
  record: (message: string, options?: NotifyOptions) => number;
  dismiss: (id: number) => void;
  clear: () => void;
  clearHistory: () => void;
  clearLog: () => void;
  announce: (message: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => NotificationSnapshot;
}

export const MAX_LIVE_NOTIFICATIONS = 5;
export const NOTIFICATION_HISTORY_LIMIT = 50;
export const ACTIVITY_LOG_LIMIT = 200;

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
    log: [],
    announcement: '',
  };
  const listeners = new Set<() => void>();

  const build = (text: string, options: NotifyOptions): Notification => ({
    id: nextId++,
    message: text,
    tone: options.tone ?? 'info',
    detail: options.detail ?? null,
    duration: options.duration ?? null,
    action: options.action ?? null,
    createdAt: now(),
  });

  const commit = (
    items: readonly Notification[],
    history: readonly Notification[],
    announcement: string,
    log: readonly Notification[] = snapshot.log,
  ) => {
    snapshot = {
      items,
      history: history.slice(0, NOTIFICATION_HISTORY_LIMIT),
      log: log.slice(0, ACTIVITY_LOG_LIMIT),
      announcement,
    };
    for (const listener of listeners) listener();
  };

  return {
    notify(message, options = {}) {
      const text = message.trim();
      if (!text) return 0;
      const notification = build(text, options);
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
        [notification, ...snapshot.log],
      );
      return notification.id;
    },
    record(message, options = {}) {
      const text = message.trim();
      if (!text) return 0;
      const entry = build(text, options);
      commit(snapshot.items, snapshot.history, snapshot.announcement, [
        entry,
        ...snapshot.log,
      ]);
      return entry.id;
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
    clearLog() {
      commit(snapshot.items, snapshot.history, snapshot.announcement, []);
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
