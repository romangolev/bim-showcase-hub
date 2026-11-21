import { describe, expect, it } from 'vitest';
import { installErrorCapture } from './errorCapture.js';
import { createNotificationStore } from './notifications.js';

describe('installErrorCapture', () => {
  it('logs window errors and unhandled rejections until removed', () => {
    const store = createNotificationStore();
    const remove = installErrorCapture(window, store);
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Boom',
        filename: 'app.js',
        lineno: 3,
      }),
    );
    const rejection = new Event('unhandledrejection') as Event & {
      reason: unknown;
    };
    Object.assign(rejection, { reason: new Error('Lost') });
    window.dispatchEvent(rejection);
    remove();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Later' }));
    expect(store.getSnapshot().log.map((e) => e.message)).toEqual([
      'Lost',
      'Boom',
    ]);
    expect(store.getSnapshot().items).toHaveLength(0);
  });
});
