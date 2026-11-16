import {
  type DockviewApi,
  DockviewDefaultTab,
  type DockviewGroupPanel,
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { defaultSteps, placementFor } from './defaultLayout.js';
import type {
  DockController,
  MoveTarget,
  PaneTitles,
} from './layoutContext.js';
import {
  type SerializedDock,
  sanitizeDock,
  siblingCountOf,
  splitAxisOf,
} from './layoutState.js';
import {
  definitionOf,
  FOLLOWERS,
  followersOf,
  isFollower,
  isPaneId,
  isPanelClosable,
  PANES,
  type PaneDefinition,
  type PaneId,
  type PanelId,
  type Placement,
  paneById,
  paneKind,
  parsePanelId,
} from './paneRegistry.js';
import { type HostStore, PaneSlot } from './ViewerHost.js';
import './dockTheme.css';

const GAP = 12;

export const DOCK_THEME: DockviewTheme = {
  name: 'bsh',
  className: 'bsh-dock',
  gap: GAP,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
  dndTabIndicator: 'line',
};

export const HEADER_SIZE = 33;
const FLOAT_MIN = { width: 360, height: 280 };
const UNBOUNDED = Number.POSITIVE_INFINITY;

interface SlotContextValue {
  hosts: HostStore<PanelId>;
  onAttach: (id: PanelId) => void;
  onVisibility: (id: PanelId, visible: boolean) => void;
  onCloseInstance: (id: PanelId) => void;
  onClosePane: (id: PaneId) => void;
  titles: PaneTitles;
  headerActions?: (props: {
    pane: PanelId;
    group: DockviewGroupPanel;
  }) => ReactNode;
}

const SlotContext = createContext<SlotContextValue | null>(null);

function PaneContent({ api }: IDockviewPanelProps) {
  const slot = useContext(SlotContext);
  const [visible, setVisible] = useState(api.isVisible);
  useEffect(() => {
    setVisible(api.isVisible);
    const subscription = api.onDidVisibilityChange((event) =>
      setVisible(event.isVisible),
    );
    return () => subscription.dispose();
  }, [api]);
  if (!slot || !paneKind(api.id)) return null;
  return (
    <PaneSlot
      hosts={slot.hosts}
      id={api.id}
      onAttach={slot.onAttach}
      onVisibility={slot.onVisibility}
      visible={visible}
      className="pane-slot--dock"
    />
  );
}

function PaneTab(props: IDockviewPanelHeaderProps) {
  const slot = useContext(SlotContext);
  const id = props.api.id;
  const instance = Boolean(parsePanelId(id)?.instance);
  const close = () => {
    if (instance) slot?.onCloseInstance(id);
    else if (isPaneId(id)) slot?.onClosePane(id);
  };
  return (
    <DockviewDefaultTab
      {...props}
      hideClose={!isPanelClosable(id)}
      title={slot?.titles[id]?.tooltip}
      closeActionOverride={close}
    />
  );
}

function PaneActions({ activePanel, group }: IDockviewHeaderActionsProps) {
  const slot = useContext(SlotContext);
  const id = activePanel?.id;
  if (!slot?.headerActions || !id || !paneKind(id)) return null;
  return <>{slot.headerActions({ pane: id, group })}</>;
}

const COMPONENTS = { pane: PaneContent };

export function cycleGroups(root: HTMLElement, event: KeyboardEvent) {
  if (event.key !== 'F6' || event.altKey || event.ctrlKey || event.metaKey) {
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

function constrain(group: DockviewGroupPanel, bounds: Bounds) {
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
  if (placement.kind === 'root') return;
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

function addPane(
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

function placementOf(api: DockviewApi, pane: PaneDefinition): Placement {
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
}

function isInstance(id: PanelId): boolean {
  return Boolean(parsePanelId(id)?.instance);
}

function wantedOf(sync: InstanceSync, kind: PaneId): PanelId[] {
  return sync.instances.filter((id) => paneKind(id) === kind);
}

export function changesShape(api: DockviewApi, sync: InstanceSync): boolean {
  return PANES.some(
    (pane) =>
      pane.instances &&
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
    const want = wantedOf(sync, pane.id);
    const before = kindPanels(api, pane.id).length;
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
    const followers = followersOf(pane.id);
    if (want.length === 0) {
      for (const follower of followers) api.getPanel(follower)?.api.close();
    } else if (before === 0) {
      sizeTree(api, sync.treeWidth);
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

function buildDefault(api: DockviewApi, treeWidth: number, sync: InstanceSync) {
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

function restore(
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
  try {
    api.fromJSON(clean.dock as never);
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

function openKinds(api: DockviewApi): PaneId[] {
  const kinds = new Set(api.panels.map((panel) => paneKind(panel.id)));
  return PANES.map((pane) => pane.id).filter((id) => kinds.has(id));
}

function activeKind(group: DockviewGroupPanel): PaneId | null {
  return paneKind(group.activePanel?.id);
}

export interface DockLayoutProps {
  hosts: HostStore<PanelId>;
  dock: SerializedDock | null;
  treeWidth: number;
  collapsed: readonly PaneId[];
  titles: PaneTitles;
  instances: readonly PanelId[];
  activeInstance: PanelId | null;
  companions: readonly PaneId[];
  onAttach: (id: PanelId) => void;
  onVisibility: (id: PanelId, visible: boolean) => void;
  onMoved: (id: PanelId) => void;
  onChange: (dock: SerializedDock, open: PaneId[]) => void;
  onController: (controller: DockController | null) => void;
  onActivateInstance: (id: PanelId) => void;
  onCloseInstance: (id: PanelId) => void;
  onClosePane: (id: PaneId) => void;
  headerActions?: SlotContextValue['headerActions'];
}

export function DockLayout(props: DockLayoutProps) {
  const latest = useRef(props);
  latest.current = props;
  const apiRef = useRef<DockviewApi | null>(null);
  const kept = useRef<DockviewApi | null>(null);
  const live = useRef(false);
  const busy = useRef(0);
  const quiet = useRef(0);
  const saved = useRef(new Map<string, number>());
  const disposers = useRef<(() => void)[]>([]);
  const lastEmitted = useRef<string | null>(null);

  const sync = (): InstanceSync => ({
    instances: latest.current.instances,
    active: latest.current.activeInstance,
    titles: latest.current.titles,
    companions: latest.current.companions,
    treeWidth: latest.current.treeWidth,
  });

  const relax = (group: DockviewGroupPanel) => {
    const active = activeKind(group);
    if (!active) return;
    const min = paneById(active).minSize;
    constrain(group, {
      minimumWidth: min.width,
      maximumWidth: UNBOUNDED,
      minimumHeight: min.height,
      maximumHeight: UNBOUNDED,
    });
  };

  const pinOthers = (api: DockviewApi, skip: Set<string>) => {
    const json = api.toJSON() as unknown as SerializedDock;
    const pinned: DockviewGroupPanel[] = [];
    for (const group of api.groups) {
      if (skip.has(group.id) || group.element.dataset.collapsed) continue;
      if (group.api.location.type !== 'grid') continue;
      if (group.panels.some((panel) => paneKind(panel.id) === 'viewer')) {
        continue;
      }
      const active = activeKind(group);
      const axis = splitAxisOf(json, group.id);
      if (!axis || !active) continue;
      const min = paneById(active).minSize;
      const siblings = siblingCountOf(json, group.id) ?? 1;
      const share = (GAP * (siblings - 1)) / siblings;
      const size = (axis === 'width' ? group.width : group.height) + share;
      if (axis === 'width') {
        constrain(group, {
          minimumWidth: size,
          maximumWidth: size,
          minimumHeight: min.height,
          maximumHeight: UNBOUNDED,
        });
      } else {
        constrain(group, {
          minimumWidth: min.width,
          maximumWidth: UNBOUNDED,
          minimumHeight: size,
          maximumHeight: size,
        });
      }
      pinned.push(group);
    }
    return () => {
      for (const group of pinned) {
        if (api.groups.includes(group) && !group.element.dataset.collapsed) {
          relax(group);
        }
      }
    };
  };

  const steady = (run: (api: DockviewApi) => void, skip: string[] = []) => {
    const api = apiRef.current;
    if (!api) return;
    busy.current += 1;
    const release = pinOthers(api, new Set(skip));
    try {
      run(api);
    } finally {
      release();
      busy.current -= 1;
    }
  };

  const restoredSize = (
    group: DockviewGroupPanel,
    pane: PaneId,
    axis: 'width' | 'height',
  ) => {
    const previous = saved.current.get(group.id);
    saved.current.delete(group.id);
    const min = paneById(pane).minSize;
    const floor = axis === 'width' ? min.width : min.height;
    if (previous !== undefined && previous >= floor) return previous;
    const placement = paneById(pane).defaultPlacement;
    return placement.kind === 'root' ? floor : Math.max(placement.size, floor);
  };

  const applyCollapse = () => {
    const api = apiRef.current;
    if (!api) return;
    const json = api.toJSON() as unknown as SerializedDock;
    const changes: {
      group: DockviewGroupPanel;
      pane: PaneId;
      axis: 'width' | 'height';
      collapse: boolean;
    }[] = [];
    for (const group of api.groups) {
      const active = activeKind(group);
      if (!active) continue;
      const axis =
        group.api.location.type === 'grid' ? splitAxisOf(json, group.id) : null;
      const want = axis !== null && latest.current.collapsed.includes(active);
      const current = group.element.dataset.collapsed as
        | 'width'
        | 'height'
        | undefined;
      if (want && axis && current !== axis) {
        changes.push({ group, pane: active, axis, collapse: true });
      } else if (!want && current) {
        changes.push({ group, pane: active, axis: current, collapse: false });
      }
    }
    busy.current += 1;
    try {
      for (const group of api.groups) {
        if (!group.element.dataset.collapsed) relax(group);
      }
      if (changes.length === 0) return;
      steady(
        () => {
          for (const { group, pane, axis, collapse } of changes) {
            const min = paneById(pane).minSize;
            if (collapse) {
              if (!group.element.dataset.collapsed) {
                saved.current.set(
                  group.id,
                  axis === 'width' ? group.width : group.height,
                );
              }
              group.element.dataset.collapsed = axis;
              constrain(
                group,
                axis === 'height'
                  ? {
                      minimumHeight: HEADER_SIZE,
                      maximumHeight: HEADER_SIZE,
                      minimumWidth: min.width,
                      maximumWidth: UNBOUNDED,
                    }
                  : {
                      minimumWidth: HEADER_SIZE,
                      maximumWidth: HEADER_SIZE,
                      minimumHeight: min.height,
                      maximumHeight: UNBOUNDED,
                    },
              );
              group.api.setSize(
                axis === 'height'
                  ? { height: HEADER_SIZE }
                  : { width: HEADER_SIZE },
              );
            } else {
              delete group.element.dataset.collapsed;
              relax(group);
              const siblings =
                siblingCountOf(
                  api.toJSON() as unknown as SerializedDock,
                  group.id,
                ) ?? 1;
              const size =
                restoredSize(group, pane, axis) +
                (GAP * (siblings - 1)) / siblings;
              group.api.setSize(
                axis === 'width' ? { width: size } : { height: size },
              );
            }
          }
        },
        changes.map((change) => change.group.id),
      );
    } finally {
      busy.current -= 1;
    }
  };

  const emit = () => {
    const api = apiRef.current;
    if (!api || !live.current || busy.current > 0) return;
    applyTitles(api, latest.current.titles);
    applyCollapse();
    const dock = api.toJSON() as unknown as SerializedDock;
    const open = openKinds(api);
    const key = `${open.join(' ')}\n${JSON.stringify(dock)}`;
    if (key === lastEmitted.current) return;
    lastEmitted.current = key;
    latest.current.onChange(dock, open);
  };

  const rebuild = (run: (api: DockviewApi) => void) => {
    const api = apiRef.current;
    if (!api) return;
    busy.current += 1;
    quiet.current += 1;
    try {
      saved.current.clear();
      run(api);
    } finally {
      busy.current -= 1;
      quiet.current -= 1;
    }
    emit();
  };

  const move = (id: PanelId, target: MoveTarget) => {
    const api = apiRef.current;
    const panel = api
      ? resolvePanel(api, id, latest.current.activeInstance)
      : undefined;
    if (!api || !panel) return;
    const pane = definitionOf(panel.id);
    if (target === 'float') {
      if (!pane.canFloat || panel.api.location.type === 'floating') {
        return;
      }
      api.addFloatingGroup(panel, floatingBox(api, panel.group));
    } else {
      const placement = pane.defaultPlacement;
      const direction =
        target === 'dock'
          ? placement.kind === 'root'
            ? 'right'
            : placement.direction
          : target;
      const group = api.addGroup({ direction });
      panel.api.moveTo({ group, position: 'center' });
    }
    panel.api.setActive();
    latest.current.onMoved(panel.id);
  };

  const controller: DockController = {
    movePane: move,
    openPane: (id) => {
      const api = apiRef.current;
      const existing = api ? resolvePanel(api, id) : undefined;
      if (existing) {
        existing.api.setActive();
        return;
      }
      steady((api) => addPane(api, id, placementOf(api, paneById(id))));
    },
    closePane: (id) => {
      const panel = apiRef.current?.getPanel(id);
      if (!panel || !paneById(id).closable) return;
      steady(() => panel.api.close(), [panel.group.id]);
    },
    reset: (treeWidth) =>
      rebuild((api) =>
        buildDefault(api, treeWidth, {
          ...sync(),
          companions: FOLLOWERS,
          treeWidth,
        }),
      ),
    focusPane: (id) => {
      const api = apiRef.current;
      const panel = api
        ? resolvePanel(api, id, latest.current.activeInstance)
        : undefined;
      if (!panel) return;
      panel.api.setActive();
      panel.group.element
        .querySelector<HTMLElement>('.dv-tab.dv-active-tab, .dv-tab')
        ?.focus();
    },
    location: (id) => {
      const api = apiRef.current;
      const panel = api
        ? resolvePanel(api, id, latest.current.activeInstance)
        : undefined;
      if (!panel) return null;
      return panel.api.location.type === 'floating' ? 'floating' : 'grid';
    },
  };
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const reconcile = () => {
    const api = apiRef.current;
    if (!api || !live.current) return;
    const next = sync();
    if (changesShape(api, next)) {
      busy.current += 1;
      try {
        syncInstances(api, next);
      } finally {
        busy.current -= 1;
      }
    } else {
      steady((api) => syncInstances(api, next));
    }
    emit();
  };
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;

  const onActivePanel = () => {
    const api = apiRef.current;
    if (!api || busy.current > 0) return;
    const id = api.activePanel?.id;
    if (id && isInstance(id) && id !== latest.current.activeInstance) {
      latest.current.onActivateInstance(id);
    }
  };

  const attach = (api: DockviewApi) => {
    if (live.current) return;
    apiRef.current = api;
    const subscriptions = [
      api.onDidLayoutChange(emit),
      api.onDidActivePanelChange(() => {
        onActivePanel();
        emit();
      }),
      api.onDidMovePanel((moved) => {
        if (paneKind(moved.panel.id)) latest.current.onMoved(moved.panel.id);
      }),
    ];
    disposers.current.push(() => {
      for (const subscription of subscriptions) subscription.dispose();
    });
    live.current = true;
    latest.current.onController({
      movePane: (id, target) => {
        controllerRef.current.movePane(id, target);
        emit();
      },
      openPane: (id) => {
        controllerRef.current.openPane(id);
        emit();
      },
      closePane: (id) => {
        controllerRef.current.closePane(id);
        emit();
      },
      reset: (treeWidth) => controllerRef.current.reset(treeWidth),
      focusPane: (id) => controllerRef.current.focusPane(id),
      location: (id) => controllerRef.current.location(id),
    });
    reconcile();
    emit();
  };
  const attachRef = useRef(attach);
  attachRef.current = attach;

  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api;
    kept.current = api;
    apiRef.current = api;
    busy.current += 1;
    quiet.current += 1;
    try {
      restore(api, latest.current.dock, latest.current.treeWidth, sync());
    } finally {
      busy.current -= 1;
      quiet.current -= 1;
    }
    attach(api);
  };

  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (event: KeyboardEvent) => cycleGroups(root, event);
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, []);

  const emitRef = useRef(emit);
  emitRef.current = emit;
  useLayoutEffect(() => {
    if (apiRef.current) applyTitles(apiRef.current, props.titles);
  }, [props.titles]);
  const collapsedKey = props.collapsed.join(' ');
  const seenCollapsed = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (seenCollapsed.current === collapsedKey) return;
    seenCollapsed.current = collapsedKey;
    emitRef.current();
  });
  const instancesKey = `${props.activeInstance}\n${props.instances.join('\n')}`;
  const seenInstances = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (seenInstances.current === instancesKey) return;
    seenInstances.current = instancesKey;
    reconcileRef.current();
  });

  useLayoutEffect(() => {
    if (kept.current) attachRef.current(kept.current);
    return () => {
      live.current = false;
      for (const dispose of disposers.current) dispose();
      disposers.current = [];
      apiRef.current = null;
      lastEmitted.current = null;
      latest.current.onController(null);
    };
  }, []);

  return (
    <SlotContext.Provider
      value={{
        hosts: props.hosts,
        onAttach: props.onAttach,
        onVisibility: props.onVisibility,
        onCloseInstance: props.onCloseInstance,
        onClosePane: props.onClosePane,
        titles: props.titles,
        headerActions: props.headerActions,
      }}
    >
      <div className="dock-root" ref={rootRef}>
        <DockviewReact
          theme={DOCK_THEME}
          components={COMPONENTS}
          defaultTabComponent={PaneTab}
          rightHeaderActionsComponent={PaneActions}
          onReady={onReady}
          dndStrategy="pointer"
          floatingGroupBounds="boundedWithinViewport"
          announcements
          getAnnouncement={() => (quiet.current > 0 ? null : undefined)}
        />
      </div>
    </SlotContext.Provider>
  );
}
