import { useCallback, useSyncExternalStore } from 'react';
import {
  type Coloring,
  coloringAssignments,
  entryItems,
} from '../extensions/colorBy.js';
import { FALLBACK_LABEL } from '../extensions/colorRules.js';
import { colorLayersFor } from './colorLayers.js';
import { claimGhosting, releaseGhosting } from './ghosting.js';
import type { ModelDbId } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const COLOR_STRENGTH = 0.85;

export interface ColoringOptions {
  ghostRest?: boolean;
}

interface ColoringState {
  coloring: Coloring;
  hidden: ReadonlySet<string>;
}

const NO_HIDDEN: ReadonlySet<string> = new Set();
const sessions = new WeakMap<ViewerAdapter, ColoringState>();
const listeners = new WeakMap<ViewerAdapter, Set<() => void>>();

function emit(adapter: ViewerAdapter): void {
  for (const listener of [...(listeners.get(adapter) ?? [])]) listener();
}

function groupItems(coloring: Coloring, key: string): ModelDbId[] {
  const index = coloring.legend.findIndex((entry) => entry.key === key);
  return index < 0 ? [] : entryItems(coloring, index);
}

function showHidden(adapter: ViewerAdapter, state: ColoringState): void {
  for (const key of state.hidden) {
    adapter.showModelIds(groupItems(state.coloring, key));
  }
}

function keptHidden(
  previous: ColoringState | undefined,
  next: Coloring,
): ReadonlySet<string> {
  if (!previous || previous.coloring.title !== next.title) return NO_HIDDEN;
  const keys = new Set(next.legend.map((entry) => entry.key));
  return new Set([...previous.hidden].filter((key) => keys.has(key)));
}

function solidItems(coloring: Coloring): ModelDbId[] {
  return coloring.legend.flatMap((entry, index) =>
    entry.label === FALLBACK_LABEL ? [] : entryItems(coloring, index),
  );
}

export function applyColoring(
  adapter: ViewerAdapter,
  coloring: Coloring,
  options: ColoringOptions = {},
): void {
  const previous = sessions.get(adapter);
  if (previous) showHidden(adapter, previous);
  const hidden = keptHidden(previous, coloring);
  colorLayersFor(adapter).replaceSource(
    'chart',
    coloringAssignments(coloring, COLOR_STRENGTH),
  );
  const solid = options.ghostRest ? solidItems(coloring) : [];
  if (solid.length > 0) claimGhosting(adapter, 'colors', solid);
  else releaseGhosting(adapter, 'colors');
  for (const key of hidden) {
    adapter.hideModelIds(groupItems(coloring, key));
  }
  sessions.set(adapter, { coloring, hidden });
  emit(adapter);
}

export function clearColoring(adapter: ViewerAdapter): void {
  const previous = sessions.get(adapter);
  if (previous) showHidden(adapter, previous);
  colorLayersFor(adapter).clearSource('chart');
  releaseGhosting(adapter, 'colors');
  sessions.delete(adapter);
  emit(adapter);
}

export function toggleColoringGroup(adapter: ViewerAdapter, key: string): void {
  const state = sessions.get(adapter);
  if (!state) return;
  const items = groupItems(state.coloring, key);
  const hidden = new Set(state.hidden);
  if (hidden.delete(key)) adapter.showModelIds(items);
  else {
    hidden.add(key);
    adapter.hideModelIds(items);
  }
  sessions.set(adapter, { ...state, hidden });
  emit(adapter);
}

export function currentColoring(adapter: ViewerAdapter): Coloring | null {
  return sessions.get(adapter)?.coloring ?? null;
}

export function hiddenGroups(adapter: ViewerAdapter): ReadonlySet<string> {
  return sessions.get(adapter)?.hidden ?? NO_HIDDEN;
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

function useColoringValue<T>(
  adapter: ViewerAdapter | null,
  read: (adapter: ViewerAdapter) => T,
  empty: T,
): T {
  const subscribe = useCallback(
    (listener: () => void) =>
      adapter ? subscribeColoring(adapter, listener) : () => undefined,
    [adapter],
  );
  const snapshot = useCallback(
    () => (adapter ? read(adapter) : empty),
    [adapter, read, empty],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useModelColoring(
  adapter: ViewerAdapter | null,
): Coloring | null {
  return useColoringValue(adapter, currentColoring, null);
}

export function useHiddenGroups(
  adapter: ViewerAdapter | null,
): ReadonlySet<string> {
  return useColoringValue(adapter, hiddenGroups, NO_HIDDEN);
}
