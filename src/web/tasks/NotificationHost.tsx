import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../components/icons.js';
import { FORGET_EVENT } from '../storage.js';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { Toast, Toaster, type ToastTone } from '../ui/Toast.js';
import {
  type NotificationSettings,
  useNotificationSettings,
} from './notificationSettings.js';
import {
  MAX_LIVE_NOTIFICATIONS,
  type Notification,
  type NotificationStore,
  notifications,
} from './notifications.js';
import { useNotifications } from './useNotifications.js';

const TONE: Record<Notification['tone'], ToastTone> = {
  info: 'accent',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

const TONE_ICON: Record<Notification['tone'], IconName> = {
  info: 'layers',
  success: 'check',
  warning: 'alert',
  error: 'alert',
};

function durationOf(
  notification: Notification,
  settings: NotificationSettings,
): number {
  if (notification.duration !== null) return notification.duration;
  if (notification.tone === 'error') return 0;
  return settings.durationMs;
}

export function NotificationHost({
  store = notifications,
}: {
  store?: NotificationStore;
}) {
  const center = useNotifications(store);
  const [settings] = useNotificationSettings();

  useEffect(() => {
    const timers: number[] = [];
    for (const item of center.items) {
      const duration = durationOf(item, settings);
      if (duration <= 0) continue;
      const remaining = Math.max(0, duration - (Date.now() - item.createdAt));
      timers.push(window.setTimeout(() => store.dismiss(item.id), remaining));
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [center.items, settings, store]);

  useEffect(() => {
    const forget = () => {
      store.clear();
      store.clearHistory();
      store.clearLog();
      store.announce('');
    };
    window.addEventListener(FORGET_EVENT, forget);
    return () => window.removeEventListener(FORGET_EVENT, forget);
  }, [store]);

  return (
    <>
      {createPortal(
        <div
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {center.announcement}
        </div>,
        document.body,
      )}
      {!settings.quiet && center.items.length > 0 ? (
        <Toaster
          label="Notifications"
          position={settings.position}
          visible={MAX_LIVE_NOTIFICATIONS}
          live="off"
          onDismiss={(key) => store.dismiss(Number(key))}
        >
          {center.items.map((item) => (
            <Toast
              key={item.id}
              tone={TONE[item.tone]}
              icon={<Icon name={TONE_ICON[item.tone]} size={16} />}
              title={item.message}
              description={item.detail}
            >
              {item.action ? (
                <Button
                  size="small"
                  onClick={() => {
                    item.action?.run();
                    store.dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </Button>
              ) : null}
              <IconButton
                label={`Dismiss ${item.message}`}
                onClick={() => store.dismiss(item.id)}
              >
                <Icon name="close" size={14} />
              </IconButton>
            </Toast>
          ))}
        </Toaster>
      ) : null}
    </>
  );
}
