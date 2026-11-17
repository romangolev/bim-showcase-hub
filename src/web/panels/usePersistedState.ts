import { useCallback, useEffect, useState } from 'react';

const SYNC_EVENT = 'bsh:persisted-state';

export function usePersistedState<T>(
  key: string,
  initial: T,
  sanitize: (raw: unknown) => T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? sanitize(JSON.parse(raw)) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (detail.key === key) setValue(detail.value);
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, [key]);
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          return resolved;
        }
        queueMicrotask(() =>
          window.dispatchEvent(
            new CustomEvent(SYNC_EVENT, { detail: { key, value: resolved } }),
          ),
        );
        return resolved;
      });
    },
    [key],
  );
  const reset = useCallback(() => update(initial), [update, initial]);
  return [value, update, reset];
}
