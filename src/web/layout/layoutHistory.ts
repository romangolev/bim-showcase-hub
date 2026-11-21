import { type LayoutModel, serializeLayout } from './layoutState.js';

export const LAYOUT_HISTORY_LIMIT = 20;

export interface LayoutHistory {
  past: readonly LayoutModel[];
  future: readonly LayoutModel[];
}

export interface HistoryStep {
  history: LayoutHistory;
  layout: LayoutModel;
}

export const EMPTY_HISTORY: LayoutHistory = { past: [], future: [] };

export function sameLayout(a: LayoutModel, b: LayoutModel): boolean {
  const strip = (model: LayoutModel) =>
    serializeLayout({ ...model, lastViewerArrangement: null });
  return a === b || strip(a) === strip(b);
}

export function recordLayout(
  history: LayoutHistory,
  before: LayoutModel,
  limit = LAYOUT_HISTORY_LIMIT,
): LayoutHistory {
  return { past: [...history.past, before].slice(-limit), future: [] };
}

export function undoStep(
  history: LayoutHistory,
  current: LayoutModel,
): HistoryStep | null {
  const past = [...history.past];
  let layout = past.pop();
  while (layout && sameLayout(layout, current)) layout = past.pop();
  if (!layout) return null;
  return { layout, history: { past, future: [current, ...history.future] } };
}

export function redoStep(
  history: LayoutHistory,
  current: LayoutModel,
): HistoryStep | null {
  const [layout, ...future] = history.future;
  if (!layout) return null;
  return { layout, history: { past: [...history.past, current], future } };
}
