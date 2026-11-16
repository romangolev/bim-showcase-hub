import { useSyncExternalStore } from 'react';

function subscribeTo(query: string) {
  return (notify: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return () => undefined;
    }
    const list = window.matchMedia(query);
    list.addEventListener('change', notify);
    return () => list.removeEventListener('change', notify);
  };
}

function snapshotOf(query: string) {
  return () =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    snapshotOf(query),
    () => false,
  );
}
