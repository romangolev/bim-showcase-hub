import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { AppShell } from '../components/AppShell.js';
import { EmptyState } from '../components/EmptyState.js';
import { ModelPage } from './ModelPage.js';

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: EmptyState,
});

const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/model/$urn',
  component: function ModelRoute() {
    const { urn } = modelRoute.useParams();
    return <ModelPage urn={urn} />;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, modelRoute]);

export function createAppRouter(
  history?: Parameters<typeof createRouter>[0]['history'],
) {
  return createRouter({ routeTree, history });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
