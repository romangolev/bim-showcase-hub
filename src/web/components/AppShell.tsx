import { useRouterState } from '@tanstack/react-router';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSession, useSessionExpiry } from '../api/hooks.js';
import { Landing } from './Landing.js';
import { TopBar } from './TopBar.js';
import { TreeControlContext } from './TreeControl.js';
import { TreePanel } from './TreePanel.js';
import { useMediaQuery } from './useMediaQuery.js';

export const OVERLAY_QUERY = '(max-width: 999px)';

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  useSessionExpiry();
  const overlay = useMediaQuery(OVERLAY_QUERY);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [overlayTreeOpen, setOverlayTreeOpen] = useState(false);
  const treeOpen = overlay ? overlayTreeOpen : desktopOpen;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [seenOverlay, setSeenOverlay] = useState(overlay);
  const signedIn = Boolean(session.data);
  const onModel = useRouterState({
    select: (state) => state.location.pathname.startsWith('/model/'),
  });
  if (seenOverlay !== overlay) {
    setSeenOverlay(overlay);
    setOverlayTreeOpen(false);
  }
  const overlayOpen = overlay && overlayTreeOpen;
  const previousOverlay = useRef(overlay);

  useLayoutEffect(() => {
    const wasOverlay = previousOverlay.current;
    previousOverlay.current = overlay;
    if (wasOverlay || !overlay) {
      return;
    }
    const panel = document.getElementById('document-panel');
    if (panel?.contains(document.activeElement)) {
      toggleRef.current?.focus();
    }
  }, [overlay]);

  const closeTree = useCallback(() => {
    setOverlayTreeOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!overlayOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTree();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlayOpen, closeTree]);

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

  const toggleTree = () => {
    const next = !treeOpen;
    if (overlay) {
      setOverlayTreeOpen(next);
    } else {
      setDesktopOpen(next);
    }
    if (next && overlay) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('#document-panel input')?.focus();
      });
    }
  };

  return (
    <div className="app-shell" data-signed-in={signedIn}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar
        treeOpen={treeOpen}
        onToggleTree={toggleTree}
        toggleRef={toggleRef}
      />
      <div className="app-body">
        {signedIn ? (
          <>
            <TreePanel
              open={treeOpen}
              onNavigate={() => {
                if (overlay) {
                  closeTree();
                }
              }}
            />
            <button
              type="button"
              className="tree-backdrop"
              aria-label="Close document tree"
              tabIndex={-1}
              hidden={!overlayOpen}
              onClick={closeTree}
            />
          </>
        ) : null}
        <main
          id="main"
          className="app-main"
          tabIndex={-1}
          inert={overlayOpen}
          data-route={signedIn && onModel ? 'model' : undefined}
        >
          {session.isPending ? (
            <p className="app-loading" role="status">
              Loading
            </p>
          ) : signedIn ? (
            <TreeControlContext.Provider value={treeControl}>
              {children}
            </TreeControlContext.Provider>
          ) : (
            <Landing />
          )}
        </main>
      </div>
    </div>
  );
}
