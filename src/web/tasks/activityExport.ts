import type { Notification } from './notifications.js';

export function activityFile(
  entries: readonly Notification[],
  now: Date = new Date(),
): { name: string; text: string } {
  const payload = {
    kind: 'bsh.activity',
    version: 1,
    exportedAt: now.toISOString(),
    entries: entries.map((entry) => ({
      at: new Date(entry.createdAt).toISOString(),
      tone: entry.tone,
      message: entry.message,
      ...(entry.detail ? { detail: entry.detail } : {}),
    })),
  };
  return {
    name: `bsh-activity-${now.toISOString().slice(0, 10)}.json`,
    text: JSON.stringify(payload, null, 2),
  };
}
