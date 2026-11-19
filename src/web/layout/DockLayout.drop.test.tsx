import { createMemoryHistory } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { OPEN_MODELS_KEY } from '../api/openModels.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function dragData() {
  const data: Record<string, string> = {};
  return {
    get types() {
      return Object.keys(data);
    },
    getData: (format: string) => data[format] ?? '',
    setData: (format: string, value: string) => {
      data[format] = value;
    },
    effectAllowed: 'none',
    dropEffect: 'none',
  };
}

function storedUrns(): string[] {
  const raw = window.sessionStorage.getItem(OPEN_MODELS_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { models?: { urn?: string }[] };
  return (parsed.models ?? []).flatMap((model) =>
    typeof model.urn === 'string' ? [model.urn] : [],
  );
}

function renderApp() {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: ['/model/abc123'] }),
  );
  render(<App appRouter={appRouter} client={createTestClient()} />);
  return appRouter;
}

async function dockRoot(): Promise<HTMLElement> {
  await waitFor(() =>
    expect(document.querySelector('.dv-dockview')).not.toBeNull(),
  );
  const root = document.querySelector<HTMLElement>('.dock-root');
  if (!root) throw new Error('no dock root');
  return root;
}

async function openVersionRow(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('treeitem', { name: 'Studio hub' }));
  fireEvent.click(
    await screen.findByRole('treeitem', { name: 'Riverside Tower' }),
  );
  fireEvent.click(
    await screen.findByRole('treeitem', { name: 'Project Files' }),
  );
  fireEvent.click(await screen.findByRole('treeitem', { name: 'Tower.rvt' }));
  return screen.findByRole('treeitem', { name: 'v2: Coordination' });
}

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
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

describe('dock drop target', () => {
  it('opens a dragged version and navigates to it', async () => {
    const appRouter = renderApp();
    const root = await dockRoot();
    const row = await openVersionRow();

    const transfer = dragData();
    fireEvent.dragStart(row, { dataTransfer: transfer });
    fireEvent.dragOver(root, { dataTransfer: transfer });
    expect(root).toHaveAttribute('data-model-drop');

    fireEvent.drop(root, { dataTransfer: transfer });

    await waitFor(() =>
      expect(appRouter.state.location.pathname).toBe('/model/dXJuOmFkc2s'),
    );
    expect(storedUrns()).toContain('dXJuOmFkc2s');
    expect(root).not.toHaveAttribute('data-model-drop');
  });

  it('ignores a drag that is not a model', async () => {
    const appRouter = renderApp();
    const root = await dockRoot();
    const before = storedUrns();

    const transfer = dragData();
    transfer.setData('text/plain', 'hello');
    fireEvent.dragOver(root, { dataTransfer: transfer });
    expect(root).not.toHaveAttribute('data-model-drop');
    fireEvent.drop(root, { dataTransfer: transfer });

    expect(storedUrns()).toEqual(before);
    expect(appRouter.state.location.pathname).toBe('/model/abc123');
  });

  it('keeps the indicator while the drag moves between children without relatedTarget', async () => {
    renderApp();
    const root = await dockRoot();
    const child = root.firstElementChild as HTMLElement;
    const row = await openVersionRow();
    const transfer = dragData();
    fireEvent.dragStart(row, { dataTransfer: transfer });

    fireEvent.dragEnter(root, { dataTransfer: transfer });
    fireEvent.dragOver(root, { dataTransfer: transfer });
    fireEvent.dragEnter(child, { dataTransfer: transfer });
    fireEvent.dragLeave(root, { dataTransfer: transfer });
    expect(root).toHaveAttribute('data-model-drop');

    fireEvent.dragLeave(child, { dataTransfer: transfer });
    expect(root).not.toHaveAttribute('data-model-drop');
  });

  it('clears the indicator and the depth when the drag ends without a leave', async () => {
    renderApp();
    const root = await dockRoot();
    const row = await openVersionRow();
    const transfer = dragData();
    fireEvent.dragStart(row, { dataTransfer: transfer });

    fireEvent.dragEnter(root, { dataTransfer: transfer });
    fireEvent.dragOver(root, { dataTransfer: transfer });
    expect(root).toHaveAttribute('data-model-drop');

    fireEvent.dragEnd(row, { dataTransfer: transfer });
    expect(root).not.toHaveAttribute('data-model-drop');

    fireEvent.dragStart(row, { dataTransfer: transfer });
    fireEvent.dragEnter(root, { dataTransfer: transfer });
    fireEvent.dragOver(root, { dataTransfer: transfer });
    fireEvent.dragLeave(root, { dataTransfer: transfer });
    expect(root).not.toHaveAttribute('data-model-drop');
  });
});
