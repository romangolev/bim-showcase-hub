import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { type ModelContext, parseModelContext } from '../api/modelContext.js';
import { AppShell } from '../components/AppShell.js';
import { EmptyState } from '../components/EmptyState.js';
import { NotFound } from '../components/NotFound.js';

const rootRoute = createRootRoute({
  notFoundComponent: NotFound,
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
  validateSearch: (
    search: Record<string, unknown>,
  ): ModelContext & { view?: string } => {
    const context = parseModelContext(search);
    return typeof search.view === 'string' && search.view
      ? { ...context, view: search.view }
      : context;
  },
  component: () => null,
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
