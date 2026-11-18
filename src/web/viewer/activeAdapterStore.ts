import { useSyncExternalStore } from 'react';
import type { ViewerAdapter } from './ViewerAdapter.js';

let current: ViewerAdapter | null = null;
const listeners = new Set<() => void>();

export function publishActiveAdapter(adapter: ViewerAdapter | null): void {
  if (current === adapter) return;
  current = adapter;
  for (const listener of listeners) listener();
}

export function releaseActiveAdapter(adapter: ViewerAdapter | null): void {
  if (adapter && current === adapter) publishActiveAdapter(null);
}

export function currentAdapter(): ViewerAdapter | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePublishedAdapter(): ViewerAdapter | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
