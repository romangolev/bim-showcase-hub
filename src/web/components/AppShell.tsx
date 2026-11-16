import { useRouterState } from '@tanstack/react-router';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSession } from '../api/hooks.js';
import { Landing } from './Landing.js';
import { TopBar } from './TopBar.js';
import { TreePanel } from './TreePanel.js';
import { useMediaQuery } from './useMediaQuery.js';

export const OVERLAY_QUERY = '(max-width: 999px)';

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const overlay = useMediaQuery(OVERLAY_QUERY);
  const [treeOpen, setTreeOpen] = useState(!overlay);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [seenOverlay, setSeenOverlay] = useState(overlay);
  const signedIn = Boolean(session.data);
  const onModel = useRouterState({
    select: (state) => state.location.pathname.startsWith('/model/'),
  });
  if (seenOverlay !== overlay) {
    setSeenOverlay(overlay);
    setTreeOpen(!overlay);
  }
  const overlayOpen = overlay && treeOpen;

  const closeTree = useCallback(() => {
    setTreeOpen(false);
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

  const toggleTree = () => {
    const next = !treeOpen;
    setTreeOpen(next);
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
            children
          ) : (
            <Landing />
          )}
        </main>
      </div>
    </div>
  );
}
