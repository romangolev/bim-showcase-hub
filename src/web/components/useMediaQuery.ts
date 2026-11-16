import { useSyncExternalStore } from 'react';

type Subscribe = (notify: () => void) => () => void;

const subscribers = new Map<string, Subscribe>();
const snapshots = new Map<string, () => boolean>();

function subscribeTo(query: string): Subscribe {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
}

function snapshotOf(query: string): () => boolean {
  let snapshot = snapshots.get(query);
  if (!snapshot) {
    snapshot = () =>
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(query).matches
        : false;
    snapshots.set(query, snapshot);
  }
  return snapshot;
}

const serverSnapshot = () => false;

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    snapshotOf(query),
    serverSnapshot,
  );
}
