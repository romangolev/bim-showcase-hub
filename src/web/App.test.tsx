import { createMemoryHistory } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { createAppRouter } from './routes/router.js';
import {
  createTestClient,
  json,
  mockFetch,
  stubLayout,
  treeRoutes,
} from './test/mockApi.js';

function renderApp(path = '/') {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  render(<App appRouter={appRouter} client={createTestClient()} />);
  return appRouter;
}

beforeEach(() => {
  stubLayout();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  it('shows the landing page and sign-in CTA when signed out', async () => {
    mockFetch({ '/api/session': () => json({ error: 'unauthorized' }, 401) });
    renderApp();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Explore your Autodesk models/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Sign in/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('starts the sign-in flow from the auth url', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    mockFetch({
      '/api/session': () => json({ error: 'unauthorized' }, 401),
      '/api/auth/url': { url: 'https://auth.example/login' },
    });
    renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Sign in with Autodesk' }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://auth.example/login'),
    );
  });

  it('shows the tree, user menu and empty state when signed in', async () => {
    mockFetch({
      '/api/session': { name: 'Ada Lovelace', picture: null },
      ...treeRoutes,
    });
    renderApp();

    expect(
      await screen.findByText('Pick a model to explore'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Studio hub')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Explore your Autodesk models/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Ada Lovelace/ }),
    ).toBeInTheDocument();
  });

  it('signs out through the user menu', async () => {
    const fetchMock = mockFetch({
      '/api/session': { name: 'Ada Lovelace', picture: null },
      '/api/auth/signout': () => new Response(null, { status: 204 }),
      ...treeRoutes,
    });
    renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: /Ada Lovelace/ }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Explore your Autodesk models/,
      }),
    ).toBeInTheDocument();
    const signout = fetchMock.mock.calls.find(
      (call) => String(call[0]) === '/api/auth/signout',
    );
    expect(signout?.[1]?.method).toBe('POST');
  });

  it('collapses the tree panel from the top bar', async () => {
    mockFetch({
      '/api/session': { name: 'Ada', picture: null },
      ...treeRoutes,
    });
    renderApp();

    const toggle = await screen.findByRole('button', {
      name: 'Collapse document tree',
    });
    fireEvent.click(toggle);
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand document tree' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates to the model route when a viewable version is selected', async () => {
    mockFetch({
      '/api/session': { name: 'Ada', picture: null },
      ...treeRoutes,
    });
    const appRouter = renderApp();

    for (const name of [
      'Studio hub',
      'Riverside Tower',
      'Project Files',
      'Tower.rvt',
    ]) {
      fireEvent.click(await screen.findByText(name));
    }
    fireEvent.click(
      await screen.findByRole('treeitem', { name: 'v2: Coordination' }),
    );

    await waitFor(() =>
      expect(appRouter.state.location.pathname).toBe('/model/dXJuOmFkc2s'),
    );
    expect(
      await screen.findByRole('region', { name: 'Viewer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
  });
});
