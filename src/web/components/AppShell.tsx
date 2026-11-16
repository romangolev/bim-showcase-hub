import { type ReactNode, useState } from 'react';
import { useSession } from '../api/hooks.js';
import { Landing } from './Landing.js';
import { TopBar } from './TopBar.js';
import { TreePanel } from './TreePanel.js';

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const [treeOpen, setTreeOpen] = useState(true);
  const signedIn = Boolean(session.data);

  return (
    <div className="app-shell" data-signed-in={signedIn}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar treeOpen={treeOpen} onToggleTree={() => setTreeOpen((v) => !v)} />
      <div className="app-body">
        {signedIn ? <TreePanel open={treeOpen} /> : null}
        <main id="main" className="app-main" tabIndex={-1}>
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
