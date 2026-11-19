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
import { LAYOUT_KEY, type LayoutModel, parseLayout } from './layoutState.js';
import type { PaneId } from './paneRegistry.js';
import type { WorkspaceApi } from './workspaces.js';
import { WORKSPACES_KEY } from './workspaces.js';

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
});
