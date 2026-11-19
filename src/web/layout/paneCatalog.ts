import { defineRecord, usePersisted } from '../storage.js';
import { isPaneId, type PaneDefinition, type PaneId } from './paneRegistry.js';

export const PANE_CATALOG_KEY = 'bsh.pane.catalog.v1';

export interface PaneCatalog {
  pins: PaneId[];
  hidden: PaneId[];
}

export const EMPTY_CATALOG: PaneCatalog = { pins: [], hidden: [] };

function uniquePanes(raw: unknown): PaneId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isPaneId))];
}

export function sanitizePaneCatalog(raw: unknown): PaneCatalog {
  if (typeof raw !== 'object' || raw === null) return EMPTY_CATALOG;
  const value = raw as Partial<PaneCatalog>;
  return {
    pins: uniquePanes(value.pins),
    hidden: uniquePanes(value.hidden),
  };
}

const CATALOG = defineRecord<PaneCatalog>({
  key: PANE_CATALOG_KEY,
  initial: EMPTY_CATALOG,
  sanitize: sanitizePaneCatalog,
});

export function toggleList(list: readonly PaneId[], id: PaneId): PaneId[] {
  return list.includes(id)
    ? list.filter((entry) => entry !== id)
    : [...list, id];
}

export function withPin(catalog: PaneCatalog, id: PaneId): PaneCatalog {
  return { ...catalog, pins: toggleList(catalog.pins, id) };
}

export function withHidden(catalog: PaneCatalog, id: PaneId): PaneCatalog {
  const hidden = toggleList(catalog.hidden, id);
  return {
    pins: hidden.includes(id)
      ? catalog.pins.filter((entry) => entry !== id)
      : catalog.pins,
    hidden,
  };
}

export function readPaneCatalog(): PaneCatalog {
  return CATALOG.read();
}

export function usePaneCatalog(): [PaneCatalog, (next: PaneCatalog) => void] {
  const [catalog, update] = usePersisted(CATALOG);
  return [catalog, update];
}

export function matchesPane(pane: PaneDefinition, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text =
    `${pane.title} ${pane.description} ${pane.category} ${pane.keywords}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

export interface OrderedPanes {
  pinned: PaneDefinition[];
  groups: { category: string; panes: PaneDefinition[] }[];
  hidden: PaneDefinition[];
}

export function orderPanes(
  panes: readonly PaneDefinition[],
  catalog: PaneCatalog,
  query: string,
  showHidden: boolean,
): OrderedPanes {
  const byId = new Map(panes.map((pane) => [pane.id, pane]));
  const matched = panes.filter((pane) => matchesPane(pane, query));
  const hidden = matched.filter((pane) => catalog.hidden.includes(pane.id));
  const visible = matched.filter((pane) => !catalog.hidden.includes(pane.id));
  if (query.trim()) {
    return {
      pinned: [],
      groups: visible.length > 0 ? [{ category: '', panes: visible }] : [],
      hidden: showHidden ? hidden : [],
    };
  }
  const pinned = catalog.pins
    .map((id) => byId.get(id))
    .filter((pane): pane is PaneDefinition => pane !== undefined)
    .filter((pane) => !catalog.hidden.includes(pane.id));
  const pinnedIds = new Set(pinned.map((pane) => pane.id));
  const rest = visible.filter((pane) => !pinnedIds.has(pane.id));
  const categoryOrder: string[] = [];
  const grouped = new Map<string, PaneDefinition[]>();
  for (const pane of rest) {
    if (!grouped.has(pane.category)) {
      grouped.set(pane.category, []);
      categoryOrder.push(pane.category);
    }
    grouped.get(pane.category)?.push(pane);
  }
  return {
    pinned,
    groups: categoryOrder.map((category) => ({
      category,
      panes: grouped.get(category) ?? [],
    })),
    hidden: showHidden ? hidden : [],
  };
}
