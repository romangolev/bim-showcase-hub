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
  useLayoutEffect,
  useRef,
} from 'react';
import { defaultSteps, placementFor } from './defaultLayout.js';
import type { DockController, MoveTarget } from './layoutContext.js';
import {
  type SerializedDock,
  sanitizeDock,
  siblingCountOf,
  splitAxisOf,
} from './layoutState.js';
import {
  isPaneId,
  type PaneId,
  type Placement,
  paneById,
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
const UNBOUNDED = Number.POSITIVE_INFINITY;

interface SlotContextValue {
  hosts: HostStore<PaneId>;
  onAttach: (id: PaneId) => void;
  headerActions?: (props: {
    pane: PaneId;
    group: DockviewGroupPanel;
  }) => ReactNode;
}

const SlotContext = createContext<SlotContextValue | null>(null);

function PaneContent({ api }: IDockviewPanelProps) {
  const slot = useContext(SlotContext);
  if (!slot || !isPaneId(api.id)) return null;
  return (
    <PaneSlot
      hosts={slot.hosts}
      id={api.id}
      onAttach={slot.onAttach}
      className="pane-slot--dock"
    />
  );
}

function PaneTab(props: IDockviewPanelHeaderProps) {
  const closable = isPaneId(props.api.id) && paneById(props.api.id).closable;
  return <DockviewDefaultTab {...props} hideClose={!closable} />;
}

function PaneActions({ activePanel, group }: IDockviewHeaderActionsProps) {
  const slot = useContext(SlotContext);
  const id = activePanel?.id;
  if (!slot?.headerActions || !id || !isPaneId(id)) return null;
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

function sizePane(api: DockviewApi, id: PaneId, placement: Placement) {
  if (placement.kind === 'root') return;
  api
    .getPanel(id)
    ?.group.api.setSize(
      placement.direction === 'below'
        ? { height: placement.size }
        : { width: placement.size },
    );
}

function addPane(api: DockviewApi, id: PaneId, placement: Placement) {
  const pane = paneById(id);
  const base = {
    id,
    component: 'pane',
    title: pane.title,
    minimumWidth: pane.minSize.width,
    minimumHeight: pane.minSize.height,
  };
  if (placement.kind === 'root') {
    api.addPanel(base);
    return;
  }
  const sized =
    placement.direction === 'below'
      ? { initialHeight: placement.size }
      : { initialWidth: placement.size };
  if (placement.kind === 'beside') {
    api.addPanel({
      ...base,
      ...sized,
      position: {
        referencePanel: placement.reference,
        direction: placement.direction,
      },
    });
    sizePane(api, id, placement);
    return;
  }
  api.addPanel({
    ...base,
    ...sized,
    position: { direction: placement.direction },
  });
  sizePane(api, id, placement);
}

function buildDefault(api: DockviewApi, treeWidth: number) {
  api.clear();
  const steps = defaultSteps(treeWidth);
  for (const step of steps) {
    addPane(api, step.id, step.placement);
  }
  for (const step of steps) {
    sizePane(api, step.id, step.placement);
  }
  api.getPanel('viewer')?.api.setActive();
}

function restore(
  api: DockviewApi,
  dock: SerializedDock | null,
  treeWidth: number,
) {
  const clean = dock ? sanitizeDock(dock) : null;
  if (!clean) {
    buildDefault(api, treeWidth);
    return;
  }
  try {
    api.fromJSON(clean.dock as never);
    for (const id of clean.missing) {
      addPane(
        api,
        id,
        placementFor(paneById(id).defaultPlacement, (other) =>
          Boolean(api.getPanel(other)),
        ),
      );
    }
  } catch {
    buildDefault(api, treeWidth);
  }
}

function openIds(api: DockviewApi): PaneId[] {
  return api.panels.map((panel) => panel.id).filter(isPaneId);
}

export interface DockLayoutProps {
  hosts: HostStore<PaneId>;
  dock: SerializedDock | null;
  treeWidth: number;
  collapsed: readonly PaneId[];
  onAttach: (id: PaneId) => void;
  onMoved: (id: PaneId) => void;
  onChange: (dock: SerializedDock, open: PaneId[]) => void;
  onController: (controller: DockController | null) => void;
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

  const relax = (group: DockviewGroupPanel) => {
    const active = group.activePanel?.id;
    if (!active || !isPaneId(active)) return;
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
      if (group.panels.some((panel) => panel.id === 'viewer')) continue;
      const active = group.activePanel?.id;
      const axis = splitAxisOf(json, group.id);
      if (!axis || !active || !isPaneId(active)) continue;
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
      const active = group.activePanel?.id;
      if (!active || !isPaneId(active)) continue;
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
    applyCollapse();
    latest.current.onChange(
      api.toJSON() as unknown as SerializedDock,
      openIds(api),
    );
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

  const move = (id: PaneId, target: MoveTarget) => {
    const api = apiRef.current;
    const panel = api?.getPanel(id);
    if (!api || !panel) return;
    if (target === 'float') {
      if (!paneById(id).canFloat || panel.api.location.type === 'floating') {
        return;
      }
      api.addFloatingGroup(panel);
    } else {
      const direction =
        target === 'dock'
          ? (() => {
              const placement = paneById(id).defaultPlacement;
              return placement.kind === 'root' ? 'right' : placement.direction;
            })()
          : target;
      const group = api.addGroup({ direction });
      panel.api.moveTo({ group, position: 'center' });
    }
    panel.api.setActive();
    latest.current.onMoved(id);
  };

  const controller: DockController = {
    movePane: move,
    openPane: (id) => {
      const existing = apiRef.current?.getPanel(id);
      if (existing) {
        existing.api.setActive();
        return;
      }
      steady((api) =>
        addPane(
          api,
          id,
          placementFor(paneById(id).defaultPlacement, (other) =>
            Boolean(api.getPanel(other)),
          ),
        ),
      );
    },
    closePane: (id) => {
      const panel = apiRef.current?.getPanel(id);
      if (!panel || !paneById(id).closable) return;
      steady(() => panel.api.close(), [panel.group.id]);
    },
    reset: (treeWidth) => rebuild((api) => buildDefault(api, treeWidth)),
    focusPane: (id) => {
      const panel = apiRef.current?.getPanel(id);
      if (!panel) return;
      panel.api.setActive();
      panel.group.element
        .querySelector<HTMLElement>('.dv-tab.dv-active-tab, .dv-tab')
        ?.focus();
    },
    location: (id) => {
      const panel = apiRef.current?.getPanel(id);
      if (!panel) return null;
      return panel.api.location.type === 'floating' ? 'floating' : 'grid';
    },
  };
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const attach = (api: DockviewApi) => {
    if (live.current) return;
    apiRef.current = api;
    const subscriptions = [
      api.onDidLayoutChange(emit),
      api.onDidActivePanelChange(emit),
      api.onDidMovePanel((moved) => {
        if (isPaneId(moved.panel.id)) latest.current.onMoved(moved.panel.id);
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
      restore(api, latest.current.dock, latest.current.treeWidth);
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
  const collapsedKey = props.collapsed.join(' ');
  useLayoutEffect(() => {
    if (collapsedKey !== undefined) emitRef.current();
  }, [collapsedKey]);

  useLayoutEffect(() => {
    if (kept.current) attachRef.current(kept.current);
    return () => {
      live.current = false;
      for (const dispose of disposers.current) dispose();
      disposers.current = [];
      apiRef.current = null;
      latest.current.onController(null);
    };
  }, []);

  return (
    <SlotContext.Provider
      value={{
        hosts: props.hosts,
        onAttach: props.onAttach,
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
