import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';
import { defaultSteps, placementFor } from './defaultLayout.js';
import type { PaneTitles } from './layoutContext.js';
import {
  adoptArrangement,
  loadWithFallback,
  type SerializedDock,
  sanitizeDock,
} from './layoutState.js';
import {
  definitionOf,
  followersOf,
  isFollower,
  isPaneId,
  isRequired,
  PANES,
  type PaneDefinition,
  type PaneId,
  type PanelId,
  type Placement,
  paneById,
  paneKind,
  parsePanelId,
  TREE_WIDTH_DEFAULT,
} from './paneRegistry.js';

const FLOAT_MIN = { width: 360, height: 280 };

const TYPING =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const VIEWER_SURFACE = '.bsh-viewer-surface';

export function cycleGroups(root: HTMLElement, event: KeyboardEvent) {
  if (event.key !== 'F6' || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const target = event.target;
  if (
    target instanceof Element &&
    (target.closest(TYPING) || target.closest(VIEWER_SURFACE))
  ) {
    return;
  }
  const groups = Array.from(
    root.querySelectorAll<HTMLElement>('.dv-groupview'),
  );
  if (groups.length === 0) return;
  event.preventDefault();
  const current = groups.findIndex((group) =>
    group.contains(document.activeElement),
  );
  const step = event.shiftKey ? -1 : 1;
  const next =
    current === -1
      ? event.shiftKey
        ? groups.length - 1
        : 0
      : (current + step + groups.length) % groups.length;
  const group = groups[next];
  const tab =
    group?.querySelector<HTMLElement>('.dv-tab.dv-active-tab') ??
    group?.querySelector<HTMLElement>('.dv-tab');
  tab?.focus();
}

interface Bounds {
  minimumWidth: number;
  maximumWidth: number;
  minimumHeight: number;
  maximumHeight: number;
}

export function constrain(group: DockviewGroupPanel, bounds: Bounds) {
  if (
    group.minimumWidth === bounds.minimumWidth &&
    group.maximumWidth === bounds.maximumWidth &&
    group.minimumHeight === bounds.minimumHeight &&
    group.maximumHeight === bounds.maximumHeight
  ) {
    return;
  }
  group.api.setConstraints(bounds);
}

function sizePane(api: DockviewApi, id: PanelId, placement: Placement) {
  if (placement.kind === 'root' || placement.kind === 'tab') return;
  api
    .getPanel(id)
    ?.group.api.setSize(
      placement.direction === 'below'
        ? { height: placement.size }
        : { width: placement.size },
    );
}

function kindPanels(api: DockviewApi, kind: PaneId) {
  return api.panels.filter((panel) => paneKind(panel.id) === kind);
}

export function resolvePanel(
  api: DockviewApi,
  id: PanelId,
  active?: PanelId | null,
) {
  const exact = api.getPanel(id);
  if (exact || !isPaneId(id)) return exact;
  const preferred =
    active && paneKind(active) === id ? api.getPanel(active) : undefined;
  return preferred ?? kindPanels(api, id)[0];
}

function panelBase(id: PanelId, title?: string) {
  const pane = definitionOf(id);
  return {
    id,
    component: 'pane',
    title: title ?? pane.title,
    minimumWidth: pane.minSize.width,
    minimumHeight: pane.minSize.height,
  };
}

export function addPane(
  api: DockviewApi,
  id: PanelId,
  placement: Placement,
  title?: string,
) {
  const base = panelBase(id, title);
  if (placement.kind === 'root') {
    if (api.panels.length === 0) {
      api.addPanel(base);
      return;
    }
    const tree = api.getPanel('tree');
    api.addPanel({
      ...base,
      position:
        tree && tree.api.location.type === 'grid'
          ? { referencePanel: tree, direction: 'right' }
          : { direction: 'left' },
    });
    return;
  }
  if (placement.kind === 'tab') {
    const host = resolvePanel(api, placement.reference);
    api.addPanel({
      ...base,
      ...(host
        ? { position: { referenceGroup: host.group }, inactive: true }
        : {
            position: { direction: 'left' as const },
            initialWidth: TREE_WIDTH_DEFAULT,
          }),
    });
    return;
  }
  const sized =
    placement.direction === 'below'
      ? { initialHeight: placement.size }
      : { initialWidth: placement.size };
  const reference =
    placement.kind === 'beside'
      ? resolvePanel(api, placement.reference)
      : undefined;
  api.addPanel({
    ...base,
    ...sized,
    position: reference
      ? { referencePanel: reference, direction: placement.direction }
      : { direction: placement.direction },
  });
  sizePane(api, id, placement);
}

export function placementOf(api: DockviewApi, pane: PaneDefinition): Placement {
  return placementFor(pane.defaultPlacement, (other) =>
    Boolean(resolvePanel(api, other)),
  );
}

export interface InstanceSync {
  instances: readonly PanelId[];
  active: PanelId | null;
  titles: PaneTitles;
  companions: readonly PaneId[];
  treeWidth: number;
  arrangement?: SerializedDock | null;
}

function adopt(api: DockviewApi, sync: InstanceSync, want: PanelId[]) {
  if (!sync.arrangement) return false;
  const snapshot = adoptArrangement(
    sync.arrangement,
    want,
    sync.active,
    sync.companions,
    sync.titles,
  );
  if (!snapshot) return false;
  try {
    api.fromJSON(snapshot as never);
  } catch {
    buildDefault(api, sync.treeWidth, sync);
    return false;
  }
  if (!api.getPanel('tree')) {
    addPane(api, 'tree', placementOf(api, paneById('tree')));
  }
  return true;
}

export function isInstance(id: PanelId): boolean {
  return Boolean(parsePanelId(id)?.instance);
}

function wantedOf(sync: InstanceSync, kind: PaneId): PanelId[] {
  return sync.instances.filter((id) => paneKind(id) === kind);
}

export function changesShape(api: DockviewApi, sync: InstanceSync): boolean {
  return PANES.some(
    (pane) =>
      pane.instances?.source === 'models' &&
      (kindPanels(api, pane.id).length === 0) !==
        (wantedOf(sync, pane.id).length === 0),
  );
}

function sizeTree(api: DockviewApi, width: number) {
  const tree = api.getPanel('tree');
  if (tree && tree.api.location.type === 'grid') {
    tree.group.api.setSize({ width });
  }
}

export function syncInstances(api: DockviewApi, sync: InstanceSync) {
  const wanted = new Set(sync.instances);
  for (const pane of PANES) {
    if (!pane.instances) continue;
    const user = pane.instances.source === 'user';
    const want = wantedOf(sync, pane.id);
    const before = kindPanels(api, pane.id).length;
    const adopted =
      !user && before === 0 && want.length > 0 && adopt(api, sync, want);
    const leaving = kindPanels(api, pane.id).filter(
      (panel) => isInstance(panel.id) && !wanted.has(panel.id),
    );
    const arriving = want.filter((id) => !api.getPanel(id));
    const [old] = leaving;
    const [renamed] = arriving;
    if (leaving.length === 1 && arriving.length === 1 && old && renamed) {
      api.addPanel({
        ...panelBase(renamed, sync.titles[renamed]?.label),
        position: {
          referenceGroup: old.group,
          index: old.group.panels.indexOf(old),
        },
        inactive: renamed !== sync.active && old.group.activePanel !== old,
      });
    }
    for (const panel of kindPanels(api, pane.id)) {
      if (isInstance(panel.id) && !wanted.has(panel.id)) panel.api.close();
    }
    for (const id of want) {
      if (api.getPanel(id)) continue;
      const anchor =
        (sync.active && paneKind(sync.active) === pane.id
          ? api.getPanel(sync.active)
          : undefined) ?? kindPanels(api, pane.id)[0];
      const title = sync.titles[id]?.label;
      if (anchor) {
        api.addPanel({
          ...panelBase(id, title),
          position: { referenceGroup: anchor.group },
          inactive: id !== sync.active,
        });
      } else {
        addPane(api, id, placementOf(api, pane), title);
      }
    }
    if (user) continue;
    const followers = followersOf(pane.id);
    if (want.length === 0) {
      for (const follower of followers) api.getPanel(follower)?.api.close();
    } else if (before === 0) {
      if (!adopted) sizeTree(api, sync.treeWidth);
      for (const follower of followers) {
        if (!sync.companions.includes(follower)) continue;
        if (api.getPanel(follower)) continue;
        addPane(api, follower, placementOf(api, paneById(follower)));
      }
    }
  }
  const active = sync.active ? api.getPanel(sync.active) : undefined;
  if (active && active.group.activePanel !== active) active.api.setActive();
}

export function buildDefault(
  api: DockviewApi,
  treeWidth: number,
  sync: InstanceSync,
) {
  api.clear();
  const open = sync.instances.length > 0;
  const steps = defaultSteps(treeWidth).filter((step) => {
    const pane = paneById(step.id);
    if (pane.instances) return open;
    if (isFollower(step.id)) return open && sync.companions.includes(step.id);
    return true;
  });
  for (const step of steps) {
    const first = paneById(step.id).instances
      ? (sync.instances.find((id) => id === sync.active) ??
        sync.instances.find((id) => paneKind(id) === step.id))
      : undefined;
    if (first) addPane(api, first, step.placement, sync.titles[first]?.label);
    else addPane(api, step.id, step.placement);
  }
  for (const step of steps) {
    const target = resolvePanel(api, step.id, sync.active);
    if (target) sizePane(api, target.id, step.placement);
  }
  syncInstances(api, sync);
  resolvePanel(api, 'viewer', sync.active)?.api.setActive();
}

export function restore(
  api: DockviewApi,
  dock: SerializedDock | null,
  treeWidth: number,
  sync: InstanceSync,
) {
  const clean = dock ? sanitizeDock(dock, sync.instances) : null;
  if (!clean) {
    buildDefault(api, treeWidth, sync);
    return;
  }
  const loaded = loadWithFallback(
    clean.dock,
    (dock) => api.fromJSON(dock as never),
    (id) => {
      const kind = paneKind(id);
      return kind !== null && isRequired(kind);
    },
  );
  if (!loaded) {
    buildDefault(api, treeWidth, sync);
    return;
  }
  try {
    for (const id of clean.missing) {
      addPane(api, id, placementOf(api, paneById(id)));
    }
    syncInstances(api, sync);
  } catch {
    buildDefault(api, treeWidth, sync);
  }
}

export function floatingBox(
  api: { width: number; height: number },
  group: { width: number; height: number },
) {
  const width = Math.round(
    Math.min(Math.max(group.width, FLOAT_MIN.width), api.width * 0.6),
  );
  const height = Math.round(
    Math.min(Math.max(group.height, FLOAT_MIN.height), api.height * 0.6),
  );
  return {
    width,
    height,
    position: {
      left: Math.max(0, Math.round((api.width - width) / 2)),
      top: Math.max(0, Math.round((api.height - height) / 3)),
    },
  };
}

export function applyTitles(api: DockviewApi, titles: PaneTitles) {
  for (const panel of api.panels) {
    const kind = paneKind(panel.id);
    if (!kind) continue;
    const label = titles[panel.id]?.label ?? paneById(kind).title;
    if (panel.title !== label) panel.api.setTitle(label);
  }
}

export interface TreeWidthSource {
  getPanel(id: string):
    | {
        api: { location: { type: string } };
        group: { width: number; element: HTMLElement };
      }
    | undefined;
  groups: readonly { api: { location: { type: string } } }[];
}

export function measureTreeWidth(api: TreeWidthSource): number | null {
  const tree = api.getPanel('tree');
  if (tree?.api.location.type !== 'grid') return null;
  if (tree.group.element.dataset.collapsed) return null;
  const docked = api.groups.filter(
    (group) => group.api.location.type === 'grid',
  );
  if (docked.length < 2 || tree.group.width <= 0) return null;
  return Math.round(tree.group.width);
}

export function openKinds(api: DockviewApi): PaneId[] {
  const kinds = new Set(api.panels.map((panel) => paneKind(panel.id)));
  return PANES.map((pane) => pane.id).filter((id) => kinds.has(id));
}

export function activeKind(group: DockviewGroupPanel): PaneId | null {
  return paneKind(group.activePanel?.id);
}
