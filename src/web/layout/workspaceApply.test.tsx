import { createMemoryHistory } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
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
import { LOCK_KEY } from './LayoutProvider.js';
import { encodeShare } from './layoutShare.js';
import {
  defaultModel,
  LAYOUT_KEY,
  type LayoutModel,
  parseLayout,
  type SerializedDock,
} from './layoutState.js';
import { PANE_APPEARANCE_KEY } from './paneAppearance.js';
import type { PaneId } from './paneRegistry.js';
import type { WorkspaceApi } from './workspaces.js';
import { serializeWorkspace, WORKSPACES_KEY } from './workspaces.js';

interface LayoutHandle {
  togglePane: (id: PaneId) => void;
  openPanes: () => PaneId[];
  read: () => LayoutModel;
  workspaces: () => WorkspaceApi;
}

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let storage: Storage;

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

function savedLayout(): LayoutModel | null {
  return parseLayout(storage.getItem(LAYOUT_KEY));
}

async function dockReady() {
  await waitFor(() =>
    expect(document.querySelector('.dv-dockview')).not.toBeNull(),
  );
  await screen.findByRole('complementary', { name: 'Documents' });
}

function announcer() {
  return document.querySelector('.layout-announcer');
}

function sharedDock(): SerializedDock {
  return {
    grid: {
      root: {
        type: 'branch',
        size: 900,
        data: [
          {
            type: 'leaf',
            size: 320,
            data: { id: '1', views: ['tree'], activeView: 'tree' },
          },
          {
            type: 'branch',
            size: 580,
            data: [
              {
                type: 'leaf',
                size: 360,
                data: {
                  id: '2',
                  views: ['viewer:abc123'],
                  activeView: 'viewer:abc123',
                },
              },
              {
                type: 'leaf',
                size: 220,
                data: {
                  id: '3',
                  views: ['summary'],
                  activeView: 'summary',
                },
              },
            ],
          },
        ],
      },
      width: 1440,
      height: 844,
      orientation: 'HORIZONTAL',
    },
    panels: {
      tree: { id: 'tree', contentComponent: 'pane', title: 'Documents' },
      'viewer:abc123': {
        id: 'viewer:abc123',
        contentComponent: 'pane',
        title: 'Model',
      },
      summary: { id: 'summary', contentComponent: 'pane', title: 'Summary' },
    },
  };
}

beforeEach(() => {
  stubLayout();
  storage = installMemoryStorage();
  window.location.hash = '';
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  mockMatchMedia(1440);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('named workspaces', () => {
  it('applies a built-in arrangement without remounting the viewer', async () => {
    renderPath();
    await dockReady();
    const scene = await screen.findByLabelText('Mock building model');
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');

    act(() => handle().workspaces().applyPreset('coordination'));
    await waitFor(() =>
      expect(announcer()).toHaveTextContent('Coordination applied'),
    );
    expect(screen.getByLabelText('Mock building model')).toBe(scene);
    expect(scene.isConnected).toBe(true);
    expect(destroy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(savedLayout()?.dock?.panels).not.toHaveProperty('dashboard'),
    );
    expect(savedLayout()?.collapsed).toContain('tree');
    expect(savedLayout()?.dismissed).toContain('dashboard');
  });

  it('reverts an applied workspace in one step', async () => {
    renderPath();
    await dockReady();
    await screen.findByLabelText('Mock building model');
    act(() => handle().workspaces().applyPreset('coordination'));
    await waitFor(() =>
      expect(announcer()).toHaveTextContent('Coordination applied'),
    );
    act(() => handle().workspaces().revert());
    await waitFor(() =>
      expect(announcer()).toHaveTextContent('Workspace reverted'),
    );
    await waitFor(() =>
      expect(savedLayout()?.dock?.panels).toHaveProperty('dashboard'),
    );
    expect(savedLayout()?.dismissed).toEqual([]);
    expect(handle().workspaces().canRevert).toBe(false);
  });

  it('presents the viewer for the Present preset', async () => {
    renderPath();
    await dockReady();
    await screen.findByLabelText('Mock building model');
    act(() => handle().workspaces().applyPreset('present'));
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-presenting'),
    );
    act(() => handle().workspaces().applyPreset('present'));
    await waitFor(() =>
      expect(document.documentElement).not.toHaveAttribute('data-presenting'),
    );
  });

  it('saves the current arrangement and applies it again', async () => {
    renderPath();
    await dockReady();
    await screen.findByLabelText('Mock building model');
    act(() => handle().togglePane('dashboard'));
    await waitFor(() =>
      expect(savedLayout()?.dock?.panels).not.toHaveProperty('dashboard'),
    );

    let id = '';
    await act(async () => {
      const workspace = handle().workspaces().save('House');
      expect(workspace).not.toBeNull();
      id = workspace?.id ?? '';
    });
    const stored = JSON.parse(storage.getItem(WORKSPACES_KEY) ?? '{}');
    expect(stored.version).toBe(1);
    expect(stored.items[0].name).toBe('House');
    expect(id).toBeTruthy();

    act(() => handle().togglePane('dashboard'));
    await waitFor(() => expect(handle().openPanes()).toContain('dashboard'));
    act(() => handle().workspaces().applySaved(id));
    await waitFor(() => expect(announcer()).toHaveTextContent('House applied'));
    await waitFor(() =>
      expect(handle().openPanes()).not.toContain('dashboard'),
    );
  });

  it('imports a workspace from JSON and rejects an older one', async () => {
    renderPath();
    await dockReady();
    await screen.findByLabelText('Mock building model');
    const current = handle().workspaces();
    const older = JSON.stringify({
      kind: 'bsh.workspace',
      version: 0,
      name: 'Old',
      layout: defaultModel(),
    });
    expect(current.importText(older)).toContain('version 0');

    const text = serializeWorkspace({
      name: 'Shared',
      layout: { ...defaultModel(), dock: sharedDock(), collapsed: [] },
      appearances: { summary: { title: 'Key values' } },
    });
    act(() => {
      expect(handle().workspaces().importText(text)).toBeNull();
    });
    await waitFor(() => expect(announcer()).toHaveTextContent('imported'));
    expect(
      await screen.findByRole('tab', { name: 'Key values' }),
    ).toBeInTheDocument();
  });
});

describe('applying while the layout cannot change', () => {
  const shared = () =>
    serializeWorkspace({
      name: 'Shared',
      layout: { ...defaultModel(), dock: sharedDock(), collapsed: [] },
      appearances: { summary: { title: 'Key values' } },
    });

  it('does not rewrite appearances or mark a workspace active while locked', async () => {
    storage.setItem(LOCK_KEY, 'true');
    renderPath();
    await dockReady();
    await screen.findByLabelText('Mock building model');
    expect(handle().workspaces().importText(shared())).toBe(
      'Unlock the layout first',
    );
    act(() => handle().workspaces().applyPreset('coordination'));
    expect(storage.getItem(PANE_APPEARANCE_KEY)).toBeNull();
    expect(handle().workspaces().active).toBeNull();
  });
});

describe('shared layout link', () => {
  it('applies the hash once, clears it and keeps the layout on navigation', async () => {
    const payload = serializeWorkspace({
      name: 'Shared',
      layout: { ...defaultModel(), dock: sharedDock(), collapsed: [] },
      appearances: {},
    });
    window.location.hash = `#layout=${await encodeShare(payload)}`;
    const { appRouter } = renderPath();
    await dockReady();
    await waitFor(() =>
      expect(announcer()).toHaveTextContent('Shared applied'),
    );
    expect(window.location.hash).toBe('');
    expect(handle().read().collapsed).toEqual([]);

    await act(() =>
      appRouter.navigate({
        to: '/model/$urn',
        params: { urn: 'xyz789' },
        search: {},
      }),
    );
    await waitFor(() =>
      expect(savedLayout()?.dock?.panels).toHaveProperty('viewer:xyz789'),
    );
    expect(handle().read().collapsed).toEqual([]);
    expect(announcer()).toHaveTextContent('Shared applied');
  });

  it('says so when the hash payload is unreadable', async () => {
    window.location.hash = '#layout=j%%%';
    renderPath();
    await dockReady();
    await waitFor(() =>
      expect(announcer()).toHaveTextContent('not a readable layout'),
    );
  });
});
