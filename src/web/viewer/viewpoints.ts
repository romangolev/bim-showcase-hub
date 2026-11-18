import { useMemo } from 'react';
import { usePersisted } from '../storage.js';
import {
  MAX_NAME_LENGTH,
  moveSaved,
  removeSaved,
  SAVED,
  type SavedItem,
  upsertSaved,
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
  return fromItems(SAVED.read());
}

export function useViewpoints(): Viewpoint[] {
  const [saved] = usePersisted(SAVED);
  return useMemo(() => fromItems(saved), [saved]);
}

function newId(): string {
  return `vp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nextViewpointName(): string {
  return `Viewpoint ${listViewpoints().length + 1}`;
}

export function saveViewpoint(
  name: string,
  state: ViewerState,
): SaveViewpointResult {
  if (!state.camera && Object.keys(state.models).length === 0) return 'empty';
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return 'failed';
  return upsertSaved({
    id: newId(),
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
  const item = SAVED.read().find(
    (entry) => entry.id === id && entry.kind === VIEWPOINT_KIND,
  );
  const trimmed = name.trim();
  if (!item || !trimmed) return false;
  return upsertSaved({ ...item, name: trimmed, updatedAt: Date.now() });
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
  const open = new Set(
    adapter
      .getModels()
      .filter((model) => model.status === 'ready' && model.visible)
      .map((model) => model.id),
  );
  const present = wanted.filter((modelId) => open.has(modelId));
  if (wanted.length > 0 && present.length === 0) {
    return {
      result: 'unavailable',
      text: `"${point.name}" belongs to models that are not open.`,
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
  return present.length < wanted.length
    ? {
        result: 'partial',
        text: `"${point.name}" restored without models that are not open.`,
      }
    : { result: 'ok', text: point.name };
}
