import { lazy, type ReactNode, Suspense } from 'react';
import { useSession } from '../api/hooks.js';
import { Landing } from './Landing.js';
import { SessionBanner } from './SessionBanner.js';
import { TopBar } from './TopBar.js';

const LayoutProvider = lazy(() =>
  import('../layout/LayoutProvider.js').then((module) => ({
    default: module.LayoutProvider,
  })),
);

function ShellMessage() {
  return (
    <>
      <TopBar />
      <div className="app-body">
        <main id="main" className="app-main" tabIndex={-1}>
          <p className="app-loading" role="status">
            Loading
          </p>
        </main>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const signedIn = Boolean(session.data);

  return (
    <div className="app-shell" data-signed-in={signedIn}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {session.isPending ? (
        <ShellMessage />
      ) : signedIn ? (
        <>
          <SessionBanner />
          <Suspense fallback={<ShellMessage />}>
            <LayoutProvider main={children} />
          </Suspense>
        </>
      ) : (
        <>
          <TopBar />
          <div className="app-body">
            <main id="main" className="app-main" tabIndex={-1}>
              <Landing />
            </main>
          </div>
        </>
      )}
    </div>
  );
}
