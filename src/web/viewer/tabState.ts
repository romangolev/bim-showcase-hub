import type { ViewerState } from './ViewerAdapter.js';

export const MAX_TAB_STATE_IDS = 5000;

export function countStateIds(state: ViewerState): number {
  return Object.values(state.models).reduce(
    (sum, entry) =>
      sum +
      entry.isolated.length +
      entry.hidden.length +
      entry.selection.length,
    0,
  );
}

export function capTabState(state: ViewerState): ViewerState {
  return countStateIds(state) > MAX_TAB_STATE_IDS
    ? { ...state, models: {} }
    : state;
}

export function shouldRestore(
  saved: ViewerState | null | undefined,
  incomingView: string | null,
): saved is ViewerState {
  return Boolean(saved) && !incomingView;
}
