import { useCallback, useEffect, useState } from 'react';
import { BSH_KEYS, FORGET_EVENT, readJson, writeJson } from '../storage.js';

const SYNC_EVENT = 'bsh:persisted-state';

export function usePersistedState<T>(
  key: string,
  initial: T,
  sanitize: (raw: unknown) => T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = readJson<unknown>(key, undefined);
    return raw === undefined ? initial : sanitize(raw);
  });
  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (detail.key === key) setValue(detail.value);
    };
    const onForget = () => {
      if ((Object.values(BSH_KEYS.personal) as string[]).includes(key)) {
        setValue(initial);
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener(FORGET_EVENT, onForget);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener(FORGET_EVENT, onForget);
    };
  }, [key, initial]);
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (!writeJson(key, resolved)) return resolved;
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
