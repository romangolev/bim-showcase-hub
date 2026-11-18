import { BSH_KEYS, readJson, writeJson } from '../storage.js';

export const RECENT_LIMIT = 5;

export function readRecents(): string[] {
  const raw = readJson<unknown>(BSH_KEYS.personal.recentCommands, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((id): id is string => typeof id === 'string')
    .slice(0, RECENT_LIMIT);
}

export function recordRecent(id: string): void {
  const next = [id, ...readRecents().filter((known) => known !== id)];
  writeJson(BSH_KEYS.personal.recentCommands, next.slice(0, RECENT_LIMIT));
}
