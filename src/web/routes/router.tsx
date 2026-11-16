import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: () => (
    <div data-testid="app-root">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <main>BIM Showcase Hub</main>,
});

const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/model/$urn',
  component: function ModelPage() {
    const { urn } = modelRoute.useParams();
    return <main>Model {urn}</main>;
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
