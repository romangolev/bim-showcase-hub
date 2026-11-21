import { type CSSProperties, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../components/icons.js';
import { FORGET_EVENT } from '../storage.js';
import {
  type NotificationSettings,
  type ToastPosition,
  useNotificationSettings,
} from './notificationSettings.js';
import {
  type Notification,
  type NotificationStore,
  notifications,
} from './notifications.js';
import { useNotifications } from './useNotifications.js';

const POSITION_STYLE: Record<ToastPosition, CSSProperties> = {
  'bottom-right': {
    right: 'var(--space-4)',
    bottom: 'var(--space-4)',
    alignItems: 'flex-end',
  },
  'bottom-left': {
    left: 'var(--space-4)',
    bottom: 'var(--space-4)',
    alignItems: 'flex-start',
  },
  'top-right': {
    right: 'var(--space-4)',
    top: 'var(--space-4)',
    alignItems: 'flex-end',
  },
  'top-left': {
    left: 'var(--space-4)',
    top: 'var(--space-4)',
    alignItems: 'flex-start',
  },
};

const TONE_ICON: Record<Notification['tone'], IconName> = {
  info: 'layers',
  success: 'check',
  warning: 'alert',
  error: 'alert',
};

const TONE_COLOR: Record<Notification['tone'], string> = {
  info: 'var(--color-arc-blue)',
  success: 'var(--color-mint)',
  warning: 'var(--color-ember)',
  error: 'var(--color-coral)',
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

  return createPortal(
    <>
      <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {center.announcement}
      </div>
      {!settings.quiet && center.items.length > 0 ? (
        <section
          aria-label="Notifications"
          style={{
            position: 'fixed',
            zIndex: 1100,
            display: 'flex',
            width: 'min(360px, calc(100vw - 2 * var(--space-4)))',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            pointerEvents: 'none',
            ...POSITION_STYLE[settings.position],
          }}
        >
          {center.items.map((item) => (
            <div
              key={item.id}
              data-tone={item.tone}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                border: 'var(--border-hairline)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--color-graphite)',
                boxShadow: 'var(--shadow-float)',
                color: 'var(--color-chalk)',
                fontSize: 'var(--text-13)',
                pointerEvents: 'auto',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  flex: '0 0 auto',
                  color: TONE_COLOR[item.tone],
                  paddingTop: 1,
                }}
              >
                <Icon name={TONE_ICON[item.tone]} size={16} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, color: 'var(--color-snow)' }}>
                  {item.message}
                </p>
                {item.detail ? (
                  <p
                    style={{
                      margin: '2px 0 0',
                      color: 'var(--color-fog)',
                    }}
                  >
                    {item.detail}
                  </p>
                ) : null}
              </div>
              {item.action ? (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    item.action?.run();
                    store.dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="icon-button"
                aria-label={`Dismiss ${item.message}`}
                onClick={() => store.dismiss(item.id)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </>,
    document.body,
  );
}
