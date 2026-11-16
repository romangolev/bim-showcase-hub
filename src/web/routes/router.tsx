import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { type ModelContext, parseModelContext } from '../api/modelContext.js';
import { useModelContext } from '../api/useModelContext.js';
import { AppShell } from '../components/AppShell.js';
import { EmptyState } from '../components/EmptyState.js';
import { NotFound } from '../components/NotFound.js';

const ModelPage = lazy(() =>
  import('./ModelPage.js').then((module) => ({ default: module.ModelPage })),
);

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
  validateSearch: (search: Record<string, unknown>): ModelContext =>
    parseModelContext(search),
  component: function ModelRoute() {
    const { urn } = modelRoute.useParams();
    const search = modelRoute.useSearch();
    const context = useModelContext(urn, search);
    return (
      <Suspense
        fallback={
          <p className="app-loading" role="status">
            Loading model
          </p>
        }
      >
        <ModelPage
          urn={urn}
          file={context.file}
          version={context.v}
          crumbs={context.crumbs}
        />
      </Suspense>
    );
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
