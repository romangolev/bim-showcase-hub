import { useCallback, useSyncExternalStore } from 'react';
import { type Coloring, coloringAssignments } from '../extensions/colorBy.js';
import { colorLayersFor } from './colorLayers.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const COLOR_STRENGTH = 0.85;

const colorings = new WeakMap<ViewerAdapter, Coloring>();
const listeners = new WeakMap<ViewerAdapter, Set<() => void>>();

function emit(adapter: ViewerAdapter): void {
  for (const listener of [...(listeners.get(adapter) ?? [])]) listener();
}

export function applyColoring(
  adapter: ViewerAdapter,
  coloring: Coloring,
): void {
  colorLayersFor(adapter).replaceSource(
    'chart',
    coloringAssignments(coloring, COLOR_STRENGTH),
  );
  colorings.set(adapter, coloring);
  emit(adapter);
}

export function clearColoring(adapter: ViewerAdapter): void {
  colorLayersFor(adapter).clearSource('chart');
  colorings.delete(adapter);
  emit(adapter);
}

export function currentColoring(adapter: ViewerAdapter): Coloring | null {
  return colorings.get(adapter) ?? null;
}

export function subscribeColoring(
  adapter: ViewerAdapter,
  listener: () => void,
): () => void {
  let set = listeners.get(adapter);
  if (!set) {
    set = new Set();
    listeners.set(adapter, set);
  }
  const active = set;
  active.add(listener);
  return () => {
    active.delete(listener);
  };
}

export function useModelColoring(
  adapter: ViewerAdapter | null,
): Coloring | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      adapter ? subscribeColoring(adapter, listener) : () => undefined,
    [adapter],
  );
  const snapshot = useCallback(
    () => (adapter ? currentColoring(adapter) : null),
    [adapter],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
