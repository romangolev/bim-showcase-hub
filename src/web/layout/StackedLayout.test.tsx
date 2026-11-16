import { createMemoryHistory } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
import { LAYOUT_KEY, parseLayout } from './layoutState.js';
import { stackedPanes } from './StackedLayout.js';

function renderPath(path: string) {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return render(<App appRouter={appRouter} client={createTestClient()} />);
}

let storage: Storage;

beforeEach(() => {
  stubLayout();
  storage = installMemoryStorage();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('stackedPanes', () => {
  it('stacks main, dashboard and summary on a model route', () => {
    expect(
      stackedPanes(['tree', 'viewer', 'summary', 'dashboard'], true),
    ).toEqual(['viewer', 'dashboard', 'summary']);
  });

  it('shows only main off the model route', () => {
    expect(
      stackedPanes(['tree', 'viewer', 'summary', 'dashboard'], false),
    ).toEqual(['viewer']);
  });

  it('keeps panes closed in the dock closed and never drops the viewer', () => {
    expect(stackedPanes(['tree'], true)).toEqual(['viewer']);
  });
});

describe('stacked layout', () => {
  it('replaces the dock below 876px and keeps the saved dock layout', async () => {
    const media = mockMatchMedia(1440);
    renderPath('/model/abc123');
    await waitFor(() =>
      expect(document.querySelector('.dv-dockview')).not.toBeNull(),
    );
    await waitFor(() =>
      expect(parseLayout(storage.getItem(LAYOUT_KEY))?.dock).not.toBeNull(),
    );
    const before = storage.getItem(LAYOUT_KEY);

    act(() => media.setWidth(800));
    await waitFor(() =>
      expect(document.querySelector('.dv-dockview')).toBeNull(),
    );
    expect(document.querySelector('.stack')).not.toBeNull();
    expect(
      screen.getByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Model viewer' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).toBeNull();
    expect(storage.getItem(LAYOUT_KEY)).toBe(before);
    expect(
      document.querySelectorAll('.stack__column > .pane-slot'),
    ).toHaveLength(3);
  });

  it('uses the panels own collapse toggles in the stack', async () => {
    mockMatchMedia(800);
    renderPath('/model/abc123');
    expect(
      await screen.findByRole('button', { name: 'Collapse Model summary' }),
    ).toHaveClass('bsh-summary__toggle');
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('names the open model above the viewer and keeps the path in the tooltip', async () => {
    mockMatchMedia(800);
    renderPath(
      `/model/abc123?file=Tower.rvt&v=v2&crumbs=${encodeURIComponent(JSON.stringify(['Hub', 'Docs']))}`,
    );
    const strip = await screen.findByRole('tablist', { name: 'Open models' });
    const tab = await within(strip).findByRole('tab', {
      name: 'Tower.rvt · v2',
    });
    expect(tab.parentElement).toHaveAttribute(
      'title',
      'Hub / Docs / Tower.rvt · v2\nabc123',
    );
    expect(strip.nextElementSibling?.getAttribute('data-slot')).toBe(
      'viewer:abc123',
    );
  });

  it('shows no model strip on the index route', async () => {
    mockMatchMedia(800);
    renderPath('/');
    await screen.findByRole('heading', { name: 'Pick a model to explore' });
    expect(screen.queryByRole('tablist', { name: 'Open models' })).toBeNull();
  });

  it('shows only main on the index route', async () => {
    mockMatchMedia(800);
    renderPath('/');
    await screen.findByRole('heading', { name: 'Pick a model to explore' });
    expect(
      document.querySelectorAll('.stack__column > .pane-slot'),
    ).toHaveLength(1);
  });
});
