import { createMemoryHistory } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StrictMode } from 'react';
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
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import type { MoveTarget } from './layoutContext.js';
import {
  LAYOUT_KEY,
  type LayoutModel,
  LEGACY_KEYS,
  parseLayout,
} from './layoutState.js';
import type { PaneId } from './paneRegistry.js';

interface LayoutHandle {
  movePane: (id: PaneId, target: MoveTarget) => void;
  togglePane: (id: PaneId) => void;
  setCollapsed: (id: PaneId, collapsed: boolean) => void;
  resetLayout: () => void;
  openPanes: () => PaneId[];
  location: (id: string) => string | null;
  read: () => LayoutModel;
}

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let storage: Storage;
let media: ReturnType<typeof mockMatchMedia>;

function renderPath(path = '/model/abc123') {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return {
    appRouter,
    ...render(<App appRouter={appRouter} client={createTestClient()} />),
  };
}

function handle(): LayoutHandle {
  const value = (window as unknown as { __bshLayout?: LayoutHandle })
    .__bshLayout;
  if (!value) throw new Error('layout handle missing');
  return value;
}

function saved(): LayoutModel | null {
  return parseLayout(storage.getItem(LAYOUT_KEY));
}

async function dockReady() {
  await waitFor(() =>
    expect(document.querySelector('.dv-dockview')).not.toBeNull(),
  );
  await screen.findByRole('complementary', { name: 'Documents' });
}

beforeEach(() => {
  stubLayout();
  storage = installMemoryStorage();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  media = mockMatchMedia(1440);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dock layout', () => {
  it('builds the default layout and saves it under the versioned key', async () => {
    renderPath();
    await dockReady();
    const viewer = await screen.findByRole('region', { name: 'Model viewer' });
    expect(screen.getByRole('main')).toContainElement(viewer);
    expect(
      screen.getByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('region', { name: 'Dashboard' })[0],
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(Object.keys(saved()?.dock?.panels ?? {}).sort()).toEqual([
        'dashboard',
        'summary',
        'tree',
        'viewer:abc123',
      ]),
    );
    expect(JSON.parse(storage.getItem(LAYOUT_KEY) ?? '{}').version).toBe(2);
  });

  it('puts the paint and export tools inside the viewer toolbar', async () => {
    renderPath();
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Viewer toolbar',
    });
    expect(
      await within(toolbar).findByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
  });

  it('collapses panes from their header and remembers it', async () => {
    renderPath();
    await dockReady();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Collapse Model summary' }),
    );
    expect(
      screen.getAllByRole('button', { name: 'Expand Model summary' })[0],
    ).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() =>
      expect(saved()?.collapsed).toEqual(['dashboard', 'summary']),
    );
  });

  it('opens the dashboard collapsed next to the first model', async () => {
    renderPath();
    await dockReady();
    expect(
      await screen.findByRole('button', { name: 'Expand Dashboard' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('restores a saved layout and keeps closed panes closed', async () => {
    const first = renderPath();
    await dockReady();
    act(() => handle().togglePane('dashboard'));
    await waitFor(() =>
      expect(Object.keys(saved()?.dock?.panels ?? {})).not.toContain(
        'dashboard',
      ),
    );
    first.unmount();
    renderPath();
    await dockReady();
    await screen.findByRole('region', { name: 'Model viewer' });
    expect(
      screen.queryByRole('combobox', { name: 'Group elements by' }),
    ).toBeNull();
    expect(handle().openPanes()).not.toContain('dashboard');
  });

  it('starts with Documents alone and names each model tab after its file', async () => {
    const { appRouter } = renderPath('/');
    await dockReady();
    await waitFor(() => expect(handle().openPanes()).toEqual(['tree']));
    expect(screen.queryByRole('tab', { name: 'Viewer' })).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Pick a model to explore' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Select a model version to open it in the viewer/),
    ).toBeInTheDocument();

    await act(() =>
      appRouter.navigate({
        to: '/model/$urn',
        params: { urn: 'abc123' },
        search: {
          file: 'FILI_20170810_01.nwd',
          v: 'v1',
          crumbs: ['Hub', 'Docs'],
        },
      }),
    );
    const tab = await screen.findByRole('tab', {
      name: 'FILI_20170810_01.nwd · v1',
    });
    expect(tab.querySelector('[title]')).toHaveAttribute(
      'title',
      'Hub / Docs / FILI_20170810_01.nwd · v1\nabc123',
    );
    expect(screen.queryByRole('tab', { name: 'Viewer' })).toBeNull();
    await waitFor(() =>
      expect(saved()?.dock?.panels['viewer:abc123']).toMatchObject({
        title: 'FILI_20170810_01.nwd · v1',
      }),
    );
  });

  it('opens the viewer and its companions next to a saved Documents-only layout', async () => {
    storage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        version: 2,
        layout: {
          collapsed: [],
          treeWidth: 320,
          dock: {
            grid: {
              root: {
                type: 'branch',
                size: 800,
                data: [
                  {
                    type: 'leaf',
                    size: 800,
                    data: { id: '1', views: ['tree'], activeView: 'tree' },
                  },
                ],
              },
              width: 1440,
              height: 800,
              orientation: 'HORIZONTAL',
            },
            panels: {
              tree: {
                id: 'tree',
                contentComponent: 'pane',
                title: 'Documents',
              },
            },
          },
        },
      }),
    );
    renderPath();
    await dockReady();
    expect(
      await screen.findByRole('region', { name: 'Model viewer' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(handle().openPanes().sort()).toEqual([
        'dashboard',
        'summary',
        'tree',
        'viewer',
      ]),
    );
  });

  it('imports the old keys on first run and deletes them', async () => {
    storage.setItem(LEGACY_KEYS.summary, '1');
    storage.setItem(LEGACY_KEYS.dashboard, '1');
    storage.setItem(LEGACY_KEYS.treeWidth, '400');
    renderPath();
    await dockReady();
    expect(storage.getItem(LEGACY_KEYS.summary)).toBeNull();
    expect(storage.getItem(LEGACY_KEYS.dashboard)).toBeNull();
    expect(storage.getItem(LEGACY_KEYS.treeWidth)).toBeNull();
    expect(saved()?.collapsed.sort()).toEqual(['dashboard', 'summary']);
    expect(saved()?.treeWidth).toBe(400);
  });

  it('never destroys or reloads the viewer across moves and the breakpoint switch', async () => {
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
    const load = vi.spyOn(MockViewerAdapter.prototype, 'load');
    const resize = vi.spyOn(MockViewerAdapter.prototype, 'resize');
    renderPath();
    await dockReady();
    const scene = await screen.findByLabelText('Mock building model');
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    resize.mockClear();

    act(() => handle().movePane('viewer', 'right'));
    expect(scene.isConnected).toBe(true);
    expect(resize).toHaveBeenCalled();

    act(() => handle().movePane('viewer', 'float'));
    expect(handle().location('viewer')).toBe('floating');
    expect(scene.isConnected).toBe(true);

    act(() => handle().setCollapsed('viewer', true));
    act(() => handle().setCollapsed('viewer', false));

    act(() => media.setWidth(800));
    await waitFor(() =>
      expect(document.querySelector('.dv-dockview')).toBeNull(),
    );
    expect(screen.getByLabelText('Mock building model')).toBe(scene);
    expect(scene.isConnected).toBe(true);

    act(() => media.setWidth(1440));
    await dockReady();
    expect(screen.getByLabelText('Mock building model')).toBe(scene);
    expect(handle().location('viewer')).toBe('floating');

    act(() => handle().resetLayout());
    expect(screen.getByLabelText('Mock building model')).toBe(scene);

    expect(destroy).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('opens the Models pane on demand and lists the models', async () => {
    renderPath();
    await dockReady();
    expect(handle().openPanes()).not.toContain('models');
    act(() => handle().togglePane('models'));
    await screen.findByRole('tab', { name: 'Models' });
    expect(await screen.findByText(/of 6 models/)).toBeInTheDocument();
    act(() => handle().togglePane('models'));
    await waitFor(() => expect(handle().openPanes()).not.toContain('models'));
  });

  it('restores a floating pane after a reload and never pops out', async () => {
    const first = renderPath();
    await dockReady();
    act(() => handle().movePane('summary', 'float'));
    await waitFor(() =>
      expect(saved()?.dock?.floatingGroups?.[0]?.data.views).toEqual([
        'summary',
      ]),
    );
    expect(JSON.stringify(saved()?.dock)).not.toContain('popout');
    first.unmount();
    renderPath();
    await dockReady();
    await waitFor(() => expect(handle().location('summary')).toBe('floating'));
    expect(document.querySelector('.dv-resize-container')).not.toBeNull();
  });

  it('resets to the default layout', async () => {
    renderPath();
    await dockReady();
    act(() => handle().togglePane('summary'));
    act(() => handle().movePane('dashboard', 'left'));
    act(() => handle().resetLayout());
    await waitFor(() =>
      expect(handle().openPanes().sort()).toEqual([
        'dashboard',
        'summary',
        'tree',
        'viewer',
      ]),
    );
    expect(handle().location('dashboard')).toBe('grid');
    expect(handle().location('viewer:abc123')).toBe('grid');
  });

  it('keeps the dock controller alive under StrictMode', async () => {
    const appRouter = createAppRouter(
      createMemoryHistory({ initialEntries: ['/model/abc123'] }),
    );
    render(
      <StrictMode>
        <App appRouter={appRouter} client={createTestClient()} />
      </StrictMode>,
    );
    await dockReady();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Collapse document tree' }),
    );
    expect(
      screen.getByRole('button', { name: 'Expand document tree' }),
    ).toHaveAttribute('aria-expanded', 'false');
    act(() => handle().movePane('summary', 'float'));
    expect(handle().location('summary')).toBe('floating');
    fireEvent.click(screen.getByRole('button', { name: 'Expand Dashboard' }));
    await waitFor(() => expect(saved()?.collapsed).not.toContain('dashboard'));
  });

  it('shows the route content in main on other routes', async () => {
    renderPath('/');
    const heading = await screen.findByRole('heading', {
      name: 'Pick a model to explore',
    });
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(screen.queryByRole('region', { name: 'Model viewer' })).toBeNull();
  });
});
