import { createMemoryHistory } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';
import {
  DASHBOARD_STORAGE_KEY,
  SUMMARY_STORAGE_KEY,
} from './LayoutProvider.js';

function renderModel(path = '/model/abc123') {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  render(<App appRouter={appRouter} client={createTestClient()} />);
}

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  mockMatchMedia(1440);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('model layout', () => {
  it('renders the viewer, summary and dashboard panes around main', async () => {
    renderModel();
    const viewer = await screen.findByRole('region', { name: 'Viewer' });
    expect(screen.getByRole('main')).toContainElement(viewer);
    expect(
      screen.getByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.model-toolbar')).toBeNull();
  });

  it('puts the paint and export tools inside the viewer toolbar', async () => {
    renderModel();
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Viewer toolbar',
    });
    expect(
      within(toolbar).getByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: 'Paint selection' }),
    ).toBeInTheDocument();
  });

  it('collapses the summary and the dashboard independently and remembers both', async () => {
    renderModel();
    const summary = await screen.findByRole('button', {
      name: 'Collapse Model summary',
    });
    fireEvent.click(summary);
    expect(
      screen.getByRole('button', { name: 'Expand Model summary' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(SUMMARY_STORAGE_KEY)).toBe('1');
    expect(window.localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(window.localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBe('1');
  });

  it('starts the dashboard collapsed on short windows without a stored choice', async () => {
    vi.stubGlobal('innerHeight', 800);
    renderModel();
    expect(
      await screen.findByRole('button', { name: 'Expand' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the route content in main on other routes', async () => {
    renderModel('/');
    const heading = await screen.findByRole('heading', {
      name: 'Pick a model to explore',
    });
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(screen.queryByRole('region', { name: 'Viewer' })).toBeNull();
  });
});
