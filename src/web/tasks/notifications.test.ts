import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationStore,
  MAX_LIVE_NOTIFICATIONS,
  NOTIFICATION_HISTORY_LIMIT,
} from './notifications.js';

describe('notification store', () => {
  it('adds a notification and announces it once', () => {
    let clock = 0;
    const store = createNotificationStore(() => (clock += 1));
    const listener = vi.fn();
    store.subscribe(listener);
    const id = store.notify('Exported 1,200 rows', {
      tone: 'success',
      detail: 'Sheet 1',
    });
    expect(id).toBe(1);
    const snapshot = store.getSnapshot();
    expect(snapshot.items[0]).toMatchObject({
      id,
      message: 'Exported 1,200 rows',
      tone: 'success',
      detail: 'Sheet 1',
      duration: null,
      createdAt: 1,
    });
    expect(snapshot.announcement).toBe('Exported 1,200 rows');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('makes consecutive identical announcements distinct', () => {
    const store = createNotificationStore();
    store.notify('Saved');
    const first = store.getSnapshot().announcement;
    store.notify('Saved');
    const second = store.getSnapshot().announcement;
    expect(first).toBe('Saved');
    expect(second).not.toBe(first);
    expect(second.trim()).toBe('Saved');
  });

  it('ignores an empty message', () => {
    const store = createNotificationStore();
    expect(store.notify('   ')).toBe(0);
    expect(store.getSnapshot().items).toEqual([]);
    expect(store.getSnapshot().announcement).toBe('');
  });

  it('dismisses into history without changing the announcement', () => {
    const store = createNotificationStore();
    const id = store.notify('Saved');
    store.dismiss(id);
    store.dismiss(id);
    expect(store.getSnapshot().items).toEqual([]);
    expect(store.getSnapshot().history.map((item) => item.message)).toEqual([
      'Saved',
    ]);
    expect(store.getSnapshot().announcement).toBe('Saved');
  });

  it('archives overflow beyond the visible limit', () => {
    const store = createNotificationStore();
    for (let i = 0; i < MAX_LIVE_NOTIFICATIONS + 2; i += 1) {
      store.notify(`N${i}`);
    }
    const { items, history } = store.getSnapshot();
    expect(items.map((item) => item.message)).toEqual(
      Array.from({ length: MAX_LIVE_NOTIFICATIONS }, (_, i) => `N${i + 2}`),
    );
    expect(history).toHaveLength(2);
    expect(history[0]?.message).toBe('N1');
    expect(history[1]?.message).toBe('N0');
  });

  it('clears the visible toasts into history and keeps a bounded history', () => {
    const store = createNotificationStore();
    for (let i = 0; i < NOTIFICATION_HISTORY_LIMIT + 10; i += 1) {
      store.notify(`N${i}`);
    }
    store.clear();
    const { items, history } = store.getSnapshot();
    expect(items).toEqual([]);
    expect(history).toHaveLength(NOTIFICATION_HISTORY_LIMIT);
    expect(history[0]?.message).toBe(`N${NOTIFICATION_HISTORY_LIMIT + 9}`);
    store.clearHistory();
    expect(store.getSnapshot().history).toEqual([]);
  });

  it('keeps the action of a notification', () => {
    const store = createNotificationStore();
    const run = vi.fn();
    store.notify('Deleted', { action: { label: 'Undo', run } });
    expect(store.getSnapshot().items[0]?.action).toEqual({
      label: 'Undo',
      run,
    });
  });

  it('announces messages that are not toasts and can clear the announcement', () => {
    const store = createNotificationStore();
    store.announce('Loading A.rvt finished');
    expect(store.getSnapshot().items).toEqual([]);
    expect(store.getSnapshot().announcement).toBe('Loading A.rvt finished');
    store.announce('');
    expect(store.getSnapshot().announcement).toBe('');
  });
});
