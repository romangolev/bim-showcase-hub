import { createMemoryHistory } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { notifyUnauthorized } from '../api/client.js';
import { resetSessionEnded } from '../api/hooks.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';

function renderApp(path = '/') {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  render(<App appRouter={appRouter} client={createTestClient()} />);
}

function renderShellPending() {
  mockFetch({
    '/api/session': () => new Promise<Response>(() => {}),
    ...treeRoutes,
  });
  renderApp();
}

beforeEach(() => {
  resetSessionEnded();
  stubLayout();
  installMemoryStorage();
  vi.stubGlobal('__MOCK_APS__', true);
  mockFetch({
    '/api/session': { name: 'Ada', picture: null },
    ...treeRoutes,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell loading', () => {
  it('shows skeleton rows while the session loads', async () => {
    renderShellPending();
    expect((await screen.findByRole('status')).textContent).toContain(
      'Loading',
    );
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });
});

describe('AppShell session expiry', () => {
  it('keeps the layout and shows a sign-in banner when any API call reports 401', async () => {
    mockMatchMedia(1440);
    renderApp();
    await screen.findByRole('complementary', { name: 'Documents' });
    act(() => notifyUnauthorized());
    expect(
      await screen.findByRole('button', { name: 'Sign in again' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();
  });

  it('warns shortly before the session ends', async () => {
    mockMatchMedia(1440);
    mockFetch({
      '/api/session': {
        name: 'Ada',
        picture: null,
        expiresInMs: 4 * 60_000,
      },
      ...treeRoutes,
    });
    renderApp();
    expect(
      await screen.findByText('Your session ends in 4 min.'),
    ).toBeInTheDocument();
  });
});

describe('AppShell responsive tree', () => {
  it('starts with Documents as the main pane on wide viewports', async () => {
    mockMatchMedia(1440);
    renderApp();
    const docs = await screen.findByRole('complementary', {
      name: 'Documents',
    });
    expect(docs).toBeVisible();
    expect(screen.getByRole('main')).toContainElement(docs);
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('keeps Documents as the main section on narrow screens without a model', async () => {
    const media = mockMatchMedia(1440);
    renderApp();
    await screen.findByRole('complementary', { name: 'Documents' });
    act(() => media.setWidth(800));
    const docs = await screen.findByRole('complementary', {
      name: 'Documents',
    });
    expect(screen.getByRole('main')).toContainElement(docs);
    expect(document.querySelector('.stack__tree')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Collapse document tree' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses Documents in the dock and keeps the choice across the breakpoint', async () => {
    const media = mockMatchMedia(920);
    renderApp('/model/abc123');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Collapse document tree' }),
    );
    expect(
      screen.getByRole('button', { name: 'Expand document tree' }),
    ).toHaveAttribute('aria-expanded', 'false');

    act(() => media.setWidth(800));
    expect(
      screen.getByRole('button', { name: 'Expand document tree' }),
    ).toHaveAttribute('aria-expanded', 'false');

    act(() => media.setWidth(920));
    expect(
      await screen.findByRole('button', { name: 'Expand document tree' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows Documents as an overlay once a model is open', async () => {
    const media = mockMatchMedia(1440);
    renderApp('/model/abc123');
    await screen.findByRole('complementary', { name: 'Documents' });

    act(() => media.setWidth(800));
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand document tree' }),
    );
    expect(
      await screen.findByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();

    act(() => media.setWidth(1440));
    expect(
      await screen.findByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Collapse document tree' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('makes main inert while the overlay is open and closes on Escape returning focus', async () => {
    mockMatchMedia(800);
    renderApp('/model/abc123');
    const opener = await screen.findByRole('button', {
      name: 'Expand document tree',
    });
    fireEvent.click(opener);
    expect(
      await screen.findByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main').closest('[inert]')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
    expect(
      screen.getByRole('button', { name: 'Expand document tree' }),
    ).toHaveFocus();
  });

  it('closes the overlay from the scrim and returns focus to the opener', async () => {
    mockMatchMedia(800);
    renderApp('/model/abc123');
    const opener = await screen.findByRole('button', {
      name: 'Expand document tree',
    });
    fireEvent.click(opener);
    await screen.findByRole('complementary', { name: 'Documents' });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Close document tree',
        hidden: true,
      }),
    );
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
    expect(
      screen.getByRole('button', { name: 'Expand document tree' }),
    ).toHaveFocus();
  });

  it('keeps Escape inert when the tree is docked', async () => {
    mockMatchMedia(1440);
    renderApp();
    await screen.findByRole('complementary', { name: 'Documents' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.getByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();
  });

  it('moves focus to the toggle when the tree turns into the overlay with focus inside it', async () => {
    const media = mockMatchMedia(920);
    renderApp('/model/abc123');
    const filter = await screen.findByRole('searchbox', {
      name: 'Filter loaded nodes',
    });
    await waitFor(() => expect(filter).toBeEnabled());
    filter.focus();
    expect(filter).toHaveFocus();

    act(() => media.setWidth(800));
    expect(
      screen.getByRole('button', { name: 'Expand document tree' }),
    ).toHaveFocus();
  });

  it('leaves focus alone when the tree turns into the overlay with focus elsewhere', async () => {
    const media = mockMatchMedia(920);
    renderApp('/model/abc123');
    await screen.findByRole('complementary', { name: 'Documents' });
    const main = await screen.findByRole('main');
    main.focus();

    act(() => media.setWidth(800));
    expect(main).toHaveFocus();
  });
});

describe('unknown routes', () => {
  it('renders a not found state inside the shell with a way back', async () => {
    mockMatchMedia(1440);
    renderApp('/nope');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Not found · BIM Showcase Hub');
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Page not found' }),
    );
    expect(
      screen.getByRole('complementary', { name: 'Documents' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to documents' }));
    expect(
      await screen.findByRole('heading', { name: 'Pick a model to explore' }),
    ).toBeInTheDocument();
  });
});
