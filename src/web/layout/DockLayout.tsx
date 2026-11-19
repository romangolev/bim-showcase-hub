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
import { useNavigate } from '@tanstack/react-router';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOpenModelsStore } from '../api/useOpenModels.js';
import {
  type DraggedModel,
  handleModelDrop,
  hasModelDrag,
} from '../components/tree/docDrag.js';
import { applyCollapse, GAP, steady as steadyOn } from './collapse.js';
import {
  addPane,
  applyTitles,
  buildDefault,
  changesShape,
  cycleGroups,
  floatingBox,
  type InstanceSync,
  isInstance,
  measureTreeWidth,
  openKinds,
  placementOf,
  resolvePanel,
  restore,
  syncInstances,
  type TreeWidthSource,
} from './dockOps.js';
import type {
  DockController,
  MoveTarget,
  PaneTitles,
} from './layoutContext.js';
import {
  type SerializedDock,
  siblingCountOf,
  splitAxisOf,
} from './layoutState.js';
import {
  definitionOf,
  FOLLOWERS,
  isPaneId,
  isPanelClosable,
  type PaneId,
  type PanelId,
  paneById,
  paneKind,
  parsePanelId,
} from './paneRegistry.js';
import { type HostStore, PaneSlot } from './ViewerHost.js';
import './dockTheme.css';

export const DOCK_THEME: DockviewTheme = {
  name: 'bsh',
  className: 'bsh-dock',
  gap: GAP,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
  dndTabIndicator: 'line',
};

interface SlotContextValue {
  hosts: HostStore<PanelId>;
  onAttach: (id: PanelId) => void;
  onVisibility: (id: PanelId, visible: boolean) => void;
  onCloseInstance: (id: PanelId) => void;
  onClosePane: (id: PaneId) => void;
  onToggleMaximize: (id: PanelId) => void;
  locked: boolean;
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
      hideClose={!isPanelClosable(id) || slot?.locked}
      title={slot?.titles[id]?.tooltip}
      onDoubleClick={() => slot?.onToggleMaximize(id)}
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

export interface DockLayoutProps {
  hosts: HostStore<PanelId>;
  dock: SerializedDock | null;
  treeWidth: number;
  collapsed: readonly PaneId[];
  titles: PaneTitles;
  instances: readonly PanelId[];
  activeInstance: PanelId | null;
  companions: readonly PaneId[];
  arrangement: SerializedDock | null;
  onAttach: (id: PanelId) => void;
  onVisibility: (id: PanelId, visible: boolean) => void;
  onMoved: (id: PanelId) => void;
  onChange: (dock: SerializedDock, open: PaneId[]) => void;
  onTreeWidth: (width: number) => void;
  onController: (controller: DockController | null) => void;
  onActivateInstance: (id: PanelId) => void;
  onCloseInstance: (id: PanelId) => void;
  onClosePane: (id: PaneId) => void;
  locked: boolean;
  onToggleMaximize: (id: PanelId) => void;
  onMaximized: (id: PanelId | null) => void;
  headerActions?: SlotContextValue['headerActions'];
}

export function DockLayout(props: DockLayoutProps) {
  const latest = useRef(props);
  latest.current = props;
  const navigate = useNavigate();
  const models = useOpenModelsStore();
  const [modelOver, setModelOver] = useState(false);
  const openDropped = (model: DraggedModel) => {
    models?.open(model.urn, model.context);
    void navigate({
      to: '/model/$urn',
      params: { urn: model.urn },
      search: model.context,
    });
  };
  const openDroppedRef = useRef(openDropped);
  openDroppedRef.current = openDropped;
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
    arrangement: latest.current.arrangement,
  });

  const steady = (run: (api: DockviewApi) => void, skip: string[] = []) => {
    const api = apiRef.current;
    if (api) steadyOn(api, busy, run, skip);
  };

  const emit = () => {
    const api = apiRef.current;
    if (!api || !live.current || busy.current > 0) return;
    applyTitles(api, latest.current.titles);
    applyCollapse(api, latest.current.collapsed, saved.current, busy);
    const width = measureTreeWidth(api as unknown as TreeWidthSource);
    if (width !== null && width !== latest.current.treeWidth) {
      latest.current.onTreeWidth(width);
    }
    const raw = api.toJSON() as unknown as SerializedDock;
    const { maximizedNode: _maximized, ...grid } = raw.grid;
    const dock: SerializedDock = {
      ...raw,
      grid: grid as SerializedDock['grid'],
    };
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
          ? placement.kind === 'root' || placement.kind === 'tab'
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
      steady((api) => {
        addPane(api, id, placementOf(api, paneById(id)));
        api.getPanel(id)?.api.setActive();
      });
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
          arrangement: null,
        }),
      ),
    toggleMaximize: (id) => {
      const api = apiRef.current;
      const panel = api
        ? resolvePanel(api, id, latest.current.activeInstance)
        : undefined;
      if (!panel) return false;
      if (panel.api.isMaximized()) {
        panel.api.exitMaximized();
        return false;
      }
      if (panel.api.location.type !== 'grid') return false;
      panel.api.maximize();
      return true;
    },
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
    resizePane: (id, delta) => {
      const api = apiRef.current;
      const panel = api
        ? resolvePanel(api, id, latest.current.activeInstance)
        : undefined;
      if (panel?.api.location.type !== 'grid') return null;
      const group = panel.group;
      const json = api?.toJSON() as unknown as SerializedDock;
      const siblings = siblingCountOf(json, group.id) ?? 1;
      const share = (GAP * (siblings - 1)) / siblings;
      const axis = splitAxisOf(json, group.id);
      const extra = (along: 'width' | 'height') => (axis === along ? share : 0);
      busy.current += 1;
      try {
        if (delta.width) {
          group.api.setSize({
            width: Math.max(0, group.width + extra('width') + delta.width),
          });
        }
        if (delta.height) {
          group.api.setSize({
            height: Math.max(0, group.height + extra('height') + delta.height),
          });
        }
      } finally {
        busy.current -= 1;
      }
      emit();
      return {
        width: Math.round(group.width),
        height: Math.round(group.height),
      };
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
        const active = api.activePanel;
        if (active?.group.api.isMaximized()) {
          latest.current.onMaximized(active.id);
        }
        emit();
      }),
      api.onDidMaximizedGroupChange((event) => {
        latest.current.onMaximized(
          event.isMaximized ? (event.group.activePanel?.id ?? null) : null,
        );
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
      toggleMaximize: (id) => controllerRef.current.toggleMaximize(id),
      location: (id) => controllerRef.current.location(id),
      resizePane: (id, delta) => controllerRef.current.resizePane(id, delta),
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
    const doc = root.ownerDocument;
    const onKey = (event: KeyboardEvent) => cycleGroups(root, event);
    const onDragOver = (event: DragEvent) => {
      if (!hasModelDrag(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setModelOver(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (root.contains(event.relatedTarget as Node | null)) return;
      setModelOver(false);
    };
    const onDrop = (event: DragEvent) => {
      setModelOver(false);
      handleModelDrop(event, (model) => openDroppedRef.current(model));
    };
    doc.addEventListener('keydown', onKey);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', onDragLeave);
    root.addEventListener('drop', onDrop);
    return () => {
      doc.removeEventListener('keydown', onKey);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('dragleave', onDragLeave);
      root.removeEventListener('drop', onDrop);
    };
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

  const {
    hosts,
    onAttach,
    onVisibility,
    onCloseInstance,
    onClosePane,
    onToggleMaximize,
    locked,
    titles,
    headerActions,
  } = props;
  const slotValue = useMemo(
    () => ({
      hosts,
      onAttach,
      onVisibility,
      onCloseInstance,
      onClosePane,
      onToggleMaximize,
      locked,
      titles,
      headerActions,
    }),
    [
      hosts,
      onAttach,
      onVisibility,
      onCloseInstance,
      onClosePane,
      onToggleMaximize,
      locked,
      titles,
      headerActions,
    ],
  );

  return (
    <SlotContext.Provider value={slotValue}>
      <div
        className="dock-root"
        ref={rootRef}
        data-model-drop={modelOver || undefined}
      >
        <DockviewReact
          theme={DOCK_THEME}
          components={COMPONENTS}
          defaultTabComponent={PaneTab}
          rightHeaderActionsComponent={PaneActions}
          onReady={onReady}
          dndStrategy="pointer"
          disableDnd={props.locked}
          disableFloatingGroups={props.locked}
          floatingGroupBounds="boundedWithinViewport"
          announcements
          getAnnouncement={() => (quiet.current > 0 ? null : undefined)}
        />
      </div>
    </SlotContext.Provider>
  );
}
