import { useCallback, useState } from 'react';

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
        return resolved;
      });
    },
    [key],
  );
  const reset = useCallback(() => update(initial), [update, initial]);
  return [value, update, reset];
}
