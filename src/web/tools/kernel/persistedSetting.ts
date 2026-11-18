import { usePersistedState } from '../../usePersistedState.js';

export interface PersistedSetting<T> {
  key: string;
  initial: T;
  sanitize: (raw: unknown) => T;
}

export function persistedSetting<T>(
  key: string,
  initial: T,
  sanitize: (raw: unknown) => T,
): PersistedSetting<T> {
  return { key, initial, sanitize };
}

export function usePersistedSetting<T>(spec: PersistedSetting<T>) {
  return usePersistedState<T>(spec.key, spec.initial, spec.sanitize);
}
