import { beforeEach, describe, expect, it } from 'vitest';
import { forgetPersonal, getStorageAdapter } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTINGS_KEY,
  readNotificationSettings,
  writeNotificationSettings,
} from './notificationSettings.js';

beforeEach(() => {
  installMemoryStorage();
});

describe('notification settings', () => {
  it('starts from the defaults', () => {
    expect(readNotificationSettings()).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('falls back for invalid stored values and clamps the duration', () => {
    getStorageAdapter().set(
      'local',
      NOTIFICATION_SETTINGS_KEY,
      JSON.stringify({ position: 'middle', durationMs: 900_000, quiet: 'yes' }),
    );
    expect(readNotificationSettings()).toEqual({
      position: 'bottom-right',
      durationMs: 60_000,
      quiet: false,
    });
    NOTIFICATION_SETTINGS.write({
      position: 'top-left',
      durationMs: -5,
      quiet: true,
    });
    expect(readNotificationSettings()).toEqual({
      position: 'top-left',
      durationMs: 0,
      quiet: true,
    });
  });

  it('round-trips and survives sign-out as a preference', () => {
    expect(
      writeNotificationSettings({
        position: 'bottom-left',
        durationMs: 2000,
        quiet: true,
      }),
    ).toBe(true);
    forgetPersonal();
    expect(readNotificationSettings()).toEqual({
      position: 'bottom-left',
      durationMs: 2000,
      quiet: true,
    });
  });
});
