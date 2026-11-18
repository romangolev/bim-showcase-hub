import { BSH_KEYS, defineRecord } from '../storage.js';

export const RECENT_LIMIT = 5;

const RECENTS = defineRecord<string[]>({
  key: BSH_KEYS.personal.recentCommands,
  initial: [],
  sanitize: (raw) =>
    Array.isArray(raw)
      ? raw
          .filter((id): id is string => typeof id === 'string')
          .slice(0, RECENT_LIMIT)
      : [],
});

export function readRecents(): string[] {
  return RECENTS.read();
}

export function recordRecent(id: string): void {
  const next = [id, ...readRecents().filter((known) => known !== id)];
  RECENTS.write(next.slice(0, RECENT_LIMIT));
}
