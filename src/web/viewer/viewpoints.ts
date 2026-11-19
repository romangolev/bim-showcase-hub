import { useMemo } from 'react';
import { isRecord } from '../../shared/guards.js';
import {
  defineSavedKind,
  type SavedKindItem,
  useSavedKindItems,
} from '../store/savedKinds.js';
import type {
  RestoreReport,
  ViewerAdapter,
  ViewerState,
} from './ViewerAdapter.js';
import { sanitizeViewerState } from './viewerState.js';

export const VIEWPOINT_KIND = 'viewpoint';

type ViewpointData = { state: ViewerState };

export const VIEWPOINTS = defineSavedKind<ViewpointData>({
  kind: VIEWPOINT_KIND,
  version: 1,
  label: 'Viewpoint',
  sanitize: (raw) => {
    const state = sanitizeViewerState(isRecord(raw) ? raw.state : null);
    return state ? { state } : null;
  },
});

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
    'Could not save the viewpoint. Saved items hold up to 4 MB; delete some and try again.',
};

function toViewpoint(item: SavedKindItem<ViewpointData>): Viewpoint {
  return {
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
    state: item.data.state,
  };
}

export function listViewpoints(): Viewpoint[] {
  return VIEWPOINTS.list().map(toViewpoint);
}

export function useViewpoints(): Viewpoint[] {
  const items = useSavedKindItems(VIEWPOINTS);
  return useMemo(() => items.map(toViewpoint), [items]);
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
  return VIEWPOINTS.save(name, { state }) ? 'ok' : 'failed';
}

export function renameViewpoint(id: string, name: string): boolean {
  return VIEWPOINTS.rename(id, name);
}

export function deleteViewpoint(id: string): boolean {
  return VIEWPOINTS.remove(id);
}

export function moveViewpoint(id: string, delta: -1 | 1): boolean {
  return VIEWPOINTS.move(id, delta);
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
  let report: RestoreReport;
  try {
    report = await adapter.restoreState(point.state);
  } catch {
    return {
      result: 'failed',
      text: `Could not restore "${point.name}".`,
    };
  }
  const skipped = [
    closed.length > 0 ? 'models that are not open' : '',
    hidden.length > 0 ? 'hidden models' : '',
    report.skippedModels.length > 0
      ? 'models whose object tree could not be read'
      : '',
    report.viewerFailed ? 'the camera and section planes' : '',
  ].filter(Boolean);
  return skipped.length > 0
    ? {
        result: 'partial',
        text: `"${point.name}" restored without ${skipped.join(' and ')}.`,
      }
    : { result: 'ok', text: point.name };
}
