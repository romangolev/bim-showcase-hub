import { useSyncExternalStore } from 'react';

let active = false;
const listeners = new Set<() => void>();

export const ifcBatchMode = {
  get: () => active,
  set(next: boolean) {
    if (next === active) return;
    active = next;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useIfcBatchMode(): boolean {
  return useSyncExternalStore(
    ifcBatchMode.subscribe,
    ifcBatchMode.get,
    ifcBatchMode.get,
  );
}
