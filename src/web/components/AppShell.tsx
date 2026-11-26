import { lazy, type ReactNode, Suspense } from 'react';
import { useSession } from '../api/hooks.js';
import { loadLayoutProvider } from '../layout/preload.js';
import { AppSkeleton } from './AppSkeleton.js';
import { Landing } from './Landing.js';
import { SessionBanner } from './SessionBanner.js';
import { TopBar } from './TopBar.js';

const LayoutProvider = lazy(() =>
  loadLayoutProvider().then((module) => ({
    default: module.LayoutProvider,
  })),
);

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const signedIn = Boolean(session.data);

  return (
    <div className="app-shell" data-signed-in={signedIn}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {session.isPending ? (
        <AppSkeleton />
      ) : signedIn ? (
        <>
          <SessionBanner />
          <Suspense fallback={<AppSkeleton hints />}>
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
