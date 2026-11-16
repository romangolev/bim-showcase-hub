import { useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useSession } from '../api/hooks.js';
import { Landing } from './Landing.js';
import { TopBar } from './TopBar.js';
import { TreePanel } from './TreePanel.js';

const OVERLAY_BREAKPOINT = 1000;

function isOverlayViewport() {
  return (
    typeof window !== 'undefined' && window.innerWidth < OVERLAY_BREAKPOINT
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const [treeOpen, setTreeOpen] = useState(() => !isOverlayViewport());
  const signedIn = Boolean(session.data);
  const onModel = useRouterState({
    select: (state) => state.location.pathname.startsWith('/model/'),
  });

  useEffect(() => {
    if (!treeOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOverlayViewport()) {
        setTreeOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [treeOpen]);

  return (
    <div className="app-shell" data-signed-in={signedIn}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar treeOpen={treeOpen} onToggleTree={() => setTreeOpen((v) => !v)} />
      <div className="app-body">
        {signedIn ? (
          <>
            <TreePanel
              open={treeOpen}
              onNavigate={() => {
                if (isOverlayViewport()) {
                  setTreeOpen(false);
                }
              }}
            />
            <button
              type="button"
              className="tree-backdrop"
              aria-label="Close document tree"
              tabIndex={-1}
              hidden={!treeOpen}
              onClick={() => setTreeOpen(false)}
            />
          </>
        ) : null}
        <main
          id="main"
          className="app-main"
          tabIndex={-1}
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
