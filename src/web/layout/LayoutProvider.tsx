import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TopBar } from '../components/TopBar.js';
import { TreeControlContext } from '../components/TreeControl.js';
import { useMediaQuery } from '../components/useMediaQuery.js';
import { ViewerProvider } from '../viewer/index.js';
import { ClassicLayout } from './ClassicLayout.js';
import {
  type LayoutApi,
  LayoutContext,
  MainContentContext,
} from './layoutContext.js';
import { PANE_IDS, type PaneId, paneById } from './paneRegistry.js';
import { createHostStore, PaneHosts } from './ViewerHost.js';

export const OVERLAY_QUERY = '(max-width: 999px)';
export const DASHBOARD_STORAGE_KEY = 'bsh.dashboard.collapsed';
export const SUMMARY_STORAGE_KEY = 'bsh.summary.collapsed';
export const DASHBOARD_AUTO_COLLAPSE_HEIGHT = 900;

function readFlag(key: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    return null;
  }
  return null;
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    return;
  }
}

const COLLAPSE_KEYS: Partial<Record<PaneId, string>> = {
  summary: SUMMARY_STORAGE_KEY,
  dashboard: DASHBOARD_STORAGE_KEY,
};

function initialCollapsed(): PaneId[] {
  const collapsed: PaneId[] = [];
  if (readFlag(SUMMARY_STORAGE_KEY) === true) collapsed.push('summary');
  const dashboard = readFlag(DASHBOARD_STORAGE_KEY);
  if (
    dashboard === true ||
    (dashboard === null && window.innerHeight < DASHBOARD_AUTO_COLLAPSE_HEIGHT)
  ) {
    collapsed.push('dashboard');
  }
  return collapsed;
}

export interface LayoutProviderProps {
  main: ReactNode;
}

export function LayoutProvider({ main }: LayoutProviderProps) {
  const overlay = useMediaQuery(OVERLAY_QUERY);
  const [hosts] = useState(() => createHostStore<PaneId>());
  const [attached, setAttached] = useState<readonly PaneId[]>([]);
  const [signals, setSignals] = useState<Partial<Record<PaneId, number>>>({});
  const [collapsed, setCollapsedList] = useState(initialCollapsed);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [overlayTreeOpen, setOverlayTreeOpen] = useState(false);
  const [seenOverlay, setSeenOverlay] = useState(overlay);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  if (seenOverlay !== overlay) {
    setSeenOverlay(overlay);
    setOverlayTreeOpen(false);
  }
  const treeOpen = overlay ? overlayTreeOpen : desktopOpen;
  const overlayOpen = overlay && overlayTreeOpen;
  const previousOverlay = useRef(overlay);

  useLayoutEffect(() => {
    const wasOverlay = previousOverlay.current;
    previousOverlay.current = overlay;
    if (wasOverlay || !overlay) return;
    const panel = document.getElementById('document-panel');
    if (panel?.contains(document.activeElement)) {
      toggleRef.current?.focus();
    }
  }, [overlay]);

  const closeTree = useCallback(() => {
    setOverlayTreeOpen(false);
    toggleRef.current?.focus();
  }, []);

  const closeTreeOverlay = useCallback(() => {
    if (overlayRef.current) closeTree();
  }, [closeTree]);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTree();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlayOpen, closeTree]);

  const onAttach = useCallback((id: PaneId) => {
    setAttached((list) => (list.includes(id) ? list : [...list, id]));
    setSignals((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }, []);

  const setCollapsed = useCallback((id: PaneId, next: boolean) => {
    setCollapsedList((list) => {
      const without = list.filter((item) => item !== id);
      return next ? [...without, id] : without;
    });
    const key = COLLAPSE_KEYS[id];
    if (key) writeFlag(key, next);
  }, []);

  const toggleTree = useCallback(() => {
    if (overlayRef.current) {
      setOverlayTreeOpen((open) => {
        if (!open) {
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>('#document-panel input')
              ?.focus();
          });
        }
        return !open;
      });
    } else {
      setDesktopOpen((open) => !open);
    }
  }, []);

  const treeControl = useMemo(
    () => ({
      reveal: () => {
        if (overlayRef.current) {
          setOverlayTreeOpen(true);
        } else {
          setDesktopOpen(true);
        }
        requestAnimationFrame(() => {
          const target =
            document.querySelector<HTMLElement>(
              '#document-panel [aria-selected="true"]',
            ) ?? document.querySelector<HTMLElement>('#document-panel input');
          target?.focus();
          target?.scrollIntoView({ block: 'nearest' });
        });
      },
    }),
    [],
  );

  const api = useMemo<LayoutApi>(
    () => ({
      mode: 'stacked',
      openPanes: PANE_IDS,
      isOpen: () => true,
      isCollapsed: (id) => collapsed.includes(id),
      setCollapsed,
      togglePane: (id) => {
        if (id === 'tree') toggleTree();
      },
      movePane: () => undefined,
      resetLayout: () => undefined,
      focusPane: (id) => {
        if (id === 'tree') treeControl.reveal();
      },
      resizeSignal: (id) => signals[id] ?? 0,
      closeTreeOverlay,
    }),
    [
      collapsed,
      setCollapsed,
      toggleTree,
      treeControl,
      signals,
      closeTreeOverlay,
    ],
  );

  const renderPane = useCallback((id: PaneId) => {
    const Component = paneById(id).component;
    return <Component />;
  }, []);

  return (
    <LayoutContext.Provider value={api}>
      <MainContentContext.Provider value={main}>
        <TreeControlContext.Provider value={treeControl}>
          <ViewerProvider>
            <TopBar
              treeOpen={treeOpen}
              onToggleTree={toggleTree}
              toggleRef={toggleRef}
            />
            <ClassicLayout
              hosts={hosts}
              onAttach={onAttach}
              treeOpen={treeOpen}
              overlayOpen={overlayOpen}
              onCloseTree={closeTree}
              summaryCollapsed={collapsed.includes('summary')}
            />
            <PaneHosts hosts={hosts} panes={attached} render={renderPane} />
          </ViewerProvider>
        </TreeControlContext.Provider>
      </MainContentContext.Provider>
    </LayoutContext.Provider>
  );
}
