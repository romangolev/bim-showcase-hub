import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS, defineRecord } from '../storage.js';
import type { ModelInfo, ModelSource } from './modelSet.js';
import type { ViewerAdapter, ViewNode } from './ViewerAdapter.js';

export const MAX_VIEW_PREF_URNS = 200;
export const MODEL_VIEWS_KEY = BSH_KEYS.personal.modelViews;

export interface ViewPrefs {
  start?: string;
  favorites: string[];
  hidden: string[];
}

export type ViewPrefsMap = Record<string, ViewPrefs>;

export type ViewSwitchResult = 'ok' | 'dimension' | 'failed';

export interface OrderedViews {
  favorites: ViewNode[];
  views3d: ViewNode[];
  sheets: ViewNode[];
  hidden: ViewNode[];
}

function idsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry && !out.includes(entry)) {
      out.push(entry);
    }
  }
  return out;
}

function sanitizePrefs(raw: unknown): ViewPrefs | null {
  if (!isRecord(raw)) return null;
  const start = typeof raw.start === 'string' && raw.start ? raw.start : '';
  const favorites = idsOf(raw.favorites);
  const hidden = idsOf(raw.hidden);
  if (!start && favorites.length === 0 && hidden.length === 0) return null;
  return {
    ...(start ? { start } : {}),
    favorites,
    hidden,
  };
}

function cap(map: ViewPrefsMap): ViewPrefsMap {
  const urns = Object.keys(map);
  if (urns.length <= MAX_VIEW_PREF_URNS) return map;
  const kept: ViewPrefsMap = {};
  for (const urn of urns.slice(-MAX_VIEW_PREF_URNS)) {
    const prefs = map[urn];
    if (prefs) kept[urn] = prefs;
  }
  return kept;
}

function sanitizeViewPrefs(raw: unknown): ViewPrefsMap {
  if (!isRecord(raw)) return {};
  const out: ViewPrefsMap = {};
  for (const [urn, value] of Object.entries(raw)) {
    const prefs = sanitizePrefs(value);
    if (!urn || !prefs) continue;
    out[urn] = prefs;
  }
  return cap(out);
}

export const VIEW_PREFS = defineRecord<ViewPrefsMap>({
  key: MODEL_VIEWS_KEY,
  initial: {},
  sanitize: sanitizeViewPrefs,
});

export function viewPrefsFor(
  urn: string,
  prefs: ViewPrefsMap = VIEW_PREFS.read(),
): ViewPrefs {
  const found = prefs[urn];
  if (!found) return { favorites: [], hidden: [] };
  return {
    ...(found.start ? { start: found.start } : {}),
    favorites: [...found.favorites],
    hidden: [...found.hidden],
  };
}

function put(
  prefs: ViewPrefsMap,
  urn: string,
  next: ViewPrefs | null,
): ViewPrefsMap {
  const { [urn]: _previous, ...rest } = prefs;
  const empty =
    !next ||
    (!next.start && next.favorites.length === 0 && next.hidden.length === 0);
  const merged: ViewPrefsMap = empty
    ? rest
    : {
        ...rest,
        [urn]: {
          ...(next?.start ? { start: next.start } : {}),
          favorites: [...(next?.favorites ?? [])],
          hidden: [...(next?.hidden ?? [])],
        },
      };
  return cap(merged);
}

function toggled(list: readonly string[], id: string, on: boolean): string[] {
  if (list.includes(id) === on) return [...list];
  return on ? [...list, id] : list.filter((entry) => entry !== id);
}

export function withFavorite(
  prefs: ViewPrefsMap,
  urn: string,
  id: string,
  on: boolean,
): ViewPrefsMap {
  const current = viewPrefsFor(urn, prefs);
  return put(prefs, urn, {
    ...current,
    favorites: toggled(current.favorites, id, on),
  });
}

export function withHidden(
  prefs: ViewPrefsMap,
  urn: string,
  id: string,
  on: boolean,
): ViewPrefsMap {
  const current = viewPrefsFor(urn, prefs);
  return put(prefs, urn, {
    ...current,
    hidden: toggled(current.hidden, id, on),
  });
}

export function withStartView(
  prefs: ViewPrefsMap,
  urn: string,
  id: string | null,
): ViewPrefsMap {
  const { start: _start, ...current } = viewPrefsFor(urn, prefs);
  return put(prefs, urn, id ? { ...current, start: id } : current);
}

export function orderViews(
  views: readonly ViewNode[],
  prefs: ViewPrefs,
): OrderedViews {
  const hiddenIds = new Set(prefs.hidden);
  const favoriteIds = new Set(prefs.favorites);
  const hidden = views.filter((view) => hiddenIds.has(view.id));
  const shown = views.filter((view) => !hiddenIds.has(view.id));
  const favorites = prefs.favorites.flatMap((id) =>
    shown.filter((view) => view.id === id),
  );
  const rest = shown.filter((view) => !favoriteIds.has(view.id));
  return {
    favorites,
    views3d: rest.filter((view) => view.role === '3d'),
    sheets: rest.filter((view) => view.role === '2d'),
    hidden,
  };
}

function sourceOf(model: ModelInfo, view: ViewNode): ModelSource {
  return {
    urn: model.urn,
    ...(model.name ? { name: model.name } : {}),
    ...(model.version ? { version: model.version } : {}),
    ...(model.path ? { path: model.path } : {}),
    view: view.id,
  };
}

async function anchorRole(adapter: ViewerAdapter): Promise<'2d' | '3d' | null> {
  const anchor = adapter.getModels()[0];
  if (!anchor) return null;
  const views = await adapter.listViews(anchor.id).catch(() => []);
  return views.find((entry) => entry.current)?.role ?? views[0]?.role ?? null;
}

export async function switchView(
  adapter: ViewerAdapter,
  modelId: string,
  view: ViewNode,
): Promise<ViewSwitchResult> {
  const models = adapter.getModels();
  const model = models.find((entry) => entry.id === modelId);
  if (!model) return 'failed';
  try {
    if (models.length > 1) {
      const role = await anchorRole(adapter);
      if (role && role !== view.role) return 'dimension';
      adapter.removeModel(modelId);
      await adapter.addModel(sourceOf(model, view));
      return 'ok';
    }
    await adapter.loadModels([sourceOf(model, view)]);
    return 'ok';
  } catch {
    return 'failed';
  }
}
