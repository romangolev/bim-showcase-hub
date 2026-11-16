import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  createOpenModelsStore,
  type OpenModelsState,
  type OpenModelsStore,
} from '../api/openModels.js';
import { OpenModelsContext } from '../api/useOpenModels.js';
import { TopBar } from '../components/TopBar.js';
import { TreeControlContext } from '../components/TreeControl.js';
import { useMediaQuery } from '../components/useMediaQuery.js';
import { modelTabTitle } from '../routes/ModelPage.js';
import { ModelRouteSync } from '../routes/ModelRouteSync.js';
import { isMockViewer, ViewerProvider } from '../viewer/index.js';
import {
  type DockController,
  type LayoutApi,
  LayoutContext,
  type LayoutMode,
  MainContentContext,
  type MoveTarget,
  type PaneTitle,
  type PaneTitles,
} from './layoutContext.js';
import {
  defaultModel,
  type LayoutModel,
  layoutReducer,
  readLayout,
  type SerializedDock,
  writeLayout,
} from './layoutState.js';
import { LayoutMenu, PaneActions } from './PaneMenu.js';
import {
  definitionOf,
  FOLLOWERS,
  isPaneId,
  PANE_IDS,
  type PaneId,
  type PanelId,
  paneById,
  paneKind,
  parsePanelId,
  TREE_WIDTH_DEFAULT,
} from './paneRegistry.js';
import { MODEL_KIND, modelPanelId } from './panes.js';
import { StackedLayout } from './StackedLayout.js';
import { createHostStore, PaneHosts } from './ViewerHost.js';

const DockLayout = lazy(() =>
  import('./DockLayout.js').then((module) => ({
    default: module.DockLayout,
  })),
);

const MOVE_MESSAGES: Partial<Record<MoveTarget, string>> = {
  left: 'moved to the left edge',
  right: 'moved to the right edge',
  below: 'moved to the bottom',
};

export const STACKED_MAX_WIDTH = 875;
export const STACKED_QUERY = `(max-width: ${STACKED_MAX_WIDTH}px)`;
export const LAYOUT_WRITE_DELAY_MS = 300;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initialModel(openPanels: readonly PanelId[]): LayoutModel {
  const store = storage();
  const height = window.innerHeight;
  return store ? readLayout(store, height, openPanels) : defaultModel(height);
}

function openFromDock(dock: SerializedDock | null): PaneId[] {
  if (!dock) return ['tree'];
  const kinds = new Set(Object.keys(dock.panels).map(paneKind));
  return PANE_IDS.filter((id) => kinds.has(id));
}

function focusTreeTarget() {
  requestAnimationFrame(() => {
    const target =
      document.querySelector<HTMLElement>(
        '#document-panel [aria-selected="true"]',
      ) ?? document.querySelector<HTMLElement>('#document-panel input');
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  });
}

function modelOf(id: PanelId): string | null {
  const parsed = parsePanelId(id);
  return parsed?.kind === MODEL_KIND ? parsed.instance : null;
}

function titlesFor(models: OpenModelsState): PaneTitles {
  const titles: Record<PanelId, PaneTitle> = {};
  for (const { urn, context } of models.models) {
    titles[modelPanelId(urn)] = modelTabTitle(urn, context);
  }
  const active = models.active ? titles[modelPanelId(models.active)] : null;
  if (active) {
    for (const id of FOLLOWERS) {
      const label = paneById(id).title;
      titles[id] = { label, tooltip: `${label} of ${active.label}` };
    }
  }
  return titles;
}

function useDebouncedWrite(model: LayoutModel) {
  const pending = useRef<LayoutModel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = null;
    const store = storage();
    if (next && store) writeLayout(store, next);
  }, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pending.current = model;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, LAYOUT_WRITE_DELAY_MS);
  }, [model, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
}

export interface LayoutProviderProps {
  main: ReactNode;
  openModels?: OpenModelsStore;
}

export function LayoutProvider({ main, openModels }: LayoutProviderProps) {
  const [modelStore] = useState(() => openModels ?? createOpenModelsStore());
  const models = useSyncExternalStore(
    modelStore.subscribe,
    modelStore.getState,
    modelStore.getState,
  );
  const instances = useMemo(
    () => models.models.map(({ urn }) => modelPanelId(urn)),
    [models.models],
  );
  const activeInstance = models.active ? modelPanelId(models.active) : null;
  const titles = useMemo(() => titlesFor(models), [models]);

  const stacked = useMediaQuery(STACKED_QUERY);
  const mode: LayoutMode = stacked ? 'stacked' : 'dock';
  const [model, dispatch] = useReducer(layoutReducer, instances, initialModel);
  const [openPanes, setOpenPanes] = useState<readonly PaneId[]>(() =>
    openFromDock(model.dock),
  );
  const [hosts] = useState(() => createHostStore<PanelId>());
  const [attached, setAttached] = useState<readonly PanelId[]>([]);
  const [signals, setSignals] = useState<Readonly<Record<PanelId, number>>>({});
  const [overlayTreeOpen, setOverlayTreeOpen] = useState(false);
  const [seenMode, setSeenMode] = useState(mode);
  const controller = useRef<DockController | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const focusBeforeSwitch = useRef<Element | null>(null);
  if (seenMode !== mode) {
    focusBeforeSwitch.current = document.activeElement;
    setSeenMode(mode);
    setOverlayTreeOpen(false);
  }
  const home = models.models.length === 0;
  const overlayOpen = stacked && overlayTreeOpen && !home;
  const treeOpen = stacked
    ? home || overlayTreeOpen
    : !model.collapsed.includes('tree');
  const companions = useMemo(
    () => FOLLOWERS.filter((id) => !model.dismissed.includes(id)),
    [model.dismissed],
  );
  const previousMode = useRef(mode);

  useDebouncedWrite(model);

  const instanceKey = instances.join('\n');
  useEffect(() => {
    const wanted = new Set(instanceKey ? instanceKey.split('\n') : []);
    setAttached((list) => {
      const gone = list.filter(
        (id) => parsePanelId(id)?.instance && !wanted.has(id),
      );
      if (gone.length === 0) return list;
      for (const id of gone) hosts.release(id);
      return list.filter((id) => !gone.includes(id));
    });
  }, [instanceKey, hosts]);

  useLayoutEffect(() => {
    const was = previousMode.current;
    previousMode.current = mode;
    if (was === mode) return;
    const focused = focusBeforeSwitch.current;
    focusBeforeSwitch.current = null;
    if (!(focused instanceof HTMLElement)) return;
    const inTree = Boolean(focused.closest('#document-panel'));
    if (mode === 'stacked' && inTree) {
      toggleRef.current?.focus();
    } else if (focused.isConnected && document.activeElement !== focused) {
      focused.focus();
    }
  }, [mode]);

  const closeTree = useCallback(() => {
    setOverlayTreeOpen(false);
    toggleRef.current?.focus();
  }, []);

  const closeTreeOverlay = useCallback(() => {
    if (modeRef.current === 'stacked') closeTree();
  }, [closeTree]);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTree();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlayOpen, closeTree]);

  const bump = useCallback((id: PanelId) => {
    setSignals((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }, []);

  const onAttach = useCallback(
    (id: PanelId) => {
      setAttached((list) => (list.includes(id) ? list : [...list, id]));
      bump(id);
      const urn = modelOf(id);
      if (urn) modelStore.show(urn);
    },
    [bump, modelStore],
  );

  const onDockChange = useCallback((dock: SerializedDock, open: PaneId[]) => {
    dispatch({ type: 'dock', dock });
    setOpenPanes((current) =>
      current.length === open.length && current.every((id) => open.includes(id))
        ? current
        : open,
    );
  }, []);

  const onController = useCallback((next: DockController | null) => {
    controller.current = next;
  }, []);

  const onActivateInstance = useCallback(
    (id: PanelId) => {
      const urn = modelOf(id);
      if (urn) modelStore.activate(urn);
    },
    [modelStore],
  );

  const onCloseInstance = useCallback(
    (id: PanelId) => {
      const urn = modelOf(id);
      if (urn) modelStore.close(urn);
    },
    [modelStore],
  );

  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((message: string) => {
    setAnnouncement((current) =>
      current === message ? `${message} ` : message,
    );
  }, []);

  const setCollapsed = useCallback((id: PaneId, collapsed: boolean) => {
    dispatch({ type: 'setCollapsed', id, collapsed });
  }, []);

  const focusTreeInput = useCallback(() => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('#document-panel input')?.focus();
    });
  }, []);

  const toggleTree = useCallback(() => {
    if (modeRef.current === 'stacked') {
      if (!home) setOverlayTreeOpen((open) => !open);
      focusTreeInput();
      return;
    }
    const collapsed = model.collapsed.includes('tree');
    dispatch({ type: 'setCollapsed', id: 'tree', collapsed: !collapsed });
    controller.current?.openPane('tree');
    if (collapsed) focusTreeInput();
  }, [home, model.collapsed, focusTreeInput]);

  const closePane = useCallback((id: PaneId) => {
    if (!paneById(id).closable) return;
    dispatch({ type: 'dismiss', id, dismissed: true });
    controller.current?.closePane(id);
  }, []);

  const treeControl = useMemo(
    () => ({
      reveal: () => {
        if (modeRef.current === 'stacked') {
          setOverlayTreeOpen(true);
        } else {
          setCollapsed('tree', false);
          controller.current?.openPane('tree');
        }
        focusTreeTarget();
      },
    }),
    [setCollapsed],
  );

  const paneTitle = useCallback(
    (id: PanelId): PaneTitle =>
      titles[id] ?? {
        label: paneKind(id) ? definitionOf(id).title : id,
        tooltip: '',
      },
    [titles],
  );

  const api = useMemo<LayoutApi>(
    () => ({
      mode,
      openPanes,
      isOpen: (id) => openPanes.includes(id),
      isCollapsed: (id) => model.collapsed.includes(id),
      setCollapsed: (id, collapsed) => {
        setCollapsed(id, collapsed);
        announce(
          `${paneById(id).title} ${collapsed ? 'collapsed' : 'expanded'}`,
        );
      },
      togglePane: (id) => {
        const urn = modelOf(id);
        if (urn) {
          modelStore.close(urn);
          return;
        }
        if (!isPaneId(id) || !paneById(id).closable) return;
        if (openPanes.includes(id)) {
          closePane(id);
          return;
        }
        dispatch({ type: 'dismiss', id, dismissed: false });
        controller.current?.openPane(id);
      },
      movePane: (id, target) => {
        const kind = paneKind(id);
        if (kind) setCollapsed(kind, false);
        controller.current?.movePane(id, target);
        const message = MOVE_MESSAGES[target];
        if (message) announce(`${paneTitle(id).label} ${message}`);
        requestAnimationFrame(() => controller.current?.focusPane(id));
      },
      resetLayout: () => {
        dispatch({ type: 'reset', height: window.innerHeight });
        controller.current?.reset(TREE_WIDTH_DEFAULT);
        announce('Layout reset');
        requestAnimationFrame(() => controller.current?.focusPane('viewer'));
      },
      focusPane: (id) => {
        if (id === 'tree') {
          treeControl.reveal();
          return;
        }
        controller.current?.focusPane(id);
      },
      resizeSignal: (id) => signals[id] ?? 0,
      location: (id) => controller.current?.location(id) ?? null,
      closeTreeOverlay,
      paneTitle,
    }),
    [
      announce,
      mode,
      openPanes,
      model.collapsed,
      setCollapsed,
      treeControl,
      signals,
      closeTreeOverlay,
      paneTitle,
      modelStore,
      closePane,
    ],
  );

  const modelRef = useRef(model);
  modelRef.current = model;
  useEffect(() => {
    if (!import.meta.env.DEV || !isMockViewer()) return;
    const target = window as unknown as Record<string, unknown>;
    target.__bshLayout = {
      movePane: api.movePane,
      togglePane: api.togglePane,
      setCollapsed: api.setCollapsed,
      resetLayout: api.resetLayout,
      openPanes: () => [...api.openPanes],
      location: api.location,
      mode: () => api.mode,
      read: () => modelRef.current,
      models: () => modelStore.getState(),
      activateModel: modelStore.activate,
      closeModel: modelStore.close,
    };
    return () => {
      delete target.__bshLayout;
    };
  }, [api, modelStore]);

  const renderPane = useCallback((id: PanelId) => {
    const parsed = parsePanelId(id);
    if (!parsed) return null;
    const pane = paneById(parsed.kind);
    if (parsed.instance && pane.instances) {
      const Instance = pane.instances.component;
      return <Instance instance={parsed.instance} />;
    }
    const Component = pane.component;
    return Component ? <Component /> : null;
  }, []);

  const wanted = new Set(instances);
  const mounted = attached.filter((id) => {
    const parsed = parsePanelId(id);
    if (!parsed) return false;
    if (parsed.instance) return wanted.has(id);
    return (
      openPanes.includes(parsed.kind) ||
      id === 'tree' ||
      (stacked && companions.includes(parsed.kind))
    );
  });

  return (
    <OpenModelsContext.Provider value={modelStore}>
      <LayoutContext.Provider value={api}>
        <MainContentContext.Provider value={main}>
          <TreeControlContext.Provider value={treeControl}>
            <ViewerProvider active={models.active}>
              <ModelRouteSync />
              <TopBar
                treeOpen={treeOpen}
                onToggleTree={toggleTree}
                toggleRef={toggleRef}
                actions={<LayoutMenu />}
              />
              {stacked ? (
                <StackedLayout
                  hosts={hosts}
                  open={companions}
                  titles={titles}
                  models={models}
                  onSelectModel={modelStore.activate}
                  onCloseModel={modelStore.close}
                  onAttach={onAttach}
                  treeOpen={overlayOpen}
                  onCloseTree={closeTree}
                />
              ) : (
                <div className="app-body app-body--dock">
                  <Suspense
                    fallback={
                      <p className="app-loading" role="status">
                        Loading layout
                      </p>
                    }
                  >
                    <DockLayout
                      hosts={hosts}
                      dock={model.dock}
                      treeWidth={model.treeWidth}
                      collapsed={model.collapsed}
                      titles={titles}
                      instances={instances}
                      activeInstance={activeInstance}
                      companions={companions}
                      onAttach={onAttach}
                      onMoved={bump}
                      onChange={onDockChange}
                      onController={onController}
                      onActivateInstance={onActivateInstance}
                      onCloseInstance={onCloseInstance}
                      onClosePane={closePane}
                      headerActions={({ pane }) => <PaneActions pane={pane} />}
                    />
                  </Suspense>
                </div>
              )}
              <PaneHosts hosts={hosts} panes={mounted} render={renderPane} />
              <div
                className="visually-hidden layout-announcer"
                role="status"
                aria-live="polite"
              >
                {announcement}
              </div>
            </ViewerProvider>
          </TreeControlContext.Provider>
        </MainContentContext.Provider>
      </LayoutContext.Provider>
    </OpenModelsContext.Provider>
  );
}
