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
} from 'react';
import { TopBar } from '../components/TopBar.js';
import { TreeControlContext } from '../components/TreeControl.js';
import { useMediaQuery } from '../components/useMediaQuery.js';
import { isMockViewer, ViewerProvider } from '../viewer/index.js';
import { ClassicLayout } from './ClassicLayout.js';
import {
  type DockController,
  type LayoutApi,
  LayoutContext,
  type LayoutMode,
  MainContentContext,
  type MoveTarget,
} from './layoutContext.js';
import {
  type LayoutModel,
  layoutReducer,
  readLayout,
  type SerializedDock,
  writeLayout,
} from './layoutState.js';
import { LayoutMenu, PaneActions } from './PaneMenu.js';
import {
  PANE_IDS,
  type PaneId,
  paneById,
  TREE_WIDTH_DEFAULT,
} from './paneRegistry.js';
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

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initialModel(): LayoutModel {
  const store = storage();
  const height = window.innerHeight;
  if (!store) {
    return layoutReducer(
      { dock: null, collapsed: [], treeWidth: 0 },
      { type: 'reset', height },
    );
  }
  return readLayout(store, height);
}

function openFromDock(dock: SerializedDock | null): PaneId[] {
  if (!dock) return [...PANE_IDS];
  return PANE_IDS.filter((id) => id in dock.panels);
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

export interface LayoutProviderProps {
  main: ReactNode;
}

export function LayoutProvider({ main }: LayoutProviderProps) {
  const stacked = useMediaQuery(STACKED_QUERY);
  const mode: LayoutMode = stacked ? 'stacked' : 'dock';
  const [model, dispatch] = useReducer(layoutReducer, undefined, initialModel);
  const [openPanes, setOpenPanes] = useState<readonly PaneId[]>(() =>
    openFromDock(model.dock),
  );
  const [hosts] = useState(() => createHostStore<PaneId>());
  const [attached, setAttached] = useState<readonly PaneId[]>([]);
  const [signals, setSignals] = useState<Partial<Record<PaneId, number>>>({});
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
  const overlayOpen = stacked && overlayTreeOpen;
  const treeOpen = stacked ? overlayTreeOpen : openPanes.includes('tree');
  const previousMode = useRef(mode);

  useEffect(() => {
    const store = storage();
    if (store) writeLayout(store, model);
  }, [model]);

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

  const bump = useCallback((id: PaneId) => {
    setSignals((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }, []);

  const onAttach = useCallback(
    (id: PaneId) => {
      setAttached((list) => (list.includes(id) ? list : [...list, id]));
      bump(id);
    },
    [bump],
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

  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((message: string) => {
    setAnnouncement((current) =>
      current === message ? `${message}\u00a0` : message,
    );
  }, []);

  const setCollapsed = useCallback((id: PaneId, collapsed: boolean) => {
    dispatch({ type: 'setCollapsed', id, collapsed });
  }, []);

  const toggleTree = useCallback(() => {
    if (modeRef.current === 'stacked') {
      setOverlayTreeOpen((open) => !open);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('#document-panel input')?.focus();
      });
      return;
    }
    if (openPanes.includes('tree')) {
      controller.current?.closePane('tree');
    } else {
      controller.current?.openPane('tree');
    }
  }, [openPanes]);

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
        if (id === 'tree') {
          toggleTree();
          return;
        }
        if (openPanes.includes(id)) controller.current?.closePane(id);
        else controller.current?.openPane(id);
      },
      movePane: (id, target) => {
        setCollapsed(id, false);
        controller.current?.movePane(id, target);
        const message = MOVE_MESSAGES[target];
        if (message) announce(`${paneById(id).title} ${message}`);
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
    }),
    [
      announce,
      mode,
      openPanes,
      model.collapsed,
      setCollapsed,
      toggleTree,
      treeControl,
      signals,
      closeTreeOverlay,
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
    };
    return () => {
      delete target.__bshLayout;
    };
  }, [api]);

  const renderPane = useCallback((id: PaneId) => {
    const Component = paneById(id).component;
    return <Component />;
  }, []);

  const mounted = attached.filter(
    (id) => openPanes.includes(id) || id === 'tree' || id === 'viewer',
  );

  return (
    <LayoutContext.Provider value={api}>
      <MainContentContext.Provider value={main}>
        <TreeControlContext.Provider value={treeControl}>
          <ViewerProvider>
            <TopBar
              treeOpen={treeOpen}
              onToggleTree={toggleTree}
              toggleRef={toggleRef}
              actions={<LayoutMenu />}
            />
            {stacked ? (
              <ClassicLayout
                hosts={hosts}
                onAttach={onAttach}
                treeOpen={overlayTreeOpen}
                overlayOpen={overlayOpen}
                onCloseTree={closeTree}
                summaryCollapsed={model.collapsed.includes('summary')}
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
                    onAttach={onAttach}
                    onMoved={bump}
                    onChange={onDockChange}
                    onController={onController}
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
  );
}
