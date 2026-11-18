import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORGET_EVENT } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, within } from '../test/render.js';
import { NotificationHost } from './NotificationHost.js';
import { NOTIFICATION_SETTINGS } from './notificationSettings.js';
import { createNotificationStore } from './notifications.js';

function toasts() {
  return screen.queryByRole('region', { name: 'Notifications' });
}

beforeEach(() => {
  installMemoryStorage();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificationHost', () => {
  it('renders a toast, announces it and dismisses it on request', () => {
    const store = createNotificationStore();
    render(<NotificationHost store={store} />);
    act(() => {
      store.notify('Saved the viewpoint', {
        tone: 'success',
        detail: 'Viewpoint 2',
      });
    });
    const region = toasts();
    expect(region).not.toBeNull();
    if (!region) throw new Error('expected a toast region');
    expect(within(region).getByText('Saved the viewpoint')).toBeInTheDocument();
    expect(within(region).getByText('Viewpoint 2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved the viewpoint');
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Saved the viewpoint' }),
    );
    expect(toasts()).toBeNull();
  });

  it('auto-dismisses after its duration', () => {
    const store = createNotificationStore();
    render(<NotificationHost store={store} />);
    act(() => {
      store.notify('Short', { duration: 1000 });
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(toasts()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toasts()).toBeNull();
  });

  it('keeps an error until it is dismissed', () => {
    const store = createNotificationStore();
    render(<NotificationHost store={store} />);
    act(() => {
      store.notify('Export failed', { tone: 'error' });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const region = toasts();
    if (!region) throw new Error('expected a toast region');
    expect(within(region).getByText('Export failed')).toBeInTheDocument();
  });

  it('hides toasts in quiet mode but still announces them', () => {
    NOTIFICATION_SETTINGS.write({
      position: 'top-left',
      durationMs: 6000,
      quiet: true,
    });
    const store = createNotificationStore();
    render(<NotificationHost store={store} />);
    act(() => {
      store.notify('Quiet note');
    });
    expect(toasts()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Quiet note');
  });

  it('runs a notification action and closes the toast', () => {
    const store = createNotificationStore();
    const run = vi.fn();
    render(<NotificationHost store={store} />);
    act(() => {
      store.notify('Deleted the set', {
        action: { label: 'Undo', run },
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(toasts()).toBeNull();
  });

  it('clears toasts, history and the announcement on sign-out', () => {
    const store = createNotificationStore();
    render(<NotificationHost store={store} />);
    act(() => {
      store.notify('Saved the viewpoint');
      store.notify('Export failed', { tone: 'error' });
    });
    expect(store.getSnapshot().history).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Export failed');
    act(() => {
      window.dispatchEvent(new Event(FORGET_EVENT));
    });
    expect(toasts()).toBeNull();
    expect(store.getSnapshot().items).toEqual([]);
    expect(store.getSnapshot().history).toEqual([]);
    expect(store.getSnapshot().announcement).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
