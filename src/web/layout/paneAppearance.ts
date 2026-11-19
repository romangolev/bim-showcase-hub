import { defineRecord, usePersisted } from '../storage.js';
import type { PaneTitles } from './layoutContext.js';
import { type PanelId, parsePanelId } from './paneRegistry.js';

export const PANE_APPEARANCE_KEY = 'bsh.pane.appearance.v1';
export const PANE_TITLE_MAX = 48;

export type PaneColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple';

export const PANE_COLORS: readonly { id: PaneColor; label: string }[] = [
  { id: 'red', label: 'Red' },
  { id: 'orange', label: 'Orange' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'purple', label: 'Purple' },
];

const COLOR_IDS = new Set<string>(PANE_COLORS.map((color) => color.id));

export interface PaneAppearance {
  title?: string;
  color?: PaneColor;
}

export type PaneAppearances = Readonly<Record<string, PaneAppearance>>;

export function sanitizePaneTitle(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const title = raw.trim().replace(/\s+/g, ' ').slice(0, PANE_TITLE_MAX);
  return title || undefined;
}

export function sanitizePaneColor(raw: unknown): PaneColor | undefined {
  return typeof raw === 'string' && COLOR_IDS.has(raw)
    ? (raw as PaneColor)
    : undefined;
}

export function sanitizePaneAppearances(raw: unknown): PaneAppearances {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, PaneAppearance> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!parsePanelId(id) || typeof value !== 'object' || value === null) {
      continue;
    }
    const title = sanitizePaneTitle((value as PaneAppearance).title);
    const color = sanitizePaneColor((value as PaneAppearance).color);
    if (!title && !color) continue;
    out[id] = { ...(title ? { title } : {}), ...(color ? { color } : {}) };
  }
  return out;
}

const APPEARANCES = defineRecord<PaneAppearances>({
  key: PANE_APPEARANCE_KEY,
  initial: {},
  sanitize: sanitizePaneAppearances,
});

export function readPaneAppearances(): PaneAppearances {
  return APPEARANCES.read();
}

export function replacePaneAppearances(next: PaneAppearances): PaneAppearances {
  return write(sanitizePaneAppearances(next));
}

export function usePaneAppearances(): PaneAppearances {
  const [appearances] = usePersisted(APPEARANCES);
  return appearances;
}

export function withPaneAppearance(
  appearances: PaneAppearances,
  id: PanelId,
  patch: PaneAppearance,
): PaneAppearances {
  const current = appearances[id] ?? {};
  const title =
    'title' in patch ? sanitizePaneTitle(patch.title) : current.title;
  const color =
    'color' in patch ? sanitizePaneColor(patch.color) : current.color;
  const next = {
    ...current,
    ...(title ? { title } : {}),
    ...(color ? { color } : {}),
  };
  if (!title) delete next.title;
  if (!color) delete next.color;
  if (!next.title && !next.color) {
    const { [id]: _removed, ...rest } = appearances;
    return rest;
  }
  return { ...appearances, [id]: next };
}

function write(next: PaneAppearances): PaneAppearances {
  APPEARANCES.write(next);
  return next;
}

export function setPaneTitle(
  id: PanelId,
  title: string | null,
  appearances: PaneAppearances = readPaneAppearances(),
): PaneAppearances {
  return write(withPaneAppearance(appearances, id, { title: title ?? '' }));
}

export function setPaneColor(
  id: PanelId,
  color: PaneColor | null,
  appearances: PaneAppearances = readPaneAppearances(),
): PaneAppearances {
  return write(
    withPaneAppearance(appearances, id, { color: color ?? undefined }),
  );
}

export function paneTags(
  appearances: PaneAppearances,
): Record<PanelId, PaneColor> {
  const tags: Record<PanelId, PaneColor> = {};
  for (const [id, appearance] of Object.entries(appearances)) {
    if (appearance.color) tags[id] = appearance.color;
  }
  return tags;
}

export function withPaneTitles(
  titles: PaneTitles,
  appearances: PaneAppearances,
): PaneTitles {
  const out: Record<PanelId, { label: string; tooltip: string }> = {
    ...titles,
  };
  for (const [id, appearance] of Object.entries(appearances)) {
    if (!appearance.title) continue;
    const current = out[id];
    out[id] = {
      label: appearance.title,
      tooltip: current?.tooltip || current?.label || appearance.title,
    };
  }
  return out;
}
