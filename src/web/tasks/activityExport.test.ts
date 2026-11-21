import { describe, expect, it } from 'vitest';
import { activityFile } from './activityExport.js';
import type { Notification } from './notifications.js';

const entry: Notification = {
  id: 1,
  message: 'Boom',
  tone: 'error',
  detail: 'app.js:3',
  duration: null,
  action: null,
  createdAt: Date.parse('2026-11-20T09:59:00Z'),
};

describe('activityFile', () => {
  it('builds a dated JSON export of the entries', () => {
    const file = activityFile([entry], new Date('2026-11-20T10:00:00Z'));
    expect(file.name).toBe('bsh-activity-2026-11-20.json');
    expect(JSON.parse(file.text)).toMatchObject({
      kind: 'bsh.activity',
      version: 1,
      entries: [
        {
          at: '2026-11-20T09:59:00.000Z',
          tone: 'error',
          message: 'Boom',
          detail: 'app.js:3',
        },
      ],
    });
  });

  it('omits a detail that is missing', () => {
    const file = activityFile([{ ...entry, detail: null }]);
    const payload = JSON.parse(file.text) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(payload.entries[0]).not.toHaveProperty('detail');
  });
});
