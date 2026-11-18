import { instancePanelId } from './panelIds.js';
import {
  isUserFamily,
  type PaneId,
  type PanelId,
  paneById,
  parsePanelId,
  userFamilies,
} from './paneRegistry.js';

export interface UserInstance {
  id: PanelId;
  title: string;
}

export type UserInstances = Readonly<Record<string, readonly UserInstance[]>>;

const MAX_PER_KIND = 12;

export function sanitizeUserInstances(raw: unknown): UserInstances {
  const out: Record<string, UserInstance[]> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [kind, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    const clean: UserInstance[] = [];
    for (const entry of list) {
      const id = entry?.id;
      const parsed = parsePanelId(id);
      if (!parsed?.instance || parsed.kind !== kind) continue;
      if (!isUserFamily(parsed.kind) || seen.has(id)) continue;
      seen.add(id);
      clean.push({
        id,
        title:
          typeof entry.title === 'string' && entry.title
            ? entry.title
            : paneById(parsed.kind).title,
      });
    }
    if (clean.length > 0) out[kind] = clean.slice(0, MAX_PER_KIND);
  }
  return out;
}

export function userInstanceIds(state: UserInstances): PanelId[] {
  return userFamilies().flatMap((pane) =>
    (state[pane.id] ?? []).map((entry) => entry.id),
  );
}

export function addUserInstance(
  state: UserInstances,
  kind: PaneId,
): { state: UserInstances; id: PanelId } | null {
  if (!isUserFamily(kind)) return null;
  const list = state[kind] ?? [];
  if (list.length >= MAX_PER_KIND) return null;
  const used = new Set(list.map((entry) => entry.id));
  let n = 1;
  while (used.has(instancePanelId(kind, String(n)))) n += 1;
  const id = instancePanelId(kind, String(n));
  const title = `${paneById(kind).title} ${n}`;
  return { state: { ...state, [kind]: [...list, { id, title }] }, id };
}

export function removeUserInstance(
  state: UserInstances,
  id: PanelId,
): UserInstances {
  const kind = parsePanelId(id)?.kind;
  if (!kind || !state[kind]) return state;
  const rest = state[kind].filter((entry) => entry.id !== id);
  const { [kind]: _dropped, ...others } = state;
  return rest.length > 0 ? { ...others, [kind]: rest } : others;
}

export function userInstanceTitles(
  state: UserInstances,
): Record<PanelId, { label: string; tooltip: string }> {
  const titles: Record<PanelId, { label: string; tooltip: string }> = {};
  for (const list of Object.values(state)) {
    for (const { id, title } of list)
      titles[id] = { label: title, tooltip: '' };
  }
  return titles;
}
