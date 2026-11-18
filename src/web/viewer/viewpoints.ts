import { useMemo } from 'react';
import {
  MAX_NAME_LENGTH,
  moveSaved,
  newSavedId,
  readSaved,
  removeSaved,
  renameSaved,
  type SavedItem,
  upsertSaved,
  useSavedItems,
} from '../store/savedStore.js';
import type { ViewerAdapter, ViewerState } from './ViewerAdapter.js';
import { sanitizeViewerState } from './viewerState.js';

export const VIEWPOINT_KIND = 'viewpoint';

export interface Viewpoint {
  id: string;
  name: string;
  updatedAt: number;
  state: ViewerState;
}

export type SaveViewpointResult = 'ok' | 'empty' | 'failed';

export type GoResult = 'ok' | 'partial' | 'unavailable' | 'missing' | 'failed';

export const VIEWPOINT_MESSAGES: Record<
  Exclude<SaveViewpointResult, 'ok'>,
  string
> = {
  empty: 'Open a model first.',
  failed:
    'Could not save the viewpoint. It may be too large; delete some saved items and try again.',
};

function toViewpoint(item: SavedItem): Viewpoint | null {
  const state = sanitizeViewerState(item.data.state);
  return state
    ? { id: item.id, name: item.name, updatedAt: item.updatedAt, state }
    : null;
}

function fromItems(items: readonly SavedItem[]): Viewpoint[] {
  return items
    .filter((item) => item.kind === VIEWPOINT_KIND)
    .flatMap((item) => toViewpoint(item) ?? []);
}

export function listViewpoints(): Viewpoint[] {
  return fromItems(readSaved(VIEWPOINT_KIND));
}

export function useViewpoints(): Viewpoint[] {
  const saved = useSavedItems(VIEWPOINT_KIND);
  return useMemo(() => fromItems(saved), [saved]);
}

export function nextViewpointName(): string {
  const used = new Set(
    listViewpoints().map((point) => /^Viewpoint (\d+)$/.exec(point.name)?.[1]),
  );
  let number = 1;
  while (used.has(String(number))) number += 1;
  return `Viewpoint ${number}`;
}

export function saveViewpoint(
  name: string,
  state: ViewerState,
): SaveViewpointResult {
  if (!state.camera && Object.keys(state.models).length === 0) return 'empty';
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return 'failed';
  return upsertSaved({
    id: newSavedId('vp'),
    kind: VIEWPOINT_KIND,
    name: trimmed,
    version: 1,
    updatedAt: Date.now(),
    data: { state },
  })
    ? 'ok'
    : 'failed';
}

export function renameViewpoint(id: string, name: string): boolean {
  return renameSaved(VIEWPOINT_KIND, id, name);
}

export function deleteViewpoint(id: string): boolean {
  return removeSaved(id);
}

export function moveViewpoint(id: string, delta: -1 | 1): boolean {
  return moveSaved(id, delta);
}

export interface GoOutcome {
  result: GoResult;
  text: string;
}

export async function goToViewpoint(
  adapter: ViewerAdapter,
  id: string,
): Promise<GoOutcome> {
  const point = listViewpoints().find((entry) => entry.id === id);
  if (!point) return { result: 'missing', text: 'That viewpoint was deleted.' };
  const wanted = Object.keys(point.state.models);
  const models = adapter
    .getModels()
    .filter((model) => model.status === 'ready');
  const open = new Set(models.map((model) => model.id));
  const shown = new Set(
    models.filter((model) => model.visible).map((model) => model.id),
  );
  const closed = wanted.filter((modelId) => !open.has(modelId));
  const hidden = wanted.filter(
    (modelId) => open.has(modelId) && !shown.has(modelId),
  );
  if (wanted.length > 0 && closed.length + hidden.length === wanted.length) {
    return {
      result: 'unavailable',
      text: `"${point.name}" belongs to models that are ${
        closed.length > 0 ? 'not open' : 'hidden. Show them in the model list'
      }.`,
    };
  }
  try {
    await adapter.restoreState(point.state);
  } catch {
    return {
      result: 'failed',
      text: `Could not restore "${point.name}".`,
    };
  }
  const skipped = [
    closed.length > 0 ? 'models that are not open' : '',
    hidden.length > 0 ? 'hidden models' : '',
  ].filter(Boolean);
  return skipped.length > 0
    ? {
        result: 'partial',
        text: `"${point.name}" restored without ${skipped.join(' and ')}.`,
      }
    : { result: 'ok', text: point.name };
}
