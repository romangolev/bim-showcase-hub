import { useCallback, useEffect, useRef, useState } from 'react';
import { BSH_KEYS, FORGET_EVENT, readJson, writeJson } from './storage.js';

const SYNC_EVENT = 'bsh:persisted-state';

export function usePersistedState<T>(
  key: string,
  initial: T,
  sanitize: (raw: unknown) => T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setState] = useState<T>(() => {
    const raw = readJson<unknown>(key, undefined);
    return raw === undefined ? initial : sanitize(raw);
  });
  const valueRef = useRef(value);
  const setValue = useCallback((next: T) => {
    valueRef.current = next;
    setState(next);
  }, []);
  const sanitizeRef = useRef(sanitize);
  sanitizeRef.current = sanitize;
  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (detail.key === key) setValue(detail.value);
    };
    const onForget = () => {
      if ((Object.values(BSH_KEYS.personal) as string[]).includes(key)) {
        setValue(initial);
        return;
      }
      const raw = readJson<unknown>(key, undefined);
      const next = raw === undefined ? initial : sanitizeRef.current(raw);
      if (JSON.stringify(next) !== JSON.stringify(valueRef.current)) {
        setValue(next);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      const raw = readJson<unknown>(key, undefined);
      setValue(raw === undefined ? initial : sanitizeRef.current(raw));
    };
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener('storage', onStorage);
    window.addEventListener(FORGET_EVENT, onForget);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(FORGET_EVENT, onForget);
    };
  }, [key, initial, setValue]);
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function'
          ? (next as (p: T) => T)(valueRef.current)
          : next;
      setValue(resolved);
      writeJson(key, resolved);
      queueMicrotask(() =>
        window.dispatchEvent(
          new CustomEvent(SYNC_EVENT, { detail: { key, value: resolved } }),
        ),
      );
    },
    [key, setValue],
  );
  const reset = useCallback(() => update(initial), [update, initial]);
  return [value, update, reset];
}
