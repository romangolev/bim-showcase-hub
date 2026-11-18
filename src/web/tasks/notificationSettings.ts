import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord, usePersisted } from '../storage.js';

export const TOAST_POSITIONS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const;

export type ToastPosition = (typeof TOAST_POSITIONS)[number];

export interface NotificationSettings {
  position: ToastPosition;
  durationMs: number;
  quiet: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  position: 'bottom-right',
  durationMs: 6000,
  quiet: false,
};

export const NOTIFICATION_SETTINGS_KEY = BSH_KEYS.preference.notifications;

const POSITIONS = new Set<string>(TOAST_POSITIONS);

function duration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATION_SETTINGS.durationMs;
  }
  return Math.min(60_000, Math.max(0, Math.round(value)));
}

export const NOTIFICATION_SETTINGS = defineRecord<NotificationSettings>({
  key: NOTIFICATION_SETTINGS_KEY,
  initial: DEFAULT_NOTIFICATION_SETTINGS,
  sanitize: (raw) => {
    const source = isRecord(raw) ? raw : {};
    return {
      position:
        typeof source.position === 'string' && POSITIONS.has(source.position)
          ? (source.position as ToastPosition)
          : DEFAULT_NOTIFICATION_SETTINGS.position,
      durationMs: duration(source.durationMs),
      quiet: source.quiet === true,
    };
  },
});

export function readNotificationSettings(): NotificationSettings {
  return NOTIFICATION_SETTINGS.read();
}

export function writeNotificationSettings(
  settings: NotificationSettings,
): boolean {
  return NOTIFICATION_SETTINGS.write(settings);
}

export function useNotificationSettings() {
  return usePersisted(NOTIFICATION_SETTINGS);
}
